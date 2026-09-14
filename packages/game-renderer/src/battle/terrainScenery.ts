import type { CampaignSceneryInstance } from "../campaign/sceneryPass";
import { terrainHeightAt, terrainNormalAt, type TerrainHeightField } from "../terrain/heightField";
import { terrainScatterCandidates } from "../terrain/scatter";
import { hash2 } from "../../../renderer-core/src/math";
import type { BattleTerrainFeature, BattleTerrainGrid } from "./terrainFeatures";

// Forest occupancy and clearings come from the physical tint grid. The scatter
// only chooses visual instances; it never modifies terrain or gameplay.
const TREE_SPACING = 9.6;
const MAX_TREES_PER_FOREST = 240;
// Trees avoid faces steeper than roughly 35 degrees on the rendered surface.
const MIN_TREE_UP_NORMAL = 0.82;
const ROCKS_PER_RADIUS = 0.07;
const MAX_ROCKS_PER_OUTCROP = 6;

export function featuresToBattleScenery(
  features: BattleTerrainFeature[],
  field: TerrainHeightField,
  seed: number,
  grid?: BattleTerrainGrid,
): CampaignSceneryInstance[] {
  const out: CampaignSceneryInstance[] = [];
  const seat = (x: number, y: number) => terrainHeightAt(field, x, y);
  const dry = (x: number, y: number) => !grid || terrainTintAt(grid, x, y) !== 1;
  for (let fi = 0; fi < features.length; fi++) {
    const f = features[fi];
    const rand = scatterRng(seed ^ Math.imul(fi + 1, 0x9e3779b1));
    if (f.kind === "forest") {
      const cells = f.cells && grid ? new Set(f.cells) : null;
      let bounds: [number, number, number, number] = [
        f.x - f.radius,
        f.y - f.radius,
        f.x + f.radius,
        f.y + f.radius,
      ];
      if (cells && grid) {
        bounds = [Infinity, Infinity, -Infinity, -Infinity];
        for (const cell of cells) {
          const x = grid.ox + (cell % grid.w) * grid.cell;
          const y = grid.oy + Math.floor(cell / grid.w) * grid.cell;
          bounds[0] = Math.min(bounds[0], x);
          bounds[1] = Math.min(bounds[1], y);
          bounds[2] = Math.max(bounds[2], x + grid.cell);
          bounds[3] = Math.max(bounds[3], y + grid.cell);
        }
      }
      const candidates = [];
      for (const candidate of terrainScatterCandidates(bounds, TREE_SPACING, seed)) {
        const { x, y } = candidate;
        if (grid) {
          const cx = Math.floor((x - grid.ox) / grid.cell);
          const cy = Math.floor((y - grid.oy) / grid.cell);
          if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h) continue;
          const cell = cy * grid.w + cx;
          // Non-forest cells include authored roads, water and gameplay clearings.
          if (grid.tint[cell] !== 4 || (cells && !cells.has(cell))) continue;
        }
        if (!cells && Math.hypot(x - f.x, y - f.y) > f.radius) continue;
        if (terrainNormalAt(field, x, y)[2] < MIN_TREE_UP_NORMAL) continue;
        candidates.push(candidate);
      }
      // Keep the cap spatially unbiased and independent of feature enumeration.
      candidates.sort((a, b) => hash2(a.seed, 3) - hash2(b.seed, 3));
      for (const { x, y, seed: identity } of candidates.slice(0, MAX_TREES_PER_FOREST)) {
        const random = scatterRng(identity);
        out.push({
          x,
          y,
          z: seat(x, y),
          size: 4.2 + random() * 2.2,
          kind: battleTreeSpecies(random()),
          yaw: random() * Math.PI * 2,
          shade: 0.5 + random() * 0.4,
        });
      }
    } else if (f.kind === "rock") {
      const n = clampInt(Math.round(f.radius * ROCKS_PER_RADIUS), 1, MAX_ROCKS_PER_OUTCROP);
      for (let k = 0; k < n; k++) {
        const r = f.radius * 0.5 * Math.sqrt(rand());
        const a = rand() * Math.PI * 2;
        const x = f.x + Math.cos(a) * r;
        const y = f.y + Math.sin(a) * r;
        if (!dry(x, y)) continue;
        out.push({
          x,
          y,
          z: seat(x, y),
          size: 2.4 + rand() * 1.8,
          kind: "rock",
          yaw: rand() * Math.PI * 2,
          shade: 0.55 + rand() * 0.35,
        });
      }
    } else if (f.kind === "micro-rough") {
      // A single tiny stone marking the spot.
      if (!dry(f.x, f.y)) continue;
      out.push({
        x: f.x,
        y: f.y,
        z: seat(f.x, f.y),
        size: 0.9 + rand() * 0.5,
        kind: "rock",
        yaw: rand() * Math.PI * 2,
        shade: 0.6,
      });
    }
    // water/wall/mud/scree are ground/horizon concerns, not scattered props.
  }
  return out;
}

// Mixed wood: conifer- and oak-led with ash/aspen accents and the odd bush at
// the sampled spot, so a forest reads as varied canopy instead of two clones.
function battleTreeSpecies(roll: number): CampaignSceneryInstance["kind"] {
  if (roll < 0.34) return "conifer";
  if (roll < 0.62) return "broadleaf";
  if (roll < 0.78) return "ash";
  if (roll < 0.92) return "aspen";
  return "bush";
}

function terrainTintAt(grid: BattleTerrainGrid, x: number, y: number): number {
  const cx = Math.max(0, Math.min(grid.w - 1, Math.floor((x - grid.ox) / grid.cell)));
  const cy = Math.max(0, Math.min(grid.h - 1, Math.floor((y - grid.oy) / grid.cell)));
  return grid.tint[cy * grid.w + cx] ?? 0;
}

// A small deterministic PRNG seeded per feature so scatter is reproducible.
function scatterRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
