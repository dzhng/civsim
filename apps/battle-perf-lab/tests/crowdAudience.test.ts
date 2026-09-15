// @vitest-environment node
/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({
  mesh: {
    upload: vi.fn(),
    precompute: vi.fn(),
    draw: vi.fn(),
    stats: () => ({}),
    dispose: vi.fn(),
  },
  layers: [] as {
    update: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
    stats: () => object;
    dispose: ReturnType<typeof vi.fn>;
  }[],
  failAtlas: -1,
  createMesh: vi.fn(),
}));
const atlasFactory = vi.hoisted(() => async () => {
  if (state.layers.length === state.failAtlas) throw Error("atlas admission failed");
  const layer = { update: vi.fn(), draw: vi.fn(), stats: () => ({}), dispose: vi.fn() };
  state.layers.push(layer);
  return layer;
});
vi.mock("../candidates/typegpu/crowd", () => ({
  createTypegpuCrowd: async () => {
    state.createMesh();
    return state.mesh;
  },
}));
vi.mock("../src/vgpu/crowd", () => ({
  createVgpuCrowd: async () => {
    state.createMesh();
    return state.mesh;
  },
}));
vi.mock("../candidates/typegpu/impostor", () => ({
  createTypegpuImpostors: atlasFactory,
}));
vi.mock("../src/vgpu/impostor", () => ({
  createVgpuImpostors: atlasFactory,
}));
import { createTypegpuCrowdAudience } from "../candidates/typegpu/crowdAudience";
import { createVgpuCrowdAudience } from "../src/vgpu/crowdAudience";
import type { CrowdProjectionView } from "../../../packages/crowd-runtime/src/visibility";
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
const asset = { manifest: { bounds: { center: [0, 0, 0], radius: 1 } } };
const assets = { 0: asset, 1: asset, 2: asset },
  atlases = { 0: {}, 1: {}, 2: {} };
const factories = { typegpu: createTypegpuCrowdAudience, vgpu: createVgpuCrowdAudience };
const create = (backend: keyof typeof factories, prepared = atlases) =>
  factories[backend]({} as never, assets as never, prepared as never, {} as never, {} as never);
beforeEach(() => {
  vi.resetAllMocks();
  state.layers.length = 0;
  state.failAtlas = -1;
});
for (const backend of ["typegpu", "vgpu"] as const) {
  test(`${backend}: full catalog L3 groups are main-only while plural shadow views retain mesh casters`, async () => {
    const owner = await create(backend);
    expect(state.layers).toHaveLength(3);
    const hidden = {
      ...view(10),
      frustum: { planes: [{ normal: { x: 1, y: 0, z: 0 }, constant: -1000 }] },
    };
    await owner.upload(
      [soldier, { ...soldier, classId: 2 }],
      [view(0.1), { ...hidden, shadow: true }, view(10, true)],
      camera,
    );
    expect(state.layers[0].update).toHaveBeenLastCalledWith([soldier], camera);
    expect(state.layers[1].update).toHaveBeenLastCalledWith([], camera);
    expect(state.layers[2].update.mock.lastCall![0]).toHaveLength(1);
    const plan = state.mesh.upload.mock.lastCall![1];
    expect(Array.from(plan.levels).slice(0, 2)).toEqual([3, 3]);
    expect(plan.shadowLevels[0]).toBeLessThan(3);
    owner.draw({} as never, "shadow", {} as never);
    expect(state.layers.every((x) => x.draw.mock.calls.length === 0)).toBe(true);
    const mainPass = {},
      mainCamera = {};
    owner.draw(mainPass as never, "main", mainCamera as never);
    expect(state.layers[0].draw).toHaveBeenLastCalledWith(mainPass, mainCamera);
    expect(state.layers.every((x) => x.draw.mock.calls.length === 1)).toBe(true);
    await owner.upload([soldier], [hidden, { ...hidden, shadow: true }, view(10, true)], camera);
    expect(owner.stats().shadowOnly).toBe(1);
    expect(state.layers[0].update).toHaveBeenLastCalledWith([], camera);
    owner.dispose();
  });
  test(`${backend}: camera refresh cannot move or alter a committed corpse when caller reuses input objects`, async () => {
    const owner = await create(backend);
    const dynamic = {
      ...soldier,
      x: 0,
      facing: 0,
      alive: false,
      playback: { base: { weight: 0.25 } },
    };
    await owner.upload([dynamic] as never, [view(0.1)], camera);
    dynamic.x = 77;
    dynamic.facing = 1.2;
    dynamic.playback.base.weight = 0.9;
    owner.refreshCamera({ ...camera, eye: [200, 0, 30] });
    const retained = state.layers[0].update.mock.lastCall![0][0];
    expect(retained.x).toBe(0);
    expect(retained.facing).toBe(0);
    expect(retained.playback.base.weight).toBe(0.25);
    owner.dispose();
  });
  test(`${backend}: camera-only refresh preserves mesh and shadow history`, async () => {
    const owner = await create(backend);
    await owner.upload([soldier], [view(0.1), view(20 / 1.8, true)], camera);
    const before = owner.stats(),
      uploads = state.mesh.upload.mock.calls.length;
    const nextCamera = { ...camera, eye: [200, 0, 30] as const };
    owner.refreshCamera(nextCamera);
    owner.refreshCamera(camera);
    expect(state.mesh.upload.mock.calls.length).toBe(uploads);
    expect(state.mesh.precompute).not.toHaveBeenCalled();
    expect(owner.stats()).toEqual(before);
    expect(state.layers[0].update.mock.calls.at(-2)).toEqual([[soldier], nextCamera]);
    await owner.upload([soldier], [view(0.1), view(17 / 1.8, true)], camera);
    expect(state.mesh.upload.mock.lastCall![1].shadowLevels[0]).toBe(0);
    owner.dispose();
  });
  test(`${backend}: failed upload cannot draw or advance history; growth and empty frames retain correct hysteresis`, async () => {
    const owner = await create(backend);
    await owner.upload([soldier], [view(20 / 1.8)], camera);
    state.mesh.upload.mockRejectedValueOnce(Error("upload failed"));
    await expect(owner.upload([soldier], [view(10 / 1.8)], camera)).rejects.toThrow(
      "upload failed",
    );
    expect(() => owner.draw({} as never)).toThrow("not ready");
    await owner.upload([soldier, soldier], [view(17 / 1.8)], camera);
    expect(Array.from(state.mesh.upload.mock.lastCall![1].levels).slice(0, 2)).toEqual([0, 1]);
    await owner.upload([], [], camera);
    expect(state.layers.every((x) => x.update.mock.lastCall![0].length === 0)).toBe(true);
    await owner.upload([soldier], [view(17 / 1.8)], camera);
    expect(state.mesh.upload.mock.lastCall![1].levels[0]).toBe(1);
    owner.dispose();
  });
  test(`${backend}: pending upload rejects concurrency and disposal is completed before the owned promise rejects`, async () => {
    const owner = await create(backend);
    let finish!: () => void;
    state.mesh.upload.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = owner.upload([soldier], [view(0.1)], camera);
    await expect(owner.upload([], [], camera)).rejects.toThrow("already pending");
    owner.dispose();
    owner.dispose();
    expect(state.mesh.dispose).not.toHaveBeenCalled();
    expect(() => owner.draw({} as never)).toThrow("disposed");
    finish();
    await expect(pending).rejects.toThrow("disposed");
    expect(state.mesh.dispose).toHaveBeenCalledOnce();
    expect(
      state.layers.every(
        (x) => x.dispose.mock.calls.length === 1 && x.update.mock.calls.length === 0,
      ),
    ).toBe(true);
  });
  test(`${backend}: simultaneous upload/cleanup errors preserve the upload error and release every owner`, async () => {
    const owner = await create(backend);
    let reject!: (error: Error) => void;
    state.mesh.upload.mockReturnValueOnce(
      new Promise<void>((_, no) => {
        reject = no;
      }),
    );
    const pending = owner.upload([soldier], [view(0.1)], camera);
    state.layers[0].dispose.mockImplementationOnce(() => {
      throw Error("cleanup failed");
    });
    owner.dispose();
    const failure = Error("original upload failure");
    reject(failure);
    const error = await pending.catch((error) => error);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors[0]).toBe(failure);
    expect(state.mesh.dispose).toHaveBeenCalledOnce();
    expect(state.layers.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
  });
  test(`${backend}: missing unused atlas rejects before allocation; later constructor failure cleans admitted owners`, async () => {
    await expect(create(backend, { 0: {} } as never)).rejects.toThrow("appearance 1");
    expect(state.createMesh).not.toHaveBeenCalled();
    state.failAtlas = 2;
    await expect(create(backend)).rejects.toThrow("atlas admission failed");
    expect(state.mesh.dispose).toHaveBeenCalledOnce();
    expect(state.layers.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
  });
}
