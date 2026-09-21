// @vitest-environment node
import { vi, test, expect } from "vitest";
// The TypeGPU audience answering the same admitted-state questions the raw audience
// does, with both GPU leaves mocked: nothing here touches a device, and every answer
// has to come from the shared diagnostic owner reading this history's admitted pose.
const mesh = vi.hoisted(() => ({
  upload: vi.fn(async () => {}),
  precompute: vi.fn(),
  draw: vi.fn(),
  stats: () => ({}),
  dispose: vi.fn(),
}));
const layers = vi.hoisted(
  () =>
    [] as {
      updateState: ReturnType<typeof vi.fn>;
      setView: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }[],
);
vi.mock("../../../packages/battle-renderer/src/world/crowd", () => ({
  createTypegpuCrowd: async () => mesh,
}));
vi.mock("../../../packages/battle-renderer/src/world/impostor", () => ({
  createTypegpuImpostors: async () => {
    const layer = {
      updateState: vi.fn(),
      setView: vi.fn(),
      draw: vi.fn(),
      stats: () => ({}),
      dispose: vi.fn(),
    };
    layers.push(layer);
    return layer;
  },
}));
import { createTypegpuCrowdAudience } from "../../../packages/battle-renderer/src/world/crowdAudience";
import type { CrowdProjectionView } from "../../../packages/crowd-runtime/src/visibility";

const view = (pixels: number): CrowdProjectionView => ({
  frustum: { planes: [] },
  shadow: false,
  projection: {
    view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -100, 1],
    pixelsPerViewUnit: pixels,
    perspective: false,
    near: 1,
  },
});
const camera = { right: [1, 0, 0], up: [0, 1, 0], eye: [0, 0, 100], fovY: 1 } as const;
const soldier = {
  x: 0,
  y: 0,
  facing: 0,
  classId: 0,
  faction: 0,
  alive: true,
  clip: "idle",
  phase: 0,
  seed: 0,
  mounted: false,
  lod: 0,
} as const;
const assets = {
  0: {
    manifest: { bounds: { center: [0, 0, 0], radius: 1 } },
    animation: {
      clips: [
        { name: "idle", duration: 1.5 },
        { name: "march", duration: 0.8 },
      ],
    },
  },
};
/** A submitted playback with the real endpoint aliasing: a held pose samples its
 *  own destination rather than a second sample object. */
const playback = (clip: string, phase: number) => {
  const destination = { clip, phase };
  return {
    appearanceId: 0,
    base: { source: { kind: "clip" as const, sample: destination }, destination, weight: 1 },
  };
};
const posed = (clip: string, phase: number, elevation = 0) => ({
  ...soldier,
  x: 7,
  y: 9,
  clip,
  phase,
  elevation,
  playback: playback(clip, phase),
});
/** A soldier the crowd builder has already seated against a surface whose height
 *  equals x, so a correct seating re-measure finds agreement everywhere. */
const seated = (x: number, elevation: number) => ({ ...soldier, x, y: 0, elevation });
const ground = () => vi.fn((x: number, _y: number) => x);
const create = () =>
  createTypegpuCrowdAudience(
    {} as never,
    assets as never,
    { 0: {} } as never,
    {} as never,
    {} as never,
  );

test("admitted diagnostics read this owner's captured pose, not the caller's array", async () => {
  const owner = await create();
  try {
    const submitted = posed("idle", 0.25, 7);
    await owner.upload([submitted], [view(10)], camera);
    const admitted = owner.debugSoldierAnim(0)!;
    expect(admitted).toMatchObject({ root: [7, 9], clip: "idle", phase: 0.25, duration: 1.5 });
    expect(admitted.playback).toEqual(submitted.playback);
    expect(admitted.playback).not.toBe(submitted.playback);
    // The caller keeps mutating its own records after submitting them.
    submitted.x = -1;
    submitted.clip = "march";
    submitted.elevation = 999;
    submitted.playback.base.destination.phase = 0.9;
    expect(owner.admitted()![0]).toMatchObject({ x: 7, y: 9, clip: "idle", elevation: 7 });
    expect(owner.debugSoldierAnim(0)).toBe(admitted);
    expect(admitted).toMatchObject({ root: [7, 9], clip: "idle", phase: 0.25 });
    expect(admitted.playback!.base.destination).toEqual({ clip: "idle", phase: 0.25 });
    expect([...owner.admittedPoses()]).toEqual(["0\u0000idle"]);
    const surface = ground();
    expect(owner.verifySeating(surface)).toMatchObject({ checked: 1, worstDelta: 0 });
    expect(surface.mock.calls).toEqual([[7, 9]]);
  } finally {
    owner.dispose();
  }
});

test("the admitted submission identifies a pose, not the uploads a moving camera causes", async () => {
  const owner = await create();
  try {
    expect(owner.admittedSubmission()).toBeNull();
    await owner.upload([posed("idle", 0.25)], [view(10)], camera);
    expect(owner.admittedSubmission()).toBe(1);
    const admitted = owner.debugSoldierAnim(0)!;
    expect(await owner.reproject([view(12)], camera)).toBe(true);
    owner.refreshCamera({ ...camera, fovY: 0.8 });
    expect(owner.admittedSubmission()).toBe(1);
    // A reprojection and a billboard refresh both republish one admitted pose.
    expect(owner.debugSoldierAnim(0)).toBe(admitted);
    // Three published views, but only the two submissions touched a soldier's bytes.
    expect(layers.at(-1)!.setView).toHaveBeenCalledTimes(3);
    expect(layers.at(-1)!.updateState).toHaveBeenCalledTimes(2);
    await owner.upload([posed("march", 0.5)], [view(12)], camera);
    expect(owner.admittedSubmission()).toBe(2);
    const next = owner.debugSoldierAnim(0)!;
    expect(next).toMatchObject({ clip: "march", phase: 0.5, duration: 0.8 });
    expect(next.playback).not.toBe(admitted.playback);
  } finally {
    owner.dispose();
  }
  expect(owner.admittedSubmission()).toBeNull();
});

test("explicit seating verification re-samples the whole population, errors at its end included", async () => {
  const owner = await create();
  const surface = ground();
  try {
    await owner.upload([seated(0, 0), seated(1, 1), seated(2, 2)], [view(10)], camera);
    expect(owner.verifySeating(surface)).toEqual({
      checked: 3,
      matches: true,
      span: 2,
      nonFinite: 0,
      worstDelta: 0,
      tolerance: 1e-3,
    });
    // One sample per admitted instance, at that instance's own position.
    expect(surface.mock.calls).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    // A defect in the LAST soldier is found: the loop never stops at the first match.
    await owner.upload([seated(0, 0), seated(1, 1), seated(2, 2.5)], [view(10)], camera);
    expect(owner.verifySeating(surface)).toMatchObject({
      checked: 3,
      matches: false,
      span: 2.5,
      worstDelta: 0.5,
    });
    // The same tolerance the raw audience enforces, at its exact boundary.
    await owner.upload([seated(0, 1e-3)], [view(10)], camera);
    expect(owner.verifySeating(ground())).toMatchObject({ matches: true, worstDelta: 1e-3 });
    await owner.upload([seated(0, 1.1e-3)], [view(10)], camera);
    expect(owner.verifySeating(ground())).toMatchObject({ matches: false, worstDelta: 1.1e-3 });
  } finally {
    owner.dispose();
  }
});

test("nonfinite elevations and heights are rejected rather than passing an absolute compare", async () => {
  const owner = await create();
  try {
    await owner.upload([seated(0, 0), seated(1, NaN), seated(2, 2)], [view(10)], camera);
    // `Math.abs(NaN) > tolerance` is false, so an unguarded compare would pass this.
    expect(owner.verifySeating(ground())).toEqual({
      checked: 3,
      matches: false,
      span: 2,
      nonFinite: 1,
      worstDelta: 0,
      tolerance: 1e-3,
    });
    // A second, independent instance: a surface that is not finite where it stands.
    const broken = vi.fn((x: number) => (x === 2 ? Infinity : x));
    expect(owner.verifySeating(broken)).toMatchObject({ matches: false, nonFinite: 2 });
  } finally {
    owner.dispose();
  }
});

test("an unadmitted, refused, empty or released population reports nothing admitted", async () => {
  const owner = await create();
  const surface = ground();
  try {
    expect(owner.verifySeating(surface)).toBeNull();
    expect(owner.admitted()).toBeNull();
    expect(owner.debugSoldierAnim(0)).toBeNull();
    expect([...owner.admittedPoses()]).toEqual([]);
    await owner.upload([], [view(10)], camera);
    expect(owner.verifySeating(surface)).toBeNull();
    expect(owner.admitted()).toEqual([]);
    expect([...owner.admittedPoses()]).toEqual([]);
    await owner.upload([seated(0, 0)], [view(10)], camera);
    expect(owner.verifySeating(surface)).toMatchObject({ checked: 1, matches: true });
    expect(owner.debugSoldierAnim(1)).toBeNull();
    // A refused upload must report no admitted pose rather than the refused one.
    mesh.upload.mockRejectedValueOnce(Error("upload failed"));
    await expect(owner.upload([seated(0, 9)], [view(10)], camera)).rejects.toThrow("upload failed");
    expect(owner.verifySeating(surface)).toBeNull();
    expect(owner.admittedSubmission()).toBeNull();
    expect(owner.debugSoldierAnim(0)).toBeNull();
    expect([...owner.admittedPoses()]).toEqual([]);
  } finally {
    owner.dispose();
  }
  expect(owner.verifySeating(surface)).toBeNull();
  expect(owner.admitted()).toBeNull();
  expect(owner.debugSoldierAnim(0)).toBeNull();
  expect([...owner.admittedPoses()]).toEqual([]);
});

test("explicit mesh authoring keeps distant appearances drawable without allocating atlases", async () => {
  const authoring = { 0: { ...assets[0], tiers: [{}, {}, {}, {}] } };
  const count = layers.length;
  const owner = await createTypegpuCrowdAudience(
    {} as never,
    authoring as never,
    null,
    {} as never,
    {} as never,
  );
  try {
    const distant = view(0.01);
    await owner.upload([soldier], [distant, { ...distant, shadow: true }], camera);
    expect(owner.stats().shadowTierHistogram).toEqual({ l0: 0, l1: 0, l2: 0, l3: 1, l4: 0 });
    expect(owner.stats().visibleTierHistogram).toEqual({ l0: 0, l1: 0, l2: 0, l3: 1, l4: 0 });
    expect(layers.length).toBe(count);
    await owner.reproject([view(100)], camera);
    expect(owner.stats().visibleTierHistogram).toEqual({ l0: 1, l1: 0, l2: 0, l3: 0, l4: 0 });
  } finally {
    owner.dispose();
  }
  await expect(
    createTypegpuCrowdAudience({} as never, authoring as never, {}, {} as never, {} as never),
  ).rejects.toThrow("Missing prepared impostor atlas for appearance 0");
});
