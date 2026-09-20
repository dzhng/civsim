/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
const state = vi.hoisted(() => ({
  owners: [] as { dispose: ReturnType<typeof vi.fn> }[],
  /** Every crowd audience the scene has constructed, in order, so a replacement's
   *  staged generation can be told apart from the one it retires. */
  crowds: [] as any[],
  replace: vi.fn(),
  setTerrain: vi.fn(),
  standardsUpload: vi.fn(),
  readoutUpload: vi.fn(),
  crowdUpload: vi.fn(),
  pose: vi.fn(),
  submit: vi.fn(),
  /** Every triangle layer this scene constructed, in order, so the block-debug
   *  layer can be told apart from the attack-arc layer, and the ids they drew in. */
  triangleLayers: [] as any[],
  drawn: [] as number[],
  terrainGeneration: 1,
  /** Scenery the mocked terrain owner has installed, which only a real
   *  replacement moves: the scene must read the owner, not its own options. */
  terrainScenery: 7,
  crowdFailure: null as unknown,
  crowdHold: null as Promise<void> | null,
  measurement: null as unknown,
  gpuError: null as GPUError | null,
  gpuAdmissionHold: null as Promise<void> | null,
}));
function layer(extra = {}) {
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
vi.mock("../environment", () => ({
  createTypegpuEnvironment: async () => layer(),
}));
vi.mock("../frame", () => ({
  TypegpuBattleFrame: class {
    width = 1440;
    height = 900;
    cameraLayout = {};
    cameraGroup = {};
    dispose = vi.fn();
    setCamera = vi.fn();
    resize = vi.fn((width: number, height: number) => {
      this.width = width;
      this.height = height;
    });
    /** The depth buffer the real frame owns, reported off this double's own size so
     *  a scene stats read cannot pass while publishing a size nothing installed. */
    depthStats = () => ({
      owner: "typegpu-battle-frame",
      installed: true,
      format: "depth32float",
      samples: 1,
      width: this.width,
      height: this.height,
      clearValue: 0,
      reversed: true,
      requestedBytes: this.width * this.height * 4,
    });
    static async create() {
      return new this();
    }
    createCommandEncoder = () => ({ submit: state.submit });
    nativeEncoder = (encoder: unknown) => encoder;
    constructor() {
      state.owners.push(this);
    }
    encode(_encoder: unknown, _output: unknown, draw: Function) {
      draw({}, {});
    }
  },
}));
vi.mock("../terrainScene", () => ({
  createTypegpuBattleTerrainScene: async () =>
    layer({
      replace: async (...args: unknown[]) => {
        await state.replace(...args);
        state.terrainGeneration++;
        state.terrainScenery += 3;
      },
      committedGeneration: () => state.terrainGeneration,
      // The committed generation's own content, as the real terrain owner reports it.
      stats: () => ({
        installed: true,
        generation: state.terrainGeneration,
        replacing: false,
        scenery: state.terrainScenery,
        vistaBands: 4,
        water: { draws: 1, triangles: 2 },
      }),
      grid: () => ({}),
      field: () => ({}),
      cover: () => "green-grass",
      rect: () => [0, 0, 10, 10],
      heightAt: () => 0,
      setFrame: vi.fn(),
      drawOpaque: vi.fn(),
      drawTransparent: vi.fn(),
      drawShadow: vi.fn(),
    }),
}));
vi.mock("../crowdAudience", () => ({
  createTypegpuCrowdAudience: async () => {
    if (state.crowdFailure) throw state.crowdFailure;
    await state.crowdHold;
    // Each audience counts its own admitted submissions, exactly as a fresh history
    // does: a replacement restarts at zero and only the scene's epoch separates them.
    let submission = 0;
    // The pose this audience has admitted, exactly as a real history reports it: null
    // until one of its OWN uploads completes, and an empty upload still admits a pose.
    let admitted: readonly unknown[] | null = null;
    // A real audience refuses every frame read until it has admitted something, so an
    // audience that was never uploaded to cannot be reprojected into a frame.
    const requireFrame = () => {
      if (!admitted) throw Error("Crowd audience frame is not ready");
    };
    const owner = layer({
      upload: vi.fn(async (instances: readonly unknown[], ...args: unknown[]) => {
        await state.crowdUpload(instances, ...args);
        submission++;
        admitted = instances;
      }),
      precompute: vi.fn((...args: unknown[]) => {
        requireFrame();
        return state.pose(...args);
      }),
      reproject: vi.fn(async () => {
        requireFrame();
        return false;
      }),
      refreshCamera: vi.fn(),
      // What the shared crowd-audience diagnostics answer off the admitted history.
      admitted: () => admitted,
      admittedSubmission: () => (admitted ? submission : null),
      admittedPoses: () => new Set(["0\u0000idle"]),
      debugSoldierAnim: (index: number) => (index === 0 ? { clip: "idle", phase: 0.25 } : null),
      verifySeating: vi.fn(() => state.measurement),
    });
    state.crowds.push(owner);
    return owner;
  },
}));
vi.mock("../grassField", () => ({
  createTypegpuGrassField: async () =>
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
vi.mock("../standards", () => ({
  createTypegpuStandards: async () => layer({ upload: state.standardsUpload, setView: vi.fn() }),
}));
vi.mock("../readout", () => ({
  createTypegpuReadout: () => layer({ upload: state.readoutUpload, setCamera: vi.fn() }),
}));
/** An overlay layer that reports the vertex count it was actually uploaded, so a
 *  scene stats read cannot pass while publishing one layer's count under another
 *  layer's key. */
function overlayLayer(extra: object = {}) {
  let count = 0;
  return layer({
    upload: vi.fn(async (vertices: Float32Array) => {
      count = vertices.length;
    }),
    stats: () => ({ count }),
    ...extra,
  });
}
/** A triangle layer that names itself when drawn, so the pass order between the
 *  block-debug and attack-arc layers is read off the draw rather than assumed. */
function triangleLayer() {
  const id = state.triangleLayers.length;
  const value = overlayLayer({ id, draw: vi.fn(() => state.drawn.push(id)) });
  state.triangleLayers.push(value);
  return value;
}
vi.mock("../overlay", () => ({
  createTypegpuLineLayer: async () => overlayLayer(),
  createTypegpuRingLayer: async () => overlayLayer(),
  createTypegpuTriangleLayer: async () => triangleLayer(),
}));
import { createTypegpuBattleScene } from "../battleScene";
import { battleSceneCamera } from "../../../../../packages/battle-renderer/src/sceneCamera";
import type { BattleSceneOptions } from "../../../../../packages/battle-renderer/src/sceneTypes";
import type { TgpuCommandEncoder } from "typegpu";
import type { CrowdInstance } from "../../../../../packages/crowd-runtime/src/instanceData";
import { CIVSIM_ENVIRONMENTS } from "../../../../../packages/game-renderer/src/environment/environment";
import { productionBladeFieldProfile } from "../../../../../packages/game-renderer/src/battle/battleGrassResidency";
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
  createCommandEncoder: () => ({ finish: () => ({}) }),
  queue: { submit: vi.fn() },
  pushErrorScope: vi.fn(),
  popErrorScope: async () => {
    await state.gpuAdmissionHold;
    const error = state.gpuError;
    state.gpuError = null;
    return error;
  },
} as unknown as GPUDevice;
beforeEach(() => {
  state.owners.length = 0;
  state.crowds.length = 0;
  state.triangleLayers.length = 0;
  state.drawn.length = 0;
  // The terrain owner commits its first generation while the scene is constructed.
  state.terrainGeneration = 1;
  state.terrainScenery = 7;
  state.crowdFailure = null;
  state.crowdHold = null;
  state.measurement = null;
  state.gpuError = null;
  state.gpuAdmissionHold = null;
  state.replace.mockReset();
  state.setTerrain.mockReset();
  state.standardsUpload.mockReset();
  state.readoutUpload.mockReset();
  state.crowdUpload.mockReset();
  state.pose.mockReset();
  state.submit.mockReset();
});
/** One admitted soldier. The scene carries the admitted array by identity, so the
 *  only thing this has to be is a real instance. */
const pose: CrowdInstance[] = [
  {
    x: 0,
    y: 0,
    facing: 0,
    classId: 0,
    faction: 0,
    alive: true,
    clip: "idle",
    phase: 0.25,
    seed: 1,
    mounted: false,
    lod: 0,
  },
];
async function ready(instances: readonly CrowdInstance[] = [], debugBlocks = false) {
  const scene = await createTypegpuBattleScene(device, { ...options, debugBlocks });
  await scene.uploadCrowd(instances, camera);
  await scene.prepare({ camera, time: 0 });
  return scene;
}
test("failed staged terrain replacement retains the previously prepared scene", async () => {
  const scene = await ready();
  state.replace.mockRejectedValueOnce(Error("allocation failed"));
  await expect(scene.replaceTerrain(terrain)).rejects.toThrow("allocation failed");
  expect(() => scene.encode({} as TgpuCommandEncoder, {} as GPUTextureView)).not.toThrow();
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
  expect(() => scene.encode({} as TgpuCommandEncoder, {} as GPUTextureView)).toThrow("disposed");
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
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 0)).toBe(true);
  resume();
  await expect(pending).rejects.toThrow("disposed");
  expect(state.readoutUpload).not.toHaveBeenCalled();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
});

test("every update submits pose once; unchanged camera demand and repeat presentation submit none", async () => {
  const scene = await ready();
  await scene.uploadCrowd([], camera, 1);
  expect(state.pose).toHaveBeenCalledTimes(2);
  expect(state.submit).toHaveBeenCalledTimes(2);
  await scene.prepare({ camera, time: 2 });
  scene.encode({} as TgpuCommandEncoder, {} as GPUTextureView);
  scene.encode({} as TgpuCommandEncoder, {} as GPUTextureView);
  expect(state.pose).toHaveBeenCalledTimes(2);
  scene.dispose();
});
test("pending crowd upload rejects overlapping updates and disposal prevents late pose submission", async () => {
  const scene = await ready();
  let resume!: () => void;
  state.crowdUpload.mockReturnValueOnce(
    new Promise<void>((r) => {
      resume = r;
    }),
  );
  const upload = scene.uploadCrowd([], camera);
  await expect(scene.prepare({ camera, time: 1 })).rejects.toThrow("in flight");
  scene.dispose();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 0)).toBe(true);
  resume();
  await expect(upload).rejects.toThrow("disposed");
  expect(state.pose).toHaveBeenCalledTimes(1);
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
});

const published = { assets: {}, atlases: {} };
const encodeOnce = (scene: Awaited<ReturnType<typeof createTypegpuBattleScene>>) =>
  scene.encode({} as TgpuCommandEncoder, {} as GPUTextureView);
test("a successful crowd replacement installs the staged generation and carries the admitted pose at the last prepared camera", async () => {
  const scene = await ready(pose);
  const [installed] = state.crowds;
  const moved = {
    ...camera,
    camera3d: { ...camera.camera3d, target: [40, 12, 0] as [number, number, number] },
  };
  await scene.prepare({ camera: moved, time: 3 });
  await scene.replaceCrowdAssets(published);
  const staged = state.crowds[1];
  expect(state.crowds).toHaveLength(2);
  expect(installed.dispose).toHaveBeenCalledOnce();
  expect(staged.upload).toHaveBeenCalledOnce();
  expect(staged.upload.mock.lastCall![0]).toBe(pose);
  // Reprojected through the camera the last completed preparation actually wrote,
  // not the camera the scene was constructed with.
  expect(staged.upload.mock.lastCall![2]).toEqual(
    battleSceneCamera(moved, 1440, 900, 3, options.environment).impostor,
  );
  expect(staged.precompute).toHaveBeenCalledOnce();
  // Terrain, grass and environment are never rebuilt to reload the crowd.
  expect(state.replace).not.toHaveBeenCalled();
  expect(state.setTerrain).toHaveBeenCalledOnce();
  expect(() => encodeOnce(scene)).toThrow("no completed preparation");
  await scene.prepare({ camera, time: 4 });
  expect(() => encodeOnce(scene)).not.toThrow();
  scene.dispose();
  expect(staged.dispose).toHaveBeenCalledOnce();
  expect(installed.dispose).toHaveBeenCalledOnce();
});
test("an admitted empty crowd is carried into the replacement rather than dropped", async () => {
  const scene = await ready();
  await scene.replaceCrowdAssets(published);
  const staged = state.crowds[1];
  // An empty pose is still an admitted one. A replacement that never receives it has
  // no admitted frame, and the next preparation has nothing to reproject.
  expect(staged.upload).toHaveBeenCalledOnce();
  expect(staged.upload.mock.lastCall![0]).toEqual([]);
  expect(staged.precompute).toHaveBeenCalledOnce();
  await expect(scene.prepare({ camera, time: 0 })).resolves.toBeUndefined();
  expect(() => encodeOnce(scene)).not.toThrow();
  scene.dispose();
});
// The pose a source upload admits is drawable before anything has prepared, so a
// reload in that window has a camera to carry it through and must not retire it
// unposed. Both admitted populations reach the replacement the same way.
for (const [label, uploaded] of [
  ["a populated", pose],
  ["an empty", [] as CrowdInstance[]],
] as const) {
  test(`${label} admitted crowd survives a replacement before the first preparation`, async () => {
    const scene = await createTypegpuBattleScene(device, options);
    const moved = {
      ...camera,
      camera3d: { ...camera.camera3d, target: [40, 12, 0] as [number, number, number] },
    };
    await scene.uploadCrowd(uploaded, moved, 3);
    // Nothing has prepared a frame, so nothing may be published as one.
    expect(scene.stats()).toMatchObject({ prepared: false, preparedCamera: null });
    await scene.replaceCrowdAssets(published);
    const staged = state.crowds[1];
    expect(staged.upload).toHaveBeenCalledOnce();
    expect(staged.upload.mock.lastCall![0]).toBe(uploaded);
    // Carried through the camera that admitted the pose, the only one this scene has.
    expect(staged.upload.mock.lastCall![2]).toEqual(
      battleSceneCamera(moved, 1440, 900, 3, options.environment).impostor,
    );
    expect(staged.precompute).toHaveBeenCalledOnce();
    expect(scene.stats().preparedCamera).toBeNull();
    // Drawable from the carried pose alone: the caller submits no second source pose.
    await expect(scene.prepare({ camera, time: 4 })).resolves.toBeUndefined();
    expect(staged.upload).toHaveBeenCalledOnce();
    expect(() => encodeOnce(scene)).not.toThrow();
    expect(scene.stats().preparedCamera).toMatchObject({ camera3d: { target: [0, 0, 0] } });
    scene.dispose();
  });
}
test("a failed crowd staging retains the last valid world and stages nothing", async () => {
  const scene = await ready();
  const [installed] = state.crowds;
  state.crowdFailure = Error("atlas allocation failed");
  await expect(scene.replaceCrowdAssets(published)).rejects.toThrow("atlas allocation failed");
  state.crowdFailure = null;
  expect(state.crowds).toHaveLength(1);
  expect(installed.dispose).not.toHaveBeenCalled();
  expect(() => encodeOnce(scene)).not.toThrow();
  scene.dispose();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
});
test("a refused admission releases the staged crowd and keeps presenting the old one", async () => {
  const scene = await ready(pose);
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
  expect(() => encodeOnce(scene)).not.toThrow();
  scene.dispose();
});
test("GPU rejection of the carried-pose upload preserves the installed crowd", async () => {
  const scene = await ready(pose);
  const [installed] = state.crowds;
  state.submit.mockImplementationOnce(() => {
    state.gpuError = { message: "invalid carried-pose upload" } as GPUError;
  });
  await expect(scene.replaceCrowdAssets(published)).rejects.toThrow("invalid carried-pose upload");
  expect(installed.dispose).not.toHaveBeenCalled();
  expect(state.crowds[1].dispose).toHaveBeenCalledOnce();
  expect(() => encodeOnce(scene)).not.toThrow();
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
  expect(staged.upload).not.toHaveBeenCalled();
  expect(installed.dispose).toHaveBeenCalledOnce();
});
test("disposal while admission waits releases the staged crowd before it can install", async () => {
  const scene = await ready(pose);
  let resume!: () => void;
  state.gpuAdmissionHold = new Promise<void>((r) => {
    resume = r;
  });
  const pending = scene.replaceCrowdAssets(published);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const staged = state.crowds[1];
  expect(staged.dispose).not.toHaveBeenCalled();
  scene.dispose();
  resume();
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
  expect(state.crowds).toHaveLength(1);
  resume();
  await readouts;
  scene.dispose();
});
test("repeated replacement retires each generation and separates identical submissions by epoch", async () => {
  const scene = await ready(pose);
  expect(scene.admittedSeatingIdentity()).toEqual({
    crowdGeneration: 0,
    submission: 1,
    terrainGeneration: 1,
  });
  await scene.replaceCrowdAssets(published);
  await scene.replaceCrowdAssets(published);
  expect(state.crowds).toHaveLength(3);
  expect(state.crowds[0].dispose).toHaveBeenCalledOnce();
  expect(state.crowds[1].dispose).toHaveBeenCalledOnce();
  expect(state.crowds[2].dispose).not.toHaveBeenCalled();
  // Every history carried one pose and restarted at submission 1; only the epoch
  // tells the three apart.
  expect(scene.admittedSeatingIdentity()).toEqual({
    crowdGeneration: 2,
    submission: 1,
    terrainGeneration: 1,
  });
  await scene.replaceTerrain(terrain);
  expect(scene.admittedSeatingIdentity()).toMatchObject({ terrainGeneration: 2 });
  scene.dispose();
});
test("an unadmitted pose or an uncommitted terrain generation has no seating identity", async () => {
  const scene = await createTypegpuBattleScene(device, options);
  // Nothing admitted yet, over a terrain generation that is committed.
  expect(scene.admittedSeatingIdentity()).toBeNull();
  await scene.uploadCrowd(pose, camera);
  expect(scene.admittedSeatingIdentity()).toMatchObject({ submission: 1 });
  scene.dispose();
  expect(() => scene.admittedSeatingIdentity()).toThrow("disposed");
});
test("seating verification measures only when asked, and refuses instead of passing vacuously", async () => {
  const unadmitted = await createTypegpuBattleScene(device, options);
  expect(unadmitted.verifyAdmittedSeating()).toEqual({
    measurement: null,
    unavailable: "No admitted crowd pose over a committed terrain generation",
    installed: null,
  });
  unadmitted.dispose();
  const scene = await ready(pose);
  state.measurement = {
    checked: 1,
    matches: true,
    span: 0,
    nonFinite: 0,
    worstDelta: 0,
    tolerance: 1e-3,
  };
  expect(scene.verifyAdmittedSeating()).toEqual({
    measurement: state.measurement,
    unavailable: null,
    installed: { crowdGeneration: 0, submission: 1, terrainGeneration: 1 },
  });
  // An identified pose that measures nothing is an unseated world, not a pass.
  state.measurement = null;
  expect(scene.verifyAdmittedSeating()).toMatchObject({
    unavailable: "The admitted crowd pose is empty",
    installed: { submission: 1 },
  });
  scene.dispose();
});
test("a staged operation in flight refuses verification rather than measuring a pose it is replacing", async () => {
  const scene = await ready(pose);
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
    installed: { submission: 1 },
  });
  resume();
  await readouts;
  scene.dispose();
});
test("preparation, presentation and stats never scan the admitted population", async () => {
  const scene = await ready(pose);
  await scene.prepare({ camera, time: 1 });
  encodeOnce(scene);
  scene.stats();
  scene.stats();
  expect(scene.admittedSeatingIdentity()).toMatchObject({ submission: 1 });
  expect(state.crowds[0].verifySeating).not.toHaveBeenCalled();
  scene.verifyAdmittedSeating();
  expect(state.crowds[0].verifySeating).toHaveBeenCalledOnce();
  scene.dispose();
});
test("admitted pose and per-soldier reads come from the installed crowd owner", async () => {
  const scene = await ready();
  expect(scene.admittedCrowdPoses()).toEqual(new Set(["0\u0000idle"]));
  expect(scene.debugSoldierAnim(0)).toEqual({ clip: "idle", phase: 0.25 });
  expect(scene.debugSoldierAnim(1)).toBeNull();
  scene.dispose();
});
test("scene stats publish the environment, terrain and cue owners this world installed", async () => {
  const scene = await ready();
  await scene.uploadTacticalLines({
    groundCues: new Float32Array(12),
    rings: new Float32Array(6),
    effects: new Float32Array(30),
  });
  await scene.uploadTriangles(new Float32Array(9));
  expect(scene.stats()).toMatchObject({
    // The environment this scene's owners were actually built from.
    environment: "golden",
    terrain: {
      installed: true,
      generation: 1,
      replacing: false,
      scenery: 7,
      vistaBands: 4,
      water: { draws: 1, triangles: 2 },
    },
    // Each cue layer answers for itself; a swapped key would report another
    // layer's upload.
    tacticalLines: {
      groundCues: { count: 12 },
      rings: { count: 6 },
      effects: { count: 30 },
      triangles: { count: 9 },
      // This world installs no formation-debug layer at all.
      debugBlocks: null,
    },
  });
  // A real terrain replacement moves the committed generation the report names.
  await scene.replaceTerrain(terrain);
  expect(scene.stats().terrain).toMatchObject({ generation: 2, scenery: 10 });
  // A later cue upload replaces only its own layer's count.
  await scene.uploadTacticalLines({
    groundCues: new Float32Array(3),
    rings: new Float32Array(6),
    effects: new Float32Array(30),
  });
  expect(scene.stats().tacticalLines).toMatchObject({
    groundCues: { count: 3 },
    triangles: { count: 9 },
  });
  scene.dispose();
});
test("ordinary battles allocate no block-debug layer and refuse its upload", async () => {
  const scene = await ready();
  expect(state.triangleLayers).toHaveLength(1);
  await expect(scene.uploadDebugBlocks(new Float32Array(6))).rejects.toThrow(
    "Block-debug rendering was not enabled",
  );
  // A refused upload reaches no layer at all, so the arc layer keeps its own content.
  expect(state.triangleLayers[0].upload).not.toHaveBeenCalled();
  scene.dispose();
});

test("attack arcs and the block-debug view own separate layers, blocks drawn first", async () => {
  const scene = await ready([], true);
  const blockVerts = new Float32Array([1, 2, 1, 0, 0, 1]);
  await scene.uploadDebugBlocks(blockVerts);
  // Every later frame reuploads its arcs, including the empty frames between them.
  await scene.uploadTriangles(new Float32Array([3, 4, 0, 1, 0, 1]));
  await scene.uploadTriangles(new Float32Array());
  expect(state.triangleLayers).toHaveLength(2);
  const blocks = state.triangleLayers.find((l) => l.upload.mock.calls[0]?.[0] === blockVerts)!;
  const arcs = state.triangleLayers.find((l) => l !== blocks)!;
  expect(blocks.upload.mock.calls).toEqual([[blockVerts]]);
  expect(arcs.upload).toHaveBeenCalledTimes(2);
  // The emptied arc frame cannot wipe the block geometry: each layer answers for
  // its own upload under its own key.
  expect(scene.stats().tacticalLines).toMatchObject({
    debugBlocks: { count: 6 },
    triangles: { count: 0 },
  });
  await scene.prepare({ camera, time: 0 });
  scene.encode({} as TgpuCommandEncoder, {} as GPUTextureView);
  expect(state.drawn).toEqual([blocks.id, arcs.id]);
  scene.dispose();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
});

test("disposal during an awaited block upload prevents late debug allocation", async () => {
  const scene = await ready([], true);
  // Allocated before the arc layer it is drawn under.
  const blocks = state.triangleLayers[0];
  let resume!: () => void;
  blocks.upload.mockReturnValueOnce(
    new Promise<void>((r) => {
      resume = r;
    }),
  );
  const pending = scene.uploadDebugBlocks(new Float32Array(6));
  scene.dispose();
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 0)).toBe(true);
  resume();
  await expect(pending).rejects.toThrow("disposed");
  expect(state.owners.every((x) => x.dispose.mock.calls.length === 1)).toBe(true);
  // A disposed scene refuses the next one outright rather than touching the layer.
  await expect(scene.uploadDebugBlocks(new Float32Array(6))).rejects.toThrow("disposed");
  expect(blocks.upload).toHaveBeenCalledOnce();
});

test("scene stats publish the frame's own depth attachment, re-read after a resize", async () => {
  const scene = await ready();
  expect(scene.stats().depth).toEqual({
    owner: "typegpu-battle-frame",
    installed: true,
    format: "depth32float",
    samples: 1,
    width: 1440,
    height: 900,
    clearValue: 0,
    reversed: true,
    requestedBytes: 1440 * 900 * 4,
  });
  await scene.resize(720, 450);
  expect(scene.stats().depth).toMatchObject({
    width: 720,
    height: 450,
    requestedBytes: 720 * 450 * 4,
  });
  scene.dispose();
});
