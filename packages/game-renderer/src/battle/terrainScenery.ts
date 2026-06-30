import type { CampaignSceneryInstance } from '../campaign/sceneryPass';
import { terrainHeightAt, type TerrainHeightField } from '../terrain/heightField';
import type { BattleTerrainFeature } from './terrainFeatures';

// Battle-specific policy that turns the slice-02 feature stream into shared
// scenery instances seated on the terrain height. Density, scale, and the
// edge-weighted scatter (clear forest edges, sparse interiors — gameplay
// clarity over literal fill) are battle's call; the meshes are the shared
// registry. Deterministic: same features + seed → same instances.

// Trees scale with forest AREA (not radius) so a wood reads as a dense, filled
// canopy instead of a sparse scattering; capped so the largest wood stays
// performant and legible.
const TREES_PER_AREA = 0.034;
const MAX_TREES_PER_FOREST = 240;
const ROCKS_PER_RADIUS = 0.07;
const MAX_ROCKS_PER_OUTCROP = 6;

export function featuresToBattleScenery(
  features: BattleTerrainFeature[],
  field: TerrainHeightField,
  seed: number,
): CampaignSceneryInstance[] {
  const out: CampaignSceneryInstance[] = [];
  const seat = (x: number, y: number) => terrainHeightAt(field, x, y);
  for (let fi = 0; fi < features.length; fi++) {
    const f = features[fi];
    const rand = scatterRng(seed ^ Math.imul(fi + 1, 0x9e3779b1));
    if (f.kind === 'forest') {
      const n = clampInt(Math.round(f.radius * f.radius * TREES_PER_AREA), 12, MAX_TREES_PER_FOREST);
      for (let k = 0; k < n; k++) {
        // Uniform area fill (sqrt keeps the density even from centre to edge) so
        // the wood reads as a packed canopy rather than a hollow ring.
        const r = f.radius * Math.sqrt(rand());
        const a = rand() * Math.PI * 2;
        const x = f.x + Math.cos(a) * r;
        const y = f.y + Math.sin(a) * r;
        out.push({
          x,
          y,
          z: seat(x, y),
          size: 4.2 + rand() * 2.2,
          kind: rand() > 0.5 ? 'conifer' : 'broadleaf',
          yaw: rand() * Math.PI * 2,
          shade: 0.5 + rand() * 0.4,
        });
      }
    } else if (f.kind === 'rock') {
      const n = clampInt(Math.round(f.radius * ROCKS_PER_RADIUS), 1, MAX_ROCKS_PER_OUTCROP);
      for (let k = 0; k < n; k++) {
        const r = f.radius * 0.5 * Math.sqrt(rand());
        const a = rand() * Math.PI * 2;
        const x = f.x + Math.cos(a) * r;
        const y = f.y + Math.sin(a) * r;
        out.push({
          x,
          y,
          z: seat(x, y),
          size: 2.4 + rand() * 1.8,
          kind: 'rock',
          yaw: rand() * Math.PI * 2,
          shade: 0.55 + rand() * 0.35,
        });
      }
    } else if (f.kind === 'micro-rough') {
      // A single tiny stone marking the spot.
      out.push({ x: f.x, y: f.y, z: seat(f.x, f.y), size: 0.9 + rand() * 0.5, kind: 'rock', yaw: rand() * Math.PI * 2, shade: 0.6 });
    }
    // water/wall/mud/scree are ground/horizon concerns, not scattered props.
  }
  return out;
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
