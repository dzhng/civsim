// @vitest-environment node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import * as THREE from "three/webgpu";
import { generatedFormation, type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import {
  assignLodForProjection,
  assignLodForScreenSize,
  COARSEST_SHADOW_LOD,
  DEFAULT_LOD_POLICY,
  emptyLodCounts,
  IMPOSTOR_LEVEL,
  lodWithHysteresis,
  type LodCounts,
  type LodLevel,
  type LodPolicy,
} from "@packages/crowd-runtime/src/lod";
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

/** Exactness pin, not an art-quality or performance gate. Fixed inputs include
 * culled, near-plane, elevated, mounted and asymmetric corpse bounds. */
function audienceSequenceHash(
  policy: LodPolicy,
  level: (level: number) => number = (value) => value,
  counts: (counts: LodCounts) => object = (value) => value,
) {
  const fixtureAssets = {
    0: {
      manifest: { bounds: { center: [0.13, -0.21, 0.9] as [number, number, number], radius: 1.3 } },
    },
  };
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
      assignments: Array.from(plan.levels.slice(0, count), (value, i) => ({
        level: level(value),
        screenSize: plan.screenSizes[i],
      })),
      counts: counts(plan.counts),
      shadowAssignments: Array.from(plan.shadowLevels.slice(0, count), (value, i) => ({
        level: level(value),
        screenSize: plan.shadowScreenSizes[i],
      })),
      shadowCounts: counts(plan.shadowCounts),
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
  return createHash("sha256").update(serialized).digest("hex");
}

test("projected LOD keeps its exact four-mesh audience sequence", () => {
  assert.equal(
    audienceSequenceHash({ meshPixels: [32, 18, 9, 4], minScreenPixels: 2.25 }),
    "abb54b79c2ef83ab21a826f50b791b24eb74dbefe737c13266e1af3813090e78",
  );
});

test("an unreachable near boundary reproduces the three-mesh audience sequence", () => {
  // Captured on 5657d660 with boundaries 18/9/4 and the impostor at level 3. Only
  // Infinity (the near plane) still reaches level 0, which both chains draw fully.
  const hash = audienceSequenceHash(
    { meshPixels: [Number.MAX_VALUE, 18, 9, 4], minScreenPixels: 2.25 },
    (level) => Math.max(0, level - 1),
    ({ l0, l1, l2, l3, l4 }) => ({ l0: l0 + l1, l1: l2, l2: l3, l3: l4 }),
  );
  assert.equal(hash, "b909f671d1ae98a8c6ecf58cf91898f9a1808750370c4cb9f6be6e655de7a78a");
});

test("production LOD follows projected depth through every mesh tier to the impostor", () => {
  const instances = [10, 100, 150, 300, 1000].map((y) => ({ ...body(0, y), mounted: true }));
  const plan = planCrowdLods(instances, [mainView()], assets);
  assert.deepEqual(Array.from(plan.levels), [0, 1, 2, 3, 4]);
  assert.equal(plan.viewVisible, 5);
  assert.equal(plan.shadowOnly, 0);
  assert.ok(plan.screenSizes[2] < 16.5);
  // A near history leaves directly for the tier the 150m body actually needs.
  assert.equal(planCrowdLods([instances[2]], [mainView()], assets, [0]).levels[0], 2);
  assert.deepEqual(plan.counts, { l0: 1, l1: 1, l2: 1, l3: 1, l4: 1 });
});

test("unseen bodies make no view contribution while retaining the policy floor", () => {
  const plan = planCrowdLods([body(0, -100)], [mainView()], assets);
  assert.equal(plan.visibility[0], 0);
  assert.equal(plan.screenSizes[0], DEFAULT_LOD_POLICY.minScreenPixels);
  assert.equal(plan.levels[0], IMPOSTOR_LEVEL);
});

test("a shadow caster does not replace the main view's distant impostor", () => {
  const plan = planCrowdLods([body(0, 1000)], [mainView(), shadowView()], assets);
  assert.equal(plan.visibility[0], 3);
  assert.equal(plan.levels[0], IMPOSTOR_LEVEL);
  assert.equal(plan.shadowLevels[0], COARSEST_SHADOW_LOD);
  assert.deepEqual(plan.shadowCounts, { l0: 0, l1: 0, l2: 0, l3: 1, l4: 0 });
});

test("isolated mounted oracle needs the same initial shadow history as production", () => {
  const instance = { ...body(0, 0), mounted: true };
  // Production workbench terrain is 128m square, with the existing 40m shadow margin.
  const views = [mainView(), shadowView(Math.hypot(128, 128) / 2 + 40)];
  const retained = planCrowdLods([instance], views, assets, [], undefined, [3]);
  const fresh = planCrowdLods([instance], views, assets, [], undefined, []);
  assert.ok(Math.abs(fresh.shadowScreenSizes[0] - 10.239241433693344) < 1e-10);
  assert.equal(retained.shadowLevels[0], 3);
  assert.equal(fresh.shadowLevels[0], 2);
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
  assert.deepEqual(withoutShadow.shadowCounts, emptyLodCounts());
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

test("hysteresis applies to measured pixels and shadow casters remain meshes", () => {
  assert.equal(assignLodForProjection(31.5, false, 0).level, 0);
  assert.equal(assignLodForProjection(32.5, false, 1).level, 1);
  assert.equal(assignLodForProjection(30.49, false, 0).level, 1);
  assert.equal(assignLodForProjection(33.51, false, 1).level, 0);
  const plan = planCrowdLods([body(0, -100)], [mainView(), shadowView()], assets);
  assert.equal(plan.visibility[0], 2);
  assert.equal(plan.viewVisible, 0);
  assert.equal(plan.shadowOnly, 1);
  assert.equal(plan.levels[0], IMPOSTOR_LEVEL);
  assert.equal(plan.shadowLevels[0], COARSEST_SHADOW_LOD);
  assert.deepEqual(plan.shadowCounts, { l0: 0, l1: 0, l2: 0, l3: 1, l4: 0 });
});

// Deliberately uneven boundaries, so each interval is identified by its own edge.
const chain: LodPolicy = { meshPixels: [40, 20, 10, 5], minScreenPixels: 2 };

test("each mesh tier owns its projected interval and smaller bodies draw the impostor", () => {
  const sizes = [41, 40, 39.9, 20, 19.9, 10, 9.9, 5, 4.9, 1];
  assert.deepEqual(
    sizes.map((size) => assignLodForScreenSize(size, chain)),
    [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
  // Shadow demand is floored at the coarsest mesh; it never selects the impostor.
  assert.deepEqual(
    sizes.map((size) => assignLodForProjection(size, true, undefined, chain).level),
    [0, 0, 1, 1, 2, 2, 3, 3, 3, 3],
  );
});

test("every boundary, including the impostor return, holds inside its deadband", () => {
  for (const [edge, pixels] of chain.meshPixels.entries()) {
    const finer = edge as LodLevel,
      coarser = (edge + 1) as LodLevel;
    assert.equal(lodWithHysteresis(coarser, pixels + 1.49, chain), coarser, `enter ${finer}`);
    assert.equal(lodWithHysteresis(coarser, pixels + 1.5, chain), finer, `enter ${finer}`);
    assert.equal(lodWithHysteresis(finer, pixels - 1.49, chain), finer, `leave ${finer}`);
    assert.equal(lodWithHysteresis(finer, pixels - 1.5, chain), coarser, `leave ${finer}`);
  }
  assert.equal(lodWithHysteresis(IMPOSTOR_LEVEL, 6, chain), IMPOSTOR_LEVEL);
  assert.equal(lodWithHysteresis(IMPOSTOR_LEVEL, 6.5, chain), IMPOSTOR_LEVEL - 1);
});

test("multi-level jumps commit only past the destination's own boundary", () => {
  // Zooming in from the impostor: the size must clear the near edge, not just any edge.
  assert.equal(lodWithHysteresis(4, 41, chain), 4);
  assert.equal(lodWithHysteresis(4, 41.5, chain), 0);
  assert.equal(lodWithHysteresis(4, 21.5, chain), 1);
  // Zooming out from near: the previous tier holds until the destination is cleared.
  assert.equal(lodWithHysteresis(0, 4, chain), 0);
  assert.equal(lodWithHysteresis(0, 3.5, chain), 4);
  assert.equal(lodWithHysteresis(0, 8.5, chain), 3);
  // A rapid reversal returns without visiting the tiers crossed on the way out.
  const history = [30, 3, 45, 12, 2].reduce<LodLevel[]>(
    (levels, size) => [...levels, lodWithHysteresis(levels.at(-1) ?? 1, size, chain)],
    [],
  );
  assert.deepEqual(history, [1, 4, 0, 2, 4]);
});

test("the production mesh selected for a shadow-only body really casts shadows", () => {
  const plan = planCrowdLods([body(0, -100)], [mainView(), shadowView()], assets);
  const geometries = Array.from(
    { length: IMPOSTOR_LEVEL },
    () => new THREE.InstancedBufferGeometry(),
  );
  const materials = geometries.map(() => new THREE.MeshStandardNodeMaterial());
  const meshes = geometries.map((geometry, lod) =>
    createCrowdDrawMesh(0, lod, geometry, materials[lod], "shadow"),
  );
  assert.equal(meshes[plan.shadowLevels[0]].castShadow, true);
  assert.deepEqual(
    meshes.map((mesh) => mesh.castShadow),
    [true, true, true, true],
  );
  assert.ok(meshes.every((mesh) => !mesh.receiveShadow));
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
});

test("a finer shadow map changes only the shadow audience", () => {
  const instance = body(0, 150);
  const coarse = planCrowdLods([instance], [mainView(), shadowView()], assets);
  const fine = planCrowdLods([instance], [mainView(), shadowView(20, 150)], assets);
  assert.equal(coarse.levels[0], 2);
  assert.equal(fine.levels[0], 2);
  assert.equal(coarse.shadowLevels[0], COARSEST_SHADOW_LOD);
  assert.equal(fine.shadowLevels[0], 0);
  assert.equal(fine.visibility[0], 3);
});

test("actual single and cascade cameras see shadow meshes but the main camera cannot", () => {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 2000);
  const geometry = new THREE.InstancedBufferGeometry();
  const material = new THREE.MeshStandardNodeMaterial();
  const main = createCrowdDrawMesh(0, 0, geometry, material, "main");
  const caster = createCrowdDrawMesh(0, COARSEST_SHADOW_LOD, geometry, material, "shadow");
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
  const instances = [10, 60, 150, 300, 1000].map((y) => body(0, y));
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
  assert.deepEqual(Array.from(first.levels.slice(0, 5)), [0, 1, 2, 3, 4]);
  assert.deepEqual(first.counts, { l0: 1, l1: 1, l2: 1, l3: 1, l4: 1 });
  assert.equal(out.visibility[5], 255, "capacity tail is not an active soldier");
  const priorMain = out.levels.slice(0, 5);
  const priorShadow = out.shadowLevels.slice(0, 5);
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
    out.levels.subarray(0, 5),
    undefined,
    out.shadowLevels.subarray(0, 5),
    out,
  );
  assert.deepEqual(reused.levels.slice(0, 2), expected.levels);
  assert.deepEqual(reused.shadowLevels.slice(0, 2), expected.shadowLevels);
  assert.deepEqual(Array.from(reused.visibility.slice(0, 2)), [1, 1]);
  assert.deepEqual(reused.counts, expected.counts);
  assert.deepEqual(reused.shadowCounts, emptyLodCounts());
});
