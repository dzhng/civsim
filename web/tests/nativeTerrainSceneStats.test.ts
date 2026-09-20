// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import type { BattleTerrainInput } from "../../packages/battle-renderer/src/sceneTypes";

// The terrain scene owns one committed generation at a time. Its published
// content must be that generation's — not the staged one a replacement is
// still building, and not zeros once it is gone.
const state = vi.hoisted(() => ({
  scenery: 0,
  vistaRings: [] as string[],
  sceneryFailure: null as unknown,
  disposed: [] as string[],
}));

function owner(label: string, extra: Record<string, unknown> = {}) {
  return {
    dispose: () => state.disposed.push(label),
    encode: vi.fn(),
    encodeHorizonShadow: vi.fn(),
    draw: vi.fn(),
    setState: vi.fn(),
    setStyle: vi.fn(),
    setRects: vi.fn(),
    ...extra,
  };
}
vi.mock("../../packages/battle-renderer/src/terrainScenePreparation", () => ({
  prepareBattleTerrain: (input: BattleTerrainInput) => ({
    grid: input.grid,
    cover: input.cover,
    data: {
      ground: { earthDistance: {} },
      horizon: null,
      vistaMeshes: state.vistaRings.map((name) => ({ name, mesh: {} })),
      scenery: [],
      rect: [-10, -10, 20, 20],
      field: {},
      vista: null,
    },
    lakes: [],
    slopeBands: null,
    waterInputs: [],
  }),
  terrainPickingMeshes: () => [],
  battleGroundInputs: () => ({}),
}));
vi.mock("../../packages/battle-renderer/src/world/terrain", () => ({
  RawBattleTerrain: class {
    constructor() {
      return owner("terrain");
    }
  },
}));
vi.mock("../../packages/battle-renderer/src/world/water", () => ({
  RawBattleWater: class {
    constructor() {
      return owner("water", { stats: () => ({ draws: 2, triangles: 8 }) });
    }
  },
}));
vi.mock("../../packages/battle-renderer/src/world/scenery", () => ({
  createRawScenery: async () => {
    if (state.sceneryFailure) throw state.sceneryFailure;
    const count = state.scenery;
    return owner("scenery", { upload: vi.fn(), stats: () => ({ scenery: count }) });
  },
}));
vi.mock("../../packages/battle-renderer/src/world/backdrop", () => ({
  createRawBackdrop: async () => owner("backdrop"),
}));
vi.mock("../../packages/battle-renderer/src/gpuAdmission", () => ({
  beginGpuAdmission: () => async () => {},
}));
import { createRawBattleTerrainScene } from "../../packages/battle-renderer/src/world/terrainScene";

const input = () =>
  ({
    grid: { w: 1, h: 1, cell: 4, ox: 0, oy: 0, tint: new Uint8Array(1) },
    cover: "green-grass",
    vista: null,
    lakes: [],
  }) as unknown as BattleTerrainInput;
const device = {} as GPUDevice;
const environment = {} as never;
const build = () =>
  createRawBattleTerrainScene(device, {} as GPUBindGroupLayout, environment, 1, input());

beforeEach(() => {
  state.scenery = 4;
  state.vistaRings = ["near", "far", "farFog"];
  state.sceneryFailure = null;
  state.disposed = [];
});

test("published content is the committed generation's own", async () => {
  const scene = await build();
  expect(scene.stats()).toEqual({
    installed: true,
    generation: 1,
    replacing: false,
    scenery: 4,
    vistaBands: 3,
    water: { draws: 2, triangles: 8 },
  });
  state.scenery = 11;
  state.vistaRings = ["near", "farFog"];
  await scene.replace(input());
  expect(scene.stats()).toMatchObject({ generation: 2, scenery: 11, vistaBands: 2 });
  scene.dispose();
});

test("a failed replacement keeps reporting the generation still installed", async () => {
  const scene = await build();
  state.scenery = 99;
  state.sceneryFailure = Error("injected scenery failure");
  await expect(scene.replace(input())).rejects.toThrow("injected scenery failure");
  expect(scene.stats()).toMatchObject({ installed: true, generation: 1, scenery: 4 });
  scene.dispose();
});

test("a disposed scene reports no installed terrain rather than an empty map", async () => {
  const scene = await build();
  scene.dispose();
  expect(scene.stats()).toEqual({
    installed: false,
    generation: 1,
    replacing: false,
    scenery: null,
    vistaBands: null,
    water: null,
  });
  // Reading stats after disposal must not resurrect or re-check owned resources.
  expect(state.disposed).toContain("scenery");
});
