/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({
  owners: [] as { dispose: ReturnType<typeof vi.fn> }[],
  ground: vi.fn(),
}));
const layer = vi.hoisted(() => () => {
  const value = {
    dispose: vi.fn(),
    setState() {},
    draw() {},
    drawHorizonShadow() {},
    upload: async () => {},
    setRects() {},
    setStyle() {},
  };
  state.owners.push(value);
  return value;
});
vi.mock("../src/terrainScenePreparation", () => ({
  prepareBattleTerrain: (input: object) => ({
    grid: input,
    cover: {},
    slopeBands: null,
    waterInputs: [],
    data: { ground: {}, horizon: null, vistaMeshes: [], scenery: [], rect: [0, 0, 10, 10] },
  }),
}));
vi.mock("../src/vgpu/terrain", () => ({
  createVgpuTerrain: (...args: unknown[]) => state.ground(...args),
}));
vi.mock("../src/vgpu/water", () => ({ createVgpuWater: async () => layer() }));
vi.mock("../src/vgpu/scenery", () => ({ createVgpuScenery: async () => layer() }));
vi.mock("../src/vgpu/backdrop", () => ({ createVgpuBackdrop: async () => layer() }));
import { createVgpuBattleTerrainScene } from "../src/vgpu/terrainScene";
const create = (input: object) =>
  createVgpuBattleTerrainScene({} as never, {} as never, {} as never, 4, input as never);
beforeEach(() => {
  vi.resetAllMocks();
  state.owners.length = 0;
  state.ground.mockImplementation(async () => layer());
});
test("staging failure retains old terrain and successful replacement releases the previous generation", async () => {
  const input = {},
    terrain = await create(input),
    old = [...state.owners];
  state.ground.mockRejectedValueOnce(Error("staging"));
  await expect(terrain.replace({} as never)).rejects.toThrow("staging");
  expect(terrain.grid()).toBe(input);
  expect(old.every((r) => !r.dispose.mock.calls.length)).toBe(true);
  const next = {};
  await terrain.replace(next as never);
  expect(terrain.grid()).toBe(next);
  expect(old.every((r) => r.dispose.mock.calls.length === 1)).toBe(true);
  terrain.dispose();
  expect(state.owners.every((r) => r.dispose.mock.calls.length === 1)).toBe(true);
});
test("dispose while new terrain admission awaits releases late and prior owners before promise settles", async () => {
  const terrain = await create({});
  let entered!: () => void, finish!: (value: ReturnType<typeof layer>) => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  state.ground.mockImplementationOnce(() => {
    entered();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = terrain.replace({} as never);
  await started;
  terrain.dispose();
  expect(state.owners.every((r) => !r.dispose.mock.calls.length)).toBe(true);
  finish(layer());
  await expect(pending).rejects.toThrow("disposed");
  expect(state.owners.every((r) => r.dispose.mock.calls.length === 1)).toBe(true);
});
