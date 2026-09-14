// @vitest-environment node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import * as THREE from "three/webgpu";
import { generatedFormation, type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import { assignLodForProjection, DEFAULT_LOD_POLICY } from "@packages/crowd-runtime/src/lod";
import {
  planCrowdLods,
  createCrowdLodBuffers,
  type CrowdProjectionView,
} from "@packages/crowd-runtime/src/visibility";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { projectionFootprint } from "@packages/renderer-core/src/camera3d";
import { createCrowdDrawMesh } from "@packages/photoreal-renderer/src/battle/crowdLayer";
import { configureSunShadows } from "@packages/photoreal-renderer/src/battle/shadowRig";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import type { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";

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

test("projected LOD keeps the exact pre-optimization audience sequence", () => {
  // Captured on 5657d660 before changing arithmetic/storage. This is an exactness
  // pin, not an art-quality or performance gate. Fixed inputs include culled,
  // near-plane, elevated, mounted and asymmetric corpse bounds.
  const fixtureAssets = {
    0: {
      manifest: { bounds: { center: [0.13, -0.21, 0.9] as [number, number, number], radius: 1.3 } },
    },
  };
  const policy = { l0Pixels: 18, l1Pixels: 9, l2Pixels: 4, minScreenPixels: 2.25 };
  const rows: unknown[] = [];
  let mainHistory: number[] = [];
  let shadowHistory: number[] = [];
  const reusable = createCrowdLodBuffers(24);
  for (const [frame, count] of [24, 24, 12, 0, 24, 24].entries()) {
    const instances = Array.from({ length: count }, (_, i) => ({
      ...body(i % 3 === 0 ? 0 : (i - 12) * 30, [-100, 0, 10, 150, 300, 1000][i % 6]),
      mounted: i % 2 === 0,
      facing: i * 0.73,
      alive: i % 4 === 0,
      elevation: i % 3 === 0 ? 0 : i * 0.7,
    }));
    const views =
      frame === 1
        ? [shadowView(100)]
        : frame === 2
          ? [mainView()]
          : [mainView(), shadowView(1000), shadowView(130.50966799187808, frame * 10)];
    const plan = planCrowdLods(
      instances,
      views,
      fixtureAssets,
      mainHistory,
      policy,
      shadowHistory,
      reusable,
    );
    // Preserve the pre-buffer serialized shape and exact golden, not typed-array JSON.
    rows.push({
      assignments: Array.from(plan.levels.slice(0, count), (level, i) => ({
        level,
        screenSize: plan.screenSizes[i],
      })),
      counts: plan.counts,
      shadowAssignments: Array.from(plan.shadowLevels.slice(0, count), (level, i) => ({
        level,
        screenSize: plan.shadowScreenSizes[i],
      })),
      shadowCounts: plan.shadowCounts,
      visibility: plan.visibility.slice(0, count),
      viewVisible: plan.viewVisible,
      shadowOnly: plan.shadowOnly,
    });
    mainHistory = Array.from(plan.levels.slice(0, count));
    shadowHistory = Array.from(plan.shadowLevels.slice(0, count));
  }
  const serialized = JSON.stringify(rows, (_key, value) =>
    typeof value === "number" && !Number.isFinite(value) ? String(value) : value,
  );
  assert.equal(
    createHash("sha256").update(serialized).digest("hex"),
    "b909f671d1ae98a8c6ecf58cf91898f9a1808750370c4cb9f6be6e655de7a78a",
  );
});

test("production LOD follows projected depth and exits L0 for the visible 150m mounted body", () => {
  const instances = [10, 150, 300, 1000].map((y) => ({ ...body(0, y), mounted: true }));
  const plan = planCrowdLods(instances, [mainView()], assets);
  assert.deepEqual(Array.from(plan.levels), [0, 1, 2, 3]);
  assert.equal(plan.viewVisible, 4);
  assert.equal(plan.shadowOnly, 0);
  assert.ok(plan.screenSizes[1] < 16.5);
  assert.equal(planCrowdLods([instances[1]], [mainView()], assets, [0]).levels[0], 1);
  assert.deepEqual(plan.counts, { l0: 1, l1: 1, l2: 1, l3: 1 });
});

test("unseen bodies make no view contribution while retaining the policy floor", () => {
  const plan = planCrowdLods([body(0, -100)], [mainView()], assets);
  assert.equal(plan.visibility[0], 0);
  assert.equal(plan.screenSizes[0], DEFAULT_LOD_POLICY.minScreenPixels);
  assert.equal(plan.levels[0], 3);
});

test("a shadow caster does not replace the main view's distant impostor", () => {
  const plan = planCrowdLods([body(0, 1000)], [mainView(), shadowView()], assets);
  assert.equal(plan.visibility[0], 3);
  assert.equal(plan.levels[0], 3);
  assert.equal(plan.shadowLevels[0], 2);
  assert.deepEqual(plan.shadowCounts, { l0: 0, l1: 0, l2: 1, l3: 0 });
});

test("isolated mounted oracle needs the same initial shadow history as production", () => {
  const instance = { ...body(0, 0), mounted: true };
  // Production workbench terrain is 128m square, with the existing 40m shadow margin.
  const views = [mainView(), shadowView(Math.hypot(128, 128) / 2 + 40)];
  const retained = planCrowdLods([instance], views, assets, [], undefined, [2]);
  const fresh = planCrowdLods([instance], views, assets, [], undefined, []);
  assert.ok(Math.abs(fresh.shadowScreenSizes[0] - 10.239241433693344) < 1e-10);
  assert.equal(retained.shadowLevels[0], 2);
  assert.equal(fresh.shadowLevels[0], 1);
  assert.deepEqual(retained.levels, fresh.levels);
  assert.deepEqual(retained.screenSizes, fresh.screenSizes);
});

test("removing shadow views leaves the main representation and its hysteresis unchanged", () => {
  const instance = body(0, 1000);
  const withShadow = planCrowdLods([instance], [mainView(), shadowView()], assets);
  const withoutShadow = planCrowdLods(
    [instance],
    [mainView()],
    assets,
    [withShadow.levels[0]],
    undefined,
    [withShadow.shadowLevels[0]],
  );
  assert.deepEqual(withoutShadow.levels, withShadow.levels);
  assert.deepEqual(withoutShadow.screenSizes, withShadow.screenSizes);
  assert.equal(withoutShadow.visibility[0], 1);
  assert.deepEqual(withoutShadow.shadowCounts, { l0: 0, l1: 0, l2: 0, l3: 0 });
});

test("production size uses each body's actual terrain elevation", () => {
  const plan = planCrowdLods(
    [body(0, 150), { ...body(0, 150), elevation: 20 }],
    [mainView()],
    assets,
  );
  assert.deepEqual(Array.from(plan.visibility), [1, 1]);
  assert.ok(plan.screenSizes[1] > plan.screenSizes[0]);
});

test("unchanged hysteresis applies to measured pixels and shadow casters remain meshes", () => {
  assert.equal(assignLodForProjection(17.5, false, 0).level, 0);
  assert.equal(assignLodForProjection(18.5, false, 1).level, 1);
  assert.equal(assignLodForProjection(16.49, false, 0).level, 1);
  assert.equal(assignLodForProjection(19.51, false, 1).level, 0);
  const plan = planCrowdLods([body(0, -100)], [mainView(), shadowView()], assets);
  assert.equal(plan.visibility[0], 2);
  assert.equal(plan.viewVisible, 0);
  assert.equal(plan.shadowOnly, 1);
  assert.equal(plan.levels[0], 3);
  assert.equal(plan.shadowLevels[0], 2);
});

test("the production mesh selected for a shadow-only body really casts shadows", () => {
  const plan = planCrowdLods([body(0, -100)], [mainView(), shadowView()], assets);
  const geometries = Array.from({ length: 3 }, () => new THREE.InstancedBufferGeometry());
  const materials = Array.from({ length: 3 }, () => new THREE.MeshStandardNodeMaterial());
  const meshes = geometries.map((geometry, lod) =>
    createCrowdDrawMesh(0, lod, geometry, materials[lod], "shadow"),
  );
  assert.equal(meshes[plan.shadowLevels[0]].castShadow, true);
  assert.deepEqual(
    meshes.map((mesh) => mesh.castShadow),
    [true, true, true],
  );
  assert.ok(meshes.every((mesh) => !mesh.receiveShadow));
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
});

test("a finer shadow map changes only the shadow audience", () => {
  const instance = body(0, 150);
  const coarse = planCrowdLods([instance], [mainView(), shadowView()], assets);
  const fine = planCrowdLods([instance], [mainView(), shadowView(20, 150)], assets);
  assert.equal(coarse.levels[0], 1);
  assert.equal(fine.levels[0], 1);
  assert.equal(coarse.shadowLevels[0], 2);
  assert.equal(fine.shadowLevels[0], 0);
  assert.equal(fine.visibility[0], 3);
});

test("actual single and cascade cameras see shadow meshes but the main camera cannot", () => {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 2000);
  const geometry = new THREE.InstancedBufferGeometry();
  const material = new THREE.MeshStandardNodeMaterial();
  const main = createCrowdDrawMesh(0, 0, geometry, material, "main");
  const caster = createCrowdDrawMesh(0, 2, geometry, material, "shadow");
  assert.equal(main.castShadow, false);
  assert.equal(main.layers.test(camera.layers), true);
  assert.equal(caster.layers.test(camera.layers), false);
  for (const mode of ["single", "csm"] as const) {
    // Renderer/device is the boundary; real shadow configuration and CSM setup run here.
    const renderer = {
      shadowMap: {},
      coordinateSystem: THREE.WebGPUCoordinateSystem,
      reversedDepthBuffer: false,
    } as unknown as THREE.WebGPURenderer;
    const sun = new THREE.DirectionalLight();
    sun.position.set(0, -100, 200);
    const scene = new THREE.Scene();
    scene.add(sun, sun.target);
    const rig = configureSunShadows(renderer, sun, CIVSIM_ENVIRONMENTS.golden, mode);
    let cameras: THREE.Camera[] = [sun.shadow.camera];
    if (mode === "csm") {
      const csm = sun.shadow.shadowNode as CSMShadowNode;
      // Public setup creates the actual cloned cascade cameras without a GPU render.
      csm.setup({ camera, renderer } as unknown as Parameters<CSMShadowNode["setup"]>[0]);
      cameras = csm.lights.map((light) => {
        assert.ok(light.shadow);
        return light.shadow.camera;
      });
      assert.equal(cameras.length, rig.identity().cascades);
    }
    for (const shadowCamera of cameras) {
      assert.equal(caster.layers.test(shadowCamera.layers), true);
      assert.equal(
        main.layers.test(shadowCamera.layers),
        true,
        "ordinary world layers remain admitted",
      );
      assert.notEqual(
        shadowCamera.layers.mask & 0xfffffffe,
        0,
        "Three must not replace this mask with the main-camera mask",
      );
    }
    rig.dispose();
  }
  geometry.dispose();
  material.dispose();
});

test("near-plane bounds keep full detail and corpse shading never moves authored bounds", () => {
  const view = mainView();
  const near = { ...body(0, -3), elevation: 2.3 };
  const plan = planCrowdLods([near], [view], assets);
  assert.equal(plan.visibility[0], 1);
  assert.equal(plan.levels[0], 0);
  assert.equal(plan.screenSizes[0], Infinity);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9 - 0.15);
  const halfspace = {
    ...view,
    frustum: new THREE.Frustum(...Array.from({ length: 6 }, () => plane.clone())),
  };
  const upright: CrowdInstance = {
    ...body(0, 0),
    alive: false,
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
  const admission = planCrowdLods([upright, fallen], [halfspace], assets);
  assert.deepEqual(
    Array.from(admission.visibility),
    [0, 0],
    "Changing death shading weight must not rotate the authored bounding sphere into view",
  );
  assert.equal(admission.levels[0], admission.levels[1]);
  assert.equal(admission.screenSizes[0], admission.screenSizes[1]);
});

test("projected LOD reuses both audience buffers and clears only the active visibility prefix", () => {
  const instances = [body(0, 10), body(0, 150), body(0, 300), body(0, 1000)];
  const out = createCrowdLodBuffers(8);
  out.visibility.fill(255);
  const first = planCrowdLods(
    instances,
    [mainView(), shadowView()],
    assets,
    undefined,
    undefined,
    undefined,
    out,
  );
  for (const key of [
    "levels",
    "shadowLevels",
    "screenSizes",
    "shadowScreenSizes",
    "visibility",
  ] as const)
    assert.equal(first[key], out[key]);
  assert.deepEqual(Array.from(first.levels.slice(0, 4)), [0, 1, 2, 3]);
  assert.equal(first.counts.l0 + first.counts.l1 + first.counts.l2 + first.counts.l3, 4);
  assert.equal(out.visibility[4], 255, "capacity tail is not an active soldier");
  const priorMain = out.levels.slice(0, 4);
  const priorShadow = out.shadowLevels.slice(0, 4);
  const expected = planCrowdLods(
    instances.slice(0, 2),
    [mainView()],
    assets,
    priorMain,
    undefined,
    priorShadow,
  );
  const reused = planCrowdLods(
    instances.slice(0, 2),
    [mainView()],
    assets,
    out.levels.subarray(0, 4),
    undefined,
    out.shadowLevels.subarray(0, 4),
    out,
  );
  assert.deepEqual(reused.levels.slice(0, 2), expected.levels);
  assert.deepEqual(reused.shadowLevels.slice(0, 2), expected.shadowLevels);
  assert.deepEqual(Array.from(reused.visibility.slice(0, 2)), [1, 1]);
  assert.deepEqual(reused.counts, expected.counts);
  assert.deepEqual(reused.shadowCounts, { l0: 0, l1: 0, l2: 0, l3: 0 });
});
