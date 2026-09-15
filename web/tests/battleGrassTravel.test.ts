// @vitest-environment node
import { expect, test } from "vitest";
import {
  BattleGrassResidency,
  productionBladeFieldProfile,
  initialBladeFieldTransition,
} from "@packages/game-renderer/src/battle/battleGrassResidency";
import { flatHeightField } from "@packages/game-renderer/src/terrain/heightField";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";

const CELL = 4;
const CELLS = 150;
const ORIGIN = -(CELLS * CELL) / 2;

/** A 600x600 m battlefield: travel crosses many 48 m snapped focus cells.
 *  `msPerTick` sets how fast the fake clock burns the per-slice time budget. */
function travelFixture(msPerTick = 0.5) {
  const grid = {
    w: CELLS,
    h: CELLS,
    cell: CELL,
    ox: ORIGIN,
    oy: ORIGIN,
    height: new Float32Array(CELLS * CELLS),
    tint: new Uint8Array(CELLS * CELLS),
    speed: new Float32Array(CELLS * CELLS),
    rough: new Float32Array(CELLS * CELLS),
  };
  const scheduled: (() => void)[] = [];
  let now = 0;
  const profile = productionBladeFieldProfile();
  const owner = new BattleGrassResidency(profile, initialBladeFieldTransition(profile), () => {}, {
    now: () => (now += msPerTick),
    schedule: (callback) => scheduled.push(callback),
  });
  owner.setTerrain(grid, flatHeightField(ORIGIN, ORIGIN, CELLS, CELLS, CELL), "green-grass");
  const camera: Camera3DParams = {
    target: [0, 0, 0],
    distance: 32,
    pitch: 0.8,
    yaw: 0,
    fovY: Math.PI / 4,
    aspect: 1.5,
    near: 0.1,
    far: 2000,
  };
  const runScheduled = (slices: number) => {
    for (let i = 0; i < slices && scheduled.length > 0; i++) scheduled.shift()!();
  };
  const at = (x: number, y: number): Camera3DParams => ({ ...camera, target: [x, y, 0] });
  return { owner, grid, scheduled, camera, runScheduled, at };
}

test("sustained travel keeps publishing focus coverage instead of restarting the same prefix", () => {
  const { owner, runScheduled, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    runScheduled(4);
    // Travel west to east across 12 snapped focus cells, four sampling slices per step.
    for (let step = 1; step <= 12; step++) {
      owner.update(at(step * 48, 0), 900);
      runScheduled(4);
    }
    const ring = owner.snapshot().ring;
    expect(ring.records).not.toBeNull();
    expect(ring.recordCount).toBeGreaterThan(0);
  } finally {
    owner.dispose();
  }
});

test("travel publishes into one persistent buffer that is never reallocated or overrun", () => {
  const { owner, runScheduled, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    runScheduled(4);
    const buffer = owner.snapshot().ring.records;
    expect(buffer).not.toBeNull();
    for (let step = 1; step <= 12; step++) {
      owner.update(at(step * 96, 0), 900);
      runScheduled(4);
      const ring = owner.snapshot().ring;
      const stats = owner.stats().rebuild;
      // One capacity buffer: publication never swaps a fresh allocation in, and
      // the live range only ever covers resident tiles.
      expect(ring.records).toBe(buffer);
      expect(ring.recordCount).toBe(stats.residentTiles * stats.tileSlotRecords);
      expect(ring.recordCount).toBeLessThanOrEqual(stats.retainedRecordBytes / 64);
    }
    expect(owner.stats().rebuild.retainedRecordBytes).toBe(buffer!.byteLength);
  } finally {
    owner.dispose();
  }
});

test("each publication step writes a bounded number of bounded record ranges", () => {
  const { owner, runScheduled, at } = travelFixture();
  try {
    let serial = -1;
    let steps = 0;
    for (let step = 0; step <= 12; step++) {
      owner.update(at(step * 48, 0), 900);
      runScheduled(4);
      const ring = owner.snapshot().ring;
      if (ring.editSerial === serial) continue;
      serial = ring.editSerial;
      steps++;
      const stats = owner.stats().rebuild;
      expect(ring.edits.length).toBeLessThanOrEqual(stats.publishTilesPerStep);
      for (const edit of ring.edits) {
        expect(edit.count).toBeLessThanOrEqual(stats.tileSlotRecords);
        expect(edit.start + edit.count).toBeLessThanOrEqual(stats.retainedRecordBytes / 64);
      }
    }
    expect(steps).toBeGreaterThan(0);
  } finally {
    owner.dispose();
  }
});

test("the base dedupe circle only moves onto coverage that is already resident", () => {
  const { owner, runScheduled, at } = travelFixture();
  try {
    let circle = JSON.stringify(owner.snapshot().base.circle);
    for (let step = 0; step <= 12; step++) {
      owner.update(at(step * 48, 0), 900);
      for (let slice = 0; slice < 4; slice++) {
        runScheduled(1);
        const next = JSON.stringify(owner.snapshot().base.circle);
        if (next === circle) continue;
        circle = next;
        if (owner.snapshot().base.circle) {
          expect(owner.stats().rebuild.missingTiles).toBe(0);
          expect(owner.stats().rebuild.activeCoverageResident).toBe(true);
        }
      }
    }
  } finally {
    owner.dispose();
  }
});

test("settling after travel completes the requested focus and centres the dedupe circle on it", () => {
  const { owner, runScheduled, at } = travelFixture();
  try {
    for (let step = 0; step <= 6; step++) {
      owner.update(at(step * 96, 0), 900);
      runScheduled(2);
    }
    owner.update(at(288, 0), 900);
    owner.settle();
    const stats = owner.stats().rebuild;
    expect(stats.missingTiles).toBe(0);
    expect(stats.pending).toBe(false);
    expect(owner.snapshot().base.circle).toEqual({
      center: [288, 0],
      radiusSq: 280 * 280,
      enabled: true,
    });
  } finally {
    owner.dispose();
  }
});

test("a focus change keeps sampled tiles and wastes at most the one tile in flight", () => {
  const { owner, runScheduled, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    runScheduled(4);
    const resident = owner.stats().rebuild.residentTiles;
    expect(resident).toBeGreaterThan(0);
    owner.update(at(480, 480), 900);
    expect(owner.stats().rebuild.residentTiles).toBe(resident);
    runScheduled(4);
    const stats = owner.stats().rebuild;
    expect(stats.cancelledTiles).toBeLessThanOrEqual(1);
    expect(stats.cancelledCells).toBeLessThanOrEqual(stats.tileCells);
  } finally {
    owner.dispose();
  }
});

test("reversing costs the crescent that changed, never a whole circle again", () => {
  const { owner, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    owner.settle();
    const settled = owner.stats().rebuild;
    expect(settled.missingTiles).toBe(0);
    owner.update(at(96, 0), 900);
    owner.settle();
    const advanced = owner.stats().rebuild;
    expect(advanced.sampledTiles - settled.sampledTiles).toBeLessThan(settled.requiredTiles);
    owner.update(at(0, 0), 900);
    owner.settle();
    const returned = owner.stats().rebuild;
    expect(returned.sampledTiles - advanced.sampledTiles).toBeLessThan(advanced.requiredTiles);
    expect(returned.missingTiles).toBe(0);
    expect(returned.activeCoverageResident).toBe(true);
    expect(owner.snapshot().base.circle).toEqual({
      center: [0, 0],
      radiusSq: 280 * 280,
      enabled: true,
    });
  } finally {
    owner.dispose();
  }
});

test("long travel plateaus retained tiles at the slot capacity", () => {
  const { owner, runScheduled, at } = travelFixture();
  try {
    for (let step = 0; step <= 8; step++) {
      owner.update(at(step * 96, (step % 4) * 96), 900);
      runScheduled(6);
      const stats = owner.stats().rebuild;
      // The dedupe circle never outlives the coverage it culls the base inside.
      if (owner.snapshot().base.circle) expect(stats.activeCoverageResident).toBe(true);
      expect(stats.residentTiles).toBeLessThanOrEqual(stats.slotCapacity);
      expect(owner.snapshot().ring.recordCount).toBe(stats.residentTiles * stats.tileSlotRecords);
    }
    const stats = owner.stats().rebuild;
    expect(stats.sampledCells).toBe(stats.sampledTiles * stats.tileCells);
    // Waste is bounded by whole cancelled tiles - never a re-scanned prefix.
    expect(stats.cancelledCells).toBeLessThanOrEqual((stats.cancelledTiles + 1) * stats.tileCells);
  } finally {
    owner.dispose();
  }
});

test("a settled focus draws exactly its own cover tiles, not the circle it replaced", () => {
  const { owner, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    owner.settle();
    owner.update(at(192, 96), 900);
    owner.settle();
    const stats = owner.stats().rebuild;
    // Retired coverage would otherwise keep drawing focus-density grass where
    // the base field is no longer culled.
    expect(stats.residentTiles).toBe(stats.requiredTiles);
    expect(owner.snapshot().ring.recordCount).toBe(stats.requiredTiles * stats.tileSlotRecords);
    expect(stats.evictedTiles).toBeGreaterThan(0);
  } finally {
    owner.dispose();
  }
});

test("a jump whose two circles cannot both be retained drops the dedupe circle, not coverage", () => {
  // Wide enough that the two circles are disjoint and together exceed the slot
  // ceiling, so retaining both is genuinely impossible.
  const w = 300;
  const h = 120;
  const grid = {
    w,
    h,
    cell: 4,
    ox: -600,
    oy: -240,
    height: new Float32Array(w * h),
    tint: new Uint8Array(w * h),
    speed: new Float32Array(w * h),
    rough: new Float32Array(w * h),
  };
  const profile = productionBladeFieldProfile();
  let now = 0;
  const owner = new BattleGrassResidency(profile, initialBladeFieldTransition(profile), () => {}, {
    now: () => (now += 0.5),
    schedule: () => {},
  });
  owner.setTerrain(grid, flatHeightField(-600, -240, w, h, 4), "green-grass");
  const camera: Camera3DParams = {
    target: [-450, 0, 0],
    distance: 32,
    pitch: 0.8,
    yaw: 0,
    fovY: Math.PI / 4,
    aspect: 1.5,
    near: 0.1,
    far: 2000,
  };
  try {
    owner.update(camera, 900);
    owner.settle();
    const seeded = owner.stats().rebuild;
    expect(seeded.residentTiles).toBeGreaterThan(seeded.slotCapacity / 2);
    expect(owner.snapshot().base.circle).not.toBeNull();
    owner.update({ ...camera, target: [450, 0, 0] }, 900);
    owner.settle();
    const stats = owner.stats().rebuild;
    expect(stats.retiredFocusGenerations).toBe(1);
    expect(stats.residentTiles).toBeLessThanOrEqual(stats.slotCapacity);
    // A published dedupe circle is always backed by resident coverage - the
    // fallback drops the circle, never the grass under it.
    expect(stats.activeCoverageResident).toBe(true);
    expect(stats.missingTiles).toBe(0);
  } finally {
    owner.dispose();
  }
});

test("every slice that moves records inside the buffer also publishes their ranges", () => {
  // A coarse clock exhausts the slice budget part-way through a tile - the
  // slice most likely to drop ranges it had already compacted - while
  // continuous travel keeps both retirement and sampling outstanding at once.
  const { owner, scheduled, at } = travelFixture(3);
  try {
    owner.update(at(0, 0), 900);
    owner.settle();
    let live = owner.snapshot().ring.recordCount;
    let serial = owner.snapshot().ring.editSerial;
    let shrinks = 0;
    for (let slice = 0; slice < 400; slice++) {
      owner.update(at(96 + slice * 6, 48 + slice * 4), 900);
      if (scheduled.length === 0) break;
      scheduled.shift()!();
      const ring = owner.snapshot().ring;
      // A slice that compacted a slot but reported no edit leaves the GPU
      // drawing the tile that used to live there.
      if (ring.recordCount !== live) {
        expect(ring.editSerial).toBe(serial + 1);
        if (ring.recordCount < live) shrinks++;
      }
      live = ring.recordCount;
      serial = ring.editSerial;
    }
    expect(shrinks).toBeGreaterThan(0);
  } finally {
    owner.dispose();
  }
});
