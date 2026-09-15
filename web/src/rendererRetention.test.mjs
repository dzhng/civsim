// @vitest-environment node
import { expect, test, vi } from "vitest";
import { Texture, RenderTarget } from "three/src/Three.Core.js";
import Textures from "three/src/renderers/common/Textures.js";
import Info from "three/src/renderers/common/Info.js";

function textureOwner() {
  const backend = {
    createDefaultTexture() {},
    createTexture() {},
    destroyTexture: vi.fn(),
    delete() {},
  };
  return new Textures({}, backend, new Info());
}

test("retiring a texture owner removes only its callbacks from a shared texture", () => {
  const texture = new Texture();
  const retired = textureOwner();
  const live = textureOwner();
  retired.updateTexture(texture);
  const retiredCallback = texture._listeners.dispose[0];
  live.updateTexture(texture);
  const liveCallback = texture._listeners.dispose[1];

  retired.dispose();
  retired.dispose();

  expect(retired.backend.destroyTexture).not.toHaveBeenCalled();
  expect(texture.hasEventListener("dispose", retiredCallback)).toBe(false);
  expect(texture.hasEventListener("dispose", liveCallback)).toBe(true);
  texture.dispose();
  expect(texture.hasEventListener("dispose", liveCallback)).toBe(false);
});

import { BufferGeometry, Camera, Mesh, MeshBasicMaterial, Scene } from "three/src/Three.Core.js";
import RenderObjects from "three/src/renderers/common/RenderObjects.js";

function renderOwner(sourceMaterial) {
  const renderer = { _currentSourceMaterial: sourceMaterial, contextNode: { id: 0, version: 0 } };
  const nodes = { getCacheKey: () => 0, delete() {} };
  return new RenderObjects(renderer, nodes, {}, { delete() {} }, { deleteForRender() {} }, {});
}

function renderObject(owner, mesh) {
  return owner.createRenderObject(
    owner.nodes,
    owner.geometries,
    owner.renderer,
    mesh,
    mesh.material,
    new Scene(),
    new Camera(),
    {},
    {},
    null,
  );
}

test("retiring a render owner detaches its shared geometry, material and source callbacks", () => {
  const mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
  const source = new MeshBasicMaterial();
  const retired = renderOwner(source);
  const live = renderOwner(source);
  const oldObject = renderObject(retired, mesh);
  const liveObject = renderObject(live, mesh);

  retired.dispose();
  retired.dispose();

  expect(mesh.geometry.hasEventListener("dispose", oldObject.onGeometryDispose)).toBe(false);
  expect(mesh.material.hasEventListener("dispose", oldObject.onMaterialDispose)).toBe(false);
  expect(source.hasEventListener("dispose", oldObject.onMaterialDispose)).toBe(false);
  expect(mesh.geometry.hasEventListener("dispose", liveObject.onGeometryDispose)).toBe(true);
  liveObject.dispose();
  expect(mesh.geometry.hasEventListener("dispose", liveObject.onGeometryDispose)).toBe(false);
});

test("texture-owner teardown also releases shared render-target listeners", () => {
  const target = new RenderTarget(1, 1, { depthBuffer: false });
  const retired = textureOwner();
  const live = textureOwner();
  retired.updateRenderTarget(target);
  const retiredCallback = target._listeners.dispose[0];
  live.updateRenderTarget(target);
  const liveCallback = target._listeners.dispose[1];

  retired.dispose();

  expect(target.hasEventListener("dispose", retiredCallback)).toBe(false);
  expect(target.hasEventListener("dispose", liveCallback)).toBe(true);
  expect(retired.backend.destroyTexture).not.toHaveBeenCalled();
  target.dispose();
  expect(target.hasEventListener("dispose", liveCallback)).toBe(false);
  expect(live.backend.destroyTexture).toHaveBeenCalledTimes(1);
});
