import { terrainHeightAt, terrainNormalAt, type TerrainHeightField } from '../terrain/heightField';
import { battleGrassTintWeight, isBattleGrassBlockedTint, type BattleTerrainGrid } from './terrainFeatures';

export const GRASS_FIELD_PACKED_STRIDE_FLOATS = 16;
export const GRASS_FIELD_PACKED_BYTES = GRASS_FIELD_PACKED_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

export type GrassFieldLodTier = 0 | 1 | 2;

export interface GrassFieldFocus {
  x: number;
  y: number;
  radius: number;
}

export interface GrassFieldConfig {
  seed?: number;
  focus: GrassFieldFocus;
  fieldCellSize?: number;
  snapCellSize?: number;
  clumpCellSize?: number;
  maxRecords?: number;
  density?: number;
  jitter?: number;
  minNormalZ?: number;
  lodNearRadius?: number;
  lodMidRadius?: number;
  lodStratifiedBudget?: boolean;
  baseHeight?: number;
  heightJitter?: number;
  baseWidth?: number;
  widthJitter?: number;
  baseBend?: number;
  bendJitter?: number;
}

export interface GrassFieldRecord {
  x: number;
  y: number;
  z: number;
  worldCellX: number;
  worldCellY: number;
  tint: number;
  lodTier: GrassFieldLodTier;
  normalX: number;
  normalY: number;
  normalZ: number;
  width: number;
  height: number;
  bend: number;
  windPhase: number;
  yaw: number;
  clumpSeed: number;
  bladeSeed: number;
  clumpWeight: number;
}

export interface GrassFieldStats {
  seed: number;
  snapX: number;
  snapY: number;
  snapCellSize: number;
  fieldCellSize: number;
  clumpCellSize: number;
  minNormalZ: number;
  lodNearRadius: number;
  lodMidRadius: number;
  lodStratifiedBudget: boolean;
  candidateCells: number;
  acceptedRecords: number;
  recordCapacity: number;
  cappedRecords: number;
  outOfBoundsCells: number;
  rejectedTintCells: number;
  rejectedSlopeCells: number;
  rejectedDensityCells: number;
  openGrassCells: number;
  forestCells: number;
  roughCells: number;
  lodCandidateCounts: [number, number, number];
  lodBudgetQuotas: [number, number, number];
  lodDroppedByBudget: [number, number, number];
  lodCounts: [number, number, number];
  packedStrideFloats: number;
  packedStrideBytes: number;
  packedBytes: number;
}

export interface GrassFieldSnapshot {
  records: GrassFieldRecord[];
  packedRecords: Float32Array;
  stats: GrassFieldStats;
}

interface GrassFieldCandidate {
  record: GrassFieldRecord;
  dist: number;
  order: number;
}

const DEFAULT_FIELD_CELL_SIZE = 7.5;
const DEFAULT_SNAP_CELL_SIZE = 30;
const DEFAULT_CLUMP_CELL_SIZE = 42;
const DEFAULT_MAX_RECORDS = 4096;
const DEFAULT_MIN_NORMAL_Z = 0.62;
const SEED24_MASK = 0x00ff_ffff;
export const GRASS_FIELD_LOD_BUDGET_RATIOS = [0.48, 0.37, 0.15] as const;

export function sampleGrassField(grid: BattleTerrainGrid, field: TerrainHeightField, config: GrassFieldConfig): GrassFieldSnapshot {
  const seed = toU32(config.seed ?? 0x6a55);
  const focus = config.focus;
  const radius = Math.max(0, finiteOr(focus.radius, 0));
  const fieldCellSize = Math.max(0.5, finiteOr(config.fieldCellSize, DEFAULT_FIELD_CELL_SIZE));
  const snapCellSize = Math.max(fieldCellSize, finiteOr(config.snapCellSize, DEFAULT_SNAP_CELL_SIZE));
  const clumpCellSize = Math.max(fieldCellSize, finiteOr(config.clumpCellSize, DEFAULT_CLUMP_CELL_SIZE));
  const recordCapacity = clampInt(finiteOr(config.maxRecords, DEFAULT_MAX_RECORDS), 0, 1_000_000);
  const density = clamp01(finiteOr(config.density, 1));
  const jitter = clamp01(finiteOr(config.jitter, 0.68));
  const minNormalZ = clamp01(finiteOr(config.minNormalZ, DEFAULT_MIN_NORMAL_Z));
  const lodNearRadius = clamp01(finiteOr(config.lodNearRadius, 0.34));
  const lodMidRadius = Math.max(lodNearRadius, clamp01(finiteOr(config.lodMidRadius, 0.72)));
  const lodStratifiedBudget = config.lodStratifiedBudget === true;
  const baseHeight = Math.max(0.01, finiteOr(config.baseHeight, 0.72));
  const heightJitter = Math.max(0, finiteOr(config.heightJitter, 0.34));
  const baseWidth = Math.max(0.001, finiteOr(config.baseWidth, 0.055));
  const widthJitter = Math.max(0, finiteOr(config.widthJitter, 0.28));
  const baseBend = Math.max(0, finiteOr(config.baseBend, 0.24));
  const bendJitter = Math.max(0, finiteOr(config.bendJitter, 0.22));
  const snapX = snapCoord(finiteOr(focus.x, 0), snapCellSize);
  const snapY = snapCoord(finiteOr(focus.y, 0), snapCellSize);
  const records: GrassFieldRecord[] = [];
  const candidates: GrassFieldCandidate[] = [];
  const lodBudgetQuotas = lodBudgetQuotasFor(recordCapacity);
  const stats: GrassFieldStats = {
    seed,
    snapX,
    snapY,
    snapCellSize,
    fieldCellSize,
    clumpCellSize,
    minNormalZ,
    lodNearRadius,
    lodMidRadius,
    lodStratifiedBudget,
    candidateCells: 0,
    acceptedRecords: 0,
    recordCapacity,
    cappedRecords: 0,
    outOfBoundsCells: 0,
    rejectedTintCells: 0,
    rejectedSlopeCells: 0,
    rejectedDensityCells: 0,
    openGrassCells: 0,
    forestCells: 0,
    roughCells: 0,
    lodCandidateCounts: [0, 0, 0],
    lodBudgetQuotas,
    lodDroppedByBudget: [0, 0, 0],
    lodCounts: [0, 0, 0],
    packedStrideFloats: GRASS_FIELD_PACKED_STRIDE_FLOATS,
    packedStrideBytes: GRASS_FIELD_PACKED_BYTES,
    packedBytes: 0,
  };
  if (radius <= 0 || density <= 0 || recordCapacity <= 0 || grid.w <= 0 || grid.h <= 0) {
    return finishSnapshot(records, stats);
  }

  const startX = Math.floor((snapX - radius) / fieldCellSize);
  const endX = Math.floor((snapX + radius) / fieldCellSize);
  const startY = Math.floor((snapY - radius) / fieldCellSize);
  const endY = Math.floor((snapY + radius) / fieldCellSize);

  for (let gy = startY; gy <= endY; gy++) {
    for (let gx = startX; gx <= endX; gx++) {
      const cellSeed = hashCell(seed, gx, gy);
      const centerX = (gx + 0.5) * fieldCellSize;
      const centerY = (gy + 0.5) * fieldCellSize;
      const jitterX = (hash01(cellSeed ^ 0x35a3_9821) - 0.5) * fieldCellSize * jitter;
      const jitterY = (hash01(cellSeed ^ 0x6f4c_5b37) - 0.5) * fieldCellSize * jitter;
      const x = centerX + jitterX;
      const y = centerY + jitterY;
      const dist = Math.hypot(x - snapX, y - snapY);
      if (dist > radius) continue;
      stats.candidateCells++;

      const terrainCell = terrainCellAt(grid, x, y);
      if (!terrainCell) {
        stats.outOfBoundsCells++;
        continue;
      }
      const tint = grid.tint[terrainCell.cy * grid.w + terrainCell.cx] ?? 0;
      if (isBattleGrassBlockedTint(tint)) {
        stats.rejectedTintCells++;
        continue;
      }
      const tintWeight = battleGrassTintWeight(tint);
      if (tintWeight <= 0 || hash01(cellSeed ^ 0x91e2_1a4f) > density * tintWeight) {
        stats.rejectedDensityCells++;
        continue;
      }

      const normal = terrainNormalAt(field, x, y, Math.max(0.5, field.cell));
      if (!isFiniteNormal(normal) || normal[2] < minNormalZ) {
        stats.rejectedSlopeCells++;
        continue;
      }
      if (!lodStratifiedBudget && candidates.length >= recordCapacity) {
        stats.cappedRecords++;
        continue;
      }

      const lodTier = lodTierForDistance(dist, radius, lodNearRadius, lodMidRadius);
      const bladeSeed = hashCell(seed ^ 0xa511_e9b3, gx, gy) & SEED24_MASK;
      const clump = clumpFor(x, y, seed, clumpCellSize);
      const heightScale = 1 - heightJitter * 0.5 + hash01(cellSeed ^ 0x4b1d_2d3f) * heightJitter;
      const widthScale = 1 - widthJitter * 0.5 + hash01(cellSeed ^ 0x8cb3_5f15) * widthJitter;
      const bendScale = 1 - bendJitter * 0.5 + hash01(cellSeed ^ 0xb529_7a4d) * bendJitter;
      const record: GrassFieldRecord = {
        x,
        y,
        z: terrainHeightAt(field, x, y),
        worldCellX: gx,
        worldCellY: gy,
        tint,
        lodTier,
        normalX: normal[0],
        normalY: normal[1],
        normalZ: normal[2],
        width: baseWidth * widthScale,
        height: baseHeight * heightScale,
        bend: baseBend * bendScale,
        windPhase: hash01(cellSeed ^ 0x2d6a_99f5) * Math.PI * 2,
        yaw: hash01(cellSeed ^ 0x7c15_3a91) * Math.PI * 2,
        clumpSeed: clump.seed,
        bladeSeed,
        clumpWeight: clump.weight,
      };
      candidates.push({ record, dist, order: hash01(cellSeed ^ 0xd2b7_4c19) });
      stats.lodCandidateCounts[lodTier]++;
    }
  }
  const selected = lodStratifiedBudget
    ? selectGrassFieldCandidates(candidates, recordCapacity, stats)
    : candidates;
  if (lodStratifiedBudget) stats.cappedRecords = Math.max(0, candidates.length - selected.length);
  for (const { record } of selected) {
    records.push(record);
    stats.lodCounts[record.lodTier]++;
    if (record.tint === 0) stats.openGrassCells++;
    else if (record.tint === 4) stats.forestCells++;
    else if (record.tint === 6) stats.roughCells++;
  }
  return finishSnapshot(records, stats);
}

function selectGrassFieldCandidates(
  candidates: GrassFieldCandidate[],
  capacity: number,
  stats: GrassFieldStats,
): GrassFieldCandidate[] {
  if (capacity <= 0 || candidates.length === 0) return [];
  const ordered = [...candidates].sort(compareGrassFieldCandidates);
  if (ordered.length <= capacity) return ordered;

  const groups: [GrassFieldCandidate[], GrassFieldCandidate[], GrassFieldCandidate[]] = [[], [], []];
  for (const candidate of ordered) groups[candidate.record.lodTier].push(candidate);

  const quotas = stats.lodBudgetQuotas;
  const offsets: [number, number, number] = [0, 0, 0];
  const selected: GrassFieldCandidate[] = [];
  let remaining = capacity;

  for (const tier of [0, 1, 2] as const) {
    const take = Math.min(groups[tier].length, quotas[tier], remaining);
    selected.push(...groups[tier].slice(0, take));
    offsets[tier] = take;
    remaining -= take;
  }
  for (const tier of [0, 1, 2] as const) {
    if (remaining <= 0) break;
    const take = Math.min(groups[tier].length - offsets[tier], remaining);
    selected.push(...groups[tier].slice(offsets[tier], offsets[tier] + take));
    offsets[tier] += take;
    remaining -= take;
  }

  for (const tier of [0, 1, 2] as const) {
    stats.lodDroppedByBudget[tier] = Math.max(0, groups[tier].length - offsets[tier]);
  }
  return selected.sort(compareGrassFieldCandidates);
}

function compareGrassFieldCandidates(a: GrassFieldCandidate, b: GrassFieldCandidate): number {
  return a.dist - b.dist || a.order - b.order;
}

function lodBudgetQuotasFor(capacity: number): [number, number, number] {
  const near = Math.floor(capacity * GRASS_FIELD_LOD_BUDGET_RATIOS[0]);
  const mid = Math.floor(capacity * GRASS_FIELD_LOD_BUDGET_RATIOS[1]);
  return [near, mid, Math.max(0, capacity - near - mid)];
}

function finishSnapshot(records: GrassFieldRecord[], stats: GrassFieldStats): GrassFieldSnapshot {
  const packedRecords = packGrassFieldRecords(records);
  stats.acceptedRecords = records.length;
  stats.packedBytes = packedRecords.byteLength;
  return { records, packedRecords, stats };
}

export function packGrassFieldRecords(records: readonly GrassFieldRecord[]): Float32Array {
  const out = new Float32Array(records.length * GRASS_FIELD_PACKED_STRIDE_FLOATS);
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const o = i * GRASS_FIELD_PACKED_STRIDE_FLOATS;
    out[o] = record.x;
    out[o + 1] = record.y;
    out[o + 2] = record.z;
    out[o + 3] = record.lodTier;
    out[o + 4] = record.width;
    out[o + 5] = record.height;
    out[o + 6] = record.bend;
    out[o + 7] = record.windPhase;
    out[o + 8] = record.yaw;
    out[o + 9] = record.clumpSeed;
    out[o + 10] = record.bladeSeed;
    out[o + 11] = record.clumpWeight;
    out[o + 12] = record.normalX;
    out[o + 13] = record.normalY;
    out[o + 14] = record.normalZ;
    out[o + 15] = 0;
  }
  return out;
}

function terrainCellAt(grid: BattleTerrainGrid, x: number, y: number): { cx: number; cy: number } | null {
  const cx = Math.floor((x - grid.ox) / grid.cell);
  const cy = Math.floor((y - grid.oy) / grid.cell);
  if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h) return null;
  return { cx, cy };
}

function clumpFor(x: number, y: number, seed: number, clumpCellSize: number) {
  const cx = Math.floor(x / clumpCellSize);
  const cy = Math.floor(y / clumpCellSize);
  const seed24 = hashCell(seed ^ 0x4f1b_bcdc, cx, cy) & SEED24_MASK;
  const centerX = (cx + 0.5 + (hash01(seed24 ^ 0x51f1_3eed) - 0.5) * 0.62) * clumpCellSize;
  const centerY = (cy + 0.5 + (hash01(seed24 ^ 0x9ccd_672b) - 0.5) * 0.62) * clumpCellSize;
  const falloff = Math.hypot(x - centerX, y - centerY) / Math.max(0.001, clumpCellSize * 0.72);
  return { seed: seed24, weight: clamp01(1 - falloff) };
}

function lodTierForDistance(distance: number, radius: number, nearT: number, midT: number): GrassFieldLodTier {
  const t = radius > 0 ? distance / radius : 0;
  if (t <= nearT) return 0;
  if (t <= midT) return 1;
  return 2;
}

function snapCoord(v: number, snapCellSize: number): number {
  return Math.floor(v / snapCellSize) * snapCellSize;
}

function hashCell(seed: number, x: number, y: number): number {
  let h = seed >>> 0;
  h ^= Math.imul(x | 0, 0x9e37_79b1);
  h ^= Math.imul(y | 0, 0x85eb_ca77);
  return mix32(h);
}

function mix32(n: number): number {
  let h = n >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb_352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846c_a68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function hash01(n: number): number {
  return mix32(n) / 4294967296;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function isFiniteNormal(n: readonly number[]): boolean {
  return n.length === 3 && n.every(Number.isFinite);
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function toU32(v: number): number {
  return Number.isFinite(v) ? v >>> 0 : 0;
}
