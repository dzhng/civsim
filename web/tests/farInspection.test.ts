// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import * as THREE from "three/webgpu";
import { farAdmissionCamera } from "../scenes/models/_far-inspection";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { projectionFootprint } from "@packages/renderer-core/src/camera3d";
import { planPhotorealCrowdLods } from "@packages/photoreal-renderer/src/crowd/crowdLod";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import type { BattleCameraSnapshot } from "@packages/photoreal-renderer/src/battle/battleWorld";

test("far inspection admits real projected impostors without changing the magnified reference", () => {
  const near: BattleCameraSnapshot = {
    x: 0,
    y: 0,
    zoom: 80,
    zoomT: 0,
    camera3d: {
      target: [0, 0, 0.9],
      distance: 2000,
      pitch: 1.15,
      yaw: 0.15,
      fovY: 0.006,
      aspect: 1.6,
      near: 1,
    },
  };
  const original = structuredClone(near);
  const far = farAdmissionCamera(near);
  const instances = [{ ...generatedFormation(1)[0], x: 0, y: 0, mounted: true }];
  const assets = {
    0: { manifest: { bounds: { center: [0, 0, 0.9] as [number, number, number], radius: 2 } } },
  };
  const plan = (view: BattleCameraSnapshot) => {
    const camera = new THREE.PerspectiveCamera();
    applyCamera3d(camera, view.camera3d);
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    return planPhotorealCrowdLods(
      instances,
      [
        {
          frustum: new THREE.Frustum().setFromProjectionMatrix(
            matrix,
            camera.coordinateSystem,
            camera.reversedDepth,
          ),
          projection: projectionFootprint(
            camera.matrixWorldInverse.elements,
            camera.projectionMatrix.elements,
            800,
            camera.near,
          ),
          shadow: false,
        },
      ],
      assets,
      [0],
    );
  };
  assert.equal(plan(near).levels[0], 0);
  assert.equal(plan(far).visibility[0], 1);
  assert.equal(plan(far).levels[0], 3, "scalar zoom alone cannot change projected admission");
  assert.ok(plan(far).screenSizes[0] <= 2.5);
  assert.deepEqual(near, original);
  assert.deepEqual(far.camera3d.target, near.camera3d.target);
  assert.equal(far.camera3d.yaw, near.camera3d.yaw);
  assert.equal(far.camera3d.pitch, near.camera3d.pitch);
});
