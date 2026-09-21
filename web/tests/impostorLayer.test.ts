// @vitest-environment node
import { expect, test, vi } from "vitest";
import * as THREE from "three/webgpu";
import { OctahedralImpostorLayer } from "@packages/photoreal-renderer/src/battle/impostorLayer";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";

function createLayer() {
  const scene = new THREE.Scene();
  const dispose = vi.fn();
  const layer = new OctahedralImpostorLayer(scene, {
    textures: {
      albedo: new THREE.Texture(),
      normal: new THREE.Texture(),
      orm: new THREE.Texture(),
    },
    dispose,
    metrics: { allocatedBytes: 0, bakeMs: 0, drawCalls: 1 },
    tileSize: 96,
    columns: 2,
    rows: 1,
    worldSpan: 4,
    center: new THREE.Vector3(0.4, 0, 1),
    directions: [new THREE.Vector3(0, -1, 1).normalize(), new THREE.Vector3(-1, 0, 1).normalize()],
  });
  return { scene, layer, dispose };
}

test("far views use the same facing basis as the skinned mesh and its offset anchor", () => {
  const { scene, layer, dispose } = createLayer();
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
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    expect(mesh.geometry.getAttribute("impostorMeta").getW(0)).toBe(0);
    expect(mesh.geometry.getAttribute("impostorLiving").getX(0)).toBe(1);
    layer.upload([{ ...instance, facing: Math.PI, alive: false }]);
    layer.setCamera(camera);
    expect(mesh.geometry.getAttribute("impostorMeta").getW(0)).toBeCloseTo(Math.PI / 2);
    expect(mesh.geometry.getAttribute("impostorInst").getY(0)).toBeCloseTo(0.4);
    expect(mesh.geometry.getAttribute("impostorLiving").getX(0)).toBe(0);
    for (const weight of [0, 0.5, 1]) {
      layer.upload([
        {
          ...instance,
          alive: false,
          playback: {
            appearanceId: 0,
            base: {
              source: { kind: "clip", sample: { clip: "idle", phase: 0 } },
              destination: { clip: "death", phase: 0.8 },
              weight,
            },
          },
        },
      ]);
      layer.setCamera(camera);
      expect(mesh.geometry.getAttribute("impostorLiving").getX(0)).toBe(1 - weight);
    }
  } finally {
    layer.dispose();
  }
  expect(dispose).toHaveBeenCalledTimes(1);
});

test("billboard camera packing skips equal views and invalidates on camera or source changes", () => {
  const { scene, layer } = createLayer();
  try {
    const instance = generatedFormation(1)[0];
    layer.upload([instance]);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, -10, 10);
    camera.lookAt(0, 0, 0);
    layer.setCamera(camera);
    const mesh = scene.children[0] as THREE.Mesh;
    const metadata = mesh.geometry.getAttribute("impostorMeta") as THREE.InstancedBufferAttribute;
    const version = metadata.version;
    layer.setCamera(camera);
    layer.setCamera(camera.clone());
    expect(metadata.version).toBe(version);
    camera.fov = 30;
    layer.setCamera(camera);
    expect(metadata.version).toBe(version + 1);
    const parent = new THREE.Group();
    parent.add(camera);
    parent.position.x = 1;
    layer.setCamera(camera);
    expect(metadata.version).toBe(version + 2);
    layer.setCamera(camera);
    expect(metadata.version).toBe(version + 2);
    layer.upload([{ ...instance, facing: instance.facing + 1 }]);
    const uploadedVersion = metadata.version;
    layer.setCamera(camera);
    expect(metadata.version).toBe(uploadedVersion + 1);
  } finally {
    layer.dispose();
  }
});
