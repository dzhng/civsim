// @vitest-environment node
import { vi, test, expect, beforeEach } from "vitest";
const state = vi.hoisted(() => ({
  resources: [] as { dispose: ReturnType<typeof vi.fn> }[],
  factory: vi.fn(),
  rock: { texture: {}, stats: { width: 2, height: 2, mipLevels: 2, bytes: 20 }, dispose: vi.fn() },
  loadRock: vi.fn(),
  /** Source content the mocked preparation hands each generation's owners, so a
   *  published report has to follow what was actually installed rather than a
   *  fixed shape. */
  scenery: 0,
  groundIndices: 36,
  vistaMeshes: [] as { name: string; mesh: object }[],
  waterDraws: 1,
}));
vi.mock("../../../packages/battle-renderer/src/world/rockDetail", () => ({
  loadTypegpuRockDetail: (...args: unknown[]) => state.loadRock(...args),
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
    stats: () => ({ groundTriangles: 0 }),
    ...extra,
  };
  state.resources.push(v);
  return v;
}
vi.mock("../../../packages/battle-renderer/src/world/terrain", () => ({
  createTypegpuTerrain: (...args: unknown[]) => state.factory(...args),
}));
vi.mock("../../../packages/battle-renderer/src/world/water", () => ({
  createTypegpuWater: async () =>
    layer({ stats: () => ({ draws: state.waterDraws, triangles: state.waterDraws * 2 }) }),
}));
// Counts what it was uploaded, exactly as the real scenery owner does, so a
// generation cannot publish an instance count nothing was handed.
vi.mock("../../../packages/battle-renderer/src/world/scenery", () => ({
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
vi.mock("../../../packages/battle-renderer/src/world/backdrop", () => ({
  createTypegpuBackdrop: async () => layer(),
}));
vi.mock("../../../packages/battle-renderer/src/terrainScenePreparation", () => ({
  prepareBattleTerrain: (input: {
    grid: object;
    cover: string;
    slopeBands?: object;
    vista?: object;
  }) => ({
    ...input,
    grid: { ...input.grid },
    slopeBands: input.slopeBands ? { ...input.slopeBands } : null,
    waterInputs: [],
    data: {
      ground: { earthDistance: null, indices: new Uint32Array(state.groundIndices) },
      horizon: null,
      vistaMeshes: state.vistaMeshes,
      vista: input.vista,
      scenery: Array.from({ length: state.scenery }, () => ({})),
      rect: [0, 0, 10, 10],
      field: {},
    },
  }),
}));
import { createTypegpuBattleTerrainScene } from "../../../packages/battle-renderer/src/world/terrainScene";
import type { BattleTerrainInput } from "../../../packages/battle-renderer/src/sceneTypes";
import type { TypegpuEnvironment } from "../../../packages/battle-renderer/src/world/environment";
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
  state.rock.dispose.mockReset();
  state.loadRock.mockReset().mockResolvedValue(state.rock);
  state.scenery = 0;
  state.groundIndices = 36;
  state.vistaMeshes = [];
  state.waterDraws = 1;
  state.factory
    .mockReset()
    .mockImplementation(async (_device, _camera, _environment, _rock, ground) => {
      const groundTriangles = (ground.indices?.length ?? 0) / 3;
      return layer({ stats: () => ({ groundTriangles }) });
    });
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
    groundTriangles: 12,
    scenery: 3,
    vistaBands: 3,
    groundCover: "green-grass",
    groundStyle: "beauty",
    slopeBands: null,
    rockDetail: state.rock.stats,
    vista: null,
    water: { draws: 1, triangles: 2 },
  });
  // A committed replacement publishes the content IT installed, not the first
  // generation's, and counts both vista lists rather than one.
  state.scenery = 5;
  state.groundIndices = 75;
  state.vistaMeshes = [{ name: "farFog", mesh: {} }];
  state.waterDraws = 2;
  await owner.replace(input);
  expect(owner.stats()).toEqual({
    installed: true,
    generation: 2,
    replacing: false,
    groundTriangles: 25,
    scenery: 5,
    vistaBands: 1,
    groundCover: "green-grass",
    groundStyle: "beauty",
    slopeBands: null,
    rockDetail: state.rock.stats,
    vista: null,
    water: { draws: 2, triangles: 4 },
  });
  // A failed staged generation leaves the installed report standing: its content
  // was never handed to an owner.
  state.scenery = 99;
  state.groundIndices = 900;
  state.factory.mockRejectedValueOnce(Error("terrain admission failed"));
  await expect(owner.replace(input)).rejects.toThrow("terrain admission failed");
  expect(owner.stats()).toMatchObject({
    generation: 2,
    groundTriangles: 25,
    scenery: 5,
    replacing: false,
  });
  // A disposed scene reports no installed map rather than zeros that read as an
  // empty one.
  owner.dispose();
  expect(owner.stats()).toEqual({
    installed: false,
    generation: 2,
    rockDetail: null,
    replacing: false,
    groundTriangles: null,
    scenery: null,
    vistaBands: null,
    groundCover: null,
    groundStyle: null,
    slopeBands: null,
    vista: null,
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

test("isolated model review keeps its ground while suppressing scenery and its shadow", async () => {
  const owner = await create();
  const [ground, water, scenery, backdrop] = state.resources as ReturnType<typeof layer>[];
  const visible = { ground: true, vista: false, water: false, scenery: false, crowd: true };
  owner.drawOpaque({} as TgpuRenderPass, visible);
  owner.drawShadow({} as TgpuRenderPass, {} as TgpuBindGroup, visible);
  expect(ground.draw).toHaveBeenCalledExactlyOnceWith({}, { ground: true, horizon: false });
  expect(ground.drawHorizonShadow).not.toHaveBeenCalled();
  expect(water.draw).not.toHaveBeenCalled();
  expect(scenery.draw).not.toHaveBeenCalled();
  expect(backdrop.draw).not.toHaveBeenCalled();
  owner.dispose();
});

test("terrain metadata follows the committed generation and returned descriptors cannot mutate it", async () => {
  const owner = await create();
  const slopeBands = {
    flatMax: 0.07,
    rollingMax: 0.115,
    slowMin: 0.135,
    cliffMin: 0.32,
    cliffDilateCells: 2,
    highlandCapMinM: 150,
  };
  const band = {
    name: "farFog",
    w: 2,
    h: 2,
    cell: 10,
    ox: -10,
    oy: -10,
    innerHalfW: 2,
    innerHalfH: 2,
    outerHalfW: 10,
    outerHalfH: 10,
    height: new Float32Array(4),
    shoreDistance: new Float32Array(4).fill(-1000),
  };
  state.vistaMeshes = [{ name: "farFog", mesh: {} }];
  await owner.replace({ ...input, slopeBands, vista: { shape: "test-apron", bands: [band] } });
  const report = owner.stats();
  expect(report.vista).toEqual({
    shape: "test-apron",
    bands: [
      {
        name: "farFog",
        w: 2,
        h: 2,
        cell: 10,
        ox: -10,
        oy: -10,
        innerHalfW: 2,
        innerHalfH: 2,
        outerHalfW: 10,
        outerHalfH: 10,
      },
    ],
  });
  expect(report.slopeBands).toEqual(slopeBands);
  report.vista!.bands[0].outerHalfW = 999;
  report.slopeBands!.cliffMin = 999;
  expect(owner.stats().vista!.bands[0].outerHalfW).toBe(10);
  expect(owner.stats().slopeBands!.cliffMin).toBe(0.32);
  state.factory.mockRejectedValueOnce(Error("terrain admission failed"));
  await expect(owner.replace(input)).rejects.toThrow("terrain admission failed");
  expect(owner.stats().vista!.bands[0].name).toBe("farFog");
  expect(owner.stats().slopeBands!.cliffMin).toBe(0.32);
  await owner.replace(input);
  expect(owner.stats()).toMatchObject({ vista: null, slopeBands: null });
  owner.dispose();
});

test("one scene-owned rock image serves every ground and vista across replacements", async () => {
  state.vistaMeshes = [
    { name: "far", mesh: {} },
    { name: "farFog", mesh: {} },
  ];
  const owner = await create();
  await owner.replace(input);
  expect(state.loadRock).toHaveBeenCalledTimes(1);
  expect(state.factory).toHaveBeenCalledTimes(6);
  for (const args of state.factory.mock.calls) expect(args[3]).toBe(state.rock);
  state.factory.mockRejectedValueOnce(Error("admission failed"));
  await expect(owner.replace(input)).rejects.toThrow("admission failed");
  expect(state.rock.dispose).not.toHaveBeenCalled();
  owner.dispose();
  owner.dispose();
  expect(state.rock.dispose).toHaveBeenCalledTimes(1);
});

test("initial admission failure releases its scene-owned rock image", async () => {
  state.factory.mockRejectedValueOnce(Error("admission failed"));
  await expect(create()).rejects.toThrow("admission failed");
  expect(state.rock.dispose).toHaveBeenCalledTimes(1);
});

test("scene disposal waits for a pending layer before releasing its borrowed rock image", async () => {
  const owner = await create();
  let resume!: (v: ReturnType<typeof layer>) => void;
  state.factory.mockReturnValueOnce(
    new Promise((r) => {
      resume = r;
    }),
  );
  const pending = owner.replace(input);
  owner.dispose();
  expect(state.rock.dispose).not.toHaveBeenCalled();
  resume(layer());
  await expect(pending).rejects.toThrow("cancelled");
  expect(state.rock.dispose).toHaveBeenCalledTimes(1);
});

test("initial terrain input is snapshotted before rock image decoding can yield", async () => {
  let resume!: (image: typeof state.rock) => void;
  state.loadRock.mockReturnValueOnce(
    new Promise((r) => {
      resume = r;
    }),
  );
  const grid = { marker: "original" };
  const pending = createTypegpuBattleTerrainScene(
    {} as GPUDevice,
    {} as GPUBuffer,
    {} as TgpuBindGroup,
    {} as TypegpuEnvironment,
    1,
    { ...input, grid } as unknown as BattleTerrainInput,
  );
  grid.marker = "mutated while image decodes";
  resume(state.rock);
  const owner = await pending;
  expect(owner.grid()).toEqual({ marker: "original" });
  owner.dispose();
});
