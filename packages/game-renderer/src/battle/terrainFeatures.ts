// Battle terrain as a typed feature stream. Given the sim terrain grid (tint +
// height, read from wasm), this turns ad-hoc per-cell tints into deterministic
// feature instances — forest clumps, rock outcrops, mud patches, scree lanes,
// water, plus sparse micro-rough samples drawn with real 3D/model cues. Pure and
// deterministic: same grid + seed → same features. No
// DOM, GPU, or wasm calls; the caller reads the grid from wasm and hands it in.

import { flatHeightField, type TerrainHeightField } from '../terrain/heightField';

type BattleTerrainFeatureKind =
  | 'water'
  | 'rock'
  | 'wall'
  | 'forest'
  | 'mud'
  | 'rough'
  | 'micro-rough';

export type BattleEdgeRole = 'open-fog' | 'cliff' | 'mountain' | 'ocean' | 'wall';
export type BattleGroundCover = 'green-grass' | 'yellow-grass' | 'scrub-grass' | 'sand';

export interface BattleSlopeBands {
  flatMax: number;
  rollingMax: number;
  slowMin: number;
  cliffMin: number;
  cliffDilateCells: number;
  highlandCapMinM: number;
}

export interface BattleEdgeRoles {
  north: BattleEdgeRole;
  south: BattleEdgeRole;
  east: BattleEdgeRole;
  west: BattleEdgeRole;
}

/** The sim terrain grid as the renderer sees it (wasm pointers copied to JS). */
export interface BattleTerrainGrid {
  w: number;
  h: number;
  cell: number;
  ox: number;
  oy: number;
  /** Render tint per cell: 0 grass,1 water,2 rock,3 wall,4 forest,5 mud,6 scree/road.
   *  Smooth, full-speed tint-6 cells are authored roads; rough/slow cells are scree. */
  tint: Uint8Array;
  /** Ground speed per cell, 0..1 (0 = impassable). Optional; needed for edge-seal validation. */
  speed?: Float32Array;
  /** Surface roughness per cell, 0..1. Optional; photoreal roads require both fields. */
  rough?: Float32Array;
  /** Ground elevation per cell, meters. Optional; flat if absent. */
  height?: Float32Array;
}

export interface BattleTerrainFeature {
  kind: BattleTerrainFeatureKind;
  x: number;
  y: number;
  radius: number;
  yaw: number;
  /** 0..1 fullness hint (clump area relative to its radius disc). */
  density: number;
  /** Exact source cells for extracted forests; absent for explicitly authored disc features. */
  cells?: readonly number[];
  /** The source tint byte, so a debug overlay can match the painted region. */
  tint: number;
}

export interface BattleTerrainPresentation {
  mapId: string;
  edges: BattleEdgeRoles;
  groundCover: BattleGroundCover;
  height: TerrainHeightField;
  features: BattleTerrainFeature[];
}

/** Render exaggeration for the gentle metre-scale relief at the gameplay
 *  camera; the sim height stays plausible. Modest for live play (vs the lab
 *  review value) so soldiers don't visibly stair-step. One owner: the
 *  production BattleRenderer and the photoreal battle world both scale the
 *  live height field by this. */
export const BATTLE_RELIEF_EXAGGERATION = 1.6;

export function isBattleGrassBlockedTint(tint: number): boolean {
  return tint === 1 || tint === 2 || tint === 3 || tint === 5;
}

export function battleGrassTintWeight(tint: number): number {
  if (tint === 0) return 1;
  if (tint === 4) return 0.40;
  if (tint === 6) return 0.16;
  return 0;
}

const TINT_TO_KIND: Record<number, BattleTerrainFeatureKind | undefined> = {
  1: 'water',
  2: 'rock',
  3: 'wall',
  4: 'forest',
  5: 'mud',
  6: 'rough',
};

// A clump smaller than this many cells is noise, not a landmark.
const MIN_CLUMP_CELLS = 8;
// Coarse lattice for the micro-rough debug scatter (meters); sparse on purpose.
const MICRO_ROUGH_SPACING = 130;

/** The height field view over a terrain grid (meters, world Z = height). */
export function terrainHeightField(grid: BattleTerrainGrid): TerrainHeightField {
  if (!grid.height) return flatHeightField(grid.ox, grid.oy, grid.w, grid.h, grid.cell, 'meters');
  return {
    w: grid.w,
    h: grid.h,
    cell: grid.cell,
    ox: grid.ox,
    oy: grid.oy,
    height: grid.height,
    units: 'meters',
    verticalScale: 1,
  };
}

/**
 * Connected-component extraction: each contiguous run of one tinted kind becomes
 * one feature at its centroid, plus a sparse micro-rough scatter over open
 * grass. Deterministic — flood order is row-major and yaw hashes the centroid.
 */
export function extractBattleTerrainFeatures(grid: BattleTerrainGrid, seed: number): BattleTerrainFeature[] {
  const { w, h, cell, ox, oy, tint } = grid;
  const features: BattleTerrainFeature[] = [];
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (visited[start]) continue;
    const kind = TINT_TO_KIND[tint[start]];
    if (!kind) {
      visited[start] = 1;
      continue;
    }
    const tintByte = tint[start];
    // Flood the contiguous same-tint region (4-connectivity).
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    const cells: number[] = [];
    let area = 0;
    let sx = 0;
    let sy = 0;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const cx = i % w;
      const cy = (i / w) | 0;
      if (kind === 'forest') cells.push(i);
      area++;
      sx += cx;
      sy += cy;
      if (cx > 0 && !visited[i - 1] && tint[i - 1] === tintByte) { visited[i - 1] = 1; stack.push(i - 1); }
      if (cx < w - 1 && !visited[i + 1] && tint[i + 1] === tintByte) { visited[i + 1] = 1; stack.push(i + 1); }
      if (cy > 0 && !visited[i - w] && tint[i - w] === tintByte) { visited[i - w] = 1; stack.push(i - w); }
      if (cy < h - 1 && !visited[i + w] && tint[i + w] === tintByte) { visited[i + w] = 1; stack.push(i + w); }
    }
    if (area < MIN_CLUMP_CELLS) continue;
    const mx = ox + (sx / area + 0.5) * cell;
    const my = oy + (sy / area + 0.5) * cell;
    const radius = Math.sqrt(area / Math.PI) * cell;
    const yaw = hash01(seed ^ hashCoord(mx, my)) * Math.PI * 2;
    // Density: how disc-filling the clump is (1 = a solid disc of its radius).
    const density = Math.min(1, (area * cell * cell) / (Math.PI * radius * radius));
    features.push({ kind, x: mx, y: my, radius, yaw, density, tint: tintByte,
      ...(kind === 'forest' ? { cells } : {}),
    });
  }
  appendMicroRoughSamples(grid, seed, features);
  return features;
}

// Sparse micro-rough markers on open grass: a coarse lattice, hashed-gated so
// only ~a third of lattice points emit. They mark where the per-fragment
// micro_rough field trips soldiers, without cluttering the open field.
function appendMicroRoughSamples(grid: BattleTerrainGrid, seed: number, out: BattleTerrainFeature[]): void {
  const { w, h, cell, ox, oy, tint } = grid;
  const stepCells = Math.max(1, Math.round(MICRO_ROUGH_SPACING / cell));
  for (let cy = (stepCells >> 1); cy < h; cy += stepCells) {
    for (let cx = (stepCells >> 1); cx < w; cx += stepCells) {
      if (tint[cy * w + cx] !== 0) continue; // open grass only
      const x = ox + (cx + 0.5) * cell;
      const y = oy + (cy + 0.5) * cell;
      const g = hash01(seed ^ hashCoord(x, y) ^ 0x9e37);
      if (g > 0.34) continue;
      out.push({
        kind: 'micro-rough',
        x,
        y,
        radius: 1.4 + hash01(seed ^ hashCoord(y, x)) * 1.2,
        yaw: g * Math.PI * 2,
        density: 0.15,
        tint: 0,
      });
    }
  }
}

/**
 * Validate that declared edge roles agree with the terrain's passability: a
 * sealed west/east role must front impassable cells along its length, and an
 * open-fog north/south role must front passable ground. Returns the offending
 * sides; an empty array means the presentation does not lie about its borders.
 */
export function edgeSealMismatches(grid: BattleTerrainGrid, edges: BattleEdgeRoles): Array<keyof BattleEdgeRoles> {
  if (!grid.speed) return [];
  const { w, h, cell, speed } = grid;
  const bandCells = Math.max(1, Math.round(90 / cell));
  const sealed = (role: BattleEdgeRole) => role !== 'open-fog';
  const out: Array<keyof BattleEdgeRoles> = [];

  // West/east: scan inward from each side over the full height.
  const sideSealedFraction = (side: 'west' | 'east') => {
    let blocked = 0;
    for (let cy = 0; cy < h; cy++) {
      let hit = false;
      for (let b = 0; b < bandCells && !hit; b++) {
        const cx = side === 'west' ? b : w - 1 - b;
        if (speed[cy * w + cx] <= 0) hit = true;
      }
      if (hit) blocked++;
    }
    return blocked / h;
  };
  const openFraction = (side: 'north' | 'south') => {
    let open = 0;
    for (let cx = 0; cx < w; cx++) {
      const cy = side === 'south' ? 0 : h - 1;
      if (speed[cy * w + cx] > 0) open++;
    }
    return open / w;
  };

  if (sealed(edges.west) !== (sideSealedFraction('west') > 0.9)) out.push('west');
  if (sealed(edges.east) !== (sideSealedFraction('east') > 0.9)) out.push('east');
  if (sealed(edges.north) === (openFraction('north') > 0.6)) out.push('north');
  if (sealed(edges.south) === (openFraction('south') > 0.6)) out.push('south');
  void cell;
  return out;
}

/**
 * Derive edge roles from the grid's edge tints, for terrain that has no catalog
 * entry (campaign-generated battles). West/east take the dominant impassable
 * tint in their band — rock→cliff, water→ocean, wall→wall — and fall back to
 * open-fog; north/south are always open. Catalog maps use their declared roles
 * instead; this is the graceful default.
 */
export function deriveBattleEdgeRoles(grid: BattleTerrainGrid): BattleEdgeRoles {
  const { w, h, tint } = grid;
  const band = Math.max(1, Math.round(w * 0.06));
  const sideRole = (side: 'west' | 'east'): BattleEdgeRole => {
    let rock = 0;
    let water = 0;
    let wall = 0;
    for (let cy = 0; cy < h; cy++) {
      for (let b = 0; b < band; b++) {
        const cx = side === 'west' ? b : w - 1 - b;
        const t = tint[cy * w + cx];
        if (t === 2) rock++;
        else if (t === 1) water++;
        else if (t === 3) wall++;
      }
    }
    const max = Math.max(rock, water, wall);
    if (max < h * 0.3) return 'open-fog';
    if (max === water) return 'ocean';
    if (max === wall) return 'wall';
    return 'cliff';
  };
  return { north: 'open-fog', south: 'open-fog', west: sideRole('west'), east: sideRole('east') };
}

function hashCoord(x: number, y: number): number {
  // Quantize to ~0.1m so float jitter is stable; mix into a 32-bit hash.
  const xi = Math.round(x * 10) | 0;
  const yi = Math.round(y * 10) | 0;
  let hsh = Math.imul(xi, 0x85ebca6b) ^ Math.imul(yi, 0xc2b2ae35);
  hsh ^= hsh >>> 13;
  hsh = Math.imul(hsh, 0x27d4eb2f);
  hsh ^= hsh >>> 16;
  return hsh >>> 0;
}

function hash01(n: number): number {
  let hsh = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  hsh ^= hsh >>> 12;
  hsh = Math.imul(hsh, 0x297a2d39);
  hsh ^= hsh >>> 15;
  return (hsh >>> 0) / 4294967296;
}
