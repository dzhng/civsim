/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
// Scene-level cascade integration for the TypeGPU candidate: the order a frame
// derives its fits in, the audience those fits publish, and what the encoder
// actually submits per cascade. The real shadow owner runs here against a
// recording device; only the unrelated scene layers are stubbed. The raw
// scene's cascade test (web/tests/nativeShadowScene.test.ts) is the reference.
const state = vi.hoisted(() => ({
  calls: [] as string[],
  crowdViews: [] as unknown[][],
  draws: [] as { audience: string; camera: unknown }[],
  terrainShadowDraws: [] as unknown[],
  poses: 0,
}));
function layer(extra = {}) {
  return {
    dispose: vi.fn(),
    upload: vi.fn(),
    draw: vi.fn(),
    encode: vi.fn(),
    stats: vi.fn(() => ({})),
    ...extra,
  };
}
vi.mock("../environment", () => ({
  createTypegpuEnvironment: async (
    _device: unknown,
    _env: unknown,
    _diagnostic: unknown,
    _samples: unknown,
    shadow?: { mode: string },
  ) => {
    state.calls.push(`environment:${shadow?.mode ?? "off"}`);
    return layer({ setView: vi.fn(), sky: { setRays: vi.fn() }, exposure: 1 });
  },
}));
vi.mock("../frame", () => ({
  TypegpuBattleFrame: class {
    width = 1280;
    height = 800;
    cameraGroup = { group: "main" };
    cameraBuffer = { buffer: "main" };
    dispose = vi.fn();
    resize = vi.fn();
    setCamera = vi.fn(() => state.calls.push("setCamera"));
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
    createCommandEncoder = () => ({ submit: vi.fn() });
    nativeEncoder = (encoder: unknown) => encoder;
    encode(_encoder: unknown, _output: unknown, draw: Function) {
      draw({}, this.cameraGroup);
    }
  },
}));
vi.mock("../terrainScene", () => ({
  createTypegpuBattleTerrainScene: async () =>
    layer({
      grid: () => ({}),
      field: () => ({ height: new Float32Array([0, 1, 2, 3]), w: 2, h: 2, cell: 4, ox: 0, oy: 0 }),
      cover: () => "green-grass",
      rect: () => [-100, -100, 200, 200],
      replace: vi.fn(),
      heightAt: () => 0,
      pickingMeshes: () => [],
      groundInputs: () => [],
      setFrame: vi.fn(),
      drawOpaque: vi.fn(),
      drawTransparent: vi.fn(),
      drawShadow: vi.fn((_pass: unknown, camera: unknown) => state.terrainShadowDraws.push(camera)),
    }),
}));
vi.mock("../crowdAudience", () => ({
  createTypegpuCrowdAudience: async () =>
    layer({
      upload: vi.fn(async (_instances: unknown, views: unknown[]) => {
        state.calls.push("crowdUpload");
        state.crowdViews.push(views);
      }),
      precompute: vi.fn(() => {
        state.poses++;
      }),
      reproject: vi.fn(async (views: unknown[]) => {
        state.calls.push("crowdReproject");
        state.crowdViews.push(views);
        return false;
      }),
      refreshCamera: vi.fn(),
      draw: vi.fn((_pass: unknown, audience = "main", camera: unknown) =>
        state.draws.push({ audience, camera }),
      ),
    }),
}));
vi.mock("../grassField", () => ({
  createTypegpuGrassField: async () =>
    layer({
      setTerrain: vi.fn(),
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
  createTypegpuStandards: async () => layer({ setView: vi.fn() }),
}));
vi.mock("../readout", () => ({ createTypegpuReadout: () => layer({ setCamera: vi.fn() }) }));
vi.mock("../overlay", () => ({
  createTypegpuLineLayer: async () => layer(),
  createTypegpuRingLayer: async () => layer(),
  createTypegpuTriangleLayer: async () => layer(),
}));
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { recordingGpu, attachedLayer } from "./recordingDevice";
import { createTypegpuBattleScene } from "../battleScene";
import type { BattleSceneOptions } from "../../../../../packages/battle-renderer/src/sceneTypes";
import { CIVSIM_ENVIRONMENTS } from "../../../../../packages/game-renderer/src/environment/environment";
import { productionBladeFieldProfile } from "../../../../../packages/game-renderer/src/battle/battleGrassResidency";
import {
  CSM_CASCADES,
  CSM_MAP_SIZE,
  type SunShadowMode,
} from "../../../../../packages/game-renderer/src/battle/shadowPolicy";

const camera = {
  x: 0,
  y: 0,
  zoom: 1,
  zoomT: 1,
  camera3d: {
    target: [0, 0, 0] as [number, number, number],
    distance: 240,
    yaw: 0.3,
    pitch: 0.7,
    fovY: 0.85,
    aspect: 1.6,
    near: 1,
  },
};
const sceneOptions = (shadows: SunShadowMode): BattleSceneOptions => ({
  environment: CIVSIM_ENVIRONMENTS.golden,
  assets: {},
  atlases: {},
  terrain: {
    grid: { w: 1, h: 1, cell: 4, ox: 0, oy: 0, tint: new Uint8Array(1) },
    cover: "green-grass" as const,
    vista: null,
    lakes: [],
  },
  grassProfile: productionBladeFieldProfile("standard"),
  width: 1280,
  height: 800,
  samples: 1,
  outputFormat: "rgba8unorm",
  shadows,
  grass: true,
  farGrass: true,
  bloom: true,
  post: true,
  grade: { strength: 1, saturationBoost: 1.15, contrast: 0.16, splitTone: 0.85, shadowLift: 1 },
});

let g: ReturnType<typeof recordingGpu>;
beforeEach(() => {
  g = recordingGpu();
  state.calls.length = 0;
  state.crowdViews.length = 0;
  state.draws.length = 0;
  state.terrainShadowDraws.length = 0;
  state.poses = 0;
});
afterEach(() => vi.unstubAllGlobals());

async function scene(shadows: SunShadowMode) {
  const built = await createTypegpuBattleScene(g.native, sceneOptions(shadows));
  await built.uploadCrowd([], camera);
  await built.prepare({ camera, time: 0 });
  return built;
}
const shadowPasses = () =>
  g.passes.filter((descriptor) => String(descriptor.label).includes("directional shadow"));

test("High admits the crowd against one main view plus every cascade of the same frame", async () => {
  const built = await scene("csm");
  expect(state.calls[0]).toBe("environment:csm");
  for (const views of state.crowdViews) {
    expect(views).toHaveLength(1 + CSM_CASCADES);
    expect(views.map((view) => (view as { shadow: boolean }).shadow)).toEqual([false, true, true]);
  }
  // One union admission and one pose pass per upload — never one per cascade.
  expect(state.poses).toBe(1);
  expect(state.calls.filter((call) => call === "crowdUpload")).toHaveLength(1);
  // The canonical frame publishes its camera BEFORE the fits that frame's
  // receivers will blend against.
  expect(state.calls.indexOf("setCamera")).toBeLessThan(state.calls.indexOf("crowdReproject"));
  built.dispose();
});

test("High encodes one caster pass per cascade, each with its own camera binding", async () => {
  const built = await scene("csm");
  built.encode(g.encoder(), {} as GPUTextureView);
  expect(shadowPasses()).toHaveLength(CSM_CASCADES);
  shadowPasses().forEach((descriptor, layer) =>
    expect(attachedLayer(descriptor)).toMatchObject({ baseArrayLayer: layer, arrayLayerCount: 1 }),
  );
  const casters = state.draws.filter((draw) => draw.audience === "shadow");
  expect(casters).toHaveLength(CSM_CASCADES);
  expect(new Set(casters.map((draw) => draw.camera)).size).toBe(CSM_CASCADES);
  // Terrain and the crowd cast into the same cascade with the same binding.
  expect(state.terrainShadowDraws).toEqual(casters.map((draw) => draw.camera));
  expect(built.stats().shadows).toMatchObject({
    mode: "csm",
    cascades: CSM_CASCADES,
    layers: CSM_CASCADES,
    mapSize: CSM_MAP_SIZE,
    depthBytes: 32 * 1024 * 1024,
    cameraBuffers: CSM_CASCADES,
    receiverBytes: 208,
  });
  built.dispose();
});

test("the fitted single map still encodes exactly one caster pass", async () => {
  const built = await scene("single");
  expect(state.calls[0]).toBe("environment:single");
  expect(state.crowdViews[0]).toHaveLength(2);
  built.encode(g.encoder(), {} as GPUTextureView);
  expect(shadowPasses()).toHaveLength(1);
  expect(state.draws.filter((draw) => draw.audience === "shadow")).toHaveLength(1);
  expect(built.stats().shadows).toMatchObject({ mode: "single", layers: 1, cameraBuffers: 1 });
  built.dispose();
});

test("off allocates no sun depth and submits no caster work", async () => {
  const built = await scene("off");
  expect(state.calls[0]).toBe("environment:off");
  expect(state.crowdViews.every((views) => views.length === 1)).toBe(true);
  built.encode(g.encoder(), {} as GPUTextureView);
  expect(shadowPasses()).toHaveLength(0);
  expect(state.draws.filter((draw) => draw.audience === "shadow")).toHaveLength(0);
  expect(g.textures).toHaveLength(0);
  expect(built.stats().shadows).toMatchObject({ mode: "off", cascades: 0, depthBytes: 0 });
  built.dispose();
});

test("a reloaded terrain refits the same cascade resources rather than growing them", async () => {
  const built = await scene("csm");
  const before = { textures: g.textures.length, buffers: g.buffers.length };
  await built.replaceTerrain(sceneOptions("csm").terrain);
  await built.resize(640, 400);
  await built.prepare({ camera, time: 1 });
  built.encode(g.encoder(), {} as GPUTextureView);
  expect(shadowPasses()).toHaveLength(CSM_CASCADES);
  expect(g.buffers).toHaveLength(before.buffers);
  expect(g.textures.length).toBeLessThanOrEqual(before.textures + 1);
  built.dispose();
  // Disposal releases every cascade resource the scene took.
  expect(g.live.size).toBe(0);
});
