/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({
  owner: null as any,
  options: null as any,
  queue: null as any,
  hold: null as null | (() => Promise<void>),
  calls: [] as any[],
  disposed: vi.fn(),
}));
vi.mock("../../sceneBackend", () => ({
  createSceneBackend: async (
    _backend: unknown,
    _device: unknown,
    _canvas: unknown,
    _context: unknown,
    options: unknown,
  ) => {
    state.options = options;
    return state.owner;
  },
}));
vi.mock("../../../../../packages/soldier-assets/src/appearanceBundle", () => ({
  loadAppearanceCatalog: async () => ({ 0: { manifest: { mounted: false } } }),
}));
vi.mock("../../../../../packages/soldier-assets/src/impostorAtlas", () => ({
  loadImpostorAtlas: async () => ({}),
}));
vi.mock("../../../../../packages/crowd-runtime/src/animationState", () => ({
  assertGameplayAppearances: () => {},
}));
vi.mock("../../../../../packages/crowd-runtime/src/instanceData", () => ({
  buildCrowdInstances: () => ({ instances: [] }),
}));
import { BattleRenderer } from "../NativeBattleRenderer";
import {
  captureBattleRenderCamera,
  type BattlePresentation,
} from "../../../../../web/src/battle/battlePresentation";
const packet = (): BattlePresentation => ({
  timeSeconds: 77,
  fixedTime: null,
  preserveFrozenEffects: false,
  camera: captureBattleRenderCamera({
    zoom: 2,
    zoomT: 0.5,
    viewCenter: () => [1, 2],
    params: () => ({
      target: [1, 2, 0],
      distance: 100,
      yaw: 0,
      pitch: 0.7,
      fovY: 1,
      aspect: 1.5,
      near: 1,
    }),
  }),
  crowd: {
    positions: new Float32Array(),
    facings: new Float32Array(),
    alive: new Float32Array(),
    playback: [],
    count: 0,
    observationTick: 9000,
    frameDt: 0.02,
    standards: [],
    readouts: [],
    triangles: new Float32Array(),
  },
  tacticalLines: {
    groundCues: new Float32Array(),
    rings: new Float32Array(),
    effects: new Float32Array(),
  },
});
beforeEach(() => {
  state.calls = [];
  state.hold = null;
  state.disposed.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  vi.stubGlobal("__BATTLE_NATIVE_BACKEND__", "raw");
  vi.stubGlobal("__BATTLE_NATIVE_ATLAS_CATALOG__", "/prepared/catalog.json");
  vi.stubGlobal("location", { search: "", href: "http://localhost/benchmark" });
  vi.stubGlobal("window", { devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({ appearances: { 0: "a.json" } }),
  }));
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
    callbacks.push(f);
    return 1;
  });
  const queue = { submit: vi.fn(), onSubmittedWorkDone: vi.fn(async () => {}) };
  state.queue = queue;
  const device = {
    queue,
    limits: {},
    features: new Set(),
    destroy: vi.fn(),
    lost: new Promise(() => {}),
    pushErrorScope() {},
    popErrorScope: async () => null,
  };
  vi.stubGlobal("navigator", {
    gpu: {
      requestAdapter: async () => ({ info: { vendor: "test" }, requestDevice: async () => device }),
      getPreferredCanvasFormat: () => "bgra8unorm",
    },
  });
  const context = { configure: vi.fn(), unconfigure: vi.fn() },
    canvas = {
      clientWidth: 720,
      clientHeight: 450,
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
  const call =
    (name: string) =>
    (...args: unknown[]) => {
      state.calls.push([name, ...args]);
    };
  state.owner = {
    scene: {
      pickingMeshes: () => [],
      heightAt: () => 2,
      seatingHeightAt: () => 2,
      setVisibility: call("visibility"),
      replaceTerrain: call("terrain"),
      resize: call("resize"),
      uploadReadouts: call("readouts"),
      uploadCrowd: (...args: unknown[]) => {
        call("crowd")(...args);
        queue.submit([]);
      },
      uploadTriangles: call("triangles"),
      uploadTacticalLines: call("lines"),
      prepare: call("prepare"),
      settleGrass: call("settle"),
      stats: () => ({ actual: true, crowd: { instances: 0, ready: true } }),
    },
    submitPresentation: () => {
      call("submit")();
      queue.submit([]);
      return state.hold?.();
    },
    resizeOutput: call("outputSize"),
    dispose: state.disposed,
  };
  const renderer = new BattleRenderer(canvas);
  renderer.setTerrain({ w: 1, h: 1, cell: 4, ox: 0, oy: 0, tint: new Uint8Array(1) });
  return { renderer, canvas, device, callbacks };
}
async function progress(callbacks: FrameRequestCallback[]) {
  for (let i = 0; i < 80; i++) {
    await Promise.resolve();
    if (callbacks.length) callbacks.shift()!(0);
  }
}
test("live facade preserves physical scale and captured time and reports actual final queue identity only after validation", async () => {
  const f = fixture();
  await f.renderer.ready;
  expect([f.canvas.width, f.canvas.height]).toEqual([1440, 900]);
  expect(state.options.samples).toBe(1);
  let resume!: () => void;
  state.hold = () =>
    new Promise((r) => {
      resume = r;
    });
  const pending = f.renderer.present(packet());
  await progress(f.callbacks);
  expect(f.renderer.frameMetrics().renderedFrameId).toBe(0);
  resume();
  const result = await pending;
  expect(result).toMatchObject({
    submitted: true,
    renderedFrameId: 1,
    gpuSubmission: { submissionId: 2, backend: "raw", source: "battle-draw" },
  });
  expect(result.gpuSubmission).not.toHaveProperty("threeFrameId");
  expect(state.calls.find((c) => c[0] === "prepare")[1].time).toBe(77);
  expect(f.renderer.gpuEventsSince(0)).toBeNull();
  expect(f.renderer.stats()).toMatchObject({ ready: true, soldiers: 0, native: { actual: true } });
  f.renderer.dispose();
  expect(state.disposed).toHaveBeenCalledTimes(1);
  expect(f.device.destroy).toHaveBeenCalledTimes(1);
});
test("startup readiness is serialized, explicit, and never repeated by an ordinary frame", async () => {
  const f = fixture();
  await f.renderer.ready;
  let readiness!: Promise<void>;
  const pending = f.renderer.present(packet(), undefined, () => {
    readiness = f.renderer.settlePresentedFrame();
  });
  await progress(f.callbacks);
  await pending;
  await readiness;
  expect(state.calls.filter((c) => c[0] === "settle")).toHaveLength(2);
  const waits = f.device.queue.onSubmittedWorkDone.mock.calls.length;
  state.calls = [];
  await f.renderer.present(packet());
  expect(state.calls.filter((c) => c[0] === "settle")).toHaveLength(0);
  expect(f.device.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(waits);
  f.renderer.dispose();
});
test("disposal during pending submission waits for ownership drain and rejects late completion", async () => {
  const f = fixture();
  await f.renderer.ready;
  let resume!: () => void;
  state.hold = () =>
    new Promise((r) => {
      resume = r;
    });
  const pending = f.renderer.present(packet());
  await progress(f.callbacks);
  f.renderer.dispose();
  expect(state.disposed).not.toHaveBeenCalled();
  resume();
  await expect(pending).rejects.toThrow("disposed");
  expect(state.disposed).toHaveBeenCalledTimes(1);
});

test("aborted external readiness stops before its second submission and does not poison renderer reuse", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  const signal = new AbortController();
  const readiness = f.renderer.settlePresentedFrame(signal.signal);
  const rejected = expect(readiness).rejects.toMatchObject({ name: "AbortError" });
  for (let i = 0; i < 80 && !f.callbacks.length; i++) await Promise.resolve();
  expect(f.callbacks.length).toBeGreaterThan(0);
  signal.abort();
  await progress(f.callbacks);
  await rejected;
  expect(state.calls.filter((c) => c[0] === "settle")).toHaveLength(1);
  await expect(f.renderer.present(packet())).resolves.toMatchObject({ submitted: true });
  f.renderer.dispose();
});
test("frozen reuse preserves a completed image without another submission", async () => {
  const f = fixture();
  await f.renderer.ready;
  const frozen = { ...packet(), fixedTime: 12 };
  await f.renderer.present(frozen);
  const submissions = state.calls.filter((c) => c[0] === "submit").length;
  await expect(f.renderer.present(frozen)).resolves.toMatchObject({ submitted: false });
  expect(state.calls.filter((c) => c[0] === "submit")).toHaveLength(submissions);
  f.renderer.dispose();
});
test("replacement presentation waits for old readiness ownership without inheriting its cancellation", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  const abort = new AbortController();
  const old = f.renderer.settlePresentedFrame(abort.signal);
  const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
  for (let i = 0; i < 80 && !f.callbacks.length; i++) await Promise.resolve();
  const replacement = f.renderer.present(packet());
  abort.abort();
  await progress(f.callbacks);
  await rejected;
  await expect(replacement).resolves.toMatchObject({ submitted: true });
  f.renderer.dispose();
});
test("an asynchronous frozen presentation cannot overwrite a later invalidation", async () => {
  const f = fixture();
  await f.renderer.ready;
  const frozen = { ...packet(), fixedTime: 12 };
  let resume!: () => void;
  state.hold = () =>
    new Promise((r) => {
      resume = r;
    });
  const pending = f.renderer.present(frozen);
  await progress(f.callbacks);
  f.renderer.resize();
  resume();
  await pending;
  state.hold = null;
  await expect(f.renderer.present(frozen)).resolves.toMatchObject({ submitted: true });
  f.renderer.dispose();
});
test("external readiness cancellation after preparation issues no extra submission", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  const abort = new AbortController();
  state.owner.scene.prepare = async () => {
    abort.abort();
  };
  const submissions = state.calls.filter((c) => c[0] === "submit").length;
  await expect(f.renderer.settlePresentedFrame(abort.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(state.calls.filter((c) => c[0] === "submit")).toHaveLength(submissions);
  f.renderer.dispose();
});

test("public readiness and soldier count come from the admitted native audience", async () => {
  const f = fixture();
  expect(f.renderer.stats()).toMatchObject({ ready: false, soldiers: 0 });
  await f.renderer.ready;
  state.owner.scene.stats = () => ({ crowd: { instances: 15560, ready: true } });
  expect(f.renderer.stats()).toMatchObject({ ready: true, soldiers: 15560 });
  state.owner.scene.stats = () => ({ crowd: { instances: 8, ready: false } });
  expect(f.renderer.stats()).toMatchObject({ ready: false, soldiers: 8 });
  f.renderer.dispose();
  expect(f.renderer.stats()).toMatchObject({ ready: false, soldiers: 0 });
});
