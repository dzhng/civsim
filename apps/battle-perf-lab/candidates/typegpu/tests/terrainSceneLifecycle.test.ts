/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({
  resources: [] as { dispose: ReturnType<typeof vi.fn> }[],
  factory: vi.fn(),
}));
function layer() {
  const v = {
    dispose: vi.fn(),
    upload: vi.fn(),
    setRects: vi.fn(),
    setStyle: vi.fn(),
    setState: vi.fn(),
    draw: vi.fn(),
    drawHorizonShadow: vi.fn(),
  };
  state.resources.push(v);
  return v;
}
vi.mock("../terrain", () => ({
  createTypegpuTerrain: (...args: unknown[]) => state.factory(...args),
}));
vi.mock("../water", () => ({ createTypegpuWater: async () => layer() }));
vi.mock("../scenery", () => ({ createTypegpuScenery: async () => layer() }));
vi.mock("../backdrop", () => ({ createTypegpuBackdrop: async () => layer() }));
vi.mock("../../../src/terrainScenePreparation", () => ({
  prepareBattleTerrain: (input: { grid: object; cover: string }) => ({
    ...input,
    grid: { ...input.grid },
    slopeBands: null,
    waterInputs: [],
    data: {
      ground: { earthDistance: null },
      horizon: null,
      vistaMeshes: [],
      scenery: [],
      rect: [0, 0, 10, 10],
      field: {},
    },
  }),
}));
import { createTypegpuBattleTerrainScene } from "../terrainScene";
import type { BattleTerrainInput } from "../../../src/sceneTypes";
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
