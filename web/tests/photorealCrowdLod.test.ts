// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import * as THREE from "three/webgpu";
import { generatedFormation, type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import { assignLodForContributions, DEFAULT_LOD_POLICY } from "@packages/crowd-runtime/src/lod";
import {
  planPhotorealCrowdLods,
  type CrowdProjectionView,
} from "@packages/photoreal-renderer/src/battle/crowdLod";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { projectionFootprint } from "@packages/renderer-core/src/camera3d";
import { createCrowdDrawMesh } from "@packages/photoreal-renderer/src/battle/crowdLayer";

const assets = {
  0: { manifest: { bounds: { center: [0, 0, 0.9] as [number, number, number], radius: 0.9 } } },
};
const body = (x: number, y: number) => ({ ...generatedFormation(1)[0], x, y });
function projectionView(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  height: number,
  shadow = false,
): CrowdProjectionView {
  camera.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  return {
    frustum: new THREE.Frustum().setFromProjectionMatrix(
      matrix,
      camera.coordinateSystem,
      camera.reversedDepth,
    ),
    projection: projectionFootprint(
      camera.matrixWorldInverse.elements,
      camera.projectionMatrix.elements,
      height,
      camera.near,
    ),
    shadow,
  };
}
function mainView() {
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, {
    target: [0, 0, 2.368040807505029],
    distance: 3.5,
    pitch: 0.24,
    yaw: -Math.PI / 2,
    fovY: 0.85,
    aspect: 1.6,
    near: 1,
  });
  return projectionView(camera, 800);
}
function shadowView(extent = 1000, y = 0) {
  const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 1, 1000);
  camera.position.set(0, y, 300);
  camera.lookAt(0, y, 0);
  return projectionView(camera, 1024, true);
}

test("production LOD follows projected depth and exits L0 for the visible 150m mounted body", () => {
  const instances = [10, 150, 300, 1000].map((y) => ({ ...body(0, y), mounted: true }));
  const plan = planPhotorealCrowdLods(instances, [mainView()], assets);
  assert.deepEqual(
    plan.assignments.map((a) => a.level),
    [0, 1, 2, 3],
  );
  assert.equal(plan.viewVisible, 4);
  assert.equal(plan.shadowOnly, 0);
  assert.ok(plan.assignments[1].screenSize < 16.5);
  assert.equal(
    planPhotorealCrowdLods([instances[1]], [mainView()], assets, [0]).assignments[0].level,
    1,
  );
  assert.deepEqual(plan.counts, { l0: 1, l1: 1, l2: 1, l3: 1 });
});

test("unseen bodies make no view contribution while retaining the policy floor", () => {
  const plan = planPhotorealCrowdLods([body(0, -100)], [mainView()], assets);
  assert.equal(plan.visibility[0], 0);
  assert.equal(plan.assignments[0].screenSize, DEFAULT_LOD_POLICY.minScreenPixels);
  assert.equal(plan.assignments[0].level, 3);
});

test("production size uses each body's actual terrain elevation", () => {
  const plan = planPhotorealCrowdLods(
    [body(0, 150), { ...body(0, 150), elevation: 20 }],
    [mainView()],
    assets,
  );
  assert.deepEqual(Array.from(plan.visibility), [1, 1]);
  assert.ok(plan.assignments[1].screenSize > plan.assignments[0].screenSize);
});

test("unchanged hysteresis applies to measured pixels and shadow casters remain meshes", () => {
  assert.equal(assignLodForContributions(17.5, 0, 0).level, 0);
  assert.equal(assignLodForContributions(18.5, 0, 1).level, 1);
  assert.equal(assignLodForContributions(16.49, 0, 0).level, 1);
  assert.equal(assignLodForContributions(19.51, 0, 1).level, 0);
  const plan = planPhotorealCrowdLods([body(0, -100)], [mainView(), shadowView()], assets);
  assert.equal(plan.visibility[0], 2);
  assert.equal(plan.viewVisible, 0);
  assert.equal(plan.shadowOnly, 1);
  assert.equal(plan.assignments[0].level, 2);
});

test("the production mesh selected for a shadow-only body really casts shadows", () => {
  const plan = planPhotorealCrowdLods([body(0, -100)], [mainView(), shadowView()], assets);
  const geometries = Array.from({ length: 3 }, () => new THREE.InstancedBufferGeometry());
  const materials = Array.from({ length: 3 }, () => new THREE.MeshStandardNodeMaterial());
  const meshes = geometries.map((geometry, lod) =>
    createCrowdDrawMesh(0, lod, geometry, materials[lod]),
  );
  assert.equal(meshes[plan.assignments[0].level].castShadow, true);
  assert.deepEqual(
    meshes.map((mesh) => mesh.castShadow),
    [true, true, true],
  );
  assert.ok(meshes.every((mesh) => mesh.receiveShadow));
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
});

test("a finer contributing shadow map wins without changing the view camera", () => {
  const instance = body(0, 150);
  const coarse = planPhotorealCrowdLods([instance], [mainView(), shadowView()], assets);
  const fine = planPhotorealCrowdLods([instance], [mainView(), shadowView(20, 150)], assets);
  assert.equal(coarse.assignments[0].level, 1);
  assert.equal(fine.assignments[0].level, 0);
  assert.equal(fine.visibility[0], 3);
});

test("near-plane bounds keep full detail and corpse roll still controls view admission", () => {
  const view = mainView();
  const near = { ...body(0, -3), elevation: 2.3 };
  const plan = planPhotorealCrowdLods([near], [view], assets);
  assert.equal(plan.visibility[0], 1);
  assert.equal(plan.assignments[0].level, 0);
  assert.equal(plan.assignments[0].screenSize, Infinity);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9 - 0.15);
  const halfspace = {
    ...view,
    frustum: new THREE.Frustum(...Array.from({ length: 6 }, () => plane.clone())),
  };
  const upright: CrowdInstance = {
    ...body(0, 0),
    alive: false,
    deathVariant: 0,
    playback: {
      appearanceId: 0,
      base: {
        source: { kind: "clip", sample: { clip: "idle", phase: 0 } },
        destination: { clip: "death_a", phase: 0 },
        weight: 0,
      },
    },
  };
  const fallen: CrowdInstance = {
    ...upright,
    playback: { ...upright.playback!, base: { ...upright.playback!.base, weight: 1 } },
  };
  const rolled = planPhotorealCrowdLods([upright, fallen], [halfspace], assets);
  assert.notEqual(rolled.visibility[0], rolled.visibility[1]);
});
