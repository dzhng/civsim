// @vitest-environment node
// The pure High-cascade policy, pinned against the Three CSM implementation the
// source tier actually runs (`CSMShadowNode` + `CSMFrustum`, three 0.185.1).
// That rig is the ORACLE here: these tests drive it on the CPU through the same
// camera bridge the product poses it with, and require the renderer-neutral
// policy to reproduce its splits, slice geometry, extents, light poses and
// per-cascade bias. No GPU, no browser — the resource/receiver side is pinned
// separately by the native shadow tests.
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import {
  CASCADE_LIGHT_UP,
  cascadeBlendWeight,
  cascadeBreaks,
  cascadeFits,
  cascadeReceiverDepth,
  resolveCascadeFar,
} from "@packages/game-renderer/src/battle/cascadePolicy";
import {
  CSM_CASCADES,
  CSM_LIGHT_MARGIN,
  CSM_MAP_SIZE,
  SHADOW_BIAS,
  SHADOW_CAM_FAR,
  SHADOW_CAM_NEAR,
  SHADOW_MAX_FAR,
  SHADOW_NORMAL_BIAS,
} from "@packages/game-renderer/src/battle/shadowPolicy";
import {
  applyCamera3d,
  PHOTOREAL_FAR_FALLBACK,
} from "@packages/photoreal-renderer/src/cameraBridge";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "@packages/game-renderer/src/environment/physicalEnvironment";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";

const SUN = photorealEnvironment(CIVSIM_ENVIRONMENTS.golden).sunDirection;

/** Framings the battle rig actually reaches: a tight tactical orbit, the
 *  strategic pull-back, a near-horizon vista, and the rig's own top-down limit
 *  (BATTLE_CURVE.topDownPitch, ~77 degrees). */
const CAMERAS: Record<string, Camera3DParams> = {
  close: {
    target: [0, 0, 0],
    distance: 40,
    pitch: 0.9,
    yaw: -1.2,
    fovY: 0.85,
    aspect: 1.6,
    near: 1,
  },
  wide: {
    target: [120, -60, 4],
    distance: 900,
    pitch: 0.7,
    yaw: 2.1,
    fovY: 0.85,
    aspect: 1.6,
    near: 1,
  },
  horizon: {
    target: [-300, 220, 0],
    distance: 420,
    pitch: 0.08,
    yaw: 0.4,
    fovY: 1.1,
    aspect: 2.3,
    near: 0.5,
  },
  topDown: { target: [0, 0, 0], distance: 260, pitch: 1.35, yaw: 0, fovY: 0.5, aspect: 1, near: 2 },
};

/** The pinned rig, initialised and settled for ONE camera pose. Settled fits are
 *  the geometric oracle; the source's cold/moving admission lag is not. */
function sourceCascades(camera: Camera3DParams, sun: readonly [number, number, number] = SUN) {
  const three = new THREE.PerspectiveCamera();
  applyCamera3d(three, camera);
  three.updateMatrixWorld(true);
  const light = new THREE.DirectionalLight();
  light.position.set(sun[0], sun[1], sun[2]);
  light.target.position.set(0, 0, 0);
  light.shadow.mapSize.set(CSM_MAP_SIZE, CSM_MAP_SIZE);
  light.shadow.camera.near = SHADOW_CAM_NEAR;
  light.shadow.camera.far = SHADOW_CAM_FAR;
  light.shadow.bias = SHADOW_BIAS;
  light.shadow.normalBias = SHADOW_NORMAL_BIAS;
  new THREE.Scene().add(light, light.target);
  const csm = new CSMShadowNode(light, {
    cascades: CSM_CASCADES,
    maxFar: SHADOW_MAX_FAR,
    mode: "practical",
    lightMargin: CSM_LIGHT_MARGIN,
  });
  csm.fade = true;
  (csm as unknown as { _init(input: unknown): void })._init({
    camera: three,
    renderer: {
      coordinateSystem: THREE.WebGPUCoordinateSystem,
      reversedDepthBuffer: true,
    },
  });
  (csm as unknown as { updateBefore(): void }).updateBefore();
  return { csm, three, dispose: () => csm.dispose() };
}

function nativeCascades(camera: Camera3DParams, sun: readonly [number, number, number] = SUN) {
  return cascadeFits({
    camera,
    resolvedFar: PHOTOREAL_FAR_FALLBACK,
    unitSunDirection: sun,
  });
}

test("practical splits reproduce the source breaks for every resolved far", () => {
  for (const [name, base] of Object.entries(CAMERAS))
    for (const far of [800, 1500, 10000, PHOTOREAL_FAR_FALLBACK, undefined]) {
      const camera = { ...base, far };
      const { csm, dispose } = sourceCascades({ ...camera, far: far ?? PHOTOREAL_FAR_FALLBACK });
      const native = nativeCascades(camera);
      expect(native.breaks.length, name).toBe(csm.breaks.length);
      native.breaks.forEach((value, i) => expect(value).toBeCloseTo(csm.breaks[i], 12));
      // The internal break is the mean of the uniform and logarithmic half-range
      // depths over the CAPPED far — not over the camera's own far plane.
      const { near, cappedFar } = native;
      expect(native.breaks[0]).toBeCloseTo(
        ((near + cappedFar) / 2 + Math.sqrt(near * cappedFar)) / 2 / cappedFar,
        12,
      );
      dispose();
    }
});

test("an absent, infinite or sentinel far resolves to a bounded shadow range, never zero", () => {
  const base = CAMERAS.wide;
  const bounded = resolveCascadeFar({ camera: { ...base, far: undefined }, resolvedFar: 1e7 });
  expect(bounded.cappedFar).toBe(SHADOW_MAX_FAR);
  expect(bounded.projectionFar).toBe(1e7);
  // The extent reference stays the RESOLVED far, not the capped one.
  expect(bounded.extentFar).toBe(1e7);
  for (const far of [undefined, Infinity, 0])
    expect(resolveCascadeFar({ camera: { ...base, far }, resolvedFar: 1e7 })).toEqual(bounded);
  expect(cascadeBreaks(base.near, bounded.cappedFar).at(-1)).toBe(1);
  expect(() =>
    resolveCascadeFar({ camera: { ...base, near: 10, far: 10 }, resolvedFar: 1e7 }),
  ).toThrow(/at or behind/);
  expect(() =>
    resolveCascadeFar({ camera: { ...base, far: undefined }, resolvedFar: Infinity }),
  ).toThrow(/finite resolved far/);
});

test("slice corners, extents, light poses and bias match the settled source fit", () => {
  for (const [name, base] of Object.entries(CAMERAS))
    for (const far of [800, 1500, 10000, PHOTOREAL_FAR_FALLBACK]) {
      const camera = { ...base, far };
      const { csm, three, dispose } = sourceCascades(camera);
      const native = nativeCascades(camera);
      expect(native.cascades.length).toBe(CSM_CASCADES);
      native.cascades.forEach((fit, i) => {
        const where = `${name} far=${far} cascade=${i}`;
        const frustum = csm.frustums[i];
        const expected = [...frustum.vertices.near, ...frustum.vertices.far].map((v) =>
          v.clone().applyMatrix4(three.matrixWorld),
        );
        fit.corners.forEach((corner, c) => {
          expectClose(corner[0], expected[c].x, `${where} corner ${c}.x`);
          expectClose(corner[1], expected[c].y, `${where} corner ${c}.y`);
          expectClose(corner[2], expected[c].z, `${where} corner ${c}.z`);
        });
        const source = csm.lights[i];
        const bounds = source.shadow!.camera;
        expectClose(fit.extent, bounds.right - bounds.left, `${where} extent`);
        expect(fit.worldUnitsPerTexel).toBeCloseTo(fit.extent / CSM_MAP_SIZE, 12);
        // The centre snap is a FLOOR on a light-space coordinate this stack
        // computes in float32 and three in float64, so a centre that lands on a
        // grid boundary can floor one texel apart. The extent and the slice
        // corners above are exact; the pose agrees within its own quantum.
        for (const axis of [0, 1, 2]) {
          expectClose(
            fit.position[axis],
            source.position.getComponent(axis),
            `${where} position`,
            2e-6,
            fit.worldUnitsPerTexel,
          );
          expectClose(
            fit.target[axis],
            source.target!.position.getComponent(axis),
            `${where} target`,
            2e-6,
            fit.worldUnitsPerTexel,
          );
        }
        expect(fit.depthBias).toBeCloseTo(source.shadow!.bias, 12);
        expect(fit.normalBias).toBe(SHADOW_NORMAL_BIAS);
        expect([fit.near, fit.far]).toEqual([SHADOW_CAM_NEAR, SHADOW_CAM_FAR]);
        expect(fit.up).toEqual(CASCADE_LIGHT_UP);
      });
      dispose();
    }
});

test("cascade projections cover every world point their own slice contains", () => {
  const camera = { ...CAMERAS.wide, far: PHOTOREAL_FAR_FALLBACK };
  const native = nativeCascades(camera);
  for (const fit of native.cascades)
    for (const corner of fit.corners) {
      const clip = apply(fit.viewProjection, [corner[0], corner[1], corner[2], 1]);
      // Light-plane coverage is what the fit promises; the depth range is the
      // caster reach and is checked by the light-margin push below.
      expect(Math.abs(clip[0] / clip[3])).toBeLessThanOrEqual(1 + 1e-4);
      expect(Math.abs(clip[1] / clip[3])).toBeLessThanOrEqual(1 + 1e-4);
      expect(clip[2] / clip[3]).toBeLessThanOrEqual(1 + 1e-4);
    }
});

test("light centres snap by floor onto their own texel grid and clear the slice by the margin", () => {
  for (const [name, base] of Object.entries(CAMERAS)) {
    const camera = { ...base, far: PHOTOREAL_FAR_FALLBACK };
    const native = nativeCascades(camera);
    for (const fit of native.cascades) {
      const depthAxis = unit(fit.position, fit.target);
      const centre = dot(fit.position, depthAxis);
      const deepest = Math.max(...fit.corners.map((corner) => dot(corner, depthAxis)));
      expect(centre - deepest, `${name} light margin`).toBeCloseTo(CSM_LIGHT_MARGIN, 3);
      // Snapping is FLOOR, so the snapped centre never sits past the unsnapped
      // one: the residual is in [0, one texel).
      const right = [
        CASCADE_LIGHT_UP[1] * depthAxis[2] - CASCADE_LIGHT_UP[2] * depthAxis[1],
        CASCADE_LIGHT_UP[2] * depthAxis[0] - CASCADE_LIGHT_UP[0] * depthAxis[2],
        CASCADE_LIGHT_UP[0] * depthAxis[1] - CASCADE_LIGHT_UP[1] * depthAxis[0],
      ];
      const length = Math.hypot(...right);
      const axis = right.map((v) => v / length);
      const projected = dot(fit.position, axis);
      const residual = projected / fit.worldUnitsPerTexel;
      expect(Math.abs(residual - Math.round(residual))).toBeLessThan(1e-3);
    }
  }
});

test("a moving camera refits the same frame it is culled on", () => {
  // The source positions its cascade lights during render update, so its own
  // pre-render culling views lag a pan. The native policy is pure: the fit is a
  // function of the camera handed in, so a pan cannot produce a prior-frame box.
  const base = { ...CAMERAS.wide, far: PHOTOREAL_FAR_FALLBACK };
  let previous = nativeCascades(base);
  for (const step of [40, 120, 400, -600]) {
    const moved = {
      ...base,
      target: [base.target[0] + step, base.target[1], base.target[2]] as [number, number, number],
    };
    const next = nativeCascades(moved);
    const { csm, three, dispose } = sourceCascades(moved);
    next.cascades.forEach((fit, i) => {
      const source = csm.lights[i];
      for (const axis of [0, 1, 2])
        expectClose(
          fit.position[axis],
          source.position.getComponent(axis),
          `pan cascade ${i}`,
          2e-6,
          fit.worldUnitsPerTexel,
        );
      // Every corner of the slice this camera just produced is inside the box
      // fitted for it — the property a lagged fit loses.
      for (const corner of fit.corners) {
        const clip = apply(fit.viewProjection, [corner[0], corner[1], corner[2], 1]);
        expect(Math.abs(clip[0] / clip[3])).toBeLessThanOrEqual(1 + 1e-4);
        expect(Math.abs(clip[1] / clip[3])).toBeLessThanOrEqual(1 + 1e-4);
      }
    });
    expect(next.cascades[0].position).not.toEqual(previous.cascades[0].position);
    expect(three.matrixWorld.elements.length).toBe(16);
    previous = next;
    dispose();
  }
});

test("adjacent blend weights partition the overlap and fade out at the capped far", () => {
  const camera = { ...CAMERAS.wide, far: PHOTOREAL_FAR_FALLBACK };
  const native = nativeCascades(camera);
  const [first, last] = native.cascades;
  const at = (depth: number) => [
    cascadeBlendWeight(depth, first.interval, { first: true, last: false }),
    cascadeBlendWeight(depth, last.interval, { first: false, last: true }),
  ];
  // The whole nearest half of cascade 0 is unblended.
  for (const depth of [0, 0.01, first.interval[1] / 4]) expect(at(depth)).toEqual([1, 0]);
  // Across the internal overlap the two weights partition unity.
  const margin = 0.25 * first.interval[1] ** 2;
  for (let t = 0; t <= 1; t += 1 / 32) {
    const depth = first.interval[1] - margin / 2 + t * margin;
    const [a, b] = at(depth);
    expect(a + b).toBeCloseTo(1, 6);
    expect(Math.min(a, b)).toBeGreaterThanOrEqual(0);
  }
  // The last cascade fades to unshadowed at its own far limit, which is where
  // the capped far lands in receiver depth.
  expect(at(1)[1]).toBeCloseTo(0, 6);
  expect(at(1.0001)).toEqual([0, 0]);
  expect(cascadeReceiverDepth(-native.cappedFar, native)).toBeCloseTo(1, 12);
  expect(cascadeReceiverDepth(-native.near, native)).toBeCloseTo(0, 12);
});

test("a zero-margin interval stays defined rather than leaking a 0/0 weight", () => {
  for (const depth of [0, 0.25, 0.5, 1])
    expect(Number.isFinite(cascadeBlendWeight(depth, [0, 0], { first: false, last: true }))).toBe(
      true,
    );
  expect(cascadeBlendWeight(0, [0, 0], { first: false, last: true })).toBe(1);
});

test("a shader split sits n*(1-break) farther out than the geometric slice plane", () => {
  for (const near of [0.5, 1, 2]) {
    const camera = { ...CAMERAS.wide, near, far: PHOTOREAL_FAR_FALLBACK };
    const native = nativeCascades(camera);
    const geometric = native.breaks[0] * native.cappedFar;
    // The shader's split plane is where receiver depth equals the break.
    const shaderPlane = near + native.breaks[0] * (native.cappedFar - near);
    expect(shaderPlane - geometric).toBeCloseTo(near * (1 - native.breaks[0]), 9);
    expect(shaderPlane - geometric).toBeLessThanOrEqual(near);
  }
});

test("a near-vertical camera diverges in the SHARED camera basis, not in this policy", () => {
  // mat4.lookAt swaps its up vector once forward is within ~2.6 degrees of it;
  // three nudges instead, so the two cameras differ by a roll there and every
  // downstream fit differs with them. That belongs to the one projection owner,
  // and the battle rig never asks for it (BATTLE_CURVE tops out at 1.35 rad).
  const degenerate = {
    ...CAMERAS.topDown,
    aspect: 1.6,
    pitch: Math.PI / 2 - 0.01,
    far: PHOTOREAL_FAR_FALLBACK,
  };
  const { csm, dispose } = sourceCascades(degenerate);
  const native = nativeCascades(degenerate);
  const source = csm.lights[0].position;
  const drift = Math.max(
    ...[0, 1, 2].map((axis) =>
      Math.abs(native.cascades[0].position[axis] - source.getComponent(axis)),
    ),
  );
  expect(drift).toBeGreaterThan(native.cascades[0].worldUnitsPerTexel * 8);
  dispose();
  // At the rig's own limit the same comparison holds to single precision.
  const limit = { ...CAMERAS.topDown, aspect: 1.6, far: PHOTOREAL_FAR_FALLBACK };
  const settled = sourceCascades(limit);
  const fitted = nativeCascades(limit);
  for (const axis of [0, 1, 2])
    expectClose(
      fitted.cascades[0].position[axis],
      settled.csm.lights[0].position.getComponent(axis),
      "rig top-down limit",
      2e-6,
      fitted.cascades[0].worldUnitsPerTexel,
    );
  settled.dispose();
});

test("the light basis follows the source's fixed Y-up, not the battle camera's Z-up", () => {
  for (const environment of Object.values(CIVSIM_ENVIRONMENTS)) {
    const sun = photorealEnvironment(environment).sunDirection;
    const camera = { ...CAMERAS.close, far: PHOTOREAL_FAR_FALLBACK };
    const { csm, dispose } = sourceCascades(camera, sun);
    const native = cascadeFits({
      camera,
      resolvedFar: PHOTOREAL_FAR_FALLBACK,
      unitSunDirection: sun,
    });
    native.cascades.forEach((fit, i) => {
      for (const axis of [0, 1, 2])
        expectClose(
          fit.position[axis],
          csm.lights[i].position.getComponent(axis),
          environment.id,
          2e-6,
          fit.worldUnitsPerTexel,
        );
    });
    dispose();
  }
});

/** The native matrix stack is float32 where three keeps float64, so agreement
 *  is a RELATIVE bound at single precision — not a fixed number of decimals on
 *  quantities that run from a fraction of a unit to a few thousand of them. */
function expectClose(
  actual: number,
  expected: number,
  label: string,
  relative = 2e-6,
  absolute = 0,
): void {
  const tolerance = absolute + relative * Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
    tolerance,
  );
}

function apply(m: ArrayLike<number>, v: [number, number, number, number]) {
  return [0, 1, 2, 3].map(
    (row) => m[row] * v[0] + m[row + 4] * v[1] + m[row + 8] * v[2] + m[row + 12] * v[3],
  );
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function unit(from: readonly number[], to: readonly number[]): number[] {
  const d = [from[0] - to[0], from[1] - to[1], from[2] - to[2]];
  const length = Math.hypot(...d) || 1;
  return d.map((v) => v / length);
}
