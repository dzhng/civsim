// @vitest-environment node
// The whole-map shadow control, consumed through a build that carries it (see
// ../vitest.config.mts). Every import below resolves to the TRANSFORMED shared
// policy, so these are the controlled build's own answers, not a re-derivation
// of what the control was supposed to do.
import assert from "node:assert/strict";
import { test } from "vitest";
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
  SHADOW_FIT_CONTROL_GLOBAL,
  shadowFitControlReport,
  type ShadowFitControlReport,
} from "../shadowFitControlReport";

// The production battle field and the two framings the zoom rig produces at its
// endpoints, matching web/tests/shadowViewFit.test.ts so the two files describe
// the same workload from opposite sides.
const RECT: [number, number, number, number] = [-1200, -800, 2400, 1600];
const ELEVATION: [number, number] = [-3, 12];
// A second field, differing from RECT in extent, so a fit that ignored a
// terrain change — or a report answering for the wrong policy — is visible.
const WIDE: [number, number, number, number] = [-400, -2000, 800, 4000];
const WIDE_ELEVATION: [number, number] = [-40, 90];
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

/** The map the original rig fitted for a rect: the shared policy's own
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
  policy.setWorldRect(WIDE, WIDE_ELEVATION, SUN);
  assertIsOriginal(policy.fit, originalMap(WIDE), "after the field changed");
  assert.notEqual(policy.fit.extent, originalMap(RECT).extent, "the new field was ignored");
  // And the new map, not the old one, is what survives further camera motion.
  for (const camera of trace()) policy.update(camera, SUN);
  assertIsOriginal(policy.fit, originalMap(WIDE), "after the field changed, still moving");
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

test("the report answers out of the policy the build installed", () => {
  const policy = new SingleShadowPolicy(SUN);
  policy.setWorldRect(RECT, ELEVATION, SUN);
  for (const camera of trace()) policy.update(camera, SUN);
  const expected = originalMap(RECT);

  const report = shadowFitControlReport();
  assert.equal(report.control, "whole-map-original");
  assert.ok(report.observed, "the controlled build registered no policy to read");
  assert.equal(report.refits, policy.refits, "the report counted fits of its own");
  assert.equal(report.fit?.extent, expected.extent);
  assert.equal(report.fit?.worldUnitsPerTexel, expected.worldUnitsPerTexel);
  assert.equal(report.fit?.normalBias, SHADOW_NORMAL_BIAS);
  assert.deepEqual(report.fit?.position, expected.position);

  // A page-side capture harness cannot import this module, so the same answer
  // has to be reachable the way it will actually be read.
  const published = (globalThis as Record<string, unknown>)[SHADOW_FIT_CONTROL_GLOBAL] as
    | ShadowFitControlReport
    | undefined;
  assert.equal(published?.control, "whole-map-original");
  assert.equal(published?.refits, policy.refits);
  assert.equal(published?.fit?.worldUnitsPerTexel, expected.worldUnitsPerTexel);
});

test("every read is its own snapshot, taken when it is read", () => {
  const policy = new SingleShadowPolicy(SUN);
  policy.setWorldRect(RECT, ELEVATION, SUN);
  const before = shadowFitControlReport();
  assert.equal(before.fit?.extent, originalMap(RECT).extent);

  // The snapshot is a copy, in both directions: the reader holds none of the
  // policy's own arrays, and editing what it holds reaches nobody else.
  assert.notEqual(before.fit?.position, policy.fit.position, "the reader holds the policy's array");
  assert.notEqual(
    before.fit?.position,
    shadowFitControlReport().fit?.position,
    "two reads share one array",
  );
  if (before.fit) before.fit.extent = -1;
  assert.notEqual(policy.fit.extent, -1, "a reader's edit reached the policy");
  assert.equal(shadowFitControlReport().fit?.extent, originalMap(RECT).extent);

  // A later refit reaches the next read, and never the snapshot already handed out.
  policy.setWorldRect(WIDE, WIDE_ELEVATION, SUN);
  const after = shadowFitControlReport();
  assert.equal(after.fit?.extent, originalMap(WIDE).extent, "the read was cached, not taken now");
  assert.equal(before.fit?.extent, -1, "a handed-out snapshot moved under its reader");
  assert.ok(
    (after.refits ?? 0) > (before.refits ?? 0),
    "the owner's own refit count did not reach the report",
  );
});

test("the report answers for the policy the build is running now", () => {
  // Registration is latest-only. Each build has one live shadow owner, so a
  // second policy means the first has been replaced, and the report must say
  // so rather than keep answering for the world that was torn down.
  const retired = new SingleShadowPolicy(SUN);
  retired.setWorldRect(RECT, ELEVATION, SUN);
  const current = new SingleShadowPolicy(SUN);
  current.setWorldRect(WIDE, WIDE_ELEVATION, SUN);
  current.update(TACTICAL, SUN);

  assert.notEqual(originalMap(WIDE).extent, originalMap(RECT).extent, "the two are the same map");
  const report = shadowFitControlReport();
  assert.equal(
    report.fit?.extent,
    originalMap(WIDE).extent,
    "the report answered for the retired policy",
  );
  assert.equal(report.refits, current.refits);
});
