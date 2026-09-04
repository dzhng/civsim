import { terrainHeightAt, terrainNormalAt, type TerrainHeightField } from "../terrain/heightField";
import {
  battleGrassTintWeight,
  isBattleGrassBlockedTint,
  type BattleTerrainGrid,
} from "./terrainFeatures";
import { clamp01 } from "../../../renderer-core/src/math";

export const GRASS_FIELD_PACKED_STRIDE_FLOATS = 16;
export const GRASS_FIELD_PACKED_BYTES =
  GRASS_FIELD_PACKED_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

type GrassFieldLodTier = 0 | 1 | 2;

interface GrassFieldFocus {
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

interface GrassFieldSnapshot {
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
const STRATIFIED_STREAM_BINS = 512;
const STRATIFIED_STREAM_OVERSAMPLE = 1.25;
export const GRASS_FIELD_LOD_BUDGET_RATIOS = [0.48, 0.37, 0.15] as const;

export function sampleGrassField(
  grid: BattleTerrainGrid,
  field: TerrainHeightField,
  config: GrassFieldConfig,
): GrassFieldSnapshot {
  const sampler = createGrassFieldSampler(grid, field, config);
  while (!sampler.step(16384)) {
    // Legacy synchronous API. Production drives the same sampler in rAF slices.
  }
  const snapshot = sampler.finish();
  if (!snapshot) throw new Error("grass field sampler finished without a snapshot");
  return snapshot;
}

export interface GrassFieldSampler {
  readonly done: boolean;
  readonly cellsProcessed: number;
  readonly totalCells: number;
  readonly stats: GrassFieldStats;
  step(maxCells?: number): boolean;
  finish(): GrassFieldSnapshot | null;
}

export function createGrassFieldSampler(
  grid: BattleTerrainGrid,
  field: TerrainHeightField,
  config: GrassFieldConfig,
): GrassFieldSampler {
  return new GrassFieldSamplerTask(grid, field, config);
}

class GrassFieldSamplerTask implements GrassFieldSampler {
  private readonly grid: BattleTerrainGrid;
  private readonly field: TerrainHeightField;
  private readonly radius: number;
  private readonly fieldCellSize: number;
  private readonly clumpCellSize: number;
  private readonly recordCapacity: number;
  private readonly density: number;
  private readonly jitter: number;
  private readonly minNormalZ: number;
  private readonly lodNearRadius: number;
  private readonly lodMidRadius: number;
  private readonly lodStratifiedBudget: boolean;
  private readonly baseHeight: number;
  private readonly heightJitter: number;
  private readonly baseWidth: number;
  private readonly widthJitter: number;
  private readonly baseBend: number;
  private readonly bendJitter: number;
  private readonly startX: number;
  private readonly endX: number;
  private readonly startY: number;
  private readonly endY: number;
  private gx: number;
  private gy: number;
  private records: GrassFieldRecord[] = [];
  private candidates: GrassFieldCandidate[] = [];
  // Accepted-candidate counter for the flat path's reservoir (Algorithm R).
  private flatSeen = 0;
  private stratifiedBins: [
    GrassFieldCandidate[][],
    GrassFieldCandidate[][],
    GrassFieldCandidate[][],
  ];
  // Per-bin index of the currently-kept candidate with the largest `order`
  // key (-1 until the bin fills). Lets the reservoir replace the weakest
  // survivor in O(1) instead of rescanning every full bin per candidate.
  private stratifiedBinMaxIdx: [number[], number[], number[]];
  private stratifiedBinCapacity: number;
  private phase: "cells" | "select" | "pack" | "done" = "cells";
  private packedRecords = new Float32Array();
  private packIndex = 0;
  private selectionQuotas: [number[], number[], number[]] | null = null;
  private selectionFlat: GrassFieldCandidate[] | null = null;
  private selectTier = 0;
  private selectBin = 0;
  private selectOffset = 0;
  private selectionIndex = 0;
  private snapshot: GrassFieldSnapshot | null = null;

  readonly totalCells: number;
  readonly stats: GrassFieldStats;
  cellsProcessed = 0;
  done = false;

  constructor(grid: BattleTerrainGrid, field: TerrainHeightField, config: GrassFieldConfig) {
    this.grid = grid;
    this.field = field;
    const seed = toU32(config.seed ?? 0x6a55);
    const focus = config.focus;
    this.radius = Math.max(0, finiteOr(focus.radius, 0));
    this.fieldCellSize = Math.max(0.35, finiteOr(config.fieldCellSize, DEFAULT_FIELD_CELL_SIZE));
    const snapCellSize = Math.max(
      this.fieldCellSize,
      finiteOr(config.snapCellSize, DEFAULT_SNAP_CELL_SIZE),
    );
    this.clumpCellSize = Math.max(
      this.fieldCellSize,
      finiteOr(config.clumpCellSize, DEFAULT_CLUMP_CELL_SIZE),
    );
    this.recordCapacity = clampInt(finiteOr(config.maxRecords, DEFAULT_MAX_RECORDS), 0, 1_000_000);
    this.density = clamp01(finiteOr(config.density, 1));
    this.jitter = clamp01(finiteOr(config.jitter, 0.68));
    this.minNormalZ = clamp01(finiteOr(config.minNormalZ, DEFAULT_MIN_NORMAL_Z));
    this.lodNearRadius = clamp01(finiteOr(config.lodNearRadius, 0.34));
    this.lodMidRadius = Math.max(this.lodNearRadius, clamp01(finiteOr(config.lodMidRadius, 0.72)));
    this.lodStratifiedBudget = config.lodStratifiedBudget === true;
    this.baseHeight = Math.max(0.01, finiteOr(config.baseHeight, 0.72));
    this.heightJitter = Math.max(0, finiteOr(config.heightJitter, 0.34));
    this.baseWidth = Math.max(0.001, finiteOr(config.baseWidth, 0.055));
    this.widthJitter = Math.max(0, finiteOr(config.widthJitter, 0.28));
    this.baseBend = Math.max(0, finiteOr(config.baseBend, 0.24));
    this.bendJitter = Math.max(0, finiteOr(config.bendJitter, 0.22));
    const snapX = snapCoord(finiteOr(focus.x, 0), snapCellSize);
    const snapY = snapCoord(finiteOr(focus.y, 0), snapCellSize);
    this.stats = {
      seed,
      snapX,
      snapY,
      snapCellSize,
      fieldCellSize: this.fieldCellSize,
      clumpCellSize: this.clumpCellSize,
      minNormalZ: this.minNormalZ,
      lodNearRadius: this.lodNearRadius,
      lodMidRadius: this.lodMidRadius,
      lodStratifiedBudget: this.lodStratifiedBudget,
      candidateCells: 0,
      acceptedRecords: 0,
      recordCapacity: this.recordCapacity,
      cappedRecords: 0,
      outOfBoundsCells: 0,
      rejectedTintCells: 0,
      rejectedSlopeCells: 0,
      rejectedDensityCells: 0,
      openGrassCells: 0,
      forestCells: 0,
      roughCells: 0,
      lodCandidateCounts: [0, 0, 0],
      lodBudgetQuotas: lodBudgetQuotasFor(this.recordCapacity),
      lodDroppedByBudget: [0, 0, 0],
      lodCounts: [0, 0, 0],
      packedStrideFloats: GRASS_FIELD_PACKED_STRIDE_FLOATS,
      packedStrideBytes: GRASS_FIELD_PACKED_BYTES,
      packedBytes: 0,
    };
    this.startX = Math.floor((snapX - this.radius) / this.fieldCellSize);
    this.endX = Math.floor((snapX + this.radius) / this.fieldCellSize);
    this.startY = Math.floor((snapY - this.radius) / this.fieldCellSize);
    this.endY = Math.floor((snapY + this.radius) / this.fieldCellSize);
    this.gx = this.startX;
    this.gy = this.startY;
    this.stratifiedBins = [createStratifiedBins(), createStratifiedBins(), createStratifiedBins()];
    this.stratifiedBinMaxIdx = [
      createStratifiedMaxIdx(),
      createStratifiedMaxIdx(),
      createStratifiedMaxIdx(),
    ];
    this.stratifiedBinCapacity = Math.max(
      1,
      Math.ceil((this.recordCapacity * STRATIFIED_STREAM_OVERSAMPLE) / STRATIFIED_STREAM_BINS),
    );
    this.totalCells =
      Math.max(0, this.endX - this.startX + 1) * Math.max(0, this.endY - this.startY + 1);
    if (
      this.radius <= 0 ||
      this.density <= 0 ||
      this.recordCapacity <= 0 ||
      grid.w <= 0 ||
      grid.h <= 0
    ) {
      this.done = true;
      this.phase = "done";
      this.snapshot = finishSnapshot(this.records, this.stats);
    }
  }

  step(maxCells = 2048): boolean {
    if (this.done) return true;
    if (this.phase === "select") {
      this.selectRecords(maxCells);
      return this.done;
    }
    if (this.phase === "pack") {
      this.packRecords(maxCells);
      return this.done;
    }
    let remaining = Math.max(1, Math.floor(maxCells));
    while (this.gy <= this.endY && remaining > 0) {
      this.processCell(this.gx, this.gy);
      this.cellsProcessed++;
      remaining--;
      this.gx++;
      if (this.gx > this.endX) {
        this.gx = this.startX;
        this.gy++;
      }
    }
    if (this.gy > this.endY) this.beginSelect();
    return this.done;
  }

  finish(): GrassFieldSnapshot | null {
    return this.snapshot;
  }

  private processCell(gx: number, gy: number): void {
    const cellSeed = hashCell(this.stats.seed, gx, gy);
    const centerX = (gx + 0.5) * this.fieldCellSize;
    const centerY = (gy + 0.5) * this.fieldCellSize;
    const jitterX = (hash01(cellSeed ^ 0x35a3_9821) - 0.5) * this.fieldCellSize * this.jitter;
    const jitterY = (hash01(cellSeed ^ 0x6f4c_5b37) - 0.5) * this.fieldCellSize * this.jitter;
    const x = centerX + jitterX;
    const y = centerY + jitterY;
    const dist = Math.hypot(x - this.stats.snapX, y - this.stats.snapY);
    if (dist > this.radius) return;
    this.stats.candidateCells++;

    const terrainCell = terrainCellAt(this.grid, x, y);
    if (!terrainCell) {
      this.stats.outOfBoundsCells++;
      return;
    }
    const tint = this.grid.tint[terrainCell.cy * this.grid.w + terrainCell.cx] ?? 0;
    if (isBattleGrassBlockedTint(tint)) {
      this.stats.rejectedTintCells++;
      return;
    }
    const tintWeight = battleGrassTintWeight(tint);
    if (tintWeight <= 0 || hash01(cellSeed ^ 0x91e2_1a4f) > this.density * tintWeight) {
      this.stats.rejectedDensityCells++;
      return;
    }

    const normal = terrainNormalAt(this.field, x, y, Math.max(0.5, this.field.cell));
    if (!isFiniteNormal(normal) || normal[2] < this.minNormalZ) {
      this.stats.rejectedSlopeCells++;
      return;
    }
    // Flat (uniform) path: reservoir-sample so an over-capacity field thins
    // UNIFORMLY. The old row-major cap filled to capacity then rejected every
    // later cell, so a field with more grass area than the record cap went bald
    // wherever the south→north scan ran out of budget. Algorithm R keeps a
    // uniform random subset instead, deterministic through the cell hash.
    let flatSlot = -1;
    if (!this.lodStratifiedBudget) {
      const seen = this.flatSeen++;
      if (seen < this.recordCapacity) {
        flatSlot = seen;
      } else {
        this.stats.cappedRecords++;
        const j = Math.floor(hash01(cellSeed ^ 0x1b7f_2c5d) * (seen + 1));
        if (j >= this.recordCapacity) return;
        flatSlot = j;
      }
    }

    const lodTier = lodTierForDistance(dist, this.radius, this.lodNearRadius, this.lodMidRadius);
    const bladeSeed = hashCell(this.stats.seed ^ 0xa511_e9b3, gx, gy) & SEED24_MASK;
    const clump = clumpFor(x, y, this.stats.seed, this.clumpCellSize);
    const heightScale =
      1 - this.heightJitter * 0.5 + hash01(cellSeed ^ 0x4b1d_2d3f) * this.heightJitter;
    const widthScale =
      1 - this.widthJitter * 0.5 + hash01(cellSeed ^ 0x8cb3_5f15) * this.widthJitter;
    const bendScale = 1 - this.bendJitter * 0.5 + hash01(cellSeed ^ 0xb529_7a4d) * this.bendJitter;
    const record: GrassFieldRecord = {
      x,
      y,
      z: terrainHeightAt(this.field, x, y),
      worldCellX: gx,
      worldCellY: gy,
      tint,
      lodTier,
      normalX: normal[0],
      normalY: normal[1],
      normalZ: normal[2],
      width: this.baseWidth * widthScale,
      height: this.baseHeight * heightScale,
      bend: this.baseBend * bendScale,
      windPhase: hash01(cellSeed ^ 0x2d6a_99f5) * Math.PI * 2,
      yaw: hash01(cellSeed ^ 0x7c15_3a91) * Math.PI * 2,
      clumpSeed: clump.seed,
      bladeSeed,
      clumpWeight: clump.weight,
    };
    const candidate = { record, dist, order: hash01(cellSeed ^ 0xd2b7_4c19) };
    if (this.lodStratifiedBudget) this.pushStratifiedCandidate(candidate);
    else if (flatSlot < this.candidates.length) this.candidates[flatSlot] = candidate;
    else this.candidates.push(candidate);
    this.stats.lodCandidateCounts[lodTier]++;
  }

  private pushStratifiedCandidate(candidate: GrassFieldCandidate): void {
    const tier = candidate.record.lodTier;
    const binIndex = stratifiedStreamBin(candidate.dist, this.radius);
    const bin = this.stratifiedBins[tier][binIndex];
    const cap = this.stratifiedBinCapacity;
    if (bin.length < cap) {
      bin.push(candidate);
      return;
    }
    // Bin full: keep the `cap` candidates with the SMALLEST `order` key - a
    // uniform random subset of this radial shell that ignores arrival order.
    // The old code kept the first `cap` in scan order, and because cells are
    // visited row-major from the south pole of the disc (where only x~0 cells
    // fall inside the radius) every shell's quota was spent on its southern,
    // x~0 arc before the wide arcs were ever reached - collapsing the whole
    // disc to a narrow vertical strip. Reservoir-by-smallest-order restores an
    // angularly uniform shell, matching the non-streaming selection path.
    const maxIdxArr = this.stratifiedBinMaxIdx[tier];
    let mi = maxIdxArr[binIndex];
    if (mi < 0) {
      mi = 0;
      for (let i = 1; i < cap; i++) if (bin[i].order > bin[mi].order) mi = i;
    }
    if (candidate.order < bin[mi].order) {
      bin[mi] = candidate;
      let nm = 0;
      for (let i = 1; i < cap; i++) if (bin[i].order > bin[nm].order) nm = i;
      maxIdxArr[binIndex] = nm;
    } else {
      maxIdxArr[binIndex] = mi;
    }
  }

  private beginSelect(): void {
    if (this.lodStratifiedBudget) {
      this.stats.cappedRecords = Math.max(
        0,
        this.stats.lodCandidateCounts.reduce((sum, count) => sum + count, 0) - this.recordCapacity,
      );
      this.selectionQuotas = stratifiedStreamQuotas(
        this.stratifiedBins,
        this.recordCapacity,
        this.stats,
      );
    } else {
      this.selectionFlat = this.candidates;
    }
    this.phase = "select";
    this.selectRecords(0);
  }

  private selectRecords(maxRecords: number): void {
    const limit = maxRecords <= 0 ? 0 : Math.max(1, Math.floor(maxRecords));
    let remaining = limit;
    if (this.selectionQuotas) {
      while (remaining > 0 && this.selectTier < 3) {
        const quotas = this.selectionQuotas[this.selectTier];
        const bins = this.stratifiedBins[this.selectTier];
        const quota = quotas[this.selectBin] ?? 0;
        const bin = bins[this.selectBin] ?? [];
        while (this.selectOffset < quota && remaining > 0) {
          this.addSelectedRecord(bin[this.selectOffset]);
          this.selectOffset++;
          remaining--;
        }
        if (this.selectOffset < quota) break;
        this.selectOffset = 0;
        this.selectBin++;
        if (this.selectBin < bins.length) continue;
        this.selectBin = 0;
        this.selectTier++;
      }
      if (this.selectTier >= 3) this.finishSelect();
      return;
    }

    const flat = this.selectionFlat ?? [];
    while (this.selectionIndex < flat.length && remaining > 0) {
      this.addSelectedRecord(flat[this.selectionIndex]);
      this.selectionIndex++;
      remaining--;
    }
    if (this.selectionIndex >= flat.length) this.finishSelect();
  }

  private addSelectedRecord(candidate: GrassFieldCandidate | undefined): void {
    if (!candidate) return;
    const record = candidate.record;
    this.records.push(record);
    this.stats.lodCounts[record.lodTier]++;
    if (record.tint === 0) this.stats.openGrassCells++;
    else if (record.tint === 4) this.stats.forestCells++;
    else if (record.tint === 6) this.stats.roughCells++;
  }

  private finishSelect(): void {
    if (this.lodStratifiedBudget) {
      this.stats.cappedRecords = Math.max(
        0,
        this.stats.lodCandidateCounts.reduce((sum, count) => sum + count, 0) - this.records.length,
      );
      this.stats.lodDroppedByBudget = [
        Math.max(0, this.stats.lodCandidateCounts[0] - this.stats.lodCounts[0]),
        Math.max(0, this.stats.lodCandidateCounts[1] - this.stats.lodCounts[1]),
        Math.max(0, this.stats.lodCandidateCounts[2] - this.stats.lodCounts[2]),
      ];
    }
    this.packedRecords = new Float32Array(this.records.length * GRASS_FIELD_PACKED_STRIDE_FLOATS);
    this.candidates = [];
    this.stratifiedBins = [createStratifiedBins(), createStratifiedBins(), createStratifiedBins()];
    this.stratifiedBinMaxIdx = [
      createStratifiedMaxIdx(),
      createStratifiedMaxIdx(),
      createStratifiedMaxIdx(),
    ];
    this.selectionQuotas = null;
    this.selectionFlat = null;
    this.phase = "pack";
    this.packRecords(0);
  }

  private packRecords(maxRecords: number): void {
    const limit =
      maxRecords <= 0
        ? this.packIndex
        : Math.min(this.records.length, this.packIndex + Math.max(1, Math.floor(maxRecords)));
    while (this.packIndex < limit) {
      packGrassFieldRecord(this.packedRecords, this.packIndex, this.records[this.packIndex]);
      this.packIndex++;
    }
    if (this.packIndex < this.records.length) return;
    this.stats.acceptedRecords = this.records.length;
    this.stats.packedBytes = this.packedRecords.byteLength;
    this.snapshot = { records: this.records, packedRecords: this.packedRecords, stats: this.stats };
    this.phase = "done";
    this.done = true;
  }
}

function createStratifiedBins(): GrassFieldCandidate[][] {
  return Array.from({ length: STRATIFIED_STREAM_BINS }, () => []);
}

function createStratifiedMaxIdx(): number[] {
  return new Array<number>(STRATIFIED_STREAM_BINS).fill(-1);
}

function stratifiedStreamBin(dist: number, radius: number): number {
  const t = radius > 0 ? dist / radius : 0;
  return Math.min(STRATIFIED_STREAM_BINS - 1, Math.max(0, Math.floor(t * STRATIFIED_STREAM_BINS)));
}

function stratifiedStreamQuotas(
  bins: readonly [GrassFieldCandidate[][], GrassFieldCandidate[][], GrassFieldCandidate[][]],
  capacity: number,
  stats: GrassFieldStats,
): [number[], number[], number[]] {
  const empty: [number[], number[], number[]] = [
    Array.from({ length: STRATIFIED_STREAM_BINS }, () => 0),
    Array.from({ length: STRATIFIED_STREAM_BINS }, () => 0),
    Array.from({ length: STRATIFIED_STREAM_BINS }, () => 0),
  ];
  if (capacity <= 0) return empty;
  const available: [number, number, number] = [
    stratifiedBinTotal(bins[0]),
    stratifiedBinTotal(bins[1]),
    stratifiedBinTotal(bins[2]),
  ];
  const desired: [number, number, number] = [0, 0, 0];
  let remaining = capacity;

  for (const tier of [0, 1, 2] as const) {
    const take = Math.min(available[tier], stats.lodBudgetQuotas[tier], remaining);
    desired[tier] = take;
    remaining -= take;
  }
  for (const tier of [0, 1, 2] as const) {
    if (remaining <= 0) break;
    const take = Math.min(available[tier] - desired[tier], remaining);
    desired[tier] += take;
    remaining -= take;
  }

  return [
    stratifiedBucketQuotasForCounts(bins[0], desired[0], available[0]),
    stratifiedBucketQuotasForCounts(bins[1], desired[1], available[1]),
    stratifiedBucketQuotasForCounts(bins[2], desired[2], available[2]),
  ];
}

function stratifiedBinTotal(bins: readonly GrassFieldCandidate[][]): number {
  let total = 0;
  for (const bin of bins) total += bin.length;
  return total;
}

function stratifiedBucketQuotasForCounts(
  buckets: readonly GrassFieldCandidate[][],
  count: number,
  total: number,
): number[] {
  const quotas = new Array<number>(buckets.length).fill(0);
  if (count <= 0 || total <= 0) return quotas;
  const fractions: Array<{ index: number; fraction: number }> = [];
  let assigned = 0;
  for (let i = 0; i < buckets.length; i++) {
    const exact = (count * buckets[i].length) / total;
    const base = Math.min(buckets[i].length, Math.floor(exact));
    quotas[i] = base;
    assigned += base;
    fractions.push({ index: i, fraction: exact - base });
  }
  fractions.sort((a, b) => b.fraction - a.fraction || b.index - a.index);
  let remaining = count - assigned;
  while (remaining > 0) {
    let moved = false;
    for (const { index } of fractions) {
      if (remaining <= 0) break;
      if (quotas[index] >= buckets[index].length) continue;
      quotas[index]++;
      remaining--;
      moved = true;
    }
    if (!moved) break;
  }
  return quotas;
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

function packGrassFieldRecords(records: readonly GrassFieldRecord[]): Float32Array {
  const out = new Float32Array(records.length * GRASS_FIELD_PACKED_STRIDE_FLOATS);
  for (let i = 0; i < records.length; i++) {
    packGrassFieldRecord(out, i, records[i]);
  }
  return out;
}

function packGrassFieldRecord(out: Float32Array, index: number, record: GrassFieldRecord): void {
  const o = index * GRASS_FIELD_PACKED_STRIDE_FLOATS;
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

function terrainCellAt(
  grid: BattleTerrainGrid,
  x: number,
  y: number,
): { cx: number; cy: number } | null {
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

function lodTierForDistance(
  distance: number,
  radius: number,
  nearT: number,
  midT: number,
): GrassFieldLodTier {
  const t = radius > 0 ? distance / radius : 0;
  if (t <= nearT) return 0;
  if (t <= midT) return 1;
  return 2;
}

function snapCoord(v: number, snapCellSize: number): number {
  // The +epsilon guards the idempotent case: a caller that already snapped the
  // focus onto THIS grid (battleWorld passes its ring-scaled step) hands us an
  // exact k*cell, and k*cell/cell can land a hair below k in float - a bare
  // floor would then drop a whole cell and displace the disc off the look
  // target (the bald ground-level frame). Epsilon is inert for genuine sub-cell
  // positions (their fraction dwarfs it), so sub-cell moves still share a cell.
  return Math.floor(v / snapCellSize + 1e-6) * snapCellSize;
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

function toU32(v: number): number {
  return Number.isFinite(v) ? v >>> 0 : 0;
}
