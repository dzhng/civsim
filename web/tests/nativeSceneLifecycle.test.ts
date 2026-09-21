import type { BattleSceneOptions } from "../../packages/battle-renderer/src/sceneTypes";
// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  owners: [] as { dispose: ReturnType<typeof vi.fn> }[],
  crowds: [] as {
    dispose: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    precompute: ReturnType<typeof vi.fn>;
  }[],
  crowdFailure: null as unknown,
  crowdHold: null as null | Promise<void>,
  admitted: [] as unknown[],
  gpuError: null as GPUError | null,
  gpuAdmissionHold: null as Promise<GPUError | null> | null,
  replace: vi.fn(),
  setTerrain: vi.fn(),
  standardsUpload: vi.fn(),
  readoutUpload: vi.fn(),
  triangleLayers: [] as { id: number; upload: ReturnType<typeof vi.fn> }[],
  encoded: [] as number[],
  terrainStats: {} as Record<string, unknown>,
  /** The pose counter a real history keeps, and the measurement its owner would
   *  return. The scene must join them; it never measures anything itself. */
  submission: 1,
  verifySeating: vi.fn(),
}));
function layer<T extends object>(extra: T = {} as T) {
  const value = {
    dispose: vi.fn(),
    upload: vi.fn(),
    draw: vi.fn(),
    encode: vi.fn(),
    stats: vi.fn(() => ({})),
    ...extra,
  };
  state.owners.push(value);
  return value;
}
vi.mock("../../apps/battle-perf-lab/src/raw/world/environment", () => ({
  createRawEnvironment: async () => layer(),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/frame", () => ({
  RawBattleFrame: class {
    width = 1440;
    height = 900;
    cameraLayout = {};
    cameraGroup = {};
    dispose = vi.fn();
    setCamera = vi.fn();
    resize = vi.fn();
    constructor() {
      state.owners.push(this);
    }
    encode(_encoder: unknown, _output: unknown, draw: Function) {
      draw({}, {});
    }
    depthStats() {
      return {
        owner: "raw-battle-frame",
        installed: true,
        format: "depth32float",
        samples: 1,
        width: this.width,
        height: this.height,
        clearValue: 0,
        loadOp: "clear",
        storeOp: "store",
        reversed: true,
        requestedBytes: this.width * this.height * 4,
      };
    }
  },
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/terrainScene", () => ({
  createRawBattleTerrainScene: async () =>
    layer({
      replace: state.replace,
      grid: () => ({}),
      field: () => ({}),
      cover: () => "green-grass",
      rect: () => [0, 0, 10, 10],
      heightAt: () => 0,
      setFrame: vi.fn(),
      drawOpaque: vi.fn(),
      drawTransparent: vi.fn(),
      drawShadow: vi.fn(),
      stats: () => state.terrainStats,
      committedGeneration: () =>
        state.terrainStats.installed ? state.terrainStats.generation : null,
    }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/crowdAudience", () => ({
  // Prepare reuses the upload camera, so the audience reports unchanged views.
  createRawCrowdAudience: async () => {
    if (state.crowdFailure) throw state.crowdFailure;
    let ready = false;
    const value = layer({
      upload: vi.fn(() => {
        ready = true;
      }),
      precompute: vi.fn(),
      reproject: vi.fn(() => {
        if (!ready) throw Error("Crowd audience frame is not ready");
        return false;
      }),
      refreshCamera: vi.fn(),
      admitted: () => state.admitted,
      admittedSubmission: () => (ready ? state.submission : null),
      verifySeating: state.verifySeating,
      admittedPoses: () => new Set<string>(),
      debugSoldierAnim: vi.fn(() => null),
    });
    state.crowds.push(value);
    // Staged resources exist before the owner is handed back, as a real GPU
    // preparation does; disposal in that window must still release them.
    await state.crowdHold;
    return value;
  },
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/grassField", () => ({
  createRawGrassField: async () =>
    layer({
      setTerrain: state.setTerrain,
      setVisible: vi.fn(),
      setFarVisible: vi.fn(),
      prepare: vi.fn(),
      update: vi.fn(),
      settle: vi.fn(),
      route: vi.fn(),
      snapshot: () => ({ terrainDetailStrength: 1 }),
    }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/standards", () => ({
  createRawStandards: async () => layer({ upload: state.standardsUpload, setView: vi.fn() }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/readout", () => ({
  createRawReadout: () => layer({ upload: state.readoutUpload, setCamera: vi.fn() }),
}));
/** Overlay layers report the content they were last handed, so the scene's
 *  published cue counts have to follow real uploads. */
function overlayLayer() {
  let count = 0;
  return layer({
    upload: vi.fn((vertices: Float32Array) => {
      count = vertices.length;
    }),
    stats: () => ({ count }),
  });
}
vi.mock("../../apps/battle-perf-lab/src/raw/world/overlay", () => ({
  createRawLineLayer: async () => overlayLayer(),
  createRawRingLayer: async () => overlayLayer(),
  createRawTriangleLayer: async () => {
    const id = state.triangleLayers.length;
    const value = layer({ id, encode: vi.fn(() => state.encoded.push(id)) });
    state.triangleLayers.push(value);
    return value;
  },
}));
import { createRawBattleScene } from "../../apps/battle-perf-lab/src/raw/battleScene";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { productionBladeFieldProfile } from "@packages/game-renderer/src/battle/battleGrassResidency";
const camera = {
  x: 0,
  y: 0,
  zoom: 1,
  zoomT: 1,
  camera3d: {
    target: [0, 0, 0] as [number, number, number],
    distance: 100,
    yaw: 0,
    pitch: 0.7,
    fovY: 1,
    aspect: 1.6,
    near: 0.5,
  },
};
const terrain = {
  grid: { w: 1, h: 1, cell: 4, ox: 0, oy: 0, tint: new Uint8Array(1) },
  cover: "green-grass" as const,
  vista: null,
  lakes: [],
};
const options: BattleSceneOptions = {
  environment: CIVSIM_ENVIRONMENTS.golden,
  assets: {},
  atlases: {},
  terrain,
  grassProfile: productionBladeFieldProfile("standard"),
  width: 1440,
  height: 900,
  samples: 1,
  outputFormat: "rgba8unorm",
  shadows: "off",
  grass: true,
  farGrass: true,
  bloom: true,
  post: true,
  grade: { strength: 1, saturationBoost: 1.15, contrast: 0.16, splitTone: 0.85, shadowLift: 1 },
};
const device = {
  pushErrorScope: () => {},
  popErrorScope: async () => state.gpuAdmissionHold ?? state.gpuError,
  createCommandEncoder: () => ({ finish: () => ({}) }),
  queue: { submit: vi.fn() },
} as unknown as GPUDevice;
const caps = {
  maxBufferSize: 1e9,
  maxStorageBufferBindingSize: 1e9,
  msaaSampleCount: 1,
  msaaSupported: true,
  timestampQuery: false,
  powerPreference: "default" as const,
};
beforeEach(() => {
  state.owners.length = 0;
  state.crowds.length = 0;
  state.crowdFailure = null;
  state.crowdHold = null;
  state.admitted = [];
  state.gpuError = null;
  state.gpuAdmissionHold = null;
  vi.mocked(device.queue.submit).mockReset();
  state.replace.mockReset();
  state.setTerrain.mockReset();
  state.standardsUpload.mockReset();
  state.readoutUpload.mockReset();
  state.triangleLayers.length = 0;
  state.encoded.length = 0;
  state.terrainStats = { installed: true, generation: 1, replacing: false, scenery: 6 };
  state.submission = 1;
  state.verifySeating.mockReset();
  state.verifySeating.mockReturnValue({
    checked: 2,
    matches: true,
    span: 0.5,
    nonFinite: 0,
    worstDelta: 0.0002,
    tolerance: 1e-3,
  });
});
async function ready(debugBlocks = false) {
  const scene = await createRawBattleScene(device, caps, { ...options, debugBlocks });
  scene.uploadCrowd([], camera);
  await scene.prepare({ camera, time: 0 });
  return scene;
}
test("failed staged terrain replacement retains the previously prepared scene", async () => {
  const scene = await ready();
  state.replace.mockRejectedValueOnce(Error("allocation failed"));
  await expect(scene.replaceTerrain(terrain)).rejects.toThrow("allocation failed");
  expect(() => scene.encode({} as GPUCommandEncoder, {} as GPUTextureView)).not.toThrow();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 0)).toBe(true);
  scene.dispose();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
});
test("a dependent failure after terrain commit cannot present mixed generations", async () => {
  const scene = await ready();
  state.setTerrain.mockImplementationOnce(() => {
    throw Error("grass allocation failed");
  });
  await expect(scene.replaceTerrain(terrain)).rejects.toThrow("grass allocation failed");
  expect(() => scene.encode({} as GPUCommandEncoder, {} as GPUTextureView)).toThrow("disposed");
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
  scene.dispose();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
});
test("disposal during an awaited UI upload prevents late readout allocation", async () => {
  const scene = await ready();
  let resume!: () => void;
  state.standardsUpload.mockReturnValueOnce(
    new Promise<void>((r) => {
      resume = r;
    }),
  );
  const pending = scene.uploadReadouts([], []);
  scene.dispose();
  resume();
  await expect(pending).rejects.toThrow("disposed");
  expect(state.readoutUpload).not.toHaveBeenCalled();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
});

test("ordinary battles allocate no block-debug layer", async () => {
  const scene = await ready();
  expect(state.triangleLayers).toHaveLength(1);
  scene.dispose();
});

test("attack arcs and the block-debug view own separate layers, blocks encoded first", async () => {
  const scene = await ready(true);
  const blockVerts = new Float32Array([1, 2, 1, 0, 0, 1]);
  scene.uploadDebugBlocks(blockVerts);
  // Every later frame reuploads its arcs, including the empty frames between them.
  scene.uploadTriangles(new Float32Array([3, 4, 0, 1, 0, 1]));
  scene.uploadTriangles(new Float32Array());
  const blocks = state.triangleLayers.find((l) => l.upload.mock.calls[0]?.[0] === blockVerts)!;
  const arcs = state.triangleLayers.find((l) => l !== blocks)!;
  expect(state.triangleLayers).toHaveLength(2);
  expect(blocks.upload.mock.calls).toEqual([[blockVerts]]);
  expect(arcs.upload).toHaveBeenCalledTimes(2);
  await scene.prepare({ camera, time: 0 });
  scene.encode({} as GPUCommandEncoder, {} as GPUTextureView);
  expect(state.encoded).toEqual([blocks.id, arcs.id]);
  scene.dispose();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
});

const published = { assets: {}, atlases: {} };
test("GPU rejection after carried-pose upload preserves the installed crowd", async () => {
  const scene = await ready();
  state.admitted = [{ classId: 0 }];
  const [installed] = state.crowds;
  vi.mocked(device.queue.submit).mockImplementationOnce(() => {
    state.gpuError = { message: "invalid carried-pose upload" } as GPUError;
  });
  await expect(scene.replaceCrowdAssets(published)).rejects.toThrow("invalid carried-pose upload");
  expect(installed.dispose).not.toHaveBeenCalled();
  expect(state.crowds[1].dispose).toHaveBeenCalledOnce();
  expect(() => scene.encode({} as GPUCommandEncoder, {} as GPUTextureView)).not.toThrow();
  scene.dispose();
});
test("an admitted empty crowd survives replacement and render-only preparation", async () => {
  const scene = await ready();
  state.admitted = [];
  await scene.replaceCrowdAssets(published);
  await expect(scene.prepare({ camera, time: 0 })).resolves.toBeUndefined();
  expect(() => scene.encode({} as GPUCommandEncoder, {} as GPUTextureView)).not.toThrow();
  scene.dispose();
});
test("a successful crowd replacement installs staged resources and carries the admitted pose", async () => {
  const scene = await ready();
  state.admitted = [{ classId: 0 }];
  const [installed] = state.crowds;
  await scene.replaceCrowdAssets(published);
  const staged = state.crowds[1];
  expect(state.crowds).toHaveLength(2);
  expect(installed.dispose).toHaveBeenCalledOnce();
  expect(staged.upload).toHaveBeenCalledOnce();
  expect(staged.upload.mock.lastCall![0]).toBe(state.admitted);
  expect(staged.precompute).toHaveBeenCalledOnce();
  // Terrain, grass and environment are never rebuilt to reload the crowd.
  expect(state.replace).not.toHaveBeenCalled();
  expect(state.setTerrain).toHaveBeenCalledOnce();
  expect(() => scene.encode({} as GPUCommandEncoder, {} as GPUTextureView)).toThrow(
    "no completed preparation",
  );
  await scene.prepare({ camera, time: 0 });
  expect(() => scene.encode({} as GPUCommandEncoder, {} as GPUTextureView)).not.toThrow();
  scene.dispose();
  expect(staged.dispose).toHaveBeenCalledOnce();
  expect(installed.dispose).toHaveBeenCalledOnce();
});
test("a failed crowd staging retains the last valid world and stages nothing", async () => {
  const scene = await ready();
  const [installed] = state.crowds;
  state.crowdFailure = Error("atlas allocation failed");
  await expect(scene.replaceCrowdAssets(published)).rejects.toThrow("atlas allocation failed");
  state.crowdFailure = null;
  expect(state.crowds).toHaveLength(1);
  expect(installed.dispose).not.toHaveBeenCalled();
  expect(() => scene.encode({} as GPUCommandEncoder, {} as GPUTextureView)).not.toThrow();
  scene.dispose();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
});
test("a refused admission releases the staged crowd and keeps presenting the old one", async () => {
  const scene = await ready();
  state.admitted = [{ classId: 0 }];
  const [installed] = state.crowds;
  await expect(
    scene.replaceCrowdAssets(published, () => {
      throw Error("Reload does not contain active appearance 0 / clip march");
    }),
  ).rejects.toThrow("active appearance 0 / clip march");
  const staged = state.crowds[1];
  expect(staged.dispose).toHaveBeenCalledOnce();
  expect(staged.upload).not.toHaveBeenCalled();
  expect(installed.dispose).not.toHaveBeenCalled();
  expect(() => scene.encode({} as GPUCommandEncoder, {} as GPUTextureView)).not.toThrow();
  scene.dispose();
});
test("disposal while staged crowd preparation waits releases the staged resources", async () => {
  const scene = await ready();
  const [installed] = state.crowds;
  let resume!: () => void;
  state.crowdHold = new Promise<void>((r) => {
    resume = r;
  });
  const pending = scene.replaceCrowdAssets(published);
  scene.dispose();
  resume();
  await expect(pending).rejects.toThrow("disposed");
  const staged = state.crowds[1];
  expect(staged.dispose).toHaveBeenCalledOnce();
  expect(installed.dispose).toHaveBeenCalledOnce();
  expect(staged.upload).not.toHaveBeenCalled();
});
test("disposal while admission waits releases the staged crowd before it can install", async () => {
  const scene = await ready();
  state.admitted = [{ classId: 0 }];
  let resume!: (error: GPUError | null) => void;
  state.gpuAdmissionHold = new Promise<GPUError | null>((r) => {
    resume = r;
  });
  const pending = scene.replaceCrowdAssets(published);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const staged = state.crowds[1];
  expect(staged.dispose).not.toHaveBeenCalled();
  scene.dispose();
  resume(null);
  await expect(pending).rejects.toThrow("disposed");
  expect(staged.dispose).toHaveBeenCalledOnce();
  expect(staged.upload).toHaveBeenCalledOnce();
});
test("a crowd replacement cannot overlap another staged scene operation", async () => {
  const scene = await ready();
  let resume!: () => void;
  state.standardsUpload.mockReturnValueOnce(
    new Promise<void>((r) => {
      resume = r;
    }),
  );
  const readouts = scene.uploadReadouts([], []);
  await expect(scene.replaceCrowdAssets(published)).rejects.toThrow("already in flight");
  resume();
  await readouts;
  scene.dispose();
});

test("scene stats publish each owner's installed content and the PREPARED pose", async () => {
  const scene = await ready(true);
  scene.uploadTacticalLines({
    groundCues: new Float32Array(9),
    rings: new Float32Array(3),
    effects: new Float32Array(15),
  });
  state.terrainStats = { installed: true, generation: 2, replacing: false, scenery: 21 };
  const moved = {
    ...camera,
    camera3d: { ...camera.camera3d, target: [7, 8, 9] as [number, number, number] },
  };
  await scene.prepare({ camera: moved, time: 3 });
  const stats = scene.stats();
  expect(stats.environment).toBe(options.environment.id);
  expect(stats.depth).toMatchObject({
    owner: "raw-battle-frame",
    reversed: true,
    format: "depth32float",
  });
  expect(stats.terrain).toEqual({ installed: true, generation: 2, replacing: false, scenery: 21 });
  expect(stats.tacticalLines).toEqual({
    groundCues: { count: 9 },
    rings: { count: 3 },
    effects: { count: 15 },
    triangles: {},
    debugBlocks: {},
  });
  // `preparedCamera` moves the moment preparation completes — before anything
  // reaches the queue — so it is not a presented camera and is not named one.
  expect(stats.preparedCamera?.camera3d.target).toEqual([7, 8, 9]);
  expect(stats.prepared).toBe(true);
  scene.dispose();
});

test("an ordinary battle publishes no block-debug layer content", async () => {
  const scene = await ready();
  expect(scene.stats().tacticalLines.debugBlocks).toBeNull();
  scene.dispose();
});

test("an explicit inspection measures the admitted pose against the seating sampler itself", async () => {
  const scene = await ready();
  expect(scene.verifyAdmittedSeating()).toEqual({
    measurement: {
      checked: 2,
      matches: true,
      span: 0.5,
      nonFinite: 0,
      worstDelta: 0.0002,
      tolerance: 1e-3,
    },
    unavailable: null,
    installed: { crowdGeneration: 0, submission: 1, terrainGeneration: 1 },
  });
  // The verification and the crowd builder share ONE sampler: the playable field,
  // not `heightAt`, which adds the vista apron no soldier stands on.
  expect(state.verifySeating.mock.lastCall![0]).toBe(scene.seatingHeightAt);
  expect(state.verifySeating.mock.lastCall![0]).not.toBe(scene.heightAt);
  scene.dispose();
});

test("an unadmitted, empty or uninstalled world is unavailable rather than a vacuous match", async () => {
  const scene = await createRawBattleScene(device, caps, options);
  // Nothing has been uploaded: there is no pose to identify or measure.
  expect(scene.admittedSeatingIdentity()).toBeNull();
  expect(scene.verifyAdmittedSeating()).toMatchObject({
    measurement: null,
    unavailable: "No admitted crowd pose over a committed terrain generation",
    installed: null,
  });
  expect(state.verifySeating).not.toHaveBeenCalled();
  scene.uploadCrowd([], camera);
  // An admitted but empty population measures nothing, and nothing is not a pass.
  state.verifySeating.mockReturnValueOnce(null);
  expect(scene.verifyAdmittedSeating()).toMatchObject({
    measurement: null,
    unavailable: "The admitted crowd pose is empty",
    installed: { submission: 1 },
  });
  // A terrain generation that is not committed cannot seat anything either.
  state.terrainStats = { installed: false, generation: 1, replacing: false };
  expect(scene.admittedSeatingIdentity()).toBeNull();
  expect(scene.verifyAdmittedSeating()).toMatchObject({ measurement: null, installed: null });
  scene.dispose();
  expect(() => scene.verifyAdmittedSeating()).toThrow("disposed");
  expect(() => scene.admittedSeatingIdentity()).toThrow("disposed");
});

test("a staged operation in flight suspends verification instead of answering mid-replacement", async () => {
  const scene = await ready();
  let resume!: () => void;
  state.standardsUpload.mockReturnValueOnce(
    new Promise<void>((r) => {
      resume = r;
    }),
  );
  const readouts = scene.uploadReadouts([], []);
  expect(scene.verifyAdmittedSeating()).toMatchObject({
    measurement: null,
    unavailable: "Battle scene preparation is in flight",
  });
  expect(state.verifySeating).not.toHaveBeenCalled();
  resume();
  await readouts;
  expect(scene.verifyAdmittedSeating().measurement).not.toBeNull();
  scene.dispose();
});

test("a crowd replacement advances the epoch that a restarted submission counter cannot", async () => {
  const scene = await ready();
  state.admitted = [{ classId: 0 }];
  expect(scene.admittedSeatingIdentity()).toEqual({
    crowdGeneration: 0,
    submission: 1,
    terrainGeneration: 1,
  });
  await scene.replaceCrowdAssets(published);
  // The staged history restarted at 0 and re-admitted the carried pose as its
  // own submission 1: identical counters, a different generation of crowd.
  expect(scene.admittedSeatingIdentity()).toEqual({
    crowdGeneration: 1,
    submission: 1,
    terrainGeneration: 1,
  });
  state.terrainStats = { installed: true, generation: 2, replacing: false, scenery: 6 };
  expect(scene.admittedSeatingIdentity()).toMatchObject({ terrainGeneration: 2 });
  scene.dispose();
});
