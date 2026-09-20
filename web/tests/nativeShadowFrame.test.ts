// @vitest-environment node
// Native shadow PACKING: what the fitted single map and the High cascades put
// into the caster cameras and the one receiver block, and when they re-upload.
// The geometry itself is pinned against Three in cascadePolicy.test.ts; here the
// source rig is the reference for the single tier's matrices and bias.
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { NativeShadowFrame } from "../../packages/battle-renderer/src/shadowData";
import {
  SUN_CASCADE_RECORD_FLOATS,
  SUN_SHADOW_BLOCK_FLOATS,
  SUN_SHADOW_CONTROL_OFFSET,
} from "../../packages/battle-renderer/src/shaders/shadow";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "@packages/game-renderer/src/environment/physicalEnvironment";
import {
  CSM_CASCADES,
  CSM_MAP_SIZE,
  SHADOW_BIAS,
  SHADOW_MAX_FAR,
  SINGLE_MAP_SIZE,
  sunShadowRadius,
} from "@packages/game-renderer/src/battle/shadowPolicy";
import { configureSunShadows } from "@packages/photoreal-renderer/src/battle/shadowRig";
import { PHOTOREAL_FAR_FALLBACK } from "@packages/photoreal-renderer/src/cameraBridge";
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
    const native = new NativeShadowFrame(environment, "single", () => {
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
      data.cascades[0].viewProjection.forEach((value, i) =>
        expect(value).toBeCloseTo(vp.elements[i], 5),
      );
      expect(data.receiver[17]).toBeCloseTo(sun.shadow.normalBias, 6);
      // One radius owner: what the source rig set on its Three shadow is what
      // the native block packs, for whatever this preset's turbidity resolves to.
      expect(data.receiver[18]).toBe(Math.fround(sun.shadow.radius));
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
    data.cascades[0].viewProjection.forEach((value, i) =>
      expect(value).toBeCloseTo(vp.elements[i], 5),
    );
    expect(data.crowdViews).toHaveLength(1);
    rig.dispose();
  }
});

test("the fitted single map fills record 0 and leaves the second record unreachable", () => {
  const environment = CIVSIM_ENVIRONMENTS.golden;
  const native = new NativeShadowFrame(environment, "single", () => {});
  native.setWorldRect([-400, -300, 800, 600], [-10, 100]);
  const data = native.update(camera);
  expect(data.receiver).toHaveLength(SUN_SHADOW_BLOCK_FLOATS);
  expect(data.receiver.byteLength).toBe(208);
  expect(data.mapSize).toBe(SINGLE_MAP_SIZE);
  expect(data.cascades).toHaveLength(1);
  // The block is float32; the policy constants are float64 literals.
  expect(data.receiver[16]).toBe(Math.fround(SHADOW_BIAS));
  // The fitted map's texel is a fraction of a cascade texel, so the single tier
  // packs a DELIBERATELY narrower version of the same turbidity radius (golden:
  // 1.252 texels at High). Same five taps, same curve, same clamps underneath.
  expect(data.receiver[18]).toBe(
    Math.fround(sunShadowRadius(environment.physical.turbidity, "single")),
  );
  expect(data.receiver[18]).toBeCloseTo(0.7512, 5);
  // The whole receiver range belongs to the one map; it is sampled directly.
  expect(Array.from(data.receiver.slice(20, 22))).toEqual([0, 1]);
  // Record 1 is initialized and EMPTY, so no code path can select the layer the
  // single-mode depth array does not have.
  const inactive = data.receiver.slice(SUN_CASCADE_RECORD_FLOATS, SUN_CASCADE_RECORD_FLOATS * 2);
  expect(Array.from(inactive.slice(0, 16))).toEqual([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]);
  expect(Array.from(inactive.slice(20, 22))).toEqual([1, 1]);
  expect(inactive[20]).toBe(inactive[21]);
  expect(
    Array.from(data.receiver.slice(SUN_SHADOW_CONTROL_OFFSET, SUN_SHADOW_CONTROL_OFFSET + 2)),
  ).toEqual([Math.min(camera.far!, SHADOW_MAX_FAR), 1]);
});

test("High packs two distinct caster cameras and a two-record receiver block", () => {
  const environment = CIVSIM_ENVIRONMENTS.golden;
  const uploads: number[] = [];
  const native = new NativeShadowFrame(environment, "csm", (data) =>
    uploads.push(data.cascades.length),
  );
  // Cascades ignore the receiver rect: the source derives its boxes from the
  // camera alone, so this must not fit or upload anything.
  const cold = native.setWorldRect([-400, -300, 800, 600], [-10, 100]);
  expect(cold.cascades).toHaveLength(0);
  expect(uploads).toEqual([0]);

  const data = native.update({ ...camera, far: PHOTOREAL_FAR_FALLBACK });
  expect(uploads).toEqual([0, CSM_CASCADES]);
  expect(data.cascades).toHaveLength(CSM_CASCADES);
  expect(data.mapSize).toBe(CSM_MAP_SIZE);
  expect(data.crowdViews).toHaveLength(CSM_CASCADES);
  expect(data.receiver).toHaveLength(SUN_SHADOW_BLOCK_FLOATS);
  // Two SEPARATE camera payloads: sharing one buffer would let both passes see
  // whichever write was queued last.
  const [near, far] = data.cascades;
  expect(near.camera).not.toBe(far.camera);
  expect([...near.camera]).not.toEqual([...far.camera]);
  expect(near.camera[38]).toBe(CSM_MAP_SIZE);
  // Depth bias is scaled by the cascade index; the normal bias is not.
  expect(data.receiver[16]).toBe(Math.fround(SHADOW_BIAS));
  expect(data.receiver[SUN_CASCADE_RECORD_FLOATS + 16]).toBe(Math.fround(SHADOW_BIAS * 2));
  // High keeps the unscaled turbidity radius in both records.
  expect(data.receiver[18]).toBe(
    Math.fround(sunShadowRadius(environment.physical.turbidity, "csm")),
  );
  expect(data.receiver[18]).toBeCloseTo(1.252, 5);
  expect(data.receiver[SUN_CASCADE_RECORD_FLOATS + 18]).toBe(data.receiver[18]);
  expect(data.receiver[SUN_CASCADE_RECORD_FLOATS + 17]).toBe(data.receiver[17]);
  // The two intervals partition [0, 1] with no gap.
  expect(data.receiver[20]).toBe(0);
  expect(data.receiver[21]).toBe(data.receiver[SUN_CASCADE_RECORD_FLOATS + 20]);
  expect(data.receiver[SUN_CASCADE_RECORD_FLOATS + 21]).toBe(1);
  expect(data.receiver[SUN_SHADOW_CONTROL_OFFSET]).toBe(SHADOW_MAX_FAR);
  expect(data.receiver[SUN_SHADOW_CONTROL_OFFSET + 1]).toBe(CSM_CASCADES);
  // Every receiver record carries the SAME matrix its caster pass rendered with.
  data.cascades.forEach((cascade, i) =>
    expect(
      Array.from(
        data.receiver.slice(i * SUN_CASCADE_RECORD_FLOATS, i * SUN_CASCADE_RECORD_FLOATS + 16),
      ),
    ).toEqual(Array.from(cascade.viewProjection)),
  );
});

test("an unchanged camera reuses its cascade fit, a moved one refits", () => {
  let uploads = 0;
  const native = new NativeShadowFrame(CIVSIM_ENVIRONMENTS.golden, "csm", () => {
    uploads++;
  });
  const view = { ...camera, far: PHOTOREAL_FAR_FALLBACK };
  const first = native.update(view);
  expect(uploads).toBe(2);
  expect(native.update({ ...view })).toBe(first);
  expect(uploads).toBe(2);
  const moved = native.update({ ...view, target: [400, -220, 0] });
  expect(uploads).toBe(3);
  expect(moved).not.toBe(first);
  // A camera far change moves the split reference even from the same pose.
  const nearer = native.update({ ...view, target: [400, -220, 0], far: 900 });
  expect(nearer.receiver[SUN_SHADOW_CONTROL_OFFSET]).toBe(900);
  expect(uploads).toBe(4);
});
