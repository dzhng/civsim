// @vitest-environment node
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { NativeShadowFrame } from "../../apps/battle-perf-lab/src/shadowData";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "@packages/game-renderer/src/environment/physicalEnvironment";
import { configureSunShadows } from "@packages/photoreal-renderer/src/battle/shadowRig";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";

const camera: Camera3DParams = {
  target: [0, 0, 0],
  distance: 160,
  pitch: 0.5,
  yaw: -Math.PI / 2,
  fovY: 0.85,
  aspect: 1.6,
  near: 1,
  far: 10000,
};

test("native camera packing follows the real Three rig through zoom and terrain replacement", () => {
  for (const environment of Object.values(CIVSIM_ENVIRONMENTS)) {
    const sun = new THREE.DirectionalLight();
    sun.position.set(...photorealEnvironment(environment).sunDirection);
    sun.shadow.camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
    Object.assign(sun.shadow.camera, { _reversedDepth: true });
    const rig = configureSunShadows(
      {
        shadowMap: {},
        coordinateSystem: THREE.WebGPUCoordinateSystem,
        reversedDepthBuffer: true,
      } as unknown as THREE.WebGPURenderer,
      sun,
      environment,
      "single",
    );
    let writes = 0;
    const native = new NativeShadowFrame(environment, () => {
      writes++;
    });
    const rect: [number, number, number, number] = [-1200, -800, 2400, 1600];
    rig.setWorldRect(rect, [-3, 360]);
    native.setWorldRect(rect, [-3, 360]);
    for (const distance of [64, 65, 160, 320, 900, 3200, 600, 64]) {
      const view = { ...camera, distance };
      rig.update(view);
      const data = native.update(view);
      const sourceViews = rig.cullingViews();
      data.crowdViews[0].frustum.planes.forEach((plane, i) => {
        const expected = sourceViews[0].frustum.planes[i];
        expect(plane.normal.x).toBeCloseTo(expected.normal.x, 5);
        expect(plane.normal.y).toBeCloseTo(expected.normal.y, 5);
        expect(plane.normal.z).toBeCloseTo(expected.normal.z, 5);
        // Native projection matrices are float32; constants are world meters.
        expect(Math.abs(plane.constant - expected.constant)).toBeLessThan(0.001);
      });
      sun.shadow.camera.updateMatrixWorld(true);
      const vp = new THREE.Matrix4().multiplyMatrices(
        sun.shadow.camera.projectionMatrix,
        sun.shadow.camera.matrixWorldInverse,
      );
      data.viewProjection.forEach((value, i) => expect(value).toBeCloseTo(vp.elements[i], 5));
      expect(data.state[17]).toBeCloseTo(sun.shadow.normalBias, 6);
      const count = writes;
      expect(native.update(view)).toBe(data);
      expect(writes).toBe(count);
    }
    rig.setWorldRect([-400, -300, 800, 600], [-10, 100]);
    const data = native.setWorldRect([-400, -300, 800, 600], [-10, 100]);
    rig.cullingViews();
    sun.shadow.camera.updateMatrixWorld(true);
    const vp = new THREE.Matrix4().multiplyMatrices(
      sun.shadow.camera.projectionMatrix,
      sun.shadow.camera.matrixWorldInverse,
    );
    data.viewProjection.forEach((value, i) => expect(value).toBeCloseTo(vp.elements[i], 5));
    expect(data.crowdViews).toHaveLength(1);
    rig.dispose();
  }
});
