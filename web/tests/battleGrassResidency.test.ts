// @vitest-environment node
import { expect, test } from "vitest";
import {
  BattleGrassResidency,
  productionBladeFieldProfile,
  initialBladeFieldTransition,
} from "@packages/game-renderer/src/battle/battleGrassResidency";
import { flatHeightField } from "@packages/game-renderer/src/terrain/heightField";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";

function fixture() {
  const grid = {
    w: 16,
    h: 16,
    cell: 4,
    ox: -32,
    oy: -32,
    height: new Float32Array(256),
    tint: new Uint8Array(256),
    speed: new Float32Array(256),
    rough: new Float32Array(256),
  };
  const scheduled: (() => void)[] = [];
  let now = 0;
  const profile = productionBladeFieldProfile();
  const owner = new BattleGrassResidency(profile, initialBladeFieldTransition(profile), () => {}, {
    now: () => (now += 0.5),
    schedule: (callback) => scheduled.push(callback),
  });
  owner.setTerrain(grid, flatHeightField(-32, -32, 16, 16, 4), "green-grass");
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
  /** A sampling callback plus the consumer taking its ranges: one drawn frame. */
  const renderSlices = (slices: number) => {
    for (let i = 0; i < slices && scheduled.length > 0; i++) {
      scheduled.shift()!();
      owner.takeRingEdits();
    }
  };
  return { owner, grid, scheduled, camera, renderSlices };
}

test("settled and scheduled focus sampling publish identical packed records and dedupe routing", () => {
  const a = fixture(),
    b = fixture();
  try {
    a.owner.update(a.camera, 900);
    b.owner.update(b.camera, 900);
    const base = a.owner.snapshot().base.records;
    expect(base!.length).toBeGreaterThan(0);
    a.owner.settle();
    while (b.scheduled.length) b.renderSlices(1);
    expect(a.owner.snapshot().ring.records).toEqual(b.owner.snapshot().ring.records);
    expect(a.owner.snapshot().ring.records!.length).toBeGreaterThan(base!.length);
    const coverage = a.owner.stats().rebuild;
    expect(a.owner.snapshot().base.mask).toEqual({
      center: [0, 0],
      radiusSq: coverage.coverageRadiusM * coverage.coverageRadiusM,
      tileM: coverage.coverageTileM,
      keepInside: false,
      enabled: true,
    });
    const revision = a.owner.snapshot().ring.revision;
    for (const callback of a.scheduled.splice(0)) callback();
    a.owner.takeRingEdits();
    expect(a.owner.snapshot().ring.revision).toBe(revision);
    a.owner.update({ ...a.camera, target: [20, 0, 0] }, 900);
    expect(a.owner.snapshot().base.records).toBe(base);
    expect(a.owner.stats().rebuild.pending).toBe(false);
  } finally {
    a.owner.dispose();
    b.owner.dispose();
  }
});

test("hidden, replaced and disposed fields reject stale scheduled focus work", () => {
  const { owner, grid, scheduled, camera } = fixture();
  owner.update(camera, 900);
  const stale = scheduled.splice(0);
  owner.setVisible(false);
  for (const callback of stale) callback();
  owner.takeRingEdits();
  // The focus buffer is allocated with the terrain and never replaced, so
  // "nothing was published" now reads as an empty live range, not a null array.
  expect(owner.snapshot().ring.recordCount).toBe(0);
  expect(owner.stats().rebuild.pending).toBe(false);
  owner.setVisible(true);
  owner.update(camera, 900);
  const replaced = scheduled.splice(0);
  owner.setTerrain(grid, flatHeightField(-32, -32, 16, 16, 4), "green-grass");
  for (const callback of replaced) callback();
  expect(owner.snapshot().base.records).toBeNull();
  expect(owner.snapshot().base.visible).toBe(false);
  expect(owner.snapshot().ring.recordCount).toBe(0);
  owner.update(camera, 900);
  owner.dispose();
  for (const callback of scheduled.splice(0)) callback();
  expect(owner.snapshot().ring.records).toBeNull();
});

test("camera detail gating retains settled records while disabling their routing", () => {
  const { owner, camera } = fixture();
  try {
    owner.prepareRender(camera, 900);
    owner.settle();
    owner.prepareRender(camera, 900);
    const records = owner.snapshot().ring.records;
    expect(owner.snapshot().ring.visible).toBe(true);
    expect(owner.snapshot().wedge?.enabled).toBe(true);
    owner.prepareRender({ ...camera, distance: 1200 }, 900);
    expect(owner.snapshot().ring.records).toBe(records);
    expect(owner.snapshot().ring.visible).toBe(false);
    expect(owner.snapshot().base.mask).toBeNull();
    expect(owner.snapshot().ring.mask).toBeNull();
    expect(owner.snapshot().wedge).toBeNull();
    owner.setFarVisible(false);
    expect(owner.snapshot().terrainDetailStrength).toBe(0);
    owner.prepareRender(camera, 900);
    expect(owner.snapshot().ring.records).toBe(records);
    expect(owner.snapshot().ring.visible).toBe(true);
    expect(owner.snapshot().terrainDetailStrength).toBe(0);
  } finally {
    owner.dispose();
  }
});

test("base sampling stays independently observable when resident focus includes padded slots", () => {
  const { owner, camera } = fixture();
  try {
    owner.update({ ...camera, distance: 3200 }, 900);
    const base = owner.stats().baseSample;
    expect(base).toBeDefined();
    expect(base!.recordCapacity).toBe(1_000_000);
    expect(base!.acceptedRecords).toBeGreaterThan(0);
    const baseCounts = structuredClone(base);
    owner.update(camera, 900);
    owner.settle();
    const stats = owner.stats();
    expect(stats.detail.focusRingActive).toBe(true);
    expect(stats.baseSample).toEqual(baseCounts);
    expect(stats.focusSample!.acceptedRecords).toBeGreaterThan(0);
    expect(stats.focusSample!.recordCapacity).toBe(
      stats.rebuild.slotCapacity * stats.rebuild.tileSlotRecords,
    );
    // This small field leaves many off-map cells padded in otherwise live slots.
    expect(stats.focusSample!.acceptedRecords).toBeLessThan(owner.snapshot().ring.recordCount);
    expect(stats.rebuild.activeCoverageResident).toBe(true);
    owner.update({ ...camera, target: [20, 0, 0] }, 900);
    owner.settle();
    expect(owner.stats().baseSample).toEqual(baseCounts);
  } finally {
    owner.dispose();
  }
});
