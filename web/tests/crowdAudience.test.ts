// @vitest-environment node
import { expect, test, vi } from "vitest";
const mesh = vi.hoisted(() => ({
  upload: vi.fn(),
  precompute: vi.fn(),
  draw: vi.fn(),
  stats: () => ({}),
  dispose: vi.fn(),
}));
const layers = vi.hoisted(
  () =>
    [] as {
      update: ReturnType<typeof vi.fn>;
      draw: ReturnType<typeof vi.fn>;
      stats: () => object;
      dispose: ReturnType<typeof vi.fn>;
    }[],
);
const failures = vi.hoisted(() => ({ at: -1 }));
vi.mock("../../apps/battle-perf-lab/src/raw/crowd", () => ({ createRawCrowd: async () => mesh }));
vi.mock("../../apps/battle-perf-lab/src/raw/impostor", () => ({
  createRawImpostors: async () => {
    if (layers.length === failures.at) throw Error("atlas upload failed");
    const layer = { update: vi.fn(), draw: vi.fn(), stats: () => ({}), dispose: vi.fn() };
    layers.push(layer);
    return layer;
  },
}));
import { createRawCrowdAudience } from "../../apps/battle-perf-lab/src/raw/crowdAudience";
import type { CrowdProjectionView } from "../../packages/crowd-runtime/src/visibility";
const view = (pixels: number, shadow = false): CrowdProjectionView => ({
  frustum: { planes: [] },
  shadow,
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
const assets = { 0: { manifest: { bounds: { center: [0, 0, 0], radius: 1 } } } };
const create = () =>
  createRawCrowdAudience(
    {} as never,
    {} as never,
    assets as never,
    { 0: {} } as never,
    {} as never,
    {} as never,
  );
test("far main soldiers remain actual impostors while their shadow stays a mesh", async () => {
  const owner = await create();
  owner.upload([soldier], [view(0.1), view(10, true)], camera);
  expect(layers.at(-1)!.update).toHaveBeenLastCalledWith([soldier], camera);
  const plan = mesh.upload.mock.lastCall![1];
  expect(plan.levels[0]).toBe(3);
  expect(plan.shadowLevels[0]).toBeLessThan(3);
  owner.draw({} as never, {} as never, "shadow");
  expect(layers.at(-1)!.draw).not.toHaveBeenCalled();
  owner.draw({} as never, {} as never);
  expect(layers.at(-1)!.draw).toHaveBeenCalledOnce();
  owner.dispose();
});
test("history survives buffer growth but removed soldiers do not inherit stale history", async () => {
  const owner = await create();
  owner.upload([soldier], [view(20 / 1.8)], camera);
  owner.upload([soldier, soldier], [view(17 / 1.8)], camera);
  expect(Array.from(mesh.upload.mock.lastCall![1].levels).slice(0, 2)).toEqual([0, 1]);
  owner.upload([], [view(17 / 1.8)], camera);
  expect(layers.at(-1)!.update).toHaveBeenLastCalledWith([], camera);
  owner.upload([soldier], [view(17 / 1.8)], camera);
  expect(mesh.upload.mock.lastCall![1].levels[0]).toBe(1);
  owner.dispose();
});
test("rejects missing zero-count catalog atlases before allocating and disposes idempotently", async () => {
  const initial = layers.length;
  await expect(
    createRawCrowdAudience(
      {} as never,
      {} as never,
      { ...assets, 4: assets[0] } as never,
      { 0: {} } as never,
      {} as never,
      {} as never,
    ),
  ).rejects.toThrow("appearance 4");
  expect(layers.length).toBe(initial);
  const owner = await create();
  expect(() => owner.precompute({} as never)).toThrow("not ready");
  owner.dispose();
  owner.dispose();
  expect(layers.at(-1)!.dispose).toHaveBeenCalledOnce();
  expect(() => owner.upload([], [], camera)).toThrow("disposed");
});
test("multiple shadow views form a union independent of main visibility", async () => {
  const owner = await create();
  const hidden = {
    ...view(10),
    frustum: { planes: [{ normal: { x: 1, y: 0, z: 0 }, constant: -1000 }] },
  };
  owner.upload([soldier], [hidden, { ...hidden, shadow: true }, view(10, true)], camera);
  expect(mesh.upload.mock.lastCall![1].visibility[0]).toBe(2);
  expect(owner.stats().shadowOnly).toBe(1);
  expect(layers.at(-1)!.update).toHaveBeenLastCalledWith([], camera);
  owner.dispose();
});
test("failed later atlas construction disposes earlier resources and mesh", async () => {
  const initial = layers.length,
    disposedBefore = mesh.dispose.mock.calls.length;
  failures.at = initial + 1;
  try {
    await expect(
      createRawCrowdAudience(
        {} as never,
        {} as never,
        { ...assets, 1: assets[0] } as never,
        { 0: {}, 1: {} } as never,
        {} as never,
        {} as never,
      ),
    ).rejects.toThrow("atlas upload failed");
    expect(layers[initial].dispose).toHaveBeenCalledOnce();
    expect(mesh.dispose.mock.calls.length).toBe(disposedBefore + 1);
  } finally {
    failures.at = -1;
  }
});
test("failed uploads prevent stale draws and preserve preceding successful LOD history", async () => {
  const owner = await create();
  owner.upload([soldier], [view(20 / 1.8)], camera);
  mesh.upload.mockImplementationOnce(() => {
    throw Error("upload failed");
  });
  expect(() => owner.upload([soldier], [view(10 / 1.8)], camera)).toThrow("upload failed");
  expect(() => owner.draw({} as never, {} as never)).toThrow("not ready");
  owner.upload([soldier], [view(17 / 1.8)], camera);
  expect(mesh.upload.mock.lastCall![1].levels[0]).toBe(0);
  owner.dispose();
});

test("camera-only refresh retains selected L3 groups and never advances mesh/LOD history", async () => {
  const owner = await create();
  owner.upload([soldier], [view(0.1), view(20 / 1.8, true)], camera);
  const before = owner.stats(),
    uploads = mesh.upload.mock.calls.length;
  const nextCamera = { ...camera, eye: [200, 0, 30] as const };
  owner.refreshCamera(nextCamera);
  owner.refreshCamera(camera);
  expect(mesh.upload.mock.calls.length).toBe(uploads);
  expect(owner.stats()).toEqual(before);
  expect(layers.at(-1)!.update.mock.calls.at(-2)).toEqual([[soldier], nextCamera]);
  owner.upload([soldier], [view(0.1), view(17 / 1.8, true)], camera);
  expect(mesh.upload.mock.lastCall![1].shadowLevels[0]).toBe(0);
  owner.dispose();
});
test("published histograms count actual main and shadow audiences without counting culled soldiers", async () => {
  const owner = await create();
  try {
    owner.upload(
      [soldier, { ...soldier, x: -1000 }],
      [
        { ...view(0.1), frustum: { planes: [{ normal: { x: 1, y: 0, z: 0 }, constant: 10 }] } },
        {
          ...view(10, true),
          frustum: { planes: [{ normal: { x: 1, y: 0, z: 0 }, constant: 10 }] },
        },
      ],
      camera,
    );
    expect(owner.stats()).toMatchObject({
      visibleTierHistogram: { l0: 0, l1: 0, l2: 0, l3: 1 },
      shadowTierHistogram: { l0: 1, l1: 0, l2: 0, l3: 0 },
    });
  } finally {
    owner.dispose();
  }
});
