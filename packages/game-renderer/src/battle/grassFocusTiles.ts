import {
  GRASS_FIELD_PACKED_STRIDE_FLOATS,
  type GrassFieldCellRange,
  type GrassFieldSampler,
  type GrassFieldStats,
} from "./grassField";
import { hashPackedRecordsRange, hashToString } from "./bladeFieldRecordHash";

/** A half-open record range inside the persistent focus buffer. */
export interface GrassRecordEdit {
  start: number;
  count: number;
}

/** Padding records sit past every transition band, so the route pass discards
 *  them for the cost of one distance compare instead of drawing a blade. */
const GRASS_TILE_PAD_COORD_M = 1e7;

interface ResidentTile {
  key: number;
  tx: number;
  ty: number;
  slot: number;
  records: number;
  hash: number;
  stats: GrassFieldStats;
}

interface RequiredTile {
  key: number;
  tx: number;
  ty: number;
  distance: number;
}

interface SampleTask {
  key: number;
  tx: number;
  ty: number;
  generation: number;
  sampler: GrassFieldSampler;
}

export interface GrassFocusTileOptions {
  /** Edge length of one residency tile in metres; must be a whole number of field cells. */
  tileM: number;
  fieldCellSize: number;
  /** Hard ceiling on retained slots. The terrain extent lowers it further. */
  slotLimit: number;
  /** Tiles published per `step` call: the per-frame copy/upload bound. */
  publishPerStep: number;
  terrainRect: readonly [number, number, number, number];
  sampleTile(
    range: GrassFieldCellRange,
    centerX: number,
    centerY: number,
    slotRecords: number,
  ): GrassFieldSampler;
  /** Called when the only evictable slots still back the protected focus. The
   *  owner retires that focus (dropping its dedupe circle) and clears protection. */
  releaseProtection(): void;
}

/**
 * The persistent half of the camera focus field: world tiles that are sampled
 * once and then reused, packed into one fixed-capacity record buffer that is
 * allocated with the terrain and never replaced.
 *
 * A tile is the unit of every bound here - sampling, copying, hashing and GPU
 * upload all move at most `publishPerStep` tiles per step, and a focus change
 * re-sorts the request instead of restarting a scan, so travelling only pays
 * for the tiles that are genuinely new.
 */
export class GrassFocusTileField {
  readonly records: Float32Array;
  readonly slotRecords: number;
  readonly slotCapacity: number;
  readonly tileCells: number;
  recordCount = 0;
  editSerial = 0;
  edits: readonly GrassRecordEdit[] = [];
  cancelledTiles = 0;
  cancelledCells = 0;
  evictedTiles = 0;
  sampledTiles = 0;
  sampledCells = 0;
  publishedRecords = 0;

  private readonly options: GrassFocusTileOptions;
  private readonly cellsPerEdge: number;
  private readonly tiles = new Map<number, ResidentTile>();
  private readonly slots: (ResidentTile | null)[];
  private required: RequiredTile[] = [];
  private requiredKeys = new Set<number>();
  private protectedKeys: ReadonlySet<number> = new Set();
  private pendingRelease = false;
  private missingIndex = 0;
  private task: SampleTask | null = null;
  private generation = 0;
  private usedSlots = 0;
  private hashAccum = 0;
  private aggregate: GrassFieldStats | null = null;
  private center: { x: number; y: number; radius: number } | null = null;

  constructor(options: GrassFocusTileOptions) {
    this.options = options;
    this.cellsPerEdge = Math.round(options.tileM / options.fieldCellSize);
    if (Math.abs(this.cellsPerEdge * options.fieldCellSize - options.tileM) > 1e-9) {
      throw new Error("grass focus tile must be a whole number of field cells");
    }
    this.tileCells = this.cellsPerEdge * this.cellsPerEdge;
    this.slotRecords = this.tileCells;
    this.slotCapacity = Math.max(1, Math.min(options.slotLimit, terrainTiles(options)));
    this.slots = new Array<ResidentTile | null>(this.slotCapacity).fill(null);
    this.records = new Float32Array(
      this.slotCapacity * this.slotRecords * GRASS_FIELD_PACKED_STRIDE_FLOATS,
    );
  }

  get requiredTiles(): number {
    return this.required.length;
  }

  get residentTiles(): number {
    return this.tiles.size;
  }

  get missingTiles(): number {
    let missing = 0;
    for (const tile of this.required) if (!this.tiles.has(tile.key)) missing++;
    return missing;
  }

  get pending(): boolean {
    return this.pendingRelease || this.task !== null || this.missingIndex < this.required.length;
  }

  get hash(): string {
    return hashToString(this.hashAccum);
  }

  sampleStats(): GrassFieldStats | null {
    return this.aggregate;
  }

  /** The published circle's tiles. Retained until another circle replaces it,
   *  so the dedupe circle never outlives the coverage it culls the base inside. */
  protect(keys: ReadonlySet<number>): void {
    this.protectedKeys = keys;
    this.pendingRelease = true;
  }

  hasAll(keys: Iterable<number>): boolean {
    for (const key of keys) if (!this.tiles.has(key)) return false;
    return true;
  }

  /** Tile keys covering a disc - the owner's admission and protection sets. */
  coverKeys(centerX: number, centerY: number, radiusM: number): Set<number> {
    const keys = new Set<number>();
    for (const tile of this.coverTiles(centerX, centerY, radiusM)) keys.add(tile.key);
    return keys;
  }

  /**
   * Coalesce to the latest camera demand. Tiles already resident satisfy it for
   * free; an in-flight tile that the new focus still wants keeps its progress.
   */
  request(centerX: number, centerY: number, radiusM: number): void {
    this.center = { x: centerX, y: centerY, radius: radiusM };
    this.generation++;
    this.required = this.coverTiles(centerX, centerY, radiusM);
    this.requiredKeys = new Set(this.required.map((tile) => tile.key));
    this.missingIndex = 0;
    this.pendingRelease = true;
    if (this.aggregate) {
      this.aggregate.snapX = centerX;
      this.aggregate.snapY = centerY;
    }
    const task = this.task;
    if (task && !this.requiredKeys.has(task.key)) {
      this.cancelledTiles++;
      this.cancelledCells += task.sampler.cellsProcessed;
      this.task = null;
    } else if (task) {
      task.generation = this.generation;
    }
  }

  clearRequest(): void {
    if (this.task) {
      this.cancelledTiles++;
      this.cancelledCells += this.task.sampler.cellsProcessed;
      this.task = null;
    }
    this.required = [];
    this.requiredKeys = new Set();
    this.missingIndex = 0;
    this.center = null;
  }

  /**
   * Sample and publish at most `publishPerStep` tiles, stopping early once the
   * time budget is gone. Returns whether the request still has work left.
   */
  step(now: () => number, budgetMs: number): boolean {
    const started = now();
    const edits: GrassRecordEdit[] = [];
    this.releaseUnretained(edits);
    while (edits.length < this.options.publishPerStep) {
      const task = this.task ?? this.startNextTask();
      if (!task) break;
      let done = task.sampler.done;
      while (!done && now() - started < budgetMs) done = task.sampler.step(this.tileCells);
      // Out of budget mid-tile: keep its progress, but still commit the ranges
      // this step already moved, or the GPU never learns they changed.
      if (!done) break;
      this.task = null;
      const snapshot = task.sampler.finish();
      this.sampledTiles++;
      this.sampledCells += task.sampler.cellsProcessed;
      if (snapshot) {
        const edit = this.publish(task, snapshot.packedRecords, snapshot.stats);
        if (edit) edits.push(edit);
      }
      if (now() - started >= budgetMs) break;
    }
    if (edits.length > 0) {
      this.edits = edits;
      this.editSerial++;
    }
    return this.pending;
  }

  /** Loading-only: drive the same bounded steps until the request is satisfied. */
  settle(now: () => number): void {
    let guard =
      Math.ceil(
        (this.required.length + this.slotCapacity) / Math.max(1, this.options.publishPerStep),
      ) *
        2 +
      4;
    while (this.pending && guard-- > 0) this.step(now, Number.POSITIVE_INFINITY);
  }

  dispose(): void {
    this.task = null;
    this.tiles.clear();
    this.slots.fill(null);
    this.usedSlots = 0;
    this.recordCount = 0;
    this.edits = [];
    this.clearRequest();
  }

  /**
   * Only the circle being requested and the circle already published may draw:
   * a tile outside both would add focus-density grass where the base field is
   * not culled. Freeing compacts the last slot into the hole, so the live range
   * stays exactly the resident tiles and the route pass never dispatches over
   * retired coverage.
   */
  private releaseUnretained(edits: GrassRecordEdit[]): void {
    if (!this.pendingRelease) return;
    for (const tile of [...this.tiles.values()]) {
      if (edits.length >= this.options.publishPerStep) return;
      if (this.requiredKeys.has(tile.key) || this.protectedKeys.has(tile.key)) continue;
      const edit = this.release(tile);
      if (edit) edits.push(edit);
    }
    this.pendingRelease = false;
  }

  private release(tile: ResidentTile): GrassRecordEdit | null {
    this.tiles.delete(tile.key);
    this.accumulate(tile, -1);
    this.evictedTiles++;
    const last = this.usedSlots - 1;
    const moved = this.slots[last];
    this.slots[last] = null;
    this.usedSlots = last;
    this.recordCount = this.usedSlots * this.slotRecords;
    if (!moved || moved === tile) {
      this.slots[tile.slot] = null;
      return null;
    }
    const stride = GRASS_FIELD_PACKED_STRIDE_FLOATS * this.slotRecords;
    this.records.copyWithin(tile.slot * stride, last * stride, (last + 1) * stride);
    moved.slot = tile.slot;
    this.slots[tile.slot] = moved;
    return { start: tile.slot * this.slotRecords, count: this.slotRecords };
  }

  private startNextTask(): SampleTask | null {
    while (this.missingIndex < this.required.length) {
      const next = this.required[this.missingIndex];
      if (this.tiles.has(next.key)) {
        this.missingIndex++;
        continue;
      }
      const range: GrassFieldCellRange = {
        startX: next.tx * this.cellsPerEdge,
        endX: next.tx * this.cellsPerEdge + this.cellsPerEdge - 1,
        startY: next.ty * this.cellsPerEdge,
        endY: next.ty * this.cellsPerEdge + this.cellsPerEdge - 1,
      };
      const centerX = (next.tx + 0.5) * this.options.tileM;
      const centerY = (next.ty + 0.5) * this.options.tileM;
      this.task = {
        key: next.key,
        tx: next.tx,
        ty: next.ty,
        generation: this.generation,
        sampler: this.options.sampleTile(range, centerX, centerY, this.slotRecords),
      };
      return this.task;
    }
    return null;
  }

  private publish(
    task: SampleTask,
    packed: Float32Array,
    stats: GrassFieldStats,
  ): GrassRecordEdit | null {
    // Reject a completion the camera moved past while it was sampling.
    if (task.generation !== this.generation || !this.requiredKeys.has(task.key)) {
      this.cancelledTiles++;
      this.cancelledCells += this.tileCells;
      return null;
    }
    if (this.tiles.has(task.key)) return null;
    const slot = this.claimSlot();
    if (slot < 0) return null;
    const stride = GRASS_FIELD_PACKED_STRIDE_FLOATS;
    const records = Math.min(this.slotRecords, packed.length / stride);
    const base = slot * this.slotRecords * stride;
    this.records.set(packed.subarray(0, records * stride), base);
    const padFrom = base + records * stride;
    const padTo = base + this.slotRecords * stride;
    this.records.fill(0, padFrom, padTo);
    for (let offset = padFrom; offset < padTo; offset += stride) {
      this.records[offset] = GRASS_TILE_PAD_COORD_M;
      this.records[offset + 1] = GRASS_TILE_PAD_COORD_M;
    }
    const tile: ResidentTile = {
      key: task.key,
      tx: task.tx,
      ty: task.ty,
      slot,
      records,
      hash: hashPackedRecordsRange(packed, 0, records * stride, 0x811c9dc5),
      stats,
    };
    this.slots[slot] = tile;
    this.tiles.set(tile.key, tile);
    this.accumulate(tile, 1);
    this.publishedRecords += this.slotRecords;
    this.recordCount = this.usedSlots * this.slotRecords;
    return { start: slot * this.slotRecords, count: this.slotRecords };
  }

  private claimSlot(): number {
    if (this.usedSlots < this.slotCapacity) return this.usedSlots++;
    let victim = this.evictionCandidate();
    if (!victim) {
      // Only protected coverage is left: the owner retires that focus rather
      // than punching a hole inside a dedupe circle it already published.
      this.options.releaseProtection();
      victim = this.evictionCandidate();
    }
    if (!victim) return -1;
    this.tiles.delete(victim.key);
    this.slots[victim.slot] = null;
    this.accumulate(victim, -1);
    this.evictedTiles++;
    return victim.slot;
  }

  private evictionCandidate(): ResidentTile | null {
    const center = this.center;
    let victim: ResidentTile | null = null;
    let worst = -1;
    for (const tile of this.tiles.values()) {
      if (this.requiredKeys.has(tile.key) || this.protectedKeys.has(tile.key)) continue;
      const distance = center
        ? Math.hypot(
            (tile.tx + 0.5) * this.options.tileM - center.x,
            (tile.ty + 0.5) * this.options.tileM - center.y,
          )
        : 0;
      if (distance <= worst) continue;
      worst = distance;
      victim = tile;
    }
    return victim;
  }

  private accumulate(tile: ResidentTile, sign: 1 | -1): void {
    this.hashAccum = (this.hashAccum + sign * mixTileHash(tile)) >>> 0;
    if (this.tiles.size === 0) {
      this.aggregate = null;
      return;
    }
    if (!this.aggregate) {
      this.aggregate = blankStats(tile.stats, this.slotCapacity * this.slotRecords);
      this.aggregate.snapX = this.center?.x ?? tile.stats.snapX;
      this.aggregate.snapY = this.center?.y ?? tile.stats.snapY;
    }
    addStats(this.aggregate, tile.stats, sign);
  }

  private coverTiles(centerX: number, centerY: number, radiusM: number): RequiredTile[] {
    const [ox, oy, width, height] = this.options.terrainRect;
    const size = this.options.tileM;
    const tiles: RequiredTile[] = [];
    const i0 = Math.max(Math.floor((centerX - radiusM) / size), Math.floor(ox / size));
    const i1 = Math.min(Math.floor((centerX + radiusM) / size), Math.floor((ox + width) / size));
    const j0 = Math.max(Math.floor((centerY - radiusM) / size), Math.floor(oy / size));
    const j1 = Math.min(Math.floor((centerY + radiusM) / size), Math.floor((oy + height) / size));
    for (let tx = i0; tx <= i1; tx++) {
      for (let ty = j0; ty <= j1; ty++) {
        const nx = Math.max(tx * size, Math.min(centerX, (tx + 1) * size));
        const ny = Math.max(ty * size, Math.min(centerY, (ty + 1) * size));
        const distance = Math.hypot(nx - centerX, ny - centerY);
        if (distance > radiusM) continue;
        tiles.push({ key: tileKey(tx, ty), tx, ty, distance });
      }
    }
    // Nearest first: the tiles the camera is standing in become useful coverage
    // before the far rim, so a partial request is still worth publishing.
    tiles.sort((a, b) => a.distance - b.distance || a.key - b.key);
    return tiles;
  }
}

export function tileKey(tx: number, ty: number): number {
  return ((tx + 0x8000) & 0xffff) * 0x10000 + ((ty + 0x8000) & 0xffff);
}

function terrainTiles(options: GrassFocusTileOptions): number {
  const [ox, oy, width, height] = options.terrainRect;
  const size = options.tileM;
  const columns = Math.floor((ox + width) / size) - Math.floor(ox / size) + 1;
  const rows = Math.floor((oy + height) / size) - Math.floor(oy / size) + 1;
  return Math.max(1, columns * rows);
}

function mixTileHash(tile: ResidentTile): number {
  let h = (tile.hash ^ tile.key) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb_352d);
  h ^= h >>> 15;
  return h >>> 0;
}

const SUMMED_STATS = [
  "candidateCells",
  "acceptedRecords",
  "cappedRecords",
  "outOfBoundsCells",
  "rejectedTintCells",
  "rejectedSlopeCells",
  "rejectedDensityCells",
  "openGrassCells",
  "forestCells",
  "roughCells",
  "packedBytes",
] as const;
const SUMMED_TIER_STATS = ["lodCandidateCounts", "lodDroppedByBudget", "lodCounts"] as const;

function blankStats(template: GrassFieldStats, capacity: number): GrassFieldStats {
  const blank: GrassFieldStats = {
    ...template,
    recordCapacity: capacity,
    lodCandidateCounts: [0, 0, 0],
    lodBudgetQuotas: [...template.lodBudgetQuotas],
    lodDroppedByBudget: [0, 0, 0],
    lodCounts: [0, 0, 0],
  };
  for (const field of SUMMED_STATS) blank[field] = 0;
  return blank;
}

function addStats(into: GrassFieldStats, from: GrassFieldStats, sign: 1 | -1): void {
  for (const field of SUMMED_STATS) into[field] += sign * from[field];
  for (const field of SUMMED_TIER_STATS) {
    for (let tier = 0; tier < 3; tier++) into[field][tier] += sign * from[field][tier];
  }
}
