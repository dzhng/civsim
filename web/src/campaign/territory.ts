// Territory overlay: which faction owns each patch of land, baked into an
// RGBA texture the terrain shader drapes over the map when zoomed out.
//
// Assignment mirrors the sim's own territory rule (economy::territory_of):
// land belongs to the *nearest city*, and displays as that city's current
// owner. The nearest-city Voronoi is static — only the city → owner lookup
// changes during play, so a rebuild is a cheap recolor pass.

import type { CampaignData } from './data';
import type { CityView } from './scene';
import { TerrainField, hash2 } from './terrain';

/** Land farther than this from any city is no one's (deep deserts, steppe).
 *  Generous enough that a faction's coastal cities reach into one contiguous
 *  hinterland instead of leaving unclaimed sand between adjacent holdings. */
const REACH_KM = 460;

/** Smooth value noise over a km grid, [0,1) — the domain warp below rides it. */
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Bend a query point along coherent noise so the nearest-city Voronoi seams
 *  curve organically (hugging the land) instead of cutting straight bisectors.
 *  Amplitude is deliberately small (≤ ~45 km, well under the ~100 km city
 *  spacing): it only wiggles the boundary between adjacent regions — never far
 *  enough to jump the query across an intervening city and stamp a spurious
 *  enclave of some distant faction into another's heartland. */
function warp(wx: number, wy: number): [number, number] {
  const big = 230;
  const fine = 90;
  const dx = (vnoise(wx / big + 11.2, wy / big + 5.7) - 0.5) * 64
    + (vnoise(wx / fine + 3.1, wy / fine + 7.9) - 0.5) * 26;
  const dy = (vnoise(wx / big + 31.4, wy / big + 19.3) - 0.5) * 64
    + (vnoise(wx / fine + 23.5, wy / fine + 13.1) - 0.5) * 26;
  return [wx + dx, wy + dy];
}

const FILL_A = 150;

/** Douglas–Peucker simplification: drop points within `tol` km of the chord, so
 *  a traced boundary's per-cell staircase zigzag collapses to the few points
 *  that capture its real shape — Chaikin then smooths those into a clean curve
 *  (smoothing the raw staircase alone only yields a rounded staircase). */
function simplifyDP(pts: [number, number][], tol: number): [number, number][] {
  const n = pts.length;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const tol2 = tol * tol;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const ax = pts[s][0];
    const ay = pts[s][1];
    const dx = pts[e][0] - ax;
    const dy = pts[e][1] - ay;
    const len2 = dx * dx + dy * dy || 1;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2));
      const cx = ax + dx * t;
      const cy = ay + dy * t;
      const d = (pts[i][0] - cx) ** 2 + (pts[i][1] - cy) ** 2;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol2 && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/** Chaikin corner-cutting: rounds a polyline's hard corners into a smooth curve
 *  (endpoints fixed). A couple of passes turn the cell-grid staircase of a
 *  traced boundary into a flowing line. */
function chaikin(pts: [number, number][], iters: number): [number, number][] {
  for (let it = 0; it < iters && pts.length >= 3; it++) {
    const out: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** Deterministic per-city shade jitter so the region mosaic reads, ±[0,1). */
function cityJitter(node: number): number {
  let n = (node * 2654435761) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296 - 0.5;
}

export interface FactionLabel {
  faction: number;
  name: string;
  color: [number, number, number];
  x: number;
  y: number;
  /** approx radius of the faction's territory blob, km */
  radiusKm: number;
  /** a passive minor league (vs. a playable power) — drawn a touch smaller */
  minor: boolean;
}

export class Territory {
  /** cell -> nearest city node index, -1 = unclaimed (static) */
  private nearest: Int32Array;
  rgba: Uint8Array;
  /** Smooth faction-boundary polylines in world km, each with its bbox for
   *  cheap viewport culling. Rebuilt with the colours; the overlay strokes them
   *  as real vectors so borders stay smooth curves at any zoom. */
  borders: { pts: [number, number][]; bb: [number, number, number, number] }[] = [];
  labels: FactionLabel[] = [];

  constructor(private data: CampaignData, private field: TerrainField) {
    const { w, h, cell, minX, maxY, land } = field;
    this.rgba = new Uint8Array(w * h * 4);
    this.nearest = new Int32Array(w * h).fill(-1);

    // The major powers pull territory a little harder than the minor leagues,
    // so a power's heartland stays one contiguous blob instead of being pinched
    // apart by a neighbouring league whose city happens to sit between two of
    // its own. POWER_W < 1 shrinks a power city's effective (squared) distance,
    // letting it win cells up to ~1/sqrt(POWER_W) farther than a league city.
    const POWER_W = 0.5;
    // Every city keeps a guaranteed core of its own land within this radius (km).
    const CORE2 = 30 * 30;
    const powerIds = new Set(
      data.map.factions.filter((f) => f.playable).map((f) => f.id),
    );

    // Bucket cities so each cell only checks its 3x3 neighborhood of buckets
    // (bucket = REACH_KM, so that covers everything within reach).
    const cities: { node: number; x: number; y: number; wt: number }[] = [];
    data.map.nodes.forEach((n, i) => {
      if (n.kind === 'city') {
        cities.push({ node: i, x: n.pos[0], y: n.pos[1], wt: powerIds.has(n.owner) ? POWER_W : 1 });
      }
    });
    const bw = Math.ceil((w * cell) / REACH_KM) + 2;
    const buckets = new Map<number, number[]>();
    const bkey = (x: number, y: number) =>
      (Math.floor((x - minX) / REACH_KM) + 1) + (Math.floor((maxY - y) / REACH_KM) + 1) * bw;
    cities.forEach((c, ci) => {
      const k = bkey(c.x, c.y);
      (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(ci);
    });

    const reach2 = REACH_KM * REACH_KM;
    // Nearest city within a 3x3 bucket neighbourhood of (px,py); returns the
    // winning node and its (weighted) squared distance, -1 if none within `cap`.
    // `weighted` applies the per-city power pull (owner choice); the coverage
    // gate runs unweighted so the claimed footprint is unchanged.
    const nearestCity = (px: number, py: number, cap: number, weighted: boolean): [number, number] => {
      const bx = Math.floor((px - minX) / REACH_KM) + 1;
      const byy = Math.floor((maxY - py) / REACH_KM) + 1;
      let best = -1;
      let bestD = cap;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const b = buckets.get(bx + dx + (byy + dy) * bw);
          if (!b) continue;
          for (const ci of b) {
            const c = cities[ci];
            let d = (c.x - px) ** 2 + (c.y - py) ** 2;
            if (weighted) d *= c.wt;
            if (d < bestD) {
              bestD = d;
              best = c.node;
            }
          }
        }
      }
      return [best, bestD];
    };
    for (let gy = 0; gy < h; gy++) {
      const wy = maxY - (gy + 0.5) * cell;
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        if (!land[i]) continue;
        const wx = minX + (gx + 0.5) * cell;
        // Contiguity gate (unweighted): a cell is claimed iff some city sits
        // within REACH of its TRUE position — the warp can't punch holes.
        // gateD is the squared distance to that true-nearest city.
        const [gateBest, gateD] = nearestCity(wx, wy, reach2, false);
        if (gateBest < 0) {
          this.nearest[i] = -1;
          continue;
        }
        // Core: the ground right around a city always belongs to that city, so
        // a city is never squeezed onto (or outside) its own border by a power's
        // stronger pull. Beyond the core, the weighted+warped Voronoi decides.
        if (gateD < CORE2) {
          this.nearest[i] = gateBest;
          continue;
        }
        // Owner is the nearest city by WEIGHTED distance from a noise-warped
        // point: powers pull harder (contiguous heartlands) and seams curve
        // with the land instead of following straight Voronoi bisectors.
        const [qx, qy] = warp(wx, wy);
        const [warpBest] = nearestCity(qx, qy, reach2, true);
        this.nearest[i] = warpBest >= 0 ? warpBest : gateBest;
      }
    }
  }

  /** Debug: classify a world point — land?, claiming city, owner faction. */
  infoAt(wx: number, wy: number, cities: Map<number, CityView>) {
    const { w, h, cell, minX, maxY, land } = this.field;
    const gx = Math.floor((wx - minX) / cell);
    const gy = Math.floor((maxY - wy) / cell);
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return { oob: true };
    const i = gy * w + gx;
    const node = this.nearest[i];
    return { land: land[i], node, owner: node >= 0 ? (cities.get(node)?.owner ?? -1) : -1 };
  }

  /** Recolor the overlay from current city ownership. */
  rebuild(cities: Map<number, CityView>) {
    const { w, h, cell, minX, maxY } = this.field;
    const factions = this.data.map.factions;
    const { nearest, rgba } = this;

    // cell -> owning faction (-1 none).
    const owner = new Int16Array(w * h).fill(-1);
    for (let i = 0; i < owner.length; i++) {
      const n = nearest[i];
      if (n >= 0) owner[i] = cities.get(n)?.owner ?? -1;
    }

    const cells = factions.map(() => 0);
    // Area-centroid accumulators (world km) so a label sits in the middle of
    // the whole territory, not at the capital.
    const sumX = factions.map(() => 0);
    const sumY = factions.map(() => 0);
    rgba.fill(0);
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        const f = owner[i];
        if (f < 0) continue;
        const fac = factions[f];
        // Flat per-faction fill (a small per-city jitter for life). Borders are
        // separate smooth vectors (extractBorders below), not baked here.
        const c = fac?.color ?? [150, 150, 150];
        const j = cityJitter(nearest[i]) * 16;
        const o = i * 4;
        rgba[o] = Math.min(255, Math.max(0, c[0] + j));
        rgba[o + 1] = Math.min(255, Math.max(0, c[1] + j));
        rgba[o + 2] = Math.min(255, Math.max(0, c[2] + j * 0.6));
        rgba[o + 3] = FILL_A;
        cells[f]++;
        sumX[f] += minX + (gx + 0.5) * cell;
        sumY[f] += maxY - (gy + 0.5) * cell;
      }
    }
    this.borders = this.extractBorders(owner);

    // Cap the label sizing so a sprawling realm's name doesn't dwarf a compact
    // one: the largest reads at most 1.5x the smallest power (Rome by default).
    const radiusKm = (fi: number) => Math.sqrt(cells[fi]) * cell;
    const playableRadii = factions
      .map((f, fi) => (f.playable && cells[fi] > 0 ? radiusKm(fi) : Infinity))
      .filter((r) => isFinite(r));
    const refRadius = (() => {
      const rome = factions.findIndex((f) => f.id === 'rome');
      return rome >= 0 && cells[rome] > 0
        ? radiusKm(rome)
        : (playableRadii.length ? Math.min(...playableRadii) : 0);
    })();
    const sizeCapKm = refRadius > 0 ? refRadius * 1.5 : Infinity;

    // Label every faction with territory at its area centroid — the minor
    // leagues get a name on the map just like the powers (only smaller, since
    // their realms are smaller). The empty "independents" sentinel has no cells.
    this.labels = factions.flatMap((fac, fi) => {
      if (cells[fi] === 0) return [];
      return [{
        faction: fi,
        name: fac.name.toUpperCase(),
        color: fac.color,
        x: sumX[fi] / cells[fi],
        y: sumY[fi] / cells[fi],
        radiusKm: Math.min(radiusKm(fi), sizeCapKm),
        minor: !fac.playable,
      }];
    });
  }

  /** Trace the faction-vs-faction boundaries of the owner grid into polylines,
   *  then Chaikin-smooth them — so the overlay can stroke real vector borders
   *  that stay smooth curves at any zoom (no cell-grid staircase). */
  private extractBorders(owner: Int16Array) {
    const { w, h, cell, minX, maxY } = this.field;
    const VW = w + 1; // vertices per row
    const M = VW * (h + 1);
    // Adjacency over grid vertices, linked by boundary segments.
    const adj = new Map<number, number[]>();
    const link = (a: number, b: number) => {
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    };
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const o = owner[gy * w + gx];
        if (o < 0) continue;
        if (gx + 1 < w) {
          const or = owner[gy * w + gx + 1];
          if (or >= 0 && or !== o) { const v = gy * VW + gx + 1; link(v, v + VW); }
        }
        if (gy + 1 < h) {
          const od = owner[(gy + 1) * w + gx];
          if (od >= 0 && od !== o) { const v = (gy + 1) * VW + gx; link(v, v + 1); }
        }
      }
    }
    // Walk degree-2 chains into polylines, breaking at junctions/endpoints.
    const used = new Set<number>();
    const key = (a: number, b: number) => (a < b ? a * M + b : b * M + a);
    const walk = (start: number, first: number): number[] => {
      const path = [start];
      let prev = start;
      let cur = first;
      for (;;) {
        used.add(key(prev, cur));
        path.push(cur);
        const nbrs = adj.get(cur)!;
        if (nbrs.length !== 2) break;
        const nxt = nbrs[0] === prev ? nbrs[1] : nbrs[0];
        if (used.has(key(cur, nxt))) break;
        prev = cur;
        cur = nxt;
      }
      return path;
    };
    const chains: number[][] = [];
    for (const [v, nbrs] of adj) {
      if (nbrs.length === 2) continue; // start only from endpoints/junctions
      for (const nb of nbrs) if (!used.has(key(v, nb))) chains.push(walk(v, nb));
    }
    for (const [v, nbrs] of adj) {
      for (const nb of nbrs) if (!used.has(key(v, nb))) chains.push(walk(v, nb)); // loops
    }
    // Vertex id → world km; smooth; record bbox for viewport culling.
    const out: { pts: [number, number][]; bb: [number, number, number, number] }[] = [];
    for (const vids of chains) {
      if (vids.length < 2) continue;
      // Trace → world km → drop the per-cell staircase (DP) → smooth (Chaikin).
      const world = vids.map((vid): [number, number] =>
        [minX + (vid % VW) * cell, maxY - ((vid / VW) | 0) * cell]);
      const pts = chaikin(simplifyDP(world, cell * 1.7), 3);
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const [x, y] of pts) {
        if (x < mnx) mnx = x;
        if (y < mny) mny = y;
        if (x > mxx) mxx = x;
        if (y > mxy) mxy = y;
      }
      out.push({ pts, bb: [mnx, mny, mxx, mxy] });
    }
    return out;
  }
}
