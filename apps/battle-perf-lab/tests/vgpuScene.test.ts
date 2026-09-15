/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({
  events: [] as string[],
  owners: new Map<string, ReturnType<typeof vi.fn>>(),
  crowdUpload: vi.fn(),
  terrainReplace: vi.fn(),
  grassTerrain: vi.fn(),
  lines: 0,
}));
const layer = vi.hoisted(() => (name: string, extra: object = {}) => {
  const dispose = vi.fn();
  state.owners.set(name, dispose);
  return {
    dispose,
    stats: () => ({}),
    upload: vi.fn(async () => {
      state.events.push(`${name}.upload`);
    }),
    draw: () => state.events.push(`${name}.draw`),
    ...extra,
  };
});
vi.mock("../src/vgpu/environment", () => ({
  createVgpuEnvironment: async () => layer("environment", { exposure: 1 }),
}));
vi.mock("../src/vgpu/frame", () => ({
  VgpuBattleFrame: {
    create: async () =>
      layer("frame", {
        camera: {},
        width: 127,
        height: 95,
        setCamera: () => state.events.push("camera"),
        resize: async () => {},
        render: async (
          _out: object,
          before: () => void,
          draw: () => void,
          _b: boolean,
          shadow: () => void,
          post: boolean,
        ) => {
          before();
          shadow();
          draw();
          state.events.push(`post:${post}`);
        },
      }),
  },
}));
vi.mock("../src/vgpu/shadow", () => ({
  createVgpuSunShadow: () =>
    layer("shadow", {
      camera: {},
      setWorldRect: () => undefined,
      encode: (_f: object, draw: () => void) => {
        state.events.push("shadow");
        draw();
      },
    }),
}));
vi.mock("../src/vgpu/terrainScene", () => ({
  createVgpuBattleTerrainScene: async () =>
    layer("terrain", {
      grid: () => ({}),
      field: () => ({}),
      cover: () => ({}),
      rect: () => [0, 0, 1, 1],
      heightAt: () => 0,
      replace: (...args: unknown[]) => state.terrainReplace(...args),
      setFrame: () => {},
      drawOpaque: () => state.events.push("opaque"),
      drawTransparent: () => state.events.push("transparent"),
      drawShadow: () => state.events.push("terrain.shadow"),
    }),
}));
vi.mock("../src/vgpu/crowdAudience", () => ({
  createVgpuCrowdAudience: async () =>
    layer("crowd", {
      upload: (...args: unknown[]) => state.crowdUpload(...args),
      refreshCamera: () => state.events.push("far.refresh"),
      precompute: () => state.events.push("pose"),
      draw: (_p: object, audience = "main") => state.events.push(`crowd.${audience}`),
    }),
}));
vi.mock("../src/vgpu/grassField", () => ({
  createVgpuGrassField: async () =>
    layer("grass", {
      setTerrain: (...args: unknown[]) => state.grassTerrain(...args),
      setVisible: () => {},
      setFarVisible: () => {},
      update: () => state.events.push("grass.update"),
      prepare: async () => state.events.push("grass.prepare"),
      settle: async () => {},
      snapshot: () => ({ terrainDetailStrength: 1 }),
      route: () => state.events.push("route"),
    }),
}));
vi.mock("../src/vgpu/standards", () => ({
  createVgpuStandards: async () => layer("standards", { setView: () => {} }),
}));
vi.mock("../src/vgpu/readout", () => ({
  createVgpuReadout: async () => layer("readouts", { setCamera: () => {} }),
}));
vi.mock("../src/vgpu/overlay", () => ({
  createVgpuLineLayer: async () => layer(state.lines++ === 0 ? "ground" : "effects"),
  createVgpuRingLayer: async () => layer("rings"),
  createVgpuTriangleLayer: async () => layer("triangles"),
}));
import { createVgpuBattleScene } from "../src/vgpu/battleScene";
import { CIVSIM_ENVIRONMENTS } from "../../../packages/game-renderer/src/environment/environment";
const input = {
  camera3d: {
    target: [0, 0, 0] as [number, number, number],
    distance: 100,
    pitch: 0.6,
    yaw: 0,
    fovY: 1,
    aspect: 1,
    near: 0.1,
  },
  x: 0,
  y: 0,
  zoom: 1,
  zoomT: 0,
  width: 127,
  height: 95,
};
const create = () =>
  createVgpuBattleScene(
    { device: { gpu: {} } } as never,
    { environment: Object.values(CIVSIM_ENVIRONMENTS)[0], shadows: true, post: true } as never,
  );
beforeEach(() => {
  vi.resetAllMocks();
  state.events.length = 0;
  state.owners.clear();
  state.lines = 0;
});
test("crowd draws dispatch pose once each; camera-only prepare/render retain separate ordering", async () => {
  const scene = await create();
  await scene.uploadCrowd([], input);
  await scene.uploadCrowd([], input);
  expect(state.events.filter((x) => x === "pose")).toHaveLength(2);
  state.events.length = 0;
  await scene.prepare({ camera: input, time: 1 });
  await scene.render({} as never);
  await scene.render({} as never);
  expect(state.events.filter((x) => x === "far.refresh")).toHaveLength(1);
  expect(state.events).not.toContain("pose");
  const sequence = [
    "route",
    "shadow",
    "terrain.shadow",
    "crowd.shadow",
    "opaque",
    "crowd.main",
    "standards.draw",
    "grass.draw",
    "readouts.draw",
    "transparent",
    "ground.draw",
    "rings.draw",
    "effects.draw",
    "triangles.draw",
    "post:true",
  ];
  expect(state.events.slice(-sequence.length * 2)).toEqual([...sequence, ...sequence]);
  scene.dispose();
});
test("an in-flight upload blocks render and cleanup finishes before disposal rejection", async () => {
  const scene = await create();
  let finish!: () => void;
  state.crowdUpload.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const pending = scene.uploadCrowd([], input);
  await expect(scene.prepare({ camera: input, time: 0 })).rejects.toThrow("in flight");
  scene.dispose();
  expect([...state.owners.values()].every((d) => d.mock.calls.length === 0)).toBe(true);
  finish();
  await expect(pending).rejects.toThrow("disposed");
  expect([...state.owners.values()].every((d) => d.mock.calls.length === 1)).toBe(true);
  expect(state.events).not.toContain("pose");
});
test("staging failure keeps the scene recoverable; dependent failure after commit closes every owner", async () => {
  const scene = await create();
  state.terrainReplace.mockRejectedValueOnce(Error("staging"));
  await expect(scene.replaceTerrain({} as never)).rejects.toThrow("staging");
  expect([...state.owners.values()].every((d) => !d.mock.calls.length)).toBe(true);
  state.grassTerrain.mockImplementationOnce(() => {
    throw Error("grass adoption");
  });
  await expect(scene.replaceTerrain({} as never)).rejects.toThrow("grass adoption");
  expect([...state.owners.values()].every((d) => d.mock.calls.length === 1)).toBe(true);
  await expect(scene.prepare({ camera: input, time: 0 })).rejects.toThrow("disposed");
});
test("UI publication invalidates preparation and preserves source upload order", async () => {
  const scene = await create();
  await scene.uploadCrowd([], input);
  await scene.prepare({ camera: input, time: 0 });
  state.events.length = 0;
  await scene.uploadReadouts([], []);
  await scene.uploadTacticalLines({
    groundCues: new Float32Array(),
    rings: new Float32Array(),
    effects: new Float32Array(),
  });
  await scene.uploadTriangles(new Float32Array());
  expect(state.events).toEqual([
    "standards.upload",
    "readouts.upload",
    "ground.upload",
    "rings.upload",
    "effects.upload",
    "triangles.upload",
  ]);
  await expect(scene.render({} as never)).rejects.toThrow("completed preparation");
  scene.dispose();
});
