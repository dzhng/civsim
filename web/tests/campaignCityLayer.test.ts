import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { CampaignCityLayer } from "../../packages/photoreal-renderer/src/campaign/cityLayer";
import { buildCityMesh } from "../../packages/game-renderer/src/models/campaign/campaignEntityModels";
import type { CampaignEntityInstance } from "../../packages/game-renderer/src/campaign/entityInstance";
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
const city: CampaignEntityInstance = {
  id: 13,
  label: "Hill town",
  selected: true,
  kind: "city",
  x: 10,
  y: 20,
  radius: 6.2,
  faction: [0.7, 0.2, 0.1],
  allegiance: [0.1, 0.8, 0.1],
};

test("actual city wall bases retain XY and extend under each presented slope through terrain replacement", () => {
  const layer = new CampaignCityLayer(new THREE.Scene());
  layer.upload([city], plane(10));
  const authored = buildCityMesh().opaque.vertices;
  const object = layer.objects[0];
  let feet = 0;
  for (const base of [10, 45]) {
    const surface = plane(base);
    layer.seat(surface);
    const position = object.mesh.geometry.getAttribute("position");
    for (let i = 0; i < authored.length / 10; i++) {
      expect(position.getX(i)).toBeCloseTo(authored[i * 10], 5);
      expect(position.getY(i)).toBeCloseTo(authored[i * 10 + 1], 5);
      if (authored[i * 10 + 2] !== 0) continue;
      const x = city.x + position.getX(i) * object.input.scale;
      const y = city.y + position.getY(i) * object.input.scale;
      const z = object.mesh.position.z + position.getZ(i) * object.input.scale;
      expect(z).toBeLessThan(surface.sampleRendered(x, y)!.position[2]);
      feet++;
    }
    expect(object.mesh.position.x).toBe(city.x);
    expect(object.mesh.position.y).toBe(city.y);
  }
  expect(feet).toBeGreaterThan(100);
  layer.dispose();
});

test("ownership and selected updates preserve geometry, removal disposes once, repeated frames are no-op", () => {
  const scene = new THREE.Scene(),
    layer = new CampaignCityLayer(scene),
    surface = plane(0);
  expect(layer.upload([city], surface)).toBe(true);
  const mesh = layer.objects[0].mesh,
    geometry = mesh.geometry;
  let disposals = 0;
  geometry.addEventListener("dispose", () => disposals++);
  expect(layer.upload([{ ...city }], surface)).toBe(false);
  layer.upload([{ ...city, selected: false, faction: [0.1, 0.2, 0.8] }], surface);
  expect(layer.objects[0].mesh).toBe(mesh);
  expect(layer.objects[0].mesh.geometry).toBe(geometry);
  expect(layer.objects[0].input.city!.selected).toBe(false);
  expect(layer.objects[0].input.city!.faction).toEqual([0.1, 0.2, 0.8]);
  layer.upload([], surface);
  expect(disposals).toBe(1);
  expect(scene.children).toHaveLength(0);
  layer.dispose();
  expect(disposals).toBe(1);
});

test("wall bottoms never bridge the trough between equal-height footprint corners", () => {
  const ground = (x: number, y: number) => -4 * Math.exp(-x * x * 12) + y * 0.1;
  const model = buildCityMesh(ground),
    authored = buildCityMesh();
  const vertices = model.opaque.vertices,
    original = authored.opaque.vertices;
  let spans = 0;
  for (let i = 0; i < model.opaque.indices.length; i += 3) {
    const triangle = Array.from(model.opaque.indices.subarray(i, i + 3));
    const bottoms = triangle.filter((index) => original[index * 10 + 2] === 0);
    if (bottoms.length < 2) continue;
    const a = bottoms[0] * 10,
      b = bottoms[1] * 10;
    for (let step = 0; step <= 40; step++) {
      const t = step / 40;
      const x = vertices[a] * (1 - t) + vertices[b] * t;
      const y = vertices[a + 1] * (1 - t) + vertices[b + 1] * t;
      const z = vertices[a + 2] * (1 - t) + vertices[b + 2] * t;
      expect(z).toBeLessThanOrEqual(ground(x, y));
    }
    spans++;
  }
  expect(spans).toBeGreaterThan(50);
});

test("authored contact cues follow the same replacement and release with their city", () => {
  const layer = new CampaignCityLayer(new THREE.Scene());
  layer.upload([city], plane(0));
  const object = layer.objects[0],
    contact = object.mesh.children[0] as THREE.Mesh;
  const material = contact.material as THREE.Material;
  expect(material.depthTest).toBe(true);
  expect(material.depthWrite).toBe(false);
  const source = buildCityMesh().shadow.vertices;
  for (const base of [0, 30]) {
    const surface = plane(base);
    layer.seat(surface);
    const positions = contact.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = city.x + positions.getX(i) * object.input.scale;
      const y = city.y + positions.getY(i) * object.input.scale;
      const z = object.mesh.position.z + positions.getZ(i) * object.input.scale;
      const clearance = source[i * 10 + 2] * object.input.scale;
      expect(z - surface.sampleRendered(x, y)!.position[2]).toBeCloseTo(clearance, 4);
    }
  }
  let geometryDisposals = 0,
    materialDisposals = 0;
  contact.geometry.addEventListener("dispose", () => geometryDisposals++);
  material.addEventListener("dispose", () => materialDisposals++);
  layer.upload([], plane(0));
  layer.dispose();
  expect(geometryDisposals).toBe(1);
  expect(materialDisposals).toBe(1);
});
