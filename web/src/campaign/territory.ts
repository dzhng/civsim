// Territory overlay: which faction owns each patch of land, baked into an
// RGBA texture the terrain shader drapes over the map when zoomed out.
//
// Assignment mirrors the sim's own territory rule (economy::territory_of):
// land belongs to the *nearest city*, and displays as that city's current
// owner. The nearest-city Voronoi is static — only the city → owner lookup
// changes during play, so a rebuild is a cheap recolor pass.

import type { CampaignData } from './data';
import type { CityView } from './scene';
import { TerrainField } from './terrain';

/** Land farther than this from any city is no one's (deep deserts, steppe). */
const REACH_KM = 280;

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
    for (let gy = 0; gy < h; gy++) {
      const wy = maxY - (gy + 0.5) * cell;
      const by = Math.floor((maxY - wy) / REACH_KM) + 1;
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        if (!land[i]) continue;
        const wx = minX + (gx + 0.5) * cell;
        const bx = Math.floor((wx - minX) / REACH_KM) + 1;
        let best = -1;
        let bestD = reach2;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const b = buckets.get(bx + dx + (by + dy) * bw);
            if (!b) continue;
            for (const ci of b) {
              const c = cities[ci];
              const d = (c.x - wx) ** 2 + (c.y - wy) ** 2;
              if (d < bestD) {
                bestD = d;
                best = c.node;
              }
            }
          }
        }
        this.nearest[i] = best;
      }
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
        const c = factions[f]?.color ?? [150, 150, 150];
        // Shade each city's region a bit differently (a lot for the
        // independents — their patchwork IS the political map's texture).
        const j = cityJitter(nearest[i]) * (factions[f]?.playable ? 24 : 70);
        const k = frontier ? 0.45 : seam ? 0.78 : 1.0;
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
