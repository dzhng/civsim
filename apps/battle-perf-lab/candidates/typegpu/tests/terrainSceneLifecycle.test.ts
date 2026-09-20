/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({
  resources: [] as { dispose: ReturnType<typeof vi.fn> }[],
  factory: vi.fn(),
  /** Source content the mocked preparation hands each generation's owners, so a
   *  published report has to follow what was actually installed rather than a
   *  fixed shape. */
  scenery: 0,
  vistaMeshes: [] as { name: string; mesh: object }[],
  waterDraws: 1,
}));
function layer(extra: object = {}) {
  const v = {
    dispose: vi.fn(),
    upload: vi.fn(),
    setRects: vi.fn(),
    setStyle: vi.fn(),
    setState: vi.fn(),
    draw: vi.fn(),
    drawHorizonShadow: vi.fn(),
    ...extra,
  };
  state.resources.push(v);
  return v;
}
vi.mock("../terrain", () => ({
  createTypegpuTerrain: (...args: unknown[]) => state.factory(...args),
}));
vi.mock("../water", () => ({
  createTypegpuWater: async () =>
    layer({ stats: () => ({ draws: state.waterDraws, triangles: state.waterDraws * 2 }) }),
}));
// Counts what it was uploaded, exactly as the real scenery owner does, so a
// generation cannot publish an instance count nothing was handed.
vi.mock("../scenery", () => ({
  createTypegpuScenery: async () => {
    let count = 0;
    return layer({
      upload: vi.fn(async (instances: readonly unknown[]) => {
        count = instances.length;
      }),
      stats: () => ({ scenery: count }),
    });
  },
}));
vi.mock("../backdrop", () => ({ createTypegpuBackdrop: async () => layer() }));
vi.mock("../../../../../packages/battle-renderer/src/terrainScenePreparation", () => ({
  prepareBattleTerrain: (input: { grid: object; cover: string }) => ({
    ...input,
    grid: { ...input.grid },
    slopeBands: null,
    waterInputs: [],
    data: {
      ground: { earthDistance: null },
      horizon: null,
      vistaMeshes: state.vistaMeshes,
      scenery: Array.from({ length: state.scenery }, () => ({})),
      rect: [0, 0, 10, 10],
      field: {},
    },
  }),
}));
import { createTypegpuBattleTerrainScene } from "../terrainScene";
import type { BattleTerrainInput } from "../../../../../packages/battle-renderer/src/sceneTypes";
import type { TypegpuEnvironment } from "../environment";
import type { TgpuBindGroup, TgpuRenderPass } from "typegpu";
const input = {
  grid: {},
  cover: "green-grass",
  vista: null,
  lakes: [],
} as unknown as BattleTerrainInput;
const create = () =>
  createTypegpuBattleTerrainScene(
    {} as GPUDevice,
    {} as GPUBuffer,
    {} as TgpuBindGroup,
    {} as TypegpuEnvironment,
    1,
    input,
  );
beforeEach(() => {
  state.resources.length = 0;
  state.scenery = 0;
  state.vistaMeshes = [];
  state.waterDraws = 1;
  state.factory.mockReset().mockImplementation(async () => layer());
});
test("a failed staged generation retains the previous complete terrain and disposes staged resources", async () => {
  const owner = await create(),
    grid = owner.grid(),
    previous = [...state.resources];
  state.factory.mockRejectedValueOnce(Error("terrain admission failed"));
  await expect(owner.replace(input)).rejects.toThrow("terrain admission failed");
  expect(owner.grid()).toBe(grid);
  expect(() => owner.drawOpaque({} as TgpuRenderPass)).not.toThrow();
  expect(previous.every((r) => r.dispose.mock.calls.length === 0)).toBe(true);
  await owner.replace(input);
  expect(owner.grid()).not.toBe(grid);
  expect(previous.every((r) => r.dispose.mock.calls.length === 1)).toBe(true);
  owner.dispose();
  expect(state.resources.every((r) => r.dispose.mock.calls.length === 1)).toBe(true);
});
test("disposal rejects pending terrain replacement and releases its late factory result", async () => {
  const owner = await create();
  let resume!: (v: ReturnType<typeof layer>) => void;
  state.factory.mockReturnValueOnce(
    new Promise((r) => {
      resume = r;
    }),
  );
  const pending = owner.replace(input);
  await expect(owner.replace(input)).rejects.toThrow("pending");
  owner.dispose();
  const late = layer();
  resume(late);
  await expect(pending).rejects.toThrow("cancelled");
  expect(state.resources.every((r) => r.dispose.mock.calls.length === 1)).toBe(true);
});
test("committed terrain content is read from the generation's own owners", async () => {
  state.scenery = 3;
  state.vistaMeshes = [
    { name: "near", mesh: {} },
    { name: "far", mesh: {} },
    { name: "farFog", mesh: {} },
  ];
  const owner = await create();
  expect(owner.stats()).toEqual({
    installed: true,
    generation: 1,
    replacing: false,
    scenery: 3,
    vistaBands: 3,
    water: { draws: 1, triangles: 2 },
  });
  // A committed replacement publishes the content IT installed, not the first
  // generation's, and counts both vista lists rather than one.
  state.scenery = 5;
  state.vistaMeshes = [{ name: "farFog", mesh: {} }];
  state.waterDraws = 2;
  await owner.replace(input);
  expect(owner.stats()).toEqual({
    installed: true,
    generation: 2,
    replacing: false,
    scenery: 5,
    vistaBands: 1,
    water: { draws: 2, triangles: 4 },
  });
  // A failed staged generation leaves the installed report standing: its content
  // was never handed to an owner.
  state.scenery = 99;
  state.factory.mockRejectedValueOnce(Error("terrain admission failed"));
  await expect(owner.replace(input)).rejects.toThrow("terrain admission failed");
  expect(owner.stats()).toMatchObject({ generation: 2, scenery: 5, replacing: false });
  // A disposed scene reports no installed map rather than zeros that read as an
  // empty one.
  owner.dispose();
  expect(owner.stats()).toEqual({
    installed: false,
    generation: 2,
    replacing: false,
    scenery: null,
    vistaBands: null,
    water: null,
  });
});
test("a staged generation in flight is reported as replacing the installed one", async () => {
  state.scenery = 4;
  const owner = await create();
  let resume!: (value: ReturnType<typeof layer>) => void;
  state.factory.mockReturnValueOnce(
    new Promise((r) => {
      resume = r;
    }),
  );
  state.scenery = 6;
  const pending = owner.replace(input);
  // The installed generation is still the one being described while staging runs.
  expect(owner.stats()).toMatchObject({
    installed: true,
    generation: 1,
    replacing: true,
    scenery: 4,
  });
  resume(layer());
  await pending;
  expect(owner.stats()).toMatchObject({ generation: 2, replacing: false, scenery: 6 });
  owner.dispose();
});
