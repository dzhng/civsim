/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({
  owner: null as any,
  options: null as any,
  queue: null as any,
  hold: null as null | (() => Promise<void>),
  calls: [] as any[],
  encoded: [] as any[],
  timestamps: [] as bigint[][],
  fetched: [] as string[],
  catalogFailure: null as unknown,
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
  loadAppearanceCatalog: async () => {
    if (state.catalogFailure) throw state.catalogFailure;
    return { 0: { manifest: { mounted: false }, animation: { clips: [{ name: "idle" }] } } };
  },
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
  clock: "wall",
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
  state.encoded = [];
  state.timestamps = [];
  state.fetched = [];
  state.catalogFailure = null;
  state.hold = null;
  state.disposed.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
function fixture(
  build: {
    timingQueries?: "enabled" | "disabled";
    timestampQuery?: boolean;
    atlasOverride?: string;
    backend?: "raw" | "typegpu" | "vgpu";
    search?: string;
    /** Render passes the scene encodes per prepared frame, so the observer has
     *  real measured work to publish. */
    encodePasses?: string[];
  } = {},
) {
  vi.stubGlobal("__BATTLE_NATIVE_BACKEND__", build.backend ?? "raw");
  vi.stubGlobal("__BATTLE_NATIVE_ATLAS_CATALOG__", build.atlasOverride ?? "");
  vi.stubGlobal("__BATTLE_NATIVE_TIMING_QUERIES__", build.timingQueries ?? "enabled");
  vi.stubGlobal("location", {
    search: build.search ?? "",
    href: "http://localhost/benchmark",
  });
  vi.stubGlobal("window", { devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("fetch", async (url: URL | string) => {
    state.fetched.push(String(url));
    return { ok: true, json: async () => ({ appearances: { 0: "a.json" } }) };
  });
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
    callbacks.push(f);
    return 1;
  });
  const queue = { submit: vi.fn(), onSubmittedWorkDone: vi.fn(async () => {}) };
  state.queue = queue;
  const features = new Set(build.timestampQuery ? ["timestamp-query"] : []);
  // Timestamp pairs the next mapped readback reports, in query order.
  // An unqueued readback maps zeros, which the observer rejects as an invalid
  // query result rather than reporting a fabricated duration.
  const mapped = (_offset = 0, size = 0) => {
    const values = state.timestamps.shift() ?? [];
    const bytes = new ArrayBuffer(Math.max(size, values.length * 8));
    new BigUint64Array(bytes).set(values);
    return bytes;
  };
  const device = {
    queue,
    limits: {},
    features,
    destroy: vi.fn(),
    lost: new Promise(() => {}),
    pushErrorScope() {},
    popErrorScope: async (): Promise<GPUError | null> => null,
    createQuerySet: vi.fn(() => ({ destroy: vi.fn() })),
    createBuffer: vi.fn(() => ({
      destroy: vi.fn(),
      mapAsync: async () => {},
      getMappedRange: mapped,
      unmap: vi.fn(),
    })),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: (_descriptor?: unknown) => ({ end() {} }),
      beginComputePass: (_descriptor?: unknown) => ({ end() {} }),
      resolveQuerySet: vi.fn(),
      copyBufferToBuffer: vi.fn(),
      finish: () => ({}),
    })),
  };
  const requested: GPUDeviceDescriptor[] = [];
  vi.stubGlobal("navigator", {
    gpu: {
      requestAdapter: async () => ({
        features,
        info: { vendor: "test" },
        requestDevice: async (descriptor: GPUDeviceDescriptor) => {
          requested.push(descriptor);
          return device;
        },
      }),
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
      uploadDebugBlocks: call("blocks"),
      uploadTacticalLines: call("lines"),
      prepare: (...args: unknown[]) => {
        call("prepare")(...args);
        if (!build.encodePasses) return;
        const encoder = device.createCommandEncoder();
        for (const label of build.encodePasses) encoder.beginRenderPass({ label }).end();
        state.encoded.push(encoder.finish());
      },
      settleGrass: call("settle"),
      replaceCrowdAssets: async (published: unknown, admit?: () => void | Promise<void>) => {
        call("replaceCrowd")(published);
        await admit?.();
      },
      admittedCrowdPoses: () => new Set(["0\u0000idle"]),
      debugSoldierAnim: (index: number) => (index === 0 ? { clip: "idle", phase: 0.25 } : null),
      stats: () => ({ actual: true, crowd: { instances: 0, ready: true } }),
    },
    submitPresentation: () => {
      call("submit")();
      queue.submit(state.encoded.splice(0));
      return state.hold?.();
    },
    resizeOutput: call("outputSize"),
    dispose: state.disposed,
  };
  const renderer = new BattleRenderer(canvas);
  renderer.setTerrain({ w: 1, h: 1, cell: 4, ox: 0, oy: 0, tint: new Uint8Array(1) });
  return { renderer, canvas, device, callbacks, requested };
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
test("measurement starts before pose submission and cancellation closes failed preparation", async () => {
  const { NativeGpuTelemetry } = await import("../../nativeGpuTelemetry");
  const begin = vi.spyOn(NativeGpuTelemetry.prototype, "beginSubmission");
  const end = vi.spyOn(NativeGpuTelemetry.prototype, "endSubmission");
  const cancel = vi.spyOn(NativeGpuTelemetry.prototype, "cancelSubmission");
  const f = fixture();
  await f.renderer.ready;
  const readouts = state.owner.scene.uploadReadouts;
  state.owner.scene.uploadReadouts = (...args: unknown[]) => {
    expect(begin).toHaveBeenCalledWith("battle-draw");
    readouts(...args);
  };
  const visibility = state.owner.scene.setVisibility;
  state.owner.scene.setVisibility = (...args: unknown[]) => {
    expect(begin).toHaveBeenCalledWith("battle-draw");
    visibility(...args);
  };
  const upload = state.owner.scene.uploadCrowd;
  state.owner.scene.uploadCrowd = (...args: unknown[]) => {
    expect(begin).toHaveBeenCalledWith("battle-draw");
    upload(...args);
  };
  await f.renderer.present(packet());
  expect(end).toHaveBeenCalledTimes(1);
  expect(end.mock.calls[0][0]).toBeInstanceOf(Promise);
  state.owner.scene.uploadCrowd = () => {
    throw Error("pose failed");
  };
  await expect(f.renderer.present(packet())).rejects.toThrow("pose failed");
  expect(cancel).toHaveBeenCalled();
  state.owner.scene.uploadCrowd = upload;
  await expect(f.renderer.present(packet())).resolves.toMatchObject({ submitted: true });
  f.renderer.dispose();
  vi.restoreAllMocks();
});

test("the disabled lab timing control removes query work while the same device and submissions remain", async () => {
  const off = fixture({ timingQueries: "disabled", timestampQuery: true });
  await off.renderer.ready;
  expect(off.requested[0].requiredFeatures).toEqual(["timestamp-query"]);
  const first = await off.renderer.present(packet());
  const second = await off.renderer.present(packet());
  expect(first.gpuSubmission).toMatchObject({ submissionId: 2, source: "battle-draw" });
  expect(second.gpuSubmission!.submissionId).toBeGreaterThan(first.gpuSubmission!.submissionId);
  expect(off.device.createQuerySet).not.toHaveBeenCalled();
  expect(off.renderer.gpuEventsSince(0)).toBeNull();
  expect(off.renderer.stats()).toMatchObject({
    gpuTiming: {
      supported: false,
      timingQueries: "disabled",
      availability: "disabled-by-lab-control",
      querySlots: 0,
      submissionCount: 4,
    },
    labBuild: { timingQueryFlag: "BATTLE_NATIVE_TIMING_QUERIES", timingQueries: "disabled" },
    // Allocation observation stays installed and records no resolve/readback buffers.
    allocations: { buffers: { createdCount: 0 }, currentBytes: 0 },
  });
  // No event stream exists to correlate, which is reported as unavailable rather
  // than as a zero-cost frame.
  expect(off.renderer.stats().performance).toMatchObject({ gpuTimeMs: null, gpuTimeMetric: null });
  expect(off.renderer.stats().gpuCorrelation).toMatchObject({
    availability: "unavailable",
    correlatedFrames: 0,
    pendingReceipts: 0,
  });
  off.renderer.dispose();
  vi.stubGlobal("GPUBufferUsage", { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 });
  const on = fixture({ timestampQuery: true });
  await on.renderer.ready;
  expect(on.requested[0].requiredFeatures).toEqual(["timestamp-query"]);
  await on.renderer.present(packet());
  expect(on.device.createQuerySet).toHaveBeenCalled();
  expect(on.renderer.stats()).toMatchObject({
    gpuTiming: { supported: true, timingQueries: "enabled", availability: "available" },
    labBuild: { timingQueries: "enabled" },
  });
  on.renderer.dispose();
});

test("upload validation overlaps later preparation but gates final submission", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  state.calls = [];
  const release: Array<() => void> = [];
  f.device.popErrorScope = () => new Promise((resolve) => release.push(() => resolve(null)));
  const pending = f.renderer.present(packet());
  await progress(f.callbacks);
  const prepared = state.calls.some((call) => call[0] === "prepare");
  const submitted = state.calls.some((call) => call[0] === "submit");
  f.device.popErrorScope = async () => null;
  release.forEach((resolve) => resolve());
  await pending;
  f.renderer.dispose();
  expect(prepared).toBe(true);
  expect(submitted).toBe(false);
});

test.each([false, true])(
  "failed upload validation drains before disposal and never presents (startup %s)",
  async (startup) => {
    const f = fixture();
    await f.renderer.ready;
    const previous = await f.renderer.present(packet());
    state.calls = [];
    const release: Array<(error: GPUError | null) => void> = [];
    state.owner.scene.uploadReadouts = () => {
      f.device.popErrorScope = () => new Promise((resolve) => release.push(resolve));
    };
    const pending = f.renderer
      .present(
        packet(),
        undefined,
        startup
          ? () => {
              void f.renderer.settlePresentedFrame().catch(() => {});
            }
          : undefined,
      )
      .catch((error) => error);
    await progress(f.callbacks);
    // Fail one complete admission while later admissions still own pending checks.
    release
      .slice(0, 3)
      .forEach((resolve, i) => resolve(i === 0 ? { message: "bad upload" } : null));
    f.renderer.dispose();
    await progress(f.callbacks);
    expect(state.disposed).not.toHaveBeenCalled();
    expect(state.calls.some((call) => call[0] === "submit")).toBe(false);
    release.slice(3).forEach((resolve) => resolve(null));
    expect(await pending).toMatchObject({ message: "bad upload" });
    expect(f.renderer.frameMetrics().renderedFrameId).toBe(previous.renderedFrameId);
    expect(state.disposed).toHaveBeenCalledTimes(1);
  },
);

test("operation failure keeps its cause while pending validation drains", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  const release: Array<(error: GPUError | null) => void> = [];
  state.owner.scene.uploadReadouts = () => {
    f.device.popErrorScope = () => new Promise((resolve) => release.push(resolve));
  };
  state.owner.scene.prepare = () => {
    throw Error("prepare failed");
  };
  let finished = false;
  const pending = f.renderer.present(packet()).catch((error) => {
    finished = true;
    return error;
  });
  await progress(f.callbacks);
  f.renderer.dispose();
  await progress(f.callbacks);
  expect(finished).toBe(false);
  expect(state.disposed).not.toHaveBeenCalled();
  release.forEach((resolve) => resolve({ message: "secondary validation failure" }));
  expect(await pending).toMatchObject({ message: "prepare failed" });
  expect(state.disposed).toHaveBeenCalledTimes(1);
});

test("final GPU validation still gates frame identity and receipt", async () => {
  const f = fixture();
  await f.renderer.ready;
  const previous = await f.renderer.present(packet());
  const release: Array<(error: GPUError | null) => void> = [];
  const submit = state.owner.submitPresentation;
  state.owner.submitPresentation = () => {
    submit();
    f.device.popErrorScope = () => new Promise((resolve) => release.push(resolve));
  };
  let finished = false;
  const pending = f.renderer.present(packet()).catch((error) => {
    finished = true;
    return error;
  });
  await progress(f.callbacks);
  expect(finished).toBe(false);
  expect(f.renderer.frameMetrics().gpuSubmission).toEqual(previous.gpuSubmission);
  release.forEach((resolve, i) => resolve(i === 0 ? { message: "bad draw" } : null));
  expect(await pending).toMatchObject({ message: "bad draw" });
  expect(f.renderer.frameMetrics().renderedFrameId).toBe(previous.renderedFrameId);
  expect(f.renderer.frameMetrics().gpuSubmission).toEqual(previous.gpuSubmission);
  f.renderer.dispose();
});

test("output resize must pass validation before dimensions commit", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  const oldWidth = f.canvas.width;
  Object.defineProperty(f.canvas, "clientWidth", { value: 800 });
  f.renderer.resize();
  state.owner.resizeOutput = () => {
    f.device.popErrorScope = async () => ({ message: "bad output resize" });
  };
  await expect(f.renderer.present(packet())).rejects.toThrow("bad output resize");
  expect(f.canvas.width).toBe(oldWidth);
  expect(state.disposed).toHaveBeenCalledTimes(1);
});

test("cancellation during batched validation cannot submit a late frame", async () => {
  const f = fixture();
  await f.renderer.ready;
  const previous = await f.renderer.present(packet());
  state.calls = [];
  const release: Array<() => void> = [];
  f.device.popErrorScope = () => new Promise((resolve) => release.push(() => resolve(null)));
  const abort = new AbortController();
  const pending = f.renderer.present(packet(), abort.signal).catch((error) => error);
  await progress(f.callbacks);
  abort.abort();
  f.device.popErrorScope = async () => null;
  release.forEach((resolve) => resolve());
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(state.calls.some((call) => call[0] === "submit")).toBe(false);
  expect(f.renderer.frameMetrics().renderedFrameId).toBe(previous.renderedFrameId);
  await expect(f.renderer.present(packet())).resolves.toMatchObject({ submitted: true });
  f.renderer.dispose();
});

test("the published impostor catalog is resolved at runtime and overridable only in the lab", async () => {
  const f = fixture();
  await f.renderer.ready;
  expect(state.fetched).toEqual(["http://localhost/assets/soldiers/impostors/catalog.json"]);
  f.renderer.dispose();
  const lab = fixture({ atlasOverride: "/benchmark-atlas/catalog.json" });
  await lab.renderer.ready;
  expect(state.fetched).toContain("http://localhost/benchmark-atlas/catalog.json");
  lab.renderer.dispose();
});

test("a reload stages the published crowd, keeps playback and invalidates the frozen frame", async () => {
  const f = fixture();
  await f.renderer.ready;
  const frozen = { ...packet(), fixedTime: 12 };
  await f.renderer.present(frozen);
  await expect(f.renderer.present(frozen)).resolves.toMatchObject({ submitted: false });
  state.fetched = [];
  await f.renderer.reloadSoldierAssets();
  expect(state.calls.filter((c) => c[0] === "replaceCrowd")).toHaveLength(1);
  expect(state.calls.at(-1)![1]).toMatchObject({ assets: { 0: {} }, atlases: { 0: {} } });
  expect(state.fetched).toContain("http://localhost/assets/soldiers/impostors/catalog.json");
  // The retained frozen image is no longer what this crowd would present.
  await expect(f.renderer.present(frozen)).resolves.toMatchObject({ submitted: true });
  f.renderer.dispose();
});

test("a failed reload load keeps the last valid world usable", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  state.catalogFailure = Error("catalog 503");
  await expect(f.renderer.reloadSoldierAssets()).rejects.toThrow("catalog 503");
  expect(state.calls.filter((c) => c[0] === "replaceCrowd")).toHaveLength(0);
  expect(state.disposed).not.toHaveBeenCalled();
  state.catalogFailure = null;
  await expect(f.renderer.present(packet())).resolves.toMatchObject({ submitted: true });
  f.renderer.dispose();
});

test("a reload whose replacement drops an admitted pose is refused before installation", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  state.owner.scene.admittedCrowdPoses = () => new Set(["0\u0000charge"]);
  await expect(f.renderer.reloadSoldierAssets()).rejects.toThrow(
    "Reload does not contain active appearance 0 / clip charge",
  );
  expect(state.calls.filter((c) => c[0] === "replaceCrowd")).toHaveLength(0);
  await expect(f.renderer.present(packet())).resolves.toMatchObject({ submitted: true });
  f.renderer.dispose();
});

test("a disposed renderer rejects a later reload without fetching", async () => {
  const f = fixture();
  await f.renderer.ready;
  f.renderer.dispose();
  state.fetched = [];
  await expect(f.renderer.reloadSoldierAssets()).rejects.toThrow("disposed");
  expect(state.fetched).toEqual([]);
});

test("disposing during crowd staging prevents the pending generation from installing", async () => {
  const f = fixture();
  await f.renderer.ready;
  let resume!: () => void;
  const held = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let staging = false,
    installed = false;
  state.owner.scene.replaceCrowdAssets = async (_published: unknown, validate?: () => void) => {
    staging = true;
    await held;
    validate?.();
    installed = true;
  };
  const pending = f.renderer.reloadSoldierAssets();
  await progress(f.callbacks);
  expect(staging).toBe(true);
  f.renderer.dispose();
  resume();
  await expect(pending).rejects.toThrow("disposed");
  expect(installed).toBe(false);
  expect(state.disposed).toHaveBeenCalledOnce();
});

test("soldier animation diagnostics report the crowd owner's admitted pose", async () => {
  const f = fixture();
  expect(f.renderer.debugSoldierAnim(0)).toBeNull();
  await f.renderer.ready;
  await f.renderer.present(packet());
  expect(f.renderer.debugSoldierAnim(0)).toEqual({ clip: "idle", phase: 0.25 });
  expect(f.renderer.debugSoldierAnim(1)).toBeNull();
  f.renderer.dispose();
  expect(f.renderer.debugSoldierAnim(0)).toBeNull();
});

const blockPacket = (): BattlePresentation => {
  const p = packet();
  // Two units of one soldier each, the second already dead.
  return {
    ...p,
    crowd: {
      ...p.crowd!,
      positions: new Float32Array([0, 0, 40, 40]),
      alive: new Float32Array([1, 0]),
      count: 2,
    },
  };
};
test("the debug-block view prepares the published association into its own layer", async () => {
  const f = fixture({ search: "?debug=blocks" });
  await f.renderer.ready;
  f.renderer.setStatic(new Uint32Array([0, 1]), [1, 0], [0, 0]);
  await f.renderer.present(blockPacket());
  const blocks = state.calls.filter((c) => c[0] === "blocks");
  expect(blocks).toHaveLength(1);
  // One rectangle: the live team-one body, padded, in red. The dead one adds none.
  const verts = blocks[0][1] as Float32Array;
  expect(verts).toHaveLength(36);
  expect([...verts.subarray(0, 6)].map((v) => Math.round(v * 1e4) / 1e4)).toEqual([
    -2.4, -2.4, 0.88, 0.2, 0.16, 0.88,
  ]);
  // Attack arcs keep their own uploads; neither layer carries the other's vertices.
  expect(state.calls.filter((c) => c[0] === "triangles").map((c) => c[1])).not.toContain(verts);
  f.renderer.dispose();
});
test("an ordinary frame uploads no debug blocks at all", async () => {
  const f = fixture();
  await f.renderer.ready;
  f.renderer.setStatic(new Uint32Array([0]), [1], [0]);
  await f.renderer.present(blockPacket());
  expect(state.calls.filter((c) => c[0] === "blocks")).toHaveLength(0);
  f.renderer.dispose();
});
test("a discarded comparison backend still refuses the debug-block view", () => {
  expect(() => fixture({ backend: "vgpu", search: "?debug=blocks" })).toThrow(
    "does not implement the source debug-block view",
  );
});

test("the facade reports the presented frame's own completed submission span", async () => {
  vi.stubGlobal("GPUBufferUsage", { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 });
  vi.stubGlobal("GPUMapMode", { READ: 1 });
  const f = fixture({ timestampQuery: true, encodePasses: ["shadow", "main"] });
  await f.renderer.ready;
  // Two measured passes with an idle gap between them: 0-1ms and 3-4ms.
  state.timestamps = [[0n, 1_000_000n, 3_000_000n, 4_000_000n]];
  const receipt = await f.renderer.present(packet());
  await progress(f.callbacks);
  // Correlation reads the observer's existing events; presentation still waits
  // for no queue completion.
  expect(f.device.queue.onSubmittedWorkDone).not.toHaveBeenCalled();
  const performance = f.renderer.stats().performance;
  expect(performance).toMatchObject({
    // The span covers the gap; the union (2ms) and the pass sum are not the frame cost.
    gpuTimeMs: 4,
    gpuTimeMetric: "correlated-complete-submission-span",
    gpuFrame: {
      renderedFrameId: receipt.renderedFrameId,
      submissionId: receipt.gpuSubmission!.submissionId,
      observedGpuSpanMs: 4,
      observedGpuUnionMs: 2,
    },
  });
  expect(f.renderer.stats().gpuCorrelation).toMatchObject({
    availability: "correlating",
    correlatedFrames: 1,
    pendingReceipts: 0,
    pendingCompletions: 0,
    cursorGaps: 0,
  });

  // A repeated frozen frame submits nothing: it keeps the drawn frame's own
  // sample instead of claiming a new identity for the retained image.
  const frozen = { ...packet(), fixedTime: 12 };
  state.timestamps = [[0n, 2_000_000n, 0n, 2_000_000n]];
  const drawn = await f.renderer.present(frozen);
  await progress(f.callbacks);
  await expect(f.renderer.present(frozen)).resolves.toMatchObject({ submitted: false });
  await progress(f.callbacks);
  expect(f.renderer.stats().performance).toMatchObject({
    gpuTimeMs: 2,
    gpuFrame: {
      renderedFrameId: drawn.renderedFrameId,
      submissionId: drawn.gpuSubmission!.submissionId,
    },
  });
  expect(f.renderer.stats().gpuCorrelation).toMatchObject({ correlatedFrames: 2 });

  f.renderer.dispose();
  expect(f.renderer.stats().performance).toMatchObject({
    gpuTimeMs: null,
    gpuTimeMetric: null,
    gpuFrame: null,
  });
});

test("a startup frame's readiness identity correlates no frame, and the next frame does", async () => {
  vi.stubGlobal("GPUBufferUsage", { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 });
  vi.stubGlobal("GPUMapMode", { READ: 1 });
  const f = fixture({ timestampQuery: true, encodePasses: ["main"] });
  await f.renderer.ready;
  state.timestamps = [
    [0n, 1_000_000n],
    [0n, 2_000_000n],
    [0n, 3_000_000n],
  ];
  let readiness!: Promise<void>;
  const startup = await (async () => {
    const pending = f.renderer.present(packet(), undefined, () => {
      readiness = f.renderer.settlePresentedFrame();
    });
    await progress(f.callbacks);
    return pending;
  })();
  await readiness;
  await progress(f.callbacks);
  // The startup frame's final queue identity is its readiness render, so that
  // frame has no correlatable battle draw and reports nothing rather than
  // borrowing readiness work.
  expect(startup.gpuSubmission).toMatchObject({ source: "render-only" });
  expect(f.renderer.stats().performance).toMatchObject({ gpuTimeMs: null, gpuTimeMetric: null });

  state.timestamps = [[0n, 5_000_000n]];
  const next = await f.renderer.present(packet());
  await progress(f.callbacks);
  expect(next.gpuSubmission).toMatchObject({ source: "battle-draw" });
  expect(f.renderer.stats().performance).toMatchObject({
    gpuTimeMs: 5,
    gpuFrame: { renderedFrameId: next.renderedFrameId },
  });
  f.renderer.dispose();
});
