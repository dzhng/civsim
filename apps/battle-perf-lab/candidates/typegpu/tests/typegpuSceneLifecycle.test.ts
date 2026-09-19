/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
const state = vi.hoisted(() => ({
  owners: [] as { dispose: ReturnType<typeof vi.fn> }[],
  replace: vi.fn(),
  setTerrain: vi.fn(),
  standardsUpload: vi.fn(),
  readoutUpload: vi.fn(),
  crowdUpload: vi.fn(),
  pose: vi.fn(),
  submit: vi.fn(),
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
    resize = vi.fn();
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
vi.mock("../crowdAudience", () => ({
  createTypegpuCrowdAudience: async () =>
    layer({
      upload: state.crowdUpload,
      precompute: state.pose,
      reproject: vi.fn(async () => false),
      refreshCamera: vi.fn(),
    }),
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
vi.mock("../overlay", () => ({
  createTypegpuLineLayer: async () => layer(),
  createTypegpuRingLayer: async () => layer(),
  createTypegpuTriangleLayer: async () => layer(),
}));
import { createTypegpuBattleScene } from "../battleScene";
import type { BattleSceneOptions } from "../../../../../packages/battle-renderer/src/sceneTypes";
import type { TgpuCommandEncoder } from "typegpu";
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
beforeEach(() => {
  state.owners.length = 0;
  state.replace.mockReset();
  state.setTerrain.mockReset();
  state.standardsUpload.mockReset();
  state.readoutUpload.mockReset();
  state.crowdUpload.mockReset();
  state.pose.mockReset();
  state.submit.mockReset();
});
async function ready() {
  const scene = await createTypegpuBattleScene(device, options);
  await scene.uploadCrowd([], camera);
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
