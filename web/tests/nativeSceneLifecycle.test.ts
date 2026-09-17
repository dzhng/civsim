import type { BattleSceneOptions } from "../../apps/battle-perf-lab/src/sceneTypes";
// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  owners: [] as { dispose: ReturnType<typeof vi.fn> }[],
  replace: vi.fn(),
  setTerrain: vi.fn(),
  standardsUpload: vi.fn(),
  readoutUpload: vi.fn(),
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
vi.mock("../../apps/battle-perf-lab/src/raw/environment", () => ({
  createRawEnvironment: async () => layer(),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/frame", () => ({
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
  },
}));
vi.mock("../../apps/battle-perf-lab/src/raw/terrainScene", () => ({
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
    }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/crowdAudience", () => ({
  // Prepare reuses the upload camera, so the audience reports unchanged views.
  createRawCrowdAudience: async () =>
    layer({ precompute: vi.fn(), reproject: vi.fn(() => false), refreshCamera: vi.fn() }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/grassField", () => ({
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
vi.mock("../../apps/battle-perf-lab/src/raw/standards", () => ({
  createRawStandards: async () => layer({ upload: state.standardsUpload, setView: vi.fn() }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/readout", () => ({
  createRawReadout: () => layer({ upload: state.readoutUpload, setCamera: vi.fn() }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/overlay", () => ({
  createRawLineLayer: async () => layer(),
  createRawRingLayer: async () => layer(),
  createRawTriangleLayer: async () => layer(),
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
  shadows: false,
  grass: true,
  farGrass: true,
  bloom: true,
  post: true,
  grade: { strength: 1, saturationBoost: 1.15, contrast: 0.16, splitTone: 0.85, shadowLift: 1 },
};
const device = {
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
  state.replace.mockReset();
  state.setTerrain.mockReset();
  state.standardsUpload.mockReset();
  state.readoutUpload.mockReset();
});
async function ready() {
  const scene = await createRawBattleScene(device, caps, options);
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
