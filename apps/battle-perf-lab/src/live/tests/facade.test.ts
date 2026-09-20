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
  /** One-shot failure for the first upload of a presentation, so a frame can fail
   *  before it ever admits a crowd pose. */
  readoutFailure: null as unknown,
  disposed: vi.fn(),
  /** Content the mocked scene owners actually hold, so the facade's published
   *  diagnostics have to follow real changes rather than repeat a fixed shape. */
  scene: {
    generation: 0,
    scenery: 0,
    preparedCamera: null as any,
    lines: { groundCues: 0, rings: 0, effects: 0 },
    /** The crowd epoch and submission the mocked owner has admitted, which only a
     *  real upload or replacement moves — the facade must join them itself. */
    crowdGeneration: 0,
    submission: 0,
    admitted: false,
    measurement: null as any,
  },
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
  state.readoutFailure = null;
  state.hold = null;
  state.disposed.mockReset();
  // The scene installs its first terrain generation while it is constructed.
  state.scene = {
    generation: 1,
    scenery: 7,
    preparedCamera: null,
    lines: { groundCues: 0, rings: 0, effects: 0 },
    crowdGeneration: 0,
    submission: 0,
    admitted: false,
    measurement: {
      checked: 3,
      matches: true,
      span: 1.25,
      nonFinite: 0,
      worstDelta: 0.0004,
      tolerance: 1e-3,
    },
  };
});
afterEach(() => vi.unstubAllGlobals());
function fixture(
  build: {
    timingQueries?: "enabled" | "disabled";
    timestampQuery?: boolean;
    atlasOverride?: string;
    backend?: "raw" | "typegpu" | "vgpu";
    /** Omit the crowd-replacement seam, as the retired comparison backends do:
     *  their scenes never owned a selected world's content diagnostics. */
    comparisonScene?: boolean;
    /** The converted selected world: it owns the same crowd, content, depth and
     *  debug-block reports the source world does. */
    convertedScene?: boolean;
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
  /** What the mocked crowd owner has admitted right now. A replacement restarts
   *  its submission counter, exactly as a fresh history does. */
  const seatingIdentity = () =>
    state.scene.admitted
      ? {
          crowdGeneration: state.scene.crowdGeneration,
          submission: state.scene.submission,
          terrainGeneration: state.scene.generation,
        }
      : null;
  const crowdSeam = {
    replaceCrowdAssets: async (published: unknown, admit?: () => void | Promise<void>) => {
      call("replaceCrowd")(published);
      await admit?.();
      state.scene.crowdGeneration++;
      state.scene.submission = 1;
    },
    admittedCrowdPoses: () => new Set(["0\u0000idle"]),
    debugSoldierAnim: (index: number) => (index === 0 ? { clip: "idle", phase: 0.25 } : null),
    admittedSeatingIdentity: () => {
      call("seatingIdentity")();
      return seatingIdentity();
    },
    verifyAdmittedSeating: () => {
      call("verifySeating")();
      const installed = seatingIdentity();
      if (!installed)
        return {
          measurement: null,
          unavailable: "No admitted crowd pose over a committed terrain generation",
          installed: null,
        };
      // A pose the owner measured nothing for is an empty population, as the real
      // scene reports it.
      if (!state.scene.measurement)
        return { measurement: null, unavailable: "The admitted crowd pose is empty", installed };
      return { measurement: state.scene.measurement, unavailable: null, installed };
    },
  };
  state.owner = {
    scene: {
      pickingMeshes: () => [],
      heightAt: () => 2,
      seatingHeightAt: () => 2,
      setVisibility: call("visibility"),
      replaceTerrain: (...args: unknown[]) => {
        call("terrain")(...args);
        state.scene.generation++;
        state.scene.scenery += 3;
      },
      resize: call("resize"),
      uploadReadouts: (...args: unknown[]) => {
        call("readouts")(...args);
        const failure = state.readoutFailure;
        state.readoutFailure = null;
        if (failure) throw failure;
      },
      uploadCrowd: (...args: unknown[]) => {
        call("crowd")(...args);
        state.scene.admitted = true;
        state.scene.submission++;
        queue.submit([]);
      },
      uploadTriangles: call("triangles"),
      uploadTacticalLines: (lines: any, ...rest: unknown[]) => {
        call("lines")(lines, ...rest);
        state.scene.lines = {
          groundCues: lines.groundCues.length,
          rings: lines.rings.length,
          effects: lines.effects.length,
        };
      },
      prepare: (view: any, ...rest: unknown[]) => {
        call("prepare")(view, ...rest);
        state.scene.preparedCamera = view.camera;
        if (!build.encodePasses) return;
        const encoder = device.createCommandEncoder();
        for (const label of build.encodePasses) encoder.beginRenderPass({ label }).end();
        state.encoded.push(encoder.finish());
      },
      settleGrass: call("settle"),
      // The crowd generation every selected world owns.
      ...(build.comparisonScene ? {} : crowdSeam),
      // Both selected worlds implement the debug-block view; the retired
      // comparison backends own neither it nor the content stats.
      ...(build.comparisonScene ? {} : { uploadDebugBlocks: call("blocks") }),
      stats: () => ({
        actual: true,
        crowd: { instances: 0, ready: true },
        preparedCamera: state.scene.preparedCamera,
        depth: {
          owner: build.convertedScene ? "typegpu-battle-frame" : "raw-battle-frame",
          installed: true,
          format: "depth32float",
          samples: 1,
          width: 1440,
          height: 900,
          clearValue: 0,
          reversed: true,
          requestedBytes: 1440 * 900 * 4,
        },
        shadows: { mode: "single", cascades: 1 },
        grass: { residency: { rebuild: { pending: false } } },
        // Terrain, overlay and environment content, which every selected world's
        // owners publish. A retired comparison backend's scene still carries the
        // shape, so the facade has to refuse it on ownership rather than on its
        // absence.
        environment: "aegean-noon",
        terrain: {
          installed: true,
          generation: state.scene.generation,
          replacing: false,
          scenery: state.scene.scenery,
          vistaBands: 4,
          water: { draws: 1, triangles: 2 },
        },
        tacticalLines: {
          groundCues: { count: state.scene.lines.groundCues },
          rings: { count: state.scene.lines.rings },
          effects: { count: state.scene.lines.effects },
          triangles: { count: 0 },
          debugBlocks: null,
        },
      }),
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
  // Both selected worlds are asked for it, through the one shared geometry owner:
  // the selection decides which scene receives the upload, not what it contains.
  for (const backend of ["raw", "typegpu"] as const) {
    state.calls = [];
    const f = fixture({
      backend,
      convertedScene: backend === "typegpu",
      search: "?debug=blocks",
    });
    await f.renderer.ready;
    // The scene is BUILT with the debug layer, not handed blocks it cannot hold.
    expect(state.options).toMatchObject({ debugBlocks: true });
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
  }
});
test("an ordinary frame uploads no debug blocks at all", async () => {
  const f = fixture();
  await f.renderer.ready;
  // The scene is built without the debug layer, so nothing can be uploaded to one.
  expect(state.options).toMatchObject({ debugBlocks: false });
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

test("High is refused only by the backend that has no cascades", async () => {
  // The selected raw world and the selected TypeGPU candidate both implement it,
  // and the selection reaches the scene they are built with; the discarded vgpu
  // candidate still keeps its fitted single map and says so.
  for (const backend of ["raw", "typegpu"] as const) {
    state.options = null;
    const f = fixture({ backend, search: "?shadows=csm" });
    await f.renderer.ready;
    expect(state.options).toMatchObject({ shadows: "csm" });
    f.renderer.dispose();
  }
  expect(() => fixture({ backend: "vgpu", search: "?shadows=csm" })).toThrow(
    "implements the single shadow map, not High",
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

// --- Installed-scene diagnostics -------------------------------------------
// The standing browser checks read a population, a presented camera, actual
// scenery/grass content, the installed depth resource and requested memory off
// this seam. Each assertion below moves with the thing it names, so a producer
// that published a fixed shape would fail them.

test("the expected population is the installed static simulation data, not the crowd's own count", async () => {
  const f = fixture();
  await f.renderer.ready;
  f.renderer.setStatic(new Uint32Array([0, 0, 1, 1, 2]), [0, 1, 0], [0, 1]);
  await f.renderer.present(packet());
  const stats = f.renderer.stats();
  // The mocked crowd owner has admitted nothing yet; `soldiers` may not borrow
  // the expected number to hide that.
  expect(stats.expectedSoldiers).toBe(5);
  expect(stats.soldiers).toBe(0);
  f.renderer.setStatic(new Uint32Array([0, 1]), [0, 1], [0]);
  expect(f.renderer.stats().expectedSoldiers).toBe(2);
  f.renderer.dispose();
});

test("published scene content follows the owners' actual content", async () => {
  const f = fixture();
  await f.renderer.ready;
  const lines = {
    groundCues: new Float32Array(12),
    rings: new Float32Array(6),
    effects: new Float32Array(),
  };
  await f.renderer.present({ ...packet(), tacticalLines: lines });
  const first = f.renderer.stats();
  expect(first).toMatchObject({
    substrate: "raw-webgpu",
    projection: "camera3d",
    environment: "aegean-noon",
    terrain: { installed: true, generation: 1, scenery: 7, vistaBands: 4 },
    tacticalLines: {
      groundCues: { count: 12 },
      rings: { count: 6 },
      effects: { count: 0 },
    },
  });
  // Grass keeps its own owner's shape under the surface it covers.
  expect(first.terrain).toMatchObject({ grass: { residency: { rebuild: { pending: false } } } });
  // A real terrain replacement and different cues must both show up.
  f.renderer.setTerrain({ w: 1, h: 1, cell: 4, ox: 0, oy: 0, tint: new Uint8Array(1) });
  await f.renderer.present({
    ...packet(),
    tacticalLines: { ...lines, effects: new Float32Array(30) },
  });
  expect(f.renderer.stats()).toMatchObject({
    terrain: { generation: 2, scenery: 10 },
    tacticalLines: { effects: { count: 30 } },
  });
  f.renderer.dispose();
});

test("depth and requested memory describe installed resources, with their existing scope", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  const stats = f.renderer.stats();
  expect(stats.depth).toEqual({
    owner: "raw-battle-frame",
    installed: true,
    format: "depth32float",
    samples: 1,
    width: 1440,
    height: 900,
    clearValue: 0,
    reversed: true,
    requestedBytes: 1440 * 900 * 4,
  });
  // The allocation tracker's own honest scope is reused, not restated.
  expect(stats.allocations).toMatchObject({
    scope: expect.stringContaining("not physical VRAM"),
    currentBytes: expect.any(Number),
  });
  // Source three's CPU object tables do not exist here, and nothing stands in.
  expect(f.renderer.memoryInfo()).toBeNull();
  f.renderer.dispose();
});

test("the published camera is the frame that presented, paired with the id it presented under", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  const presented = f.renderer.stats();
  expect(presented).toMatchObject({
    presentedFrameId: 1,
    camera: { zoom: 2, zoomT: 0.5, camera3d: { target: [1, 2, 0], distance: 100 } },
  });
  // A later presentation that fails after its battle draw leaves the previous
  // frame standing: a newer camera must never be published under an older id.
  const moved = {
    ...packet(),
    camera: captureBattleRenderCamera({
      zoom: 9,
      zoomT: 1,
      viewCenter: () => [40, 50],
      params: () => ({
        target: [40, 50, 0] as [number, number, number],
        distance: 30,
        yaw: 0,
        pitch: 0.7,
        fovY: 1,
        aspect: 1.5,
        near: 1,
      }),
    }),
  };
  f.device.queue.onSubmittedWorkDone.mockRejectedValueOnce(Error("device lost during readiness"));
  const pending = f.renderer.present(moved, undefined, () => {
    void f.renderer.settlePresentedFrame().catch(() => {});
  });
  await progress(f.callbacks);
  await expect(pending).rejects.toThrow("device lost during readiness");
  expect(f.renderer.stats()).toMatchObject({
    // The scene did prepare the newer pose, so `preparedCamera` is not a presented one.
    native: { preparedCamera: { camera3d: { target: [40, 50, 0] } } },
    presentedFrameId: 1,
    camera: { zoom: 2, camera3d: { target: [1, 2, 0] } },
  });
  f.renderer.dispose();
});

test("a retained frozen image keeps its own camera and frame identity", async () => {
  const f = fixture();
  await f.renderer.ready;
  const frozen = { ...packet(), fixedTime: 12 };
  await f.renderer.present(frozen);
  const drawn = f.renderer.stats();
  await expect(f.renderer.present(frozen)).resolves.toMatchObject({ submitted: false });
  expect(f.renderer.stats()).toMatchObject({
    presentedFrameId: drawn.presentedFrameId,
    camera: drawn.camera,
  });
  f.renderer.dispose();
});

test("a reader cannot mutate the published camera into the next read", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  const camera = f.renderer.stats().camera as { camera3d: { target: number[] } };
  camera.camera3d.target[0] = 999;
  expect(f.renderer.stats().camera).toMatchObject({ camera3d: { target: [1, 2, 0] } });
  f.renderer.dispose();
});

test("seating, draw calls and routed grass triangles are unavailable, each with a named obligation", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  const stats = f.renderer.stats();
  expect(stats.seating).toBeNull();
  expect(stats.drawCalls).toBeNull();
  const obligations = (stats.openObligations as string[]).join("\n");
  for (const owed of ["seating", "drawCalls", "grass"]) expect(obligations).toContain(owed);
  f.renderer.dispose();
});

test("a disposed renderer reports no installed world rather than an empty one", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  expect(f.renderer.stats().terrain).not.toBeNull();
  f.renderer.dispose();
  expect(f.renderer.stats()).toMatchObject({
    ready: false,
    substrate: null,
    projection: null,
    environment: null,
    depth: null,
    terrain: null,
    tacticalLines: null,
    shadows: null,
    native: null,
  });
});

test("a retired comparison backend keeps its own identity instead of the selected world's", async () => {
  const f = fixture({ backend: "vgpu", comparisonScene: true });
  await f.renderer.ready;
  await f.renderer.present(packet());
  const stats = f.renderer.stats();
  // Its scene still carries the content shape; owning no selected world is what
  // refuses it, so none of these may be borrowed from the world that does own them.
  expect(stats).toMatchObject({
    backend: "vgpu",
    substrate: null,
    projection: null,
    environment: null,
    depth: null,
    terrain: null,
    tacticalLines: null,
    // Its own scene stats still publish, and presentation is still identified.
    native: { actual: true },
    presentedFrameId: 1,
  });
  // Every null above is named, so it cannot be read as an empty installed world.
  const obligations = stats.openObligations as string[];
  for (const unowned of ["substrate", "projection", "environment", "terrain", "tacticalLines"])
    expect(obligations).toContain(unowned);
  f.renderer.dispose();
});

test("an explicit inspection answers for the frame that presented, without caching a verdict", async () => {
  const f = fixture();
  f.renderer.setStatic(new Uint32Array(3), [0], [0]);
  await f.renderer.ready;
  await f.renderer.present(packet());
  const inspection = await f.renderer.verifySeating();
  expect(inspection).toMatchObject({
    measurement: { checked: 3, matches: true, span: 1.25, nonFinite: 0, tolerance: 1e-3 },
    unavailable: null,
    presentedFrameId: 1,
    presented: { crowdGeneration: 0, submission: 1, terrainGeneration: 1 },
    installed: { crowdGeneration: 0, submission: 1, terrainGeneration: 1 },
    expectedSoldiers: 3,
  });
  // It names the population and surface it walked, and refuses the stronger claim.
  expect(inspection.scope).toContain("playable");
  expect(inspection.scope).toContain("not evidence of drawn GPU feet placement");
  // The verdict is returned, never published: the normal stat stays unavailable
  // and keeps naming its obligation.
  expect(f.renderer.stats().seating).toBeNull();
  expect(f.renderer.stats().openObligations).toContain("seating");
  f.renderer.dispose();
});

test("ordinary presentation and stats reads never reach the population inspector", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  await f.renderer.present(packet());
  f.renderer.stats();
  f.renderer.stats();
  f.renderer.frameMetrics();
  const named = (name: string) => state.calls.filter(([called]) => called === name).length;
  expect(named("verifySeating")).toBe(0);
  // One O(1) identity read per presented frame, and none per stats read.
  expect(named("seatingIdentity")).toBe(2);
  await f.renderer.verifySeating();
  expect(named("verifySeating")).toBe(1);
  f.renderer.dispose();
});

test("a presentation that failed after admitting its pose leaves no verdict for the older frame", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  state.hold = async () => {
    throw Error("submission rejected");
  };
  await expect(f.renderer.present(packet())).rejects.toThrow("submission rejected");
  state.hold = null;
  const inspection = await f.renderer.verifySeating();
  expect(inspection.measurement).toBeNull();
  expect(inspection.unavailable).toContain("no longer the one the last presented frame drew");
  // The newer pose is admitted; the frame that drew the older one still stands.
  expect(inspection).toMatchObject({
    presentedFrameId: 1,
    presented: { submission: 1 },
    installed: { submission: 2 },
  });
  f.renderer.dispose();
});

test("a terrain generation the next frame never presented is not verified against the old pose", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  f.renderer.setTerrain({ w: 1, h: 1, cell: 4, ox: 0, oy: 0, tint: new Uint8Array(1) });
  state.readoutFailure = Error("readout allocation failed");
  await expect(f.renderer.present(packet())).rejects.toThrow("readout allocation failed");
  const inspection = await f.renderer.verifySeating();
  expect(inspection.measurement).toBeNull();
  // The pose never moved; only the surface underneath it did.
  expect(inspection).toMatchObject({
    presentedFrameId: 1,
    presented: { submission: 1, terrainGeneration: 1 },
    installed: { submission: 1, terrainGeneration: 2 },
  });
  f.renderer.dispose();
});

test("a crowd replacement restarting its submission counter cannot reuse the old verdict", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  await f.renderer.reloadSoldierAssets();
  const inspection = await f.renderer.verifySeating();
  expect(inspection.measurement).toBeNull();
  // Identical submissions from two different histories: only the epoch separates them.
  expect(inspection).toMatchObject({
    presented: { crowdGeneration: 0, submission: 1 },
    installed: { crowdGeneration: 1, submission: 1 },
  });
  f.renderer.dispose();
});

test("a retained frozen image keeps the verification of the frame it is still showing", async () => {
  const f = fixture();
  await f.renderer.ready;
  const frozen = { ...packet(), fixedTime: 12 };
  await f.renderer.present(frozen);
  await expect(f.renderer.present(frozen)).resolves.toMatchObject({ submitted: false });
  expect(await f.renderer.verifySeating()).toMatchObject({
    measurement: { matches: true },
    unavailable: null,
    presentedFrameId: 1,
  });
  f.renderer.dispose();
});

test("verification waits for a presentation in flight instead of reading past it", async () => {
  const f = fixture();
  await f.renderer.ready;
  let release!: () => void;
  state.hold = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const presenting = f.renderer.present(packet());
  for (let i = 0; i < 40 && !release; i++) await Promise.resolve();
  const inspecting = f.renderer.verifySeating();
  for (let i = 0; i < 40; i++) await Promise.resolve();
  expect(state.calls.some(([name]) => name === "verifySeating")).toBe(false);
  release();
  await presenting;
  expect(await inspecting).toMatchObject({ measurement: { matches: true }, presentedFrameId: 1 });
  f.renderer.dispose();
});

test("verification before any presented frame is unavailable rather than an empty pass", async () => {
  const f = fixture();
  await f.renderer.ready;
  expect(await f.renderer.verifySeating()).toMatchObject({
    measurement: null,
    unavailable: "No frame has presented a pose to verify",
    presentedFrameId: null,
    presented: null,
  });
  f.renderer.dispose();
});

test("a retired comparison backend owns no population to verify and copies no other verdict", async () => {
  const f = fixture({ backend: "vgpu", comparisonScene: true });
  await f.renderer.ready;
  await f.renderer.present(packet());
  const inspection = await f.renderer.verifySeating();
  expect(inspection.measurement).toBeNull();
  expect(inspection.unavailable).toContain("vgpu");
  expect(inspection).toMatchObject({ presentedFrameId: 1, presented: null, installed: null });
  f.renderer.dispose();
});

test("a disposed renderer refuses verification rather than reporting a seated world", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  f.renderer.dispose();
  await expect(f.renderer.verifySeating()).rejects.toThrow("disposed");
});

test("a scene that refuses to measure is forwarded as refused, not as an absent match", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present(packet());
  // The identity still matches; the world simply has no population to measure.
  state.scene.measurement = null;
  expect(await f.renderer.verifySeating()).toMatchObject({
    measurement: null,
    unavailable: "The admitted crowd pose is empty",
    presentedFrameId: 1,
    installed: { submission: 1 },
  });
  f.renderer.dispose();
});

test("an inspection caller cannot mutate the retained presentation identity", async () => {
  const f = fixture();
  await f.renderer.ready;
  await f.renderer.present({ ...packet(), fixedTime: 12 });
  const first = await f.renderer.verifySeating();
  const identity = { ...first.presented };
  first.presented!.submission += 100;
  const second = await f.renderer.verifySeating();
  expect(second.measurement?.matches).toBe(true);
  expect(second.presented).toEqual(identity);
  expect(second.presentedFrameId).toBe(first.presentedFrameId);
  f.renderer.dispose();
});

test("a converted world publishes its own identity and the content its owners report", async () => {
  const f = fixture({ backend: "typegpu", convertedScene: true });
  await f.renderer.ready;
  const lines = {
    groundCues: new Float32Array(12),
    rings: new Float32Array(6),
    effects: new Float32Array(),
  };
  await f.renderer.present({ ...packet(), tacticalLines: lines });
  const stats = f.renderer.stats();
  expect(stats).toMatchObject({
    backend: "typegpu",
    ready: true,
    presentedFrameId: 1,
    // Its own name and its own frame's attachment, never the raw world's.
    substrate: "typegpu",
    projection: "camera3d",
    depth: { owner: "typegpu-battle-frame", installed: true, requestedBytes: 1440 * 900 * 4 },
    shadows: { mode: "single", cascades: 1 },
    // Content from this world's own owners.
    environment: "aegean-noon",
    terrain: { installed: true, generation: 1, scenery: 7, vistaBands: 4 },
    tacticalLines: {
      groundCues: { count: 12 },
      rings: { count: 6 },
      effects: { count: 0 },
    },
  });
  expect(stats.terrain).toMatchObject({ grass: { residency: { rebuild: { pending: false } } } });
  // Content is no longer owed; the measurements no world makes truthfully still are.
  expect(stats.openObligations).toEqual(["seating", "drawCalls", "grassRouting"]);
  // A real terrain replacement and different cues both move this world's report.
  f.renderer.setTerrain({ w: 1, h: 1, cell: 4, ox: 0, oy: 0, tint: new Uint8Array(1) });
  await f.renderer.present({
    ...packet(),
    tacticalLines: { ...lines, effects: new Float32Array(30) },
  });
  expect(f.renderer.stats()).toMatchObject({
    terrain: { generation: 2, scenery: 10 },
    tacticalLines: { effects: { count: 30 } },
  });
  f.renderer.dispose();
});

test("a converted world's admitted crowd is reloaded, inspected and read per soldier", async () => {
  const f = fixture({ backend: "typegpu", convertedScene: true });
  f.renderer.setStatic(new Uint32Array(3), [0], [0]);
  await f.renderer.ready;
  await f.renderer.present(packet());
  expect(f.renderer.debugSoldierAnim(0)).toEqual({ clip: "idle", phase: 0.25 });
  expect(await f.renderer.verifySeating()).toMatchObject({
    measurement: { checked: 3, matches: true },
    unavailable: null,
    presentedFrameId: 1,
    installed: { crowdGeneration: 0, submission: 1, terrainGeneration: 1 },
  });
  await f.renderer.reloadSoldierAssets();
  expect(state.calls.some(([name]) => name === "replaceCrowd")).toBe(true);
  // The replacement's own epoch leaves the frame that drew the older pose unverified.
  expect(await f.renderer.verifySeating()).toMatchObject({
    measurement: null,
    presented: { crowdGeneration: 0 },
    installed: { crowdGeneration: 1 },
  });
  f.renderer.dispose();
});
