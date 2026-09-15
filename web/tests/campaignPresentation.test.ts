// @vitest-environment node
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import {
  campaignSelectionVertices,
  type CampaignSelectionInstance,
} from "@packages/game-renderer/src/campaign/selection";
import { CampaignSelectionLayer } from "@packages/photoreal-renderer/src/campaign/selectionLayer";
import { PhotorealScenery } from "@packages/photoreal-renderer/src/landscape/sceneryLayer";

const ring: CampaignSelectionInstance = {
  x: 10,
  y: -20,
  z: 3,
  radius: 12,
  color: [0.1, 0.8, 0.2],
  kind: "army",
};
test("campaign rings retain their ellipse and ride the sampled terrain at every vertex", () => {
  const data = campaignSelectionVertices([ring], (x, y) => x * 0.2 + y * 0.3);
  let maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < data.length; i += 9) {
    expect(data[i + 2] - (data[i] * 0.2 + data[i + 1] * 0.3)).toBeCloseTo(0.42, 4);
    maxX = Math.max(maxX, data[i]);
    maxY = Math.max(maxY, data[i + 1]);
  }
  expect(maxX).toBeCloseTo(22);
  expect(maxY).toBeCloseTo(-12.32);
});
test("physical selection replacement and disposal leave no stale ring", () => {
  const scene = new THREE.Scene();
  const layer = new CampaignSelectionLayer(scene);
  const surface = {
    sampleRendered: (x: number, y: number) => ({
      position: [x, y, 7] as [number, number, number],
      normal: [0, 0, 1] as [number, number, number],
      triangle: 0,
      revision: "fixture",
      barycentric: [1, 0, 0] as [number, number, number],
    }),
  };
  layer.upload([ring], surface);
  const mesh = scene.children[0] as THREE.Mesh;
  expect(mesh.visible).toBe(true);
  expect(mesh.geometry.getAttribute("position").getZ(0)).toBeCloseTo(7.42);
  layer.upload([], surface);
  expect(mesh.visible).toBe(false);
  expect(layer.stats().selections).toBe(0);
  layer.dispose();
  expect(scene.children).toHaveLength(0);
});
test("the existing scenery layer actually submits carts and clears removed carts", () => {
  const scene = new THREE.Scene(),
    layer = new PhotorealScenery(scene);
  layer.upload([{ x: 7, y: 9, z: 4, size: 1.3, height: 0.9, kind: "cart", yaw: 0.7 }]);
  expect(layer.stats().scenerySubmitted).toBe(1);
  const mesh = scene.children.find((node) => node.name.includes("-cart-")) as THREE.Mesh;
  expect(mesh.visible).toBe(true);
  expect(mesh.geometry.getAttribute("instPose").getW(0)).toBe(4);
  expect(mesh.geometry.getAttribute("instStyle").getZ(0)).toBeCloseTo(0.7);
  layer.upload([]);
  expect(mesh.visible).toBe(false);
  layer.dispose();
  expect(scene.children).toHaveLength(0);
});

test("cart source elevation includes the same clearance as its road", async () => {
  const { campaignRoadCarts } = await import("@packages/game-renderer/src/campaign/entityFrame");
  const { CAMPAIGN_ROAD_SURFACE_LIFT } =
    await import("@packages/game-renderer/src/campaign/roadGeometry");
  const field = {
    w: 2,
    h: 2,
    cell: 100,
    minX: -100,
    maxY: 100,
    maxH: 7,
    land: new Uint8Array(4).fill(1),
    biome: new Uint8Array(4),
    height: new Float32Array(4).fill(7),
    heightAt: () => 7,
    renderLandAt: () => true,
    renderWaterAt: () => false,
  };
  const data = {
    map: {
      attribution: "fixture",
      nodes: [],
      factions: [],
      edges: [
        {
          kind: "road" as const,
          via: [
            [-100, 0],
            [100, 0],
          ] as [number, number][],
        },
      ],
    },
    bgRect: { min: [-100, -100] as [number, number], max: [100, 100] as [number, number] },
  };
  const opts = {
    cam: { x: 0, y: 0, scale: 5 },
    armies: [],
    cities: new Map(),
    selected: -1,
    selectedCity: -1,
    factionLabels: [],
    factionStatus: new Int8Array(),
    playerFaction: 0,
    fogOfWar: false,
    visionSources: [],
    factionView: false,
    stackUnitCap: 6,
    controlledStage: false,
  };
  const carts = campaignRoadCarts(data, field, 0.25, opts);
  expect(carts.length).toBeGreaterThan(0);
  for (const cart of carts) {
    expect(cart.z).toBe(7 + CAMPAIGN_ROAD_SURFACE_LIFT);
    expect(cart.surfaceOffset).toBe(CAMPAIGN_ROAD_SURFACE_LIFT);
  }
  expect(campaignRoadCarts(data, field, 0.25, { ...opts, fogOfWar: true })).toHaveLength(0);
});

test("a garrison retains its city standard and selection without intersecting representative figures", async () => {
  const { buildEntityFrame } = await import("@packages/game-renderer/src/campaign/entityFrame");
  const field = {
    w: 2,
    h: 2,
    cell: 100,
    minX: -100,
    maxY: 100,
    maxH: 7,
    land: new Uint8Array(4).fill(1),
    biome: new Uint8Array(4),
    height: new Float32Array(4).fill(7),
    heightAt: () => 7,
    renderLandAt: () => true,
    renderWaterAt: () => false,
  };
  const armies = [-35, 35].map((x, id) => ({
    id,
    x,
    y: -25,
    faction: id,
    soldiers: 600,
    stance: 0,
    pieKind: 0,
    pieFrac: 0,
    marching: false,
    encounter: -1,
    moraleCap: 1,
    mine: id === 0,
    roster: [6],
    unitsByClass: [6],
    unitCount: 6,
  }));
  const data = {
    map: {
      attribution: "fixture",
      nodes: [
        {
          id: 0,
          name: "Town",
          pos: [-35, -25] as [number, number],
          kind: "city" as const,
          tier: 2,
          port: false,
          owner: "friend",
        },
      ],
      factions: [{ id: "friend", color: [40, 90, 180] as [number, number, number] }],
      edges: [],
    },
    bgRect: { min: [-100, -100] as [number, number], max: [100, 100] as [number, number] },
  };
  const opts = {
    cam: { x: 0, y: 0, scale: 5 },
    armies,
    cities: new Map(),
    selected: 0,
    selectedCity: -1,
    factionLabels: [],
    factionStatus: new Int8Array([0, 2]),
    playerFaction: 0,
    fogOfWar: false,
    visionSources: [],
    factionView: false,
    stackUnitCap: 6,
    controlledStage: false,
  };
  const before = structuredClone(armies);
  const frame = buildEntityFrame(data, field, opts, [], 0.25, () => "idle");
  const fieldOnly = buildEntityFrame(
    { ...data, map: { ...data.map, nodes: [] } },
    field,
    opts,
    [],
    0.25,
    () => "idle",
  );
  expect(frame.entities).toHaveLength(1);
  expect(frame.standards).toHaveLength(2);
  expect(frame.standards.find((item) => item.unitId === 0)).toMatchObject({
    tier: "campaign-army",
    cityId: 0,
    selected: true,
  });
  expect(frame.selections).toHaveLength(1);
  expect(frame.selections[0].kind).toBe("garrisoned-army");
  expect(frame.crowd).toHaveLength(6);
  expect(frame.crowd).toEqual(fieldOnly.crowd.filter((instance) => instance.x > 0));
  expect(armies).toEqual(before);
});
