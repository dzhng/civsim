// @vitest-environment node
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { OctahedralImpostorLayer } from "@packages/photoreal-renderer/src/battle/impostorLayer";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";

test("far views use the same facing basis as the skinned mesh and its offset anchor", () => {
  const scene = new THREE.Scene();
  const layer = new OctahedralImpostorLayer(scene, {
    texture: new THREE.CanvasTexture(undefined),
    tileSize: 96,
    columns: 2,
    rows: 1,
    worldSpan: 4,
    center: new THREE.Vector3(0.4, 0, 1),
    directions: [new THREE.Vector3(0, -1, 1).normalize(), new THREE.Vector3(-1, 0, 1).normalize()],
  });
  try {
    const instance = { ...generatedFormation(1)[0], x: 0, y: 0, facing: Math.PI / 2, elevation: 0 };
    layer.upload([instance]);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, -10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    layer.setCamera(camera);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.geometry.getAttribute("impostorInst").getX(0)).toBeCloseTo(0.4);
    // Facing pi/2 is the mesh's unrotated pose, so the camera sees its -Y side.
    expect(mesh.geometry.getAttribute("impostorMeta").getX(0)).toBe(0);
  } finally {
    layer.dispose();
  }
});
