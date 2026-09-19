// @vitest-environment node
// The whole-map shadow control, consumed through a build that carries it (see
// ../vitest.config.mts). Every import below resolves to the TRANSFORMED shared
// policy, so these are the controlled build's own answers, not a re-derivation
// of what the control was supposed to do.
import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import {
  SHADOW_NORMAL_BIAS,
  SINGLE_MAP_SIZE,
  SingleShadowPolicy,
  singleShadowFit,
  type ShadowViewFit,
} from "@packages/game-renderer/src/battle/shadowPolicy";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "@packages/game-renderer/src/environment/physicalEnvironment";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";
import {
  resetShadowFitControlReport,
  SHADOW_FIT_CONTROL_GLOBAL,
  shadowFitControlReport,
  type ShadowFitControlReport,
} from "../shadowFitControlReport";

// The production battle field and the two framings the zoom rig produces at its
// endpoints, matching web/tests/shadowViewFit.test.ts so the two files describe
// the same workload from opposite sides.
const RECT: [number, number, number, number] = [-1200, -800, 2400, 1600];
const ELEVATION: [number, number] = [-3, 12];
const SUN = photorealEnvironment(CIVSIM_ENVIRONMENTS.golden).sunDirection;
const DUSK = photorealEnvironment(CIVSIM_ENVIRONMENTS.dusk).sunDirection;
const TACTICAL: Camera3DParams = {
  target: [0, 0, 0],
  distance: 10,
  pitch: 0.3,
  yaw: -Math.PI / 2,
  fovY: 0.85,
  aspect: 1.6,
  near: 1,
};

/** The map the original rig rasterised for a rect: the shared policy's own
 *  whole-map fallback, read straight off the unmodified `singleShadowFit`. */
function originalMap(rect: readonly [number, number, number, number], sun = SUN) {
  const whole = singleShadowFit(rect, sun);
  return {
    ...whole,
    extent: whole.right - whole.left,
    worldUnitsPerTexel: (whole.right - whole.left) / SINGLE_MAP_SIZE,
  };
}

function assertIsOriginal(
  fit: ShadowViewFit,
  expected: ReturnType<typeof originalMap>,
  at: string,
) {
  for (const key of ["left", "right", "top", "bottom", "near", "far", "extent"] as const)
    assert.equal(fit[key], expected[key], `${at}: ${key} left the original whole-map fit`);
  assert.deepEqual(fit.position, expected.position, `${at}: the light moved off the map centre`);
  assert.deepEqual(fit.target, expected.target, `${at}: the light aimed off the map centre`);
  assert.equal(fit.worldUnitsPerTexel, expected.worldUnitsPerTexel, `${at}: texel density moved`);
  assert.equal(fit.normalBias, SHADOW_NORMAL_BIAS, `${at}: the original 0.6 normal offset moved`);
}

/** The poses a 60-second pan/zoom/orbit trace visits: both zoom endpoints, both
 *  horizon and top-down pitches, and targets driven to the far corners of the
 *  field, so "the camera moved" is not one nudge. */
function* trace(): Generator<Camera3DParams> {
  for (const distance of [10, 40, 200, 900, 3200])
    for (const pitch of [0.02, 0.3, 0.7, 1.35])
      for (const yaw of [-Math.PI / 2, 0, 2.1])
        for (const target of [
          [0, 0, 0],
          [-1100, -700, 4],
          [1100, 700, -2],
        ] as const)
          yield { ...TACTICAL, distance, pitch, yaw, target: [...target] };
}

beforeEach(() => resetShadowFitControlReport());

test("a camera that pans, zooms and orbits keeps the original whole-map map", () => {
  const policy = new SingleShadowPolicy(SUN);
  policy.setWorldRect(RECT, ELEVATION, SUN);
  const expected = originalMap(RECT);
  const settled = policy.refits;
  let poses = 0;
  for (const camera of trace()) {
    policy.update(camera, SUN);
    poses++;
    assertIsOriginal(policy.fit, expected, `pose ${poses}`);
    assert.equal(
      policy.refits,
      settled,
      `pose ${poses} rebuilt the shadow map; the control must hold one map across camera motion`,
    );
  }
  assert.ok(poses > 100, `the trace only visited ${poses} poses`);
  // The density the spec's canonical terrain diagnostic recorded for the former
  // whole-map policy: six soldiers to a texel, which is the cost build B pays.
  assert.ok(
    Math.abs(policy.fit.worldUnitsPerTexel - 2.8949619339562416) < 1e-9,
    `2400x1600 must resolve the canonical 2.894962 units/texel, got ${policy.fit.worldUnitsPerTexel}`,
  );
});

test("a new terrain rect refits the whole map to it, mid-trace", () => {
  const policy = new SingleShadowPolicy(SUN);
  policy.setWorldRect(RECT, ELEVATION, SUN);
  policy.update(TACTICAL, SUN);
  const wide: [number, number, number, number] = [-400, -2000, 800, 4000];
  policy.setWorldRect(wide, [-40, 90], SUN);
  assertIsOriginal(policy.fit, originalMap(wide), "after the field changed");
  assert.notEqual(policy.fit.extent, originalMap(RECT).extent, "the new field was ignored");
  // And the new map, not the old one, is what survives further camera motion.
  for (const camera of trace()) policy.update(camera, SUN);
  assertIsOriginal(policy.fit, originalMap(wide), "after the field changed, still moving");
});

test("a new sun re-poses the same map instead of freezing the old light", () => {
  const policy = new SingleShadowPolicy(SUN);
  policy.setWorldRect(RECT, ELEVATION, SUN);
  policy.update(TACTICAL, SUN);
  const golden = policy.fit.position;
  policy.update(TACTICAL, DUSK);
  assertIsOriginal(policy.fit, originalMap(RECT, DUSK), "after the sun moved");
  assert.notDeepEqual(policy.fit.position, golden, "the light did not follow the sun");
  // Position minus target must still reproduce the direction the environment owns.
  const back = [0, 1, 2].map((i) => policy.fit.position[i] - policy.fit.target[i]);
  const length = Math.hypot(...back);
  for (let i = 0; i < 3; i++)
    assert.ok(Math.abs(back[i] / length - DUSK[i]) < 1e-12, `the fit rotated the sun: ${back}`);
});

test("the build reports which fit ran, not only which one was requested", () => {
  const policy = new SingleShadowPolicy(SUN);
  policy.setWorldRect(RECT, ELEVATION, SUN);
  for (const camera of trace()) policy.update(camera, SUN);
  const report = shadowFitControlReport();
  assert.equal(report.control, "whole-map-original");
  assert.ok(report.fits > 100, `only ${report.fits} controlled fits were observed`);
  assert.equal(report.distinctMaps, 1, "camera motion rasterised more than one map");
  const expected = originalMap(RECT);
  assert.equal(report.latest?.extent, expected.extent);
  assert.equal(report.latest?.worldUnitsPerTexel, expected.worldUnitsPerTexel);
  assert.equal(report.latest?.normalBias, SHADOW_NORMAL_BIAS);
  assert.deepEqual(report.latest?.position, expected.position);

  // A page-side capture harness cannot import this module, so the same report
  // has to be reachable the way it will actually be read.
  const published = (globalThis as Record<string, unknown>)[SHADOW_FIT_CONTROL_GLOBAL] as
    | ShadowFitControlReport
    | undefined;
  assert.equal(published?.control, "whole-map-original");
  assert.equal(published?.distinctMaps, 1);
  assert.equal(published?.latest?.worldUnitsPerTexel, expected.worldUnitsPerTexel);
});
