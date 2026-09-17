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
vi.mock("../src/raw/crowd", () => ({ createRawCrowd: async () => state.mesh }));
vi.mock("../src/raw/impostor", () => ({ createRawImpostors: atlasFactory }));
import { createRawCrowdAudience } from "../src/raw/crowdAudience";
import { createTypegpuCrowdAudience } from "../candidates/typegpu/crowdAudience";
import { createVgpuCrowdAudience } from "../src/vgpu/crowdAudience";
import type { CrowdProjectionView } from "../../../packages/crowd-runtime/src/visibility";
import { IMPOSTOR_LEVEL } from "../../../packages/crowd-runtime/src/lod";
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
    expect(Array.from(plan.levels).slice(0, 2)).toEqual([IMPOSTOR_LEVEL, IMPOSTOR_LEVEL]);
    expect(plan.shadowLevels[0]).toBeLessThan(IMPOSTOR_LEVEL);
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
      playback: {
        appearanceId: 0,
        base: {
          weight: 0.25,
          source: { kind: "clip", sample: { clip: "die", phase: 0 } },
          destination: { clip: "die", phase: 0.5 },
        },
      },
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
    await owner.upload([soldier], [view(0.1), view(34 / 1.8, true)], camera);
    const before = owner.stats(),
      uploads = state.mesh.upload.mock.calls.length;
    const nextCamera = { ...camera, eye: [200, 0, 30] as const };
    owner.refreshCamera(nextCamera);
    owner.refreshCamera(camera);
    expect(state.mesh.upload.mock.calls.length).toBe(uploads);
    expect(state.mesh.precompute).not.toHaveBeenCalled();
    expect(owner.stats()).toEqual(before);
    expect(state.layers[0].update.mock.calls.at(-2)).toEqual([[soldier], nextCamera]);
    await owner.upload([soldier], [view(0.1), view(31 / 1.8, true)], camera);
    expect(state.mesh.upload.mock.lastCall![1].shadowLevels[0]).toBe(0);
    owner.dispose();
  });
  test(`${backend}: failed upload cannot draw or advance history; growth and empty frames retain correct hysteresis`, async () => {
    const owner = await create(backend);
    await owner.upload([soldier], [view(34 / 1.8)], camera);
    state.mesh.upload.mockRejectedValueOnce(Error("upload failed"));
    await expect(owner.upload([soldier], [view(10 / 1.8)], camera)).rejects.toThrow(
      "upload failed",
    );
    expect(() => owner.draw({} as never)).toThrow("not ready");
    await owner.upload([soldier, soldier], [view(31 / 1.8)], camera);
    expect(Array.from(state.mesh.upload.mock.lastCall![1].levels).slice(0, 2)).toEqual([0, 1]);
    await owner.upload([], [], camera);
    expect(state.layers.every((x) => x.update.mock.lastCall![0].length === 0)).toBe(true);
    await owner.upload([soldier], [view(31 / 1.8)], camera);
    expect(state.mesh.upload.mock.lastCall![1].levels[0]).toBe(1);
    owner.dispose();
  });
  test(`${backend}: asynchronous upload retains the view and submitted data from admission`, async () => {
    const owner = await create(backend);
    let finish!: () => void;
    state.mesh.upload.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const input = { ...soldier, x: 12 };
    const projection = view(10);
    const pending = owner.upload([input], [projection], camera);
    input.x = 99;
    projection.projection.pixelsPerViewUnit = 30;
    finish();
    await pending;
    expect(state.mesh.upload.mock.lastCall![0][0].x).toBe(12);
    expect(await owner.reproject([projection], camera)).toBe(true);
    expect(await owner.reproject([projection], camera)).toBe(false);
    owner.dispose();
  });
  test(`${backend}: disposal preserves admitted input until the last asynchronous mesh read`, async () => {
    const owner = await create(backend);
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let observed: number | undefined;
    state.mesh.upload.mockImplementationOnce(async (instances) => {
      await gate;
      observed = instances[0].x;
    });
    const pending = owner.upload([{ ...soldier, x: 42 }], [view(10)], camera);
    owner.dispose();
    finish();
    await expect(pending).rejects.toThrow("disposed");
    expect(observed).toBe(42);
    expect(state.mesh.dispose).toHaveBeenCalledOnce();
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

for (const backend of ["raw", "typegpu", "vgpu"] as const) {
  test(`${backend}: camera-only reproject selects new bodies from owned submission and skips equal views`, async () => {
    const owner =
      backend === "raw"
        ? await createRawCrowdAudience(
            {} as never,
            {} as never,
            assets as never,
            atlases as never,
            {} as never,
            {} as never,
          )
        : await create(backend);
    const input = {
      ...soldier,
      x: 50,
      playback: {
        appearanceId: 0,
        base: {
          source: { kind: "clip" as const, sample: { clip: "idle", phase: 0.1 } },
          destination: { clip: "walk", phase: 0.2 },
          weight: 0.5,
        },
      },
    };
    const hidden = {
      ...view(10),
      frustum: { planes: [{ normal: { x: -1, y: 0, z: 0 }, constant: 10 }] },
    };
    await owner.upload([input], [hidden], camera);
    expect(owner.stats().mainVisible).toBe(0);
    expect(await owner.reproject([hidden], camera)).toBe(false);
    expect(state.mesh.upload).toHaveBeenCalledTimes(1);
    input.x = 999;
    input.playback.base.destination.phase = 0.9;
    const visible = view(10);
    expect(await owner.reproject([visible], camera)).toBe(true);
    expect(owner.stats().mainVisible).toBe(1);
    expect(state.mesh.upload.mock.lastCall![0][0].x).toBe(50);
    expect(state.mesh.upload.mock.lastCall![0][0].playback.base.destination.phase).toBe(0.2);
    expect(await owner.reproject([view(10)], camera)).toBe(false);
    expect(state.mesh.upload).toHaveBeenCalledTimes(2);
    // Mutable physical projection and independent caster changes both invalidate.
    visible.projection.pixelsPerViewUnit = 20;
    expect(await owner.reproject([visible], camera)).toBe(true);
    expect(await owner.reproject([visible, view(10, true)], camera)).toBe(true);
    expect(await owner.reproject([visible, view(10, true)], camera)).toBe(false);
    owner.dispose();
  });
}
