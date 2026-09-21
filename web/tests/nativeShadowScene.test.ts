import type { BattleSceneOptions } from "../../packages/battle-renderer/src/sceneTypes";
// @vitest-environment node
// Scene-level cascade integration: the order a frame derives its fits in, the
// audience those fits publish, and what the encoder actually submits per
// cascade. The real shadow owner runs here against a recording device; only the
// unrelated scene layers are stubbed.
import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  calls: [] as string[],
  crowdViews: [] as unknown[][],
  draws: [] as { audience: string; camera: unknown }[],
  terrainShadowDraws: [] as unknown[],
  precomputes: 0,
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
vi.mock("../../apps/battle-perf-lab/src/raw/world/frame", () => ({
  RawBattleFrame: class {
    width = 1280;
    height = 800;
    cameraLayout = { layout: "camera" };
    cameraGroup = { group: "main" };
    dispose = vi.fn();
    resize = vi.fn();
    setCamera = vi.fn(() => state.calls.push("setCamera"));
    encode(_encoder: unknown, _output: unknown, draw: Function) {
      draw({}, this.cameraGroup);
    }
    depthStats() {
      return { owner: "raw-battle-frame", installed: true, reversed: true };
    }
  },
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/terrainScene", () => ({
  createRawBattleTerrainScene: async () =>
    layer({
      grid: () => ({}),
      field: () => ({ height: new Float32Array([0, 1, 2, 3]), w: 2, h: 2, cell: 4, ox: 0, oy: 0 }),
      cover: () => "green-grass",
      rect: () => [-100, -100, 200, 200],
      committedGeneration: () => 1,
      heightAt: () => 0,
      setFrame: vi.fn(),
      drawOpaque: vi.fn(),
      drawTransparent: vi.fn(),
      drawShadow: vi.fn((_pass: unknown, camera: unknown) => state.terrainShadowDraws.push(camera)),
    }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/crowdAudience", () => ({
  createRawCrowdAudience: async () =>
    layer({
      upload: vi.fn((_instances: unknown, views: unknown[]) => {
        state.calls.push("crowdUpload");
        state.crowdViews.push(views);
      }),
      precompute: vi.fn(() => {
        state.precomputes++;
      }),
      reproject: vi.fn((views: unknown[]) => {
        state.calls.push("crowdReproject");
        state.crowdViews.push(views);
        return false;
      }),
      refreshCamera: vi.fn(),
      draw: vi.fn((_pass: unknown, camera: unknown, audience = "main") =>
        state.draws.push({ audience, camera }),
      ),
    }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/grassField", () => ({
  createRawGrassField: async () =>
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
vi.mock("../../apps/battle-perf-lab/src/raw/world/standards", () => ({
  createRawStandards: async () => layer({ setView: vi.fn() }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/readout", () => ({
  createRawReadout: () => layer({ setCamera: vi.fn() }),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/overlay", () => ({
  createRawLineLayer: async () => layer(),
  createRawRingLayer: async () => layer(),
  createRawTriangleLayer: async () => layer(),
}));
vi.mock("../../apps/battle-perf-lab/src/raw/world/environment", () => ({
  createRawEnvironment: async (
    _device: unknown,
    _env: unknown,
    _samples: unknown,
    shadow?: { mode: string },
  ) => {
    state.calls.push(`environment:${shadow?.mode ?? "off"}`);
    return layer({ setView: vi.fn(), sky: { setRays: vi.fn() }, exposure: 1 });
  },
}));
import { createRawBattleScene } from "../../apps/battle-perf-lab/src/raw/battleScene";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { productionBladeFieldProfile } from "@packages/game-renderer/src/battle/battleGrassResidency";
import { CSM_CASCADES } from "@packages/game-renderer/src/battle/shadowPolicy";
import type { SunShadowMode } from "@packages/game-renderer/src/battle/shadowPolicy";

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

const passes: GPURenderPassDescriptor[] = [];
const device = {
  createTexture: () => ({ destroy: vi.fn(), createView: (d?: unknown) => ({ view: d }) }),
  createBuffer: (descriptor: GPUBufferDescriptor) => ({ descriptor, destroy: vi.fn() }),
  createSampler: () => ({}),
  createBindGroup: (descriptor: GPUBindGroupDescriptor) => ({ descriptor }),
  queue: { writeBuffer: vi.fn(), submit: vi.fn() },
  createCommandEncoder: () => ({
    finish: () => ({}),
    beginRenderPass: (descriptor: GPURenderPassDescriptor) => {
      passes.push(descriptor);
      return { end: vi.fn() };
    },
  }),
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
  vi.stubGlobal("GPUBufferUsage", { UNIFORM: 1, COPY_DST: 2 });
  vi.stubGlobal("GPUTextureUsage", { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, COPY_SRC: 4 });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2 });
  state.calls.length = 0;
  state.crowdViews.length = 0;
  state.draws.length = 0;
  state.terrainShadowDraws.length = 0;
  state.precomputes = 0;
  passes.length = 0;
});

async function scene(shadows: SunShadowMode) {
  const built = await createRawBattleScene(device, caps, sceneOptions(shadows));
  built.uploadCrowd([], camera);
  await built.prepare({ camera, time: 0 });
  return built;
}

test("High admits the crowd against one main view plus every cascade of the same frame", async () => {
  const built = await scene("csm");
  expect(state.calls[0]).toBe("environment:csm");
  for (const views of state.crowdViews) {
    expect(views).toHaveLength(1 + CSM_CASCADES);
    expect(views.map((view) => (view as { shadow: boolean }).shadow)).toEqual([false, true, true]);
  }
  // One union admission and one pose pass per upload — never one per cascade.
  expect(state.precomputes).toBe(1);
  expect(state.calls.filter((call) => call === "crowdUpload")).toHaveLength(1);
  // The canonical frame publishes its camera BEFORE the fits that frame's
  // receivers will blend against.
  expect(state.calls.indexOf("setCamera")).toBeLessThan(state.calls.indexOf("crowdReproject"));
  built.dispose();
});

test("High encodes one caster pass per cascade, each with its own camera binding", async () => {
  const built = await scene("csm");
  const encoder = device.createCommandEncoder();
  built.encode(encoder, {} as GPUTextureView);
  const shadowPasses = passes.filter((descriptor) =>
    String(descriptor.label).includes("directional shadow"),
  );
  expect(shadowPasses).toHaveLength(CSM_CASCADES);
  const casters = state.draws.filter((draw) => draw.audience === "shadow");
  expect(casters).toHaveLength(CSM_CASCADES);
  expect(new Set(casters.map((draw) => draw.camera)).size).toBe(CSM_CASCADES);
  // Terrain and the crowd cast into the same cascade with the same binding.
  expect(state.terrainShadowDraws).toEqual(casters.map((draw) => draw.camera));
  built.dispose();
});

test("the fitted single map still encodes exactly one caster pass", async () => {
  const built = await scene("single");
  expect(state.calls[0]).toBe("environment:single");
  expect(state.crowdViews[0]).toHaveLength(2);
  built.encode(device.createCommandEncoder(), {} as GPUTextureView);
  expect(
    passes.filter((descriptor) => String(descriptor.label).includes("directional shadow")),
  ).toHaveLength(1);
  expect(state.draws.filter((draw) => draw.audience === "shadow")).toHaveLength(1);
  built.dispose();
});

test("off allocates no sun depth and submits no caster work", async () => {
  const built = await scene("off");
  expect(state.calls[0]).toBe("environment:off");
  expect(state.crowdViews.every((views) => views.length === 1)).toBe(true);
  built.encode(device.createCommandEncoder(), {} as GPUTextureView);
  expect(passes.filter((d) => String(d.label).includes("directional shadow"))).toHaveLength(0);
  expect(state.draws.filter((draw) => draw.audience === "shadow")).toHaveLength(0);
  expect(built.stats().shadows).toMatchObject({ mode: "off", cascades: 0, depthBytes: 0 });
  built.dispose();
});

test("scene stats report the shadow resources actually allocated", async () => {
  const built = await scene("csm");
  expect(built.stats().shadows).toMatchObject({
    mode: "csm",
    cascades: CSM_CASCADES,
    layers: CSM_CASCADES,
    mapSize: 2048,
    depthBytes: 32 * 1024 * 1024,
    cameraBuffers: CSM_CASCADES,
    receiverBytes: 208,
  });
  built.dispose();
});
