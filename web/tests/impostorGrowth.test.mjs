// @vitest-environment node
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import Attributes from "three/src/renderers/common/Attributes.js";
import Geometries from "three/src/renderers/common/Geometries.js";
import { AttributeType } from "three/src/renderers/common/Constants.js";
import { OctahedralImpostorLayer } from "@packages/photoreal-renderer/src/crowd/impostorLayer";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";

test("rendered impostor growth retires prior GPU attribute generations and re-admits static geometry", () => {
  const scene = new THREE.Scene();
  const layer = new OctahedralImpostorLayer(scene, {
    textures: {
      albedo: new THREE.Texture(),
      normal: new THREE.Texture(),
      orm: new THREE.Texture(),
    },
    dispose() {},
    metrics: { allocatedBytes: 0, bakeMs: 0, drawCalls: 1 },
    tileSize: 96,
    columns: 2,
    rows: 1,
    worldSpan: 4,
    center: new THREE.Vector3(0, 0, 1),
    directions: [new THREE.Vector3(0, -1, 1).normalize(), new THREE.Vector3(-1, 0, 1).normalize()],
  });
  const instance = generatedFormation(1)[0];
  layer.upload([instance]);
  const mesh = scene.children[0];
  const resident = new Set();
  const allocatedBytes = () => [...resident].reduce((sum, a) => sum + a.array.byteLength, 0);
  const backend = {
    createAttribute: (a) => resident.add(a),
    createIndexAttribute: (a) => resident.add(a),
    destroyAttribute: (a) => resident.delete(a),
    updateAttribute: () => {},
  };
  const info = {
    memory: { geometries: 0 },
    createAttribute: () => {},
    createIndexAttribute: () => {},
    destroyAttribute: () => {},
  };
  const attributes = new Attributes(backend, info);
  const geometries = new Geometries(attributes, info);
  const admit = () => {
    const current = Object.values(mesh.geometry.attributes);
    const renderObject = { geometry: mesh.geometry, getAttributes: () => current };
    if (!geometries.has(renderObject)) geometries.initGeometry(renderObject);
    for (const a of current) attributes.update(a, AttributeType.VERTEX);
    attributes.update(mesh.geometry.index, AttributeType.INDEX);
    expect(resident.size).toBe(current.length + 1);
    expect(allocatedBytes()).toBe(
      current.reduce((sum, a) => sum + a.array.byteLength, 0) +
        mesh.geometry.index.array.byteLength,
    );
  };
  admit();
  for (const count of [513, 1025]) {
    const old = mesh.geometry.getAttribute("impostorInst");
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.index;
    layer.upload(Array.from({ length: count }, () => instance));
    expect(resident.has(old)).toBe(false);
    expect(mesh.geometry.getAttribute("position")).toBe(position);
    expect(mesh.geometry.index).toBe(index);
    expect(resident.size).toBe(0);
    admit();
    expect(mesh.geometry.instanceCount).toBe(count);
  }
  layer.upload([instance]);

  layer.dispose();
  expect(resident.size).toBe(0);
  expect(allocatedBytes()).toBe(0);
  expect(info.memory.geometries).toBe(0);
});
