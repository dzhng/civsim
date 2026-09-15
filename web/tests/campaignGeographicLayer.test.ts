import { campaignFactionBorderVertices } from "../../packages/game-renderer/src/campaign/borderGeometry";
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { CampaignGeographicLayer } from "../../packages/photoreal-renderer/src/campaign/geographicLayer";
import { buildCampaignMapDrawData } from "../../packages/game-renderer/src/campaign/roadGeometry";
import { createRenderedSurface } from "../../packages/game-renderer/src/terrain/surface";

function plane(base: number) {
  const vertices = new Float32Array(40);
  for (const [i, x, y] of [
    [0, -100, -100],
    [1, 100, -100],
    [2, -100, 100],
    [3, 100, 100],
  ])
    vertices.set([x, y, base + x * 0.1 + y * 0.2, 0, 0, 1, 1, 1, 1, 0], i * 10);
  return createRenderedSurface(
    { vertices, indices: new Uint32Array([0, 2, 1, 1, 2, 3]), triangles: 2 },
    { ox: -100, oy: -100, cell: 200, columns: 2, rows: 2, units: "kilometers" },
    String(base),
  );
}

test("live geographic ribbons preserve builder clearances through surface updates and replacement", () => {
  const draw = buildCampaignMapDrawData({
    map: {
      nodes: [],
      factions: [],
      edges: [
        {
          kind: "road",
          via: [
            [-40, -30],
            [-20, -30],
          ],
        },
        {
          kind: "sea",
          via: [
            [20, 30],
            [40, 30],
          ],
        },
      ],
    },
  });
  const source = draw.roadMeshVertices.slice();
  const scene = new THREE.Scene(),
    material = new THREE.MeshBasicMaterial();
  let materialDisposals = 0;
  material.addEventListener("dispose", () => materialDisposals++);
  const layer = new CampaignGeographicLayer(scene, material, (x) => (x > 0 ? 1 : 0));
  const input = {
    ...draw,
    borderVertices: campaignFactionBorderVertices([
      {
        pts: [
          [-5, 0],
          [5, 0],
          [0, 5],
        ],
        left: { owner: 0, color: [180, 40, 20] },
        right: { owner: 1, color: [20, 40, 180] },
      },
    ]),
  };
  layer.upload(input, plane(50));
  const meshes = scene.children as THREE.Mesh[];
  expect(meshes[2].renderOrder).toBeLessThan(meshes[0].renderOrder);
  expect(meshes[0].renderOrder).toBeLessThan(meshes[1].renderOrder);
  let releases = 0;
  for (const [index, mesh] of meshes.entries()) {
    mesh.geometry.addEventListener("dispose", () => releases++);
    expect(mesh.material).toBe(material);
    const original = [draw.roadMeshVertices, draw.lineVertices, input.borderVertices][index];
    const stride = index === 0 ? 10 : 7;
    const positions = mesh.geometry.getAttribute("position");
    const fog = mesh.geometry.getAttribute("campaignFog");
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getZ(i)).toBeCloseTo(
        50 + positions.getX(i) * 0.1 + positions.getY(i) * 0.2 + original[i * stride + 2],
        4,
      );
      expect(fog.getX(i)).toBe(positions.getX(i) > 0 ? 1 : 0);
    }
  }
  const road = meshes[0].geometry.getAttribute("position") as THREE.BufferAttribute;
  const sea = meshes[1].geometry.getAttribute("position") as THREE.BufferAttribute;
  const seaBefore = sea.array.slice(),
    seaVersion = sea.version;
  layer.seat(plane(60), [{ ox: -60, oy: -60, columns: 2, rows: 2, cell: 50, units: "kilometers" }]);
  expect(meshes[0].geometry.getAttribute("position")).toBe(road);
  for (let i = 0; i < road.count; i++)
    expect(road.getZ(i)).toBeCloseTo(
      60 + road.getX(i) * 0.1 + road.getY(i) * 0.2 + source[i * 10 + 2],
      4,
    );
  expect(sea.array).toEqual(seaBefore);
  expect(sea.version).toBe(seaVersion);
  expect(layer.stats().sampledVertices).toBe(road.count);
  expect(draw.roadMeshVertices).toEqual(source);
  layer.upload(
    {
      roadMeshVertices: new Float32Array(),
      lineVertices: new Float32Array(),
      borderVertices: new Float32Array(),
    },
    plane(50),
  );
  expect(releases).toBe(3);
  expect(scene.children).toHaveLength(0);
  expect(materialDisposals).toBe(0);
  layer.dispose();
  expect(materialDisposals).toBe(1);
});

test("border subdivision samples relief between distant original waypoints", () => {
  const borders = [
    {
      pts: [
        [-10, 0],
        [10, 0],
      ] as [number, number][],
      left: { owner: 0, color: [100, 80, 60] as [number, number, number] },
    },
  ];
  const height = (x: number) => 12 * Math.exp(-(x * x) / 4);
  const sparse = campaignFactionBorderVertices(borders, height);
  const dense = campaignFactionBorderVertices(borders, height, { surfaceStep: 0.9 });
  expect(Math.max(...Array.from(sparse).filter((_, i) => i % 7 === 2))).toBeLessThan(0.13);
  expect(Math.max(...Array.from(dense).filter((_, i) => i % 7 === 2))).toBeGreaterThan(11);
  for (let i = 0; i < dense.length; i += 7) {
    expect(dense[i + 2]).toBeCloseTo(height(dense[i]) + 0.12, 4);
    expect(dense[i]).toBeGreaterThanOrEqual(-10);
    expect(dense[i]).toBeLessThanOrEqual(10);
  }
});

test("wide border ends clip to the rendered coast without moving the dry centerline", () => {
  const borders = [
    {
      pts: [
        [-4, 0],
        [4, 0],
      ] as [number, number][],
      left: { owner: 0, color: [100, 80, 60] as [number, number, number] },
    },
  ];
  const landAt = (x: number, y: number) => x + y < 1;
  const geometry = campaignFactionBorderVertices(borders, undefined, { surfaceStep: 0.9, landAt });
  expect(geometry.length).toBeGreaterThan(0);
  let farthest = -Infinity;
  for (let i = 0; i < geometry.length; i += 7) {
    const x = geometry[i],
      y = geometry[i + 1];
    expect(x + y).toBeLessThanOrEqual(1.000001);
    farthest = Math.max(farthest, x + y);
  }
  expect(farthest).toBeGreaterThan(0.999);
  expect(Math.min(...Array.from(geometry).filter((_, i) => i % 7 === 0))).toBe(-4);
});

test("distant geographic regions are neither scanned nor uploaded during local terrain admission", () => {
  const data = buildCampaignMapDrawData({
    map: {
      nodes: [],
      factions: [],
      edges: [
        {
          kind: "road",
          via: [
            [-40, -30],
            [-20, -30],
          ],
        },
        {
          kind: "road",
          via: [
            [540, 530],
            [560, 530],
          ],
        },
      ],
    },
  });
  const scene = new THREE.Scene();
  const layer = new CampaignGeographicLayer(scene, new THREE.MeshBasicMaterial(), () => 0);
  layer.upload({ ...data, borderVertices: new Float32Array() }, plane(50));
  expect(scene.children).toHaveLength(2);
  const distant = (scene.children[1] as THREE.Mesh).geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  const before = distant.array.slice(),
    version = distant.version;
  layer.seat(plane(60), [{ ox: -60, oy: -60, columns: 2, rows: 2, cell: 50, units: "kilometers" }]);
  expect(layer.stats().visitedVertices).toBe(layer.stats().vertices / 2);
  expect(layer.stats().sampledVertices).toBe(layer.stats().visitedVertices);
  expect(distant.array).toEqual(before);
  expect(distant.version).toBe(version);
  layer.dispose();
});
