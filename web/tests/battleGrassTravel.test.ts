// @vitest-environment node
import { expect, test } from "vitest";
import {
  BattleGrassResidency,
  productionBladeFieldProfile,
  initialBladeFieldTransition,
} from "@packages/game-renderer/src/battle/battleGrassResidency";
import { recordSurvivesRouteMask } from "@packages/game-renderer/src/battle/grassCoverage";
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
  const at = (x: number, y: number): Camera3DParams => ({ ...camera, target: [x, y, 0] });
  /** One sampling callback followed by the consumer taking its ranges - which is
   *  what a rendered frame does, and what releases the next publication step. */
  const renderSlices = (slices: number) => {
    const taken: { start: number; count: number }[] = [];
    for (let i = 0; i < slices && scheduled.length > 0; i++) {
      scheduled.shift()!();
      taken.push(...owner.takeRingEdits());
    }
    return taken;
  };
  return { owner, grid, scheduled, camera, renderSlices, at };
}

/** How many of the two grass fields draw the ground at `x, y`. */
function fieldsDrawing(owner: BattleGrassResidency, x: number, y: number): number {
  const { base, ring } = owner.snapshot();
  return (
    Number(base.visible && recordSurvivesRouteMask(base.mask, x, y)) +
    Number(ring.visible && recordSurvivesRouteMask(ring.mask, x, y))
  );
}

/** Points spanning the published coverage, its rim and the base field beyond. */
function samplePoints(centerX: number, centerY: number): [number, number][] {
  const points: [number, number][] = [];
  for (let dx = -336; dx <= 336; dx += 7)
    for (let dy = -336; dy <= 336; dy += 7) points.push([centerX + dx, centerY + dy]);
  return points;
}

test("sustained travel keeps publishing focus coverage instead of restarting the same prefix", () => {
  const { owner, renderSlices, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    renderSlices(4);
    // Travel west to east across 12 snapped focus cells, four sampling slices per step.
    for (let step = 1; step <= 12; step++) {
      owner.update(at(-240 + (step % 11) * 48, 0), 900);
      renderSlices(4);
      const current = owner.snapshot().ring;
      expect(current.visible).toBe(true);
      expect(current.mask).not.toBeNull();
      expect(Math.abs(current.mask!.center[0] - (-240 + (step % 11) * 48))).toBeLessThanOrEqual(48);
      expect(current.mask!.radiusSq).toBeGreaterThan(0);
      expect(owner.stats().rebuild.activeCoverageResident).toBe(true);
    }
    const ring = owner.snapshot().ring;
    expect(ring.records).not.toBeNull();
    expect(ring.recordCount).toBeGreaterThan(0);
  } finally {
    owner.dispose();
  }
});

test("travel publishes into one persistent buffer that is never reallocated or overrun", () => {
  const { owner, renderSlices, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    renderSlices(4);
    const buffer = owner.snapshot().ring.records;
    expect(buffer).not.toBeNull();
    for (let step = 1; step <= 12; step++) {
      owner.update(at(step * 96, 0), 900);
      renderSlices(4);
      const ring = owner.snapshot().ring;
      const stats = owner.stats().rebuild;
      // One capacity buffer: publication never swaps a fresh allocation in, and
      // the live range only ever covers resident tiles.
      expect(ring.records).toBe(buffer);
      expect(ring.recordCount).toBe(stats.residentTiles * stats.tileSlotRecords);
      expect(ring.recordCapacity).toBe(stats.retainedRecordBytes / 64);
      expect(ring.recordCount).toBeLessThanOrEqual(ring.recordCapacity);
    }
    expect(owner.stats().rebuild.retainedRecordBytes).toBe(buffer!.byteLength);
  } finally {
    owner.dispose();
  }
});

test("each publication step writes a bounded number of bounded record ranges", () => {
  const { owner, renderSlices, at } = travelFixture();
  try {
    let serial = -1;
    let steps = 0;
    for (let step = 0; step <= 12; step++) {
      owner.update(at(step * 48, 0), 900);
      for (let slice = 0; slice < 4; slice++) {
        const stats = owner.stats().rebuild;
        const taken = renderSlices(1);
        const ring = owner.snapshot().ring;
        if (ring.editSerial === serial) continue;
        serial = ring.editSerial;
        steps++;
        expect(taken.length).toBeLessThanOrEqual(stats.publishTilesPerStep);
        for (const edit of taken) {
          expect(edit.count).toBeLessThanOrEqual(stats.tileSlotRecords);
          expect(edit.start + edit.count).toBeLessThanOrEqual(ring.recordCapacity);
        }
      }
    }
    expect(steps).toBeGreaterThan(0);
  } finally {
    owner.dispose();
  }
});

test("travel never asks a consumer to re-read the whole record buffer", () => {
  const { owner, renderSlices, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    owner.settle();
    owner.takeRingEdits();
    const settled = owner.snapshot().ring.revision;
    for (let step = 1; step <= 16; step++) {
      owner.update(at(step * 48, step * 24), 900);
      renderSlices(4);
      // A revision bump is the consumer's instruction to upload the live range
      // whole. Camera motion must never be that instruction.
      expect(owner.snapshot().ring.revision).toBe(settled);
    }
  } finally {
    owner.dispose();
  }
});

test("delayed draws do not widen the ranges one take hands the consumer", () => {
  const { owner, scheduled, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    owner.settle();
    owner.takeRingEdits();
    const bound = owner.stats().rebuild.publishTilesPerStep;
    const serialBefore = owner.snapshot().ring.editSerial;
    // Many sampling opportunities, no rendered frame between them: the camera
    // keeps moving and every scheduled callback is run, repeatedly.
    for (let step = 1; step <= 40; step++) {
      owner.update(at(step * 24, 0), 900);
      while (scheduled.length > 0) scheduled.shift()!();
    }
    const ring = owner.snapshot().ring;
    expect(ring.edits.length).toBeLessThanOrEqual(bound);
    // At most one unconsumed publication exists, so the bound per render is the
    // same number as the bound per sampling step.
    expect(ring.editSerial).toBeLessThanOrEqual(serialBefore + 1);
    expect(owner.takeRingEdits().length).toBeLessThanOrEqual(bound);
  } finally {
    owner.dispose();
  }
});

test("the published coverage only moves onto tiles that are already resident", () => {
  const { owner, scheduled, renderSlices, at } = travelFixture();
  try {
    let mask = JSON.stringify(owner.snapshot().base.mask);
    for (let step = 0; step <= 12; step++) {
      owner.update(at(step * 48, 0), 900);
      for (let slice = 0; slice < 4; slice++) {
        renderSlices(1);
        const next = JSON.stringify(owner.snapshot().base.mask);
        if (next === mask) continue;
        mask = next;
        if (owner.snapshot().base.mask) {
          const stats = owner.stats().rebuild;
          expect(stats.activeCoverageResident).toBe(true);
          // The coverage handed to the GPU is strictly inside the coverage that
          // was sampled, so no tile can be claimed and then found missing.
          expect(stats.coverageRadiusM).toBeLessThan(stats.coverageSampledRadiusM);
        }
      }
      if (scheduled.length === 0 && owner.stats().rebuild.pending) break;
    }
  } finally {
    owner.dispose();
  }
});

test("settling after travel completes the requested focus and centres the coverage on it", () => {
  const { owner, renderSlices, at } = travelFixture();
  try {
    for (let step = 0; step <= 6; step++) {
      owner.update(at(step * 96, 0), 900);
      renderSlices(2);
    }
    owner.update(at(288, 0), 900);
    owner.settle();
    const stats = owner.stats().rebuild;
    expect(stats.missingTiles).toBe(0);
    expect(stats.pending).toBe(false);
    const { base, ring } = owner.snapshot();
    expect(base.mask).toEqual({
      center: [288, 0],
      radiusSq: stats.coverageRadiusM * stats.coverageRadiusM,
      tileM: stats.coverageTileM,
      keepInside: false,
      enabled: true,
    });
    // One coverage, opposite senses.
    expect(ring.mask).toEqual({ ...base.mask, keepInside: true });
  } finally {
    owner.dispose();
  }
});

test("a focus change keeps sampled tiles and wastes at most the one tile in flight", () => {
  const { owner, renderSlices, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    renderSlices(4);
    const resident = owner.stats().rebuild.residentTiles;
    expect(resident).toBeGreaterThan(0);
    owner.update(at(480, 480), 900);
    expect(owner.stats().rebuild.residentTiles).toBe(resident);
    renderSlices(4);
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
    expect(owner.snapshot().base.mask?.center).toEqual([0, 0]);
  } finally {
    owner.dispose();
  }
});

test("long travel plateaus retained tiles at the slot capacity", () => {
  const { owner, renderSlices, at } = travelFixture();
  try {
    for (let step = 0; step <= 8; step++) {
      owner.update(at(step * 96, (step % 4) * 96), 900);
      renderSlices(6);
      const stats = owner.stats().rebuild;
      // The published coverage never outlives the tiles it culls the base inside.
      if (owner.snapshot().base.mask) expect(stats.activeCoverageResident).toBe(true);
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

test("a jump whose two circles cannot both be retained drops the coverage, not the grass", () => {
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
    expect(owner.snapshot().base.mask).not.toBeNull();
    owner.update({ ...camera, target: [450, 0, 0] }, 900);
    owner.settle();
    const stats = owner.stats().rebuild;
    expect(stats.retiredFocusGenerations).toBe(1);
    expect(stats.residentTiles).toBeLessThanOrEqual(stats.slotCapacity);
    // Published coverage is always backed by resident tiles - the fallback drops
    // the coverage, never the grass under it.
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
    owner.takeRingEdits();
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
      owner.takeRingEdits();
    }
    expect(shrinks).toBeGreaterThan(0);
  } finally {
    owner.dispose();
  }
});

test("resident inner coverage becomes visible and grows before the whole request completes", () => {
  const { owner, renderSlices, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    let previousRadius = 0;
    let growth = 0;
    for (let slice = 0; slice < 12; slice++) {
      renderSlices(1);
      const { ring } = owner.snapshot();
      const stats = owner.stats().rebuild;
      expect(stats.missingTiles).toBeGreaterThan(0);
      expect(stats.activeCoverageResident).toBe(true);
      if (!ring.visible) continue;
      expect(ring.mask).not.toBeNull();
      expect(recordSurvivesRouteMask(ring.mask, 0, 0)).toBe(true);
      expect(stats.coverageRadiusM).toBeGreaterThanOrEqual(previousRadius);
      if (stats.coverageRadiusM > previousRadius) growth++;
      previousRadius = stats.coverageRadiusM;
      expect(stats.activeGeneration).toBeLessThan(stats.requestedGeneration);
      expect(fieldsDrawing(owner, 0, 0)).toBe(1);
    }
    expect(growth).toBeGreaterThan(1);
    owner.settle();
    expect(owner.snapshot().ring.visible).toBe(true);
    expect(owner.stats().rebuild.activeGeneration).toBe(owner.stats().rebuild.requestedGeneration);
  } finally {
    owner.dispose();
  }
});

test("exactly one grass field owns every point, through arrival, admission and reversal", () => {
  const { owner, renderSlices, at } = travelFixture();
  try {
    const stops: [number, number][] = [
      [0, 0],
      [48, 0],
      [96, 48],
      [192, 96],
      [96, 48],
      [0, 0],
    ];
    let checked = 0;
    for (const [x, y] of stops) {
      owner.update(at(x, y), 900);
      for (let slice = 0; slice < 5; slice++) {
        renderSlices(1);
        const active = owner.snapshot().base.mask?.center ?? [x, y];
        for (const [px, py] of samplePoints(active[0], active[1])) {
          // Two fields drawing the same ground doubles the authored density;
          // neither drawing it leaves bare terrain.
          expect(fieldsDrawing(owner, px, py)).toBe(1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  } finally {
    owner.dispose();
  }
});

test("the coverage boundary is a tile edge, so neither field can round it differently", () => {
  const { owner, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    owner.settle();
    const { base, ring } = owner.snapshot();
    const stats = owner.stats().rebuild;
    const tile = stats.coverageTileM;
    expect(base.mask?.tileM).toBe(tile);
    expect(ring.mask?.tileM).toBe(tile);
    // Walk one tile row across the rim: ownership flips on a tile edge, and both
    // fields flip on the same one.
    const y = tile / 2;
    let flips = 0;
    for (let x = 0; x < stats.coverageRadiusM + 2 * tile; x += tile / 4) {
      expect(fieldsDrawing(owner, x, y)).toBe(1);
      const inside = recordSurvivesRouteMask(ring.mask, x, y);
      const next = recordSurvivesRouteMask(ring.mask, x + tile / 4, y);
      if (inside === next) continue;
      flips++;
      // The flip lands on a multiple of the tile edge, never mid-tile.
      expect(Math.floor(x / tile)).not.toBe(Math.floor((x + tile / 4) / tile));
    }
    expect(flips).toBe(1);
  } finally {
    owner.dispose();
  }
});

test("an off-terrain request retires coverage and releases all old tiles", () => {
  const { owner, at } = travelFixture();
  try {
    owner.update(at(0, 0), 900);
    owner.settle();
    expect(owner.snapshot().ring.visible).toBe(true);
    owner.update(at(1000, 0), 900);
    owner.settle();
    const stats = owner.stats().rebuild;
    expect(stats.requiredTiles).toBe(0);
    expect(stats.residentTiles).toBe(0);
    expect(stats.activeGeneration).toBe(stats.requestedGeneration);
    expect(stats.pending).toBe(false);
    expect(owner.snapshot().ring.recordCount).toBe(0);
    expect(owner.snapshot().ring.visible).toBe(false);
    expect(owner.snapshot().base.mask).toBeNull();
  } finally {
    owner.dispose();
  }
});
