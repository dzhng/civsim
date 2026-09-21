import { campaignFactionBorderVertices } from "../../packages/game-renderer/src/campaign/borderGeometry";
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { CampaignGeographicLayer } from "../../packages/photoreal-renderer/src/campaign/geographicLayer";
import { buildCampaignMapDrawData } from "../../packages/game-renderer/src/campaign/roadGeometry";
import { createRenderedSurface } from "../../packages/game-renderer/src/terrain/surface";

function plane(base: number, gx = 0.1, gy = 0.2) {
  const vertices = new Float32Array(40);
  for (const [i, x, y] of [
    [0, -100, -100],
    [1, 100, -100],
    [2, -100, 100],
    [3, 100, 100],
  ])
    vertices.set([x, y, base + x * gx + y * gy, 0, 0, 1, 1, 1, 1, 0], i * 10);
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
      roadAnchors: new Float32Array(),
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

test("road surface width survives steep cross-slopes and repeated terrain replacement", () => {
  const draw = buildCampaignMapDrawData({
    map: {
      nodes: [],
      factions: [],
      edges: [
        {
          kind: "road",
          via: [
            [-10, 0],
            [10, 0],
          ],
        },
      ],
    },
  });
  const original = draw.roadMeshVertices.slice();
  const scene = new THREE.Scene();
  const layer = new CampaignGeographicLayer(scene, new THREE.MeshBasicMaterial(), () => 0);
  layer.upload({ ...draw, borderVertices: new Float32Array() }, plane(20, 0.8, 2.5));
  const positions = (scene.children[0] as THREE.Mesh).geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  // Core follows the shoulder; each strip begins with left/right at the first centerline point.
  const left = positions.count / 2,
    right = left + 5;
  const intendedWidth = Math.hypot(
    original[right * 10] - original[left * 10],
    original[right * 10 + 1] - original[left * 10 + 1],
  );
  const verify = (base: number, gx: number, gy: number) => {
    const a = new THREE.Vector3().fromBufferAttribute(positions, left);
    const b = new THREE.Vector3().fromBufferAttribute(positions, right);
    expect(a.distanceTo(b)).toBeCloseTo(intendedWidth, 4);
    expect(
      b
        .clone()
        .sub(a)
        .dot(new THREE.Vector3(1, 0, gx)),
    ).toBeCloseTo(0, 4);
    const center = a.clone().add(b).multiplyScalar(0.5);
    expect(center.x).toBeCloseTo(-10, 4);
    expect(center.y).toBeCloseTo(0, 4);
    for (const v of [a, b])
      expect(v.z).toBeCloseTo(base + gx * v.x + gy * v.y + original[left * 10 + 2], 4);
  };
  verify(20, 0.8, 2.5);
  layer.seat(plane(40, -1, -3));
  verify(40, -1, -3);
  const seated = positions.array.slice();
  layer.seat(plane(40, -1, -3));
  expect(positions.array).toEqual(seated);
  layer.seat(plane(0, 0, 0));
  verify(0, 0, 0);
  expect(draw.roadMeshVertices).toEqual(original);
  layer.dispose();
});

test("junction caps retain surface radius when terrain changes", () => {
  const draw = buildCampaignMapDrawData({
    map: {
      nodes: [{ id: 0, name: "crossroads", kind: "junction", pos: [0, 0], tier: 0, owner: "" }],
      factions: [],
      edges: [
        [10, 0],
        [0, 10],
        [-10, 0],
      ].map(([x, y], index) => ({
        a: 0,
        b: index + 1,
        kind: "road" as const,
        via: [
          [0, 0],
          [x, y],
        ] as [number, number][],
      })),
    },
  });
  expect(draw.stats.roadJunctionCaps).toBe(1);
  const original = draw.roadMeshVertices.slice();
  expect(draw.roadAnchors.length).toBe(draw.stats.roadMeshVertices * 2);
  const scene = new THREE.Scene();
  const layer = new CampaignGeographicLayer(scene, new THREE.MeshBasicMaterial(), () => 0);
  layer.upload({ ...draw, borderVertices: new Float32Array() }, plane(10, 2, -3));
  const positions = (scene.children[0] as THREE.Mesh).geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  // A cap triangle starts at the junction itself; ribbons have only edge vertices.
  const caps: { start: number; radius: number }[] = [];
  for (let i = 0; i < positions.count; i += 3)
    if (original[i * 10] === 0 && original[i * 10 + 1] === 0)
      caps.push({
        start: i,
        radius: Math.hypot(original[(i + 1) * 10], original[(i + 1) * 10 + 1]),
      });
  expect(caps.length).toBeGreaterThan(0);
  for (const surface of [plane(10, 2, -3), plane(30, -4, 1), plane(0, 0, 0)]) {
    layer.seat(surface);
    for (const { start: i, radius } of caps) {
      const center = new THREE.Vector3().fromBufferAttribute(positions, i);
      expect(center.x).toBe(0);
      expect(center.y).toBe(0);
      for (const j of [i + 1, i + 2])
        expect(
          center.distanceTo(new THREE.Vector3().fromBufferAttribute(positions, j)),
        ).toBeCloseTo(radius, 4);
    }
  }
  expect(draw.roadMeshVertices).toEqual(original);
  layer.dispose();
});

test.each(["before", "after"] as const)(
  "regional road seating preserves a full fog refresh queued %s it",
  (order) => {
    const draw = buildCampaignMapDrawData({
      map: {
        nodes: [],
        factions: [],
        edges: [
          {
            kind: "road",
            via: [
              [-20, 0],
              [20, 0],
            ],
          },
        ],
      },
    });
    const scene = new THREE.Scene();
    let visibility = 0;
    const layer = new CampaignGeographicLayer(
      scene,
      new THREE.MeshBasicMaterial(),
      () => visibility,
    );
    layer.upload({ ...draw, borderVertices: new Float32Array() }, plane(0, 0, 0));
    const fog = (scene.children[0] as THREE.Mesh).geometry.getAttribute(
      "campaignFog",
    ) as THREE.BufferAttribute;
    fog.clearUpdateRanges(); // The initial frame has been submitted.
    const refresh = () => {
      visibility = 1;
      fog.array.fill(visibility);
      fog.needsUpdate = true;
    };
    if (order === "before") refresh();
    layer.seat(plane(10, 1, 2), [
      { ox: -20, oy: -2, cell: 2, columns: 2, rows: 3, units: "kilometers" },
    ]);
    expect(layer.stats().sampledVertices).toBeGreaterThan(0);
    expect(layer.stats().sampledVertices).toBeLessThan(layer.stats().vertices);
    if (order === "after") refresh();
    expect(Array.from(fog.array).every((value) => value === 1)).toBe(true);
    // Three's WebGPU uploader interprets an empty range list as the full buffer.
    // A road-only range would leave the other vertices at their previous GPU fog.
    expect(fog.updateRanges).toEqual([]);
    layer.dispose();
  },
);
