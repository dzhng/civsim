import assert from "node:assert/strict";
import test from "node:test";
import {
  GRASS_FIELD_PACKED_STRIDE_FLOATS,
  sampleGrassField,
  type GrassFieldConfig,
  type GrassFieldRecord,
} from "../../packages/game-renderer/src/battle/grassField.ts";
import { terrainHeightField } from "../../packages/game-renderer/src/battle/terrainFeatures.ts";
import type { BattleTerrainGrid } from "../../packages/game-renderer/src/battle/terrainFeatures.ts";

test("grass field records are byte-stable for the same seed and focus", () => {
  const grid = makeGrid(6, 6, 10);
  const field = terrainHeightField(grid);
  const config = baseConfig();
  const a = sampleGrassField(grid, field, config);
  const b = sampleGrassField(grid, field, config);

  assert.ok(a.records.length > 0, JSON.stringify(a.stats));
  assert.deepEqual(Array.from(a.packedRecords), Array.from(b.packedRecords));
  assert.deepEqual(a.stats, b.stats);
  assert.equal(a.stats.recordCapacity, config.maxRecords);
  assert.equal(a.stats.packedStrideFloats, GRASS_FIELD_PACKED_STRIDE_FLOATS);
  assert.equal(
    a.stats.packedStrideBytes,
    GRASS_FIELD_PACKED_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT,
  );
  assert.equal(a.stats.packedBytes, a.packedRecords.byteLength);
});

test("grass field snap keeps sub-cell focus moves from reshuffling records", () => {
  const grid = makeGrid(7, 7, 10);
  const field = terrainHeightField(grid);
  const a = sampleGrassField(grid, field, {
    ...baseConfig(),
    focus: { x: 25, y: 25, radius: 24 },
    snapCellSize: 16,
  });
  const b = sampleGrassField(grid, field, {
    ...baseConfig(),
    focus: { x: 30.5, y: 27.25, radius: 24 },
    snapCellSize: 16,
  });

  assert.equal(a.stats.snapX, b.stats.snapX);
  assert.equal(a.stats.snapY, b.stats.snapY);
  assert.deepEqual(Array.from(a.packedRecords), Array.from(b.packedRecords));
});

test("grass field rejects blocked terrain tints while preserving allowed cover", () => {
  const tint = new Uint8Array([0, 1, 2, 0, 3, 0, 5, 0, 0, 4, 6, 0, 0, 0, 0, 0]);
  const grid = makeGrid(4, 4, 10, tint);
  const field = terrainHeightField(grid);
  const snapshot = sampleGrassField(grid, field, {
    ...baseConfig(),
    focus: { x: 20, y: 20, radius: 30 },
    fieldCellSize: 10,
    snapCellSize: 10,
    density: 1,
    jitter: 0,
    minNormalZ: 0,
    maxRecords: 64,
  });

  assert.ok(snapshot.stats.rejectedTintCells >= 4, JSON.stringify(snapshot.stats));
  assert.equal(
    snapshot.records.some((record) => [1, 2, 3, 5].includes(record.tint)),
    false,
  );
  assert.ok(snapshot.stats.openGrassCells > 0, JSON.stringify(snapshot.stats));
  assert.ok(snapshot.stats.forestCells > 0, JSON.stringify(snapshot.stats));
});

test("grass field rejects steep slopes from the shared terrain normal", () => {
  const height = new Float32Array(16);
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) height[cy * 4 + cx] = cx * 32;
  }
  const grid = makeGrid(4, 4, 10, undefined, height);
  const field = terrainHeightField(grid);
  const snapshot = sampleGrassField(grid, field, {
    ...baseConfig(),
    focus: { x: 20, y: 20, radius: 26 },
    fieldCellSize: 10,
    snapCellSize: 10,
    density: 1,
    jitter: 0,
    minNormalZ: 0.72,
    maxRecords: 64,
  });

  assert.equal(snapshot.records.length, 0, JSON.stringify(snapshot.records));
  assert.ok(snapshot.stats.rejectedSlopeCells > 0, JSON.stringify(snapshot.stats));
});

test("grass field records expose finite packed blade and clump data", () => {
  const grid = makeGrid(6, 6, 10);
  const field = terrainHeightField(grid);
  const snapshot = sampleGrassField(grid, field, baseConfig());

  assert.ok(snapshot.records.length > 0, JSON.stringify(snapshot.stats));
  assert.equal(
    snapshot.stats.lodCounts.reduce((sum, value) => sum + value, 0),
    snapshot.records.length,
  );
  for (const record of snapshot.records) assertRecordIsFinite(record);
});

test("grass field publishes explicit capacity and cap counters", () => {
  const grid = makeGrid(8, 8, 10);
  const field = terrainHeightField(grid);
  const snapshot = sampleGrassField(grid, field, {
    ...baseConfig(),
    focus: { x: 35, y: 35, radius: 36 },
    fieldCellSize: 8,
    snapCellSize: 16,
    density: 1,
    jitter: 0,
    maxRecords: 3,
  });

  assert.equal(snapshot.stats.recordCapacity, 3);
  assert.equal(snapshot.stats.acceptedRecords, 3);
  assert.equal(snapshot.records.length, 3);
  assert.equal(snapshot.packedRecords.length, 3 * GRASS_FIELD_PACKED_STRIDE_FLOATS);
  assert.ok(snapshot.stats.cappedRecords > 0, JSON.stringify(snapshot.stats));
});

function baseConfig(): GrassFieldConfig {
  return {
    seed: 0x1234_abcd,
    focus: { x: 25, y: 25, radius: 24 },
    fieldCellSize: 8,
    snapCellSize: 16,
    clumpCellSize: 24,
    maxRecords: 128,
    density: 1,
    jitter: 0.35,
  };
}

function makeGrid(
  w: number,
  h: number,
  cell: number,
  tint?: Uint8Array,
  height?: Float32Array,
): BattleTerrainGrid {
  return {
    w,
    h,
    cell,
    ox: 0,
    oy: 0,
    tint: tint ?? new Uint8Array(w * h),
    height,
  };
}

function assertRecordIsFinite(record: GrassFieldRecord): void {
  const scalars = [
    record.x,
    record.y,
    record.z,
    record.worldCellX,
    record.worldCellY,
    record.lodTier,
    record.normalX,
    record.normalY,
    record.normalZ,
    record.width,
    record.height,
    record.bend,
    record.windPhase,
    record.yaw,
    record.clumpSeed,
    record.bladeSeed,
    record.clumpWeight,
  ];
  assert.ok(scalars.every(Number.isFinite), JSON.stringify(record));
  const normalLength = Math.hypot(record.normalX, record.normalY, record.normalZ);
  assert.ok(Math.abs(normalLength - 1) < 1e-5, JSON.stringify({ record, normalLength }));
  assert.ok(
    record.lodTier === 0 || record.lodTier === 1 || record.lodTier === 2,
    JSON.stringify(record),
  );
  assert.ok(record.clumpSeed >= 0 && record.clumpSeed <= 0x00ff_ffff, JSON.stringify(record));
  assert.ok(record.bladeSeed >= 0 && record.bladeSeed <= 0x00ff_ffff, JSON.stringify(record));
}
