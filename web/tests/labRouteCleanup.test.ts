import { beforeEach, expect, test, vi } from "vitest";
import * as THREE from "three/webgpu";

// One owner releases everything a lab route acquires — a terrain worker, the
// decoded rock detail map, the world, and the materials and geometry built on
// them — through both ends of the route's life: the catch when setup fails and
// the pagehide when it succeeds. These tests inject a fault at each stage and
// count disposals, so the substrate is replaced at its own module seams — no
// device, no decode, no real Worker is needed to pin the ownership contract.
const lab = vi.hoisted(() => ({
  loadRockDetailMap: vi.fn(),
  createWorld: vi.fn(),
  worker: { build: vi.fn(), dispose: vi.fn() },
  materials: [] as { disposals: () => number }[],
  fail: { tiledTerrain: false, groundMesh: false },
}));

vi.mock("@packages/photoreal-renderer/src/landscape/rockDetailMap", () => ({
  loadRockDetailMap: lab.loadRockDetailMap,
}));
vi.mock("@packages/photoreal-renderer/src/world", () => ({
  PhotorealWorld: { create: lab.createWorld },
}));
vi.mock("@packages/photoreal-renderer/src/environment", () => ({
  applyCivsimEnvironment: () => ({ sunDirection: [0, 0, 1] }),
}));
vi.mock("@packages/photoreal-renderer/src/campaign/terrainWorker", () => ({
  createCampaignTerrainWorker: () => lab.worker,
}));
vi.mock("@packages/photoreal-renderer/src/campaign/tiledTerrain", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../packages/photoreal-renderer/src/campaign/tiledTerrain")
    >();
  class FaultingTiledTerrain extends actual.PhotorealTiledTerrain {
    constructor(...args: ConstructorParameters<typeof actual.PhotorealTiledTerrain>) {
      if (lab.fail.tiledTerrain) throw new Error("tiled terrain construction failed");
      super(...args);
    }
  }
  return { ...actual, PhotorealTiledTerrain: FaultingTiledTerrain };
});
vi.mock("@packages/photoreal-renderer/src/landscape/terrainLayer", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../packages/photoreal-renderer/src/landscape/terrainLayer")
    >();
  return {
    ...actual,
    createGroundMesh: (...args: Parameters<typeof actual.createGroundMesh>) => {
      if (lab.fail.groundMesh) throw new Error("ground mesh build failed");
      return actual.createGroundMesh(...args);
    },
  };
});
// Pass-through: the route builds its real material, and the counter is attached
// at creation so a release running twice is visible rather than invisible.
vi.mock("@packages/photoreal-renderer/src/landscape/terrainMaterial", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../packages/photoreal-renderer/src/landscape/terrainMaterial")
    >();
  return {
    ...actual,
    createLandscapeGroundMaterial: (
      ...args: Parameters<typeof actual.createLandscapeGroundMaterial>
    ) => {
      const material = actual.createLandscapeGroundMaterial(...args);
      let count = 0;
      material.addEventListener("dispose", () => count++);
      lab.materials.push({ disposals: () => count });
      return material;
    },
  };
});

const { route: landscapeTiles } = await import("../../apps/renderer-lab/src/routes/landscapeTiles");
const { route: terrainWater } = await import("../../apps/renderer-lab/src/routes/terrainWater");
const { route: landscapeWater } = await import("../../apps/renderer-lab/src/routes/landscapeWater");
const { route: landscapeMaterials } =
  await import("../../apps/renderer-lab/src/routes/landscapeMaterials");
const { route: campaignLandscape } =
  await import("../../apps/renderer-lab/src/routes/campaignLandscape");

function labContext(params = "", path = "/renderer/lab") {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 800 });
  Object.defineProperty(canvas, "clientHeight", { value: 600 });
  return {
    root: document.createElement("div"),
    canvas,
    panel: document.createElement("div"),
    status: document.createElement("div"),
    path,
    params: new URLSearchParams(params),
  };
}

/** A real texture, so the routes' own dispose() calls are what is counted. */
function detailMap() {
  const map = new THREE.Texture();
  let disposals = 0;
  map.addEventListener("dispose", () => disposals++);
  lab.loadRockDetailMap.mockResolvedValue(map);
  return { disposals: () => disposals };
}

function liveWorld() {
  const world = {
    scene: new THREE.Scene(),
    sunLight: new THREE.DirectionalLight(),
    environmentId: "golden",
    dispose: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    setTime: vi.fn(),
    stats: () => ({ drawCalls: 0 }),
    settlePresentedFrame: async () => {},
  };
  lab.createWorld.mockResolvedValue(world);
  return world;
}

function failsToRender(world: ReturnType<typeof liveWorld>) {
  world.render.mockImplementation(() => {
    throw new Error("render failed");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  lab.materials.length = 0;
  lab.fail.tiledTerrain = false;
  lab.fail.groundMesh = false;
});

test("a failed detail-map load releases the terrain worker setup already created", async () => {
  lab.loadRockDetailMap.mockRejectedValue(new Error("detail map 404"));

  await expect(landscapeTiles(labContext())).rejects.toThrow("detail map 404");

  expect(lab.worker.dispose).toHaveBeenCalledTimes(1);
  expect(lab.createWorld).not.toHaveBeenCalled();
});

test("a failed world creation releases the worker and the decoded detail map", async () => {
  const map = detailMap();
  lab.createWorld.mockRejectedValue(new Error("no adapter"));

  await expect(landscapeTiles(labContext())).rejects.toThrow("no adapter");

  expect(map.disposals()).toBe(1);
  expect(lab.worker.dispose).toHaveBeenCalledTimes(1);
});

test("a failure before the terrain takes the material releases the material itself", async () => {
  const map = detailMap();
  const world = liveWorld();
  lab.fail.tiledTerrain = true;

  await expect(landscapeTiles(labContext())).rejects.toThrow("tiled terrain construction failed");

  expect(lab.materials).toHaveLength(1);
  expect(lab.materials[0].disposals()).toBe(1);
  expect(map.disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
  expect(lab.worker.dispose).toHaveBeenCalledTimes(1);
});

test("a failure after the terrain took the material disposes it exactly once", async () => {
  const map = detailMap();
  const world = liveWorld();
  failsToRender(world);

  await expect(landscapeTiles(labContext())).rejects.toThrow("render failed");

  expect(lab.materials[0].disposals()).toBe(1);
  expect(map.disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
  expect(lab.worker.dispose).toHaveBeenCalledTimes(1);
});

test("landscape-tiles teardown disposes each resource exactly once", async () => {
  const map = detailMap();
  const world = liveWorld();

  await landscapeTiles(labContext());

  expect(map.disposals()).toBe(0);
  expect(lab.materials[0].disposals()).toBe(0);
  expect(world.dispose).not.toHaveBeenCalled();
  expect(lab.worker.dispose).not.toHaveBeenCalled();

  window.dispatchEvent(new Event("pagehide"));

  expect(map.disposals()).toBe(1);
  expect(lab.materials[0].disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
  expect(lab.worker.dispose).toHaveBeenCalledTimes(1);
  // The scene handle holds the route graph, so teardown drops it too.
  expect("__landscapeTiles" in window).toBe(false);
});

test("terrain-water releases the map and the world when the ground build fails", async () => {
  const map = detailMap();
  const world = liveWorld();
  lab.fail.groundMesh = true;

  await expect(terrainWater(labContext())).rejects.toThrow("ground mesh build failed");

  expect(map.disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
});

test("terrain-water teardown disposes the map once", async () => {
  const map = detailMap();
  const world = liveWorld();

  await terrainWater(labContext());
  expect(map.disposals()).toBe(0);
  window.dispatchEvent(new Event("pagehide"));

  expect(map.disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
});

test("landscape-water releases its material, map and world when the first render fails", async () => {
  const map = detailMap();
  const world = liveWorld();
  failsToRender(world);

  await expect(landscapeWater(labContext())).rejects.toThrow("render failed");

  expect(lab.materials[0].disposals()).toBe(1);
  expect(map.disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
});

test("landscape-materials releases the mesh's material once when the first render fails", async () => {
  const map = detailMap();
  const world = liveWorld();
  failsToRender(world);

  await expect(landscapeMaterials(labContext())).rejects.toThrow("render failed");

  expect(lab.materials[0].disposals()).toBe(1);
  expect(map.disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
});

test("campaign-landscape releases its scenery, material, map and world on a failed render", async () => {
  const map = detailMap();
  const world = liveWorld();
  failsToRender(world);

  // The fixture path builds its landscape from the lab fixture, so no campaign
  // data load stands between setup and the first render.
  await expect(campaignLandscape(labContext("", "/renderer/landscape-surface"))).rejects.toThrow(
    "render failed",
  );

  expect(lab.materials[0].disposals()).toBe(1);
  expect(map.disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
});

test("a throw after the route is fully built releases it instead of outliving setup", async () => {
  const map = detailMap();
  const world = liveWorld();
  const ctx = labContext("", "/renderer/landscape-surface");
  // The route's last statement, past every acquisition and past the point the
  // old code had already handed ownership away.
  Object.defineProperty(ctx.status, "innerHTML", {
    set() {
      throw new Error("status render failed");
    },
  });

  await expect(campaignLandscape(ctx)).rejects.toThrow("status render failed");

  expect(lab.materials[0].disposals()).toBe(1);
  expect(map.disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);

  // One owner, so the teardown path has nothing left to release a second time.
  window.dispatchEvent(new Event("pagehide"));

  expect(lab.materials[0].disposals()).toBe(1);
  expect(map.disposals()).toBe(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
});

test("a world completing after pagehide is released and setup stops", async () => {
  const map = detailMap();
  const world = liveWorld();
  let finish!: (value: typeof world) => void;
  lab.createWorld.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const running = landscapeTiles(labContext());
  await vi.waitFor(() => expect(lab.createWorld).toHaveBeenCalledTimes(1));
  window.dispatchEvent(new Event("pagehide"));
  finish(world);
  await expect(running).rejects.toMatchObject({ name: "AbortError" });
  expect(map.disposals()).toBe(1);
  expect(lab.worker.dispose).toHaveBeenCalledTimes(1);
  expect(world.dispose).toHaveBeenCalledTimes(1);
  expect(world.render).not.toHaveBeenCalled();
});
