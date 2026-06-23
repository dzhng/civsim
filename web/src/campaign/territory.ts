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

const FILL_A = 130;
const REGION_A = 170;
const BORDER_A = 240;

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
}

export class Territory {
  /** cell -> nearest city node index, -1 = unclaimed (static) */
  private nearest: Int32Array;
  rgba: Uint8Array;
  labels: FactionLabel[] = [];

  constructor(private data: CampaignData, private field: TerrainField) {
    const { w, h, cell, minX, maxY, land } = field;
    this.rgba = new Uint8Array(w * h * 4);
    this.nearest = new Int32Array(w * h).fill(-1);

    // Bucket cities so each cell only checks its 3x3 neighborhood of buckets
    // (bucket = REACH_KM, so that covers everything within reach).
    const cities: { node: number; x: number; y: number }[] = [];
    data.map.nodes.forEach((n, i) => {
      if (n.kind === 'city') cities.push({ node: i, x: n.pos[0], y: n.pos[1] });
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
    // winning node and its squared distance (node -1 if none within `cap`).
    const nearestCity = (px: number, py: number, cap: number): [number, number] => {
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
            const d = (c.x - px) ** 2 + (c.y - py) ** 2;
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
        // Contiguity gate: a cell is claimed iff a city sits within REACH of its
        // TRUE position — so the warp below can never punch unclaimed holes.
        const [trueBest] = nearestCity(wx, wy, reach2);
        if (trueBest < 0) {
          this.nearest[i] = -1;
          continue;
        }
        // Owner is chosen from a noise-warped point, so inter-faction seams
        // curve with the land instead of following straight Voronoi bisectors.
        const [qx, qy] = warp(wx, wy);
        const [warpBest] = nearestCity(qx, qy, reach2);
        this.nearest[i] = warpBest >= 0 ? warpBest : trueBest;
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

  /** Reassign each small, mostly-enclosed UNALIGNED region to the playable
   *  power that rings it, so a minor city-state can't split a faction's land
   *  into discontinuous islands. Components larger than ABSORB_MAX cells (a
   *  genuine independent region) are left alone. Mutates `owner` in place. */
  private absorbPockets(owner: Int16Array) {
    const { w, h } = this.field;
    const factions = this.data.map.factions;
    const playable = (f: number) => f >= 0 && !!factions[f]?.playable;
    const ABSORB_MAX = 900; // cells (8 km each) — below a real neutral region
    const seen = new Uint8Array(w * h);
    const comp: number[] = [];
    const stack: number[] = [];
    for (let s = 0; s < owner.length; s++) {
      if (seen[s]) continue;
      seen[s] = 1;
      const f0 = owner[s];
      if (f0 < 0 || playable(f0)) continue; // only flood unaligned land
      // Flood this unaligned component (4-connected), tallying the playable
      // factions on its land border.
      comp.length = 0;
      stack.length = 0;
      stack.push(s);
      const border = new Map<number, number>();
      while (stack.length) {
        const i = stack.pop()!;
        comp.push(i);
        const gx = i % w;
        const gy = (i / w) | 0;
        const nb = [gx > 0 ? i - 1 : -1, gx < w - 1 ? i + 1 : -1, gy > 0 ? i - w : -1, gy < h - 1 ? i + w : -1];
        for (const j of nb) {
          if (j < 0) continue;
          const fj = owner[j];
          if (fj === f0) {
            if (!seen[j]) { seen[j] = 1; stack.push(j); }
          } else if (playable(fj)) {
            border.set(fj, (border.get(fj) ?? 0) + 1);
          }
        }
      }
      if (comp.length > ABSORB_MAX) continue; // a real neutral region — keep it
      // Dominant enclosing power (needs a clear majority of the land border).
      let domF = -1;
      let domC = 0;
      let tot = 0;
      for (const [f, c] of border) {
        tot += c;
        if (c > domC) { domC = c; domF = f; }
      }
      if (domF >= 0 && domC >= tot * 0.6) for (const i of comp) owner[i] = domF;
    }
  }

  /** Recolor the overlay from current city ownership. */
  rebuild(cities: Map<number, CityView>) {
    const { w, h, cell } = this.field;
    const factions = this.data.map.factions;
    const { nearest, rgba } = this;

    // cell -> owning faction (-1 none).
    const owner = new Int16Array(w * h).fill(-1);
    for (let i = 0; i < owner.length; i++) {
      const n = nearest[i];
      if (n >= 0) owner[i] = cities.get(n)?.owner ?? -1;
    }

    // Fold small unaligned pockets into the power that surrounds them: a lone
    // neutral city wedged among one faction's holdings reads as a hole/split in
    // that faction. Large neutral regions (a whole independent coast) exceed the
    // size cap and stay their own colour.
    this.absorbPockets(owner);

    const cells = factions.map(() => 0);
    rgba.fill(0);
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        const f = owner[i];
        if (f < 0) continue;
        const right = gx + 1 < w ? i + 1 : i;
        const down = gy + 1 < h ? i + w : i;
        const left = gx > 0 ? i - 1 : i;
        const up = gy > 0 ? i - w : i;
        // Faction frontier: dual-colored, each side darkened toward its own hue.
        const frontier =
          (owner[right] >= 0 && owner[right] !== f) ||
          (owner[down] >= 0 && owner[down] !== f) ||
          (owner[left] >= 0 && owner[left] !== f) ||
          (owner[up] >= 0 && owner[up] !== f);
        // Region seam: same owner, different city — a faint interior line.
        const seam =
          !frontier &&
          ((nearest[right] !== nearest[i] && owner[right] === f) ||
            (nearest[down] !== nearest[i] && owner[down] === f));
        const fac = factions[f];
        const playable = !!fac?.playable;
        // Unaligned cities read as one cool slate neutral (not the warm grey
        // that, when jittered light, looked like bare desert holes inside a
        // faction's land). Keep the per-city shade jitter small either way.
        const c = playable ? (fac?.color ?? [150, 150, 150]) : [104, 114, 134];
        const j = cityJitter(nearest[i]) * (playable ? 22 : 12);
        const k = frontier ? 0.45 : seam ? 0.8 : 1.0;
        const o = i * 4;
        rgba[o] = Math.min(255, Math.max(0, (c[0] + j) * k));
        rgba[o + 1] = Math.min(255, Math.max(0, (c[1] + j) * k));
        rgba[o + 2] = Math.min(255, Math.max(0, (c[2] + j * 0.6) * k));
        rgba[o + 3] = frontier ? BORDER_A : seam ? REGION_A : FILL_A;
        cells[f]++;
      }
    }

    // Anchor each label at the faction's capital (highest-tier owned city):
    // a territory centroid can land between disconnected patches.
    const capitals: (number | null)[] = factions.map(() => null);
    for (const [node, cv] of cities) {
      const f = cv.owner;
      if (f < 0 || !factions[f]?.playable) continue;
      const cur = capitals[f];
      const nodes = this.data.map.nodes;
      if (cur === null || nodes[node].tier > nodes[cur].tier) capitals[f] = node;
    }
    this.labels = factions.flatMap((fac, fi) => {
      const cap = capitals[fi];
      if (!fac.playable || cap === null || cells[fi] === 0) return [];
      const pos = this.data.map.nodes[cap].pos;
      return [{
        faction: fi,
        name: fac.name.toUpperCase(),
        color: fac.color,
        x: pos[0],
        y: pos[1] + 30, // float just north of the capital marker
        radiusKm: Math.sqrt(cells[fi]) * cell,
      }];
    });
  }
}
