import assert from "node:assert/strict";
import test from "node:test";
import {
  BATTLE_ZOOM_RIG_LIMITS,
  CAMPAIGN_ZOOM_RIG_LIMITS,
  battleCameraRig,
  campaignCameraRig,
} from "../src/battle/cameraRig.ts";

const range = { min: 1, max: 9 };
const bounds = { width: 900, height: 600 };

// --- Real-camera zoom rig -------------------------------------------------

const zoomStops = [1, 2, 3, 4, 6, 8, 9];

test("battle zoom rig clamps zoomT and endpoints past both ends", () => {
  const out = battleCameraRig(-10, range, bounds);
  const vista = battleCameraRig(99, range, bounds);

  assert.equal(out.zoomT, 0);
  assert.equal(vista.zoomT, 1);
  // zoomed out → near-top-down (pitch toward vertical), narrow fov
  assert.equal(out.pitch, BATTLE_ZOOM_RIG_LIMITS.topDownPitch);
  assert.equal(out.fovY, BATTLE_ZOOM_RIG_LIMITS.topDownFovY);
  // zoomed in → low oblique vista, wide fov
  assert.equal(vista.pitch, BATTLE_ZOOM_RIG_LIMITS.vistaPitch);
  assert.equal(vista.fovY, BATTLE_ZOOM_RIG_LIMITS.vistaFovY);
});

test("battle zoom rig lands near-top-down out and a cinematic vista in", () => {
  const out = battleCameraRig(1, range, bounds);
  const vista = battleCameraRig(9, range, bounds);

  // near-top-down: within ~0.3 rad of straight-down (π/2), FOV narrow
  assert.ok(Math.PI / 2 - out.pitch < 0.3, `top-down pitch ${out.pitch}`);
  assert.ok(out.fovY < 0.6, `top-down fov ${out.fovY}`);
  assert.ok(out.target[0] === 0, "no look-ahead when zoomed out");
  // vista: low oblique, FOV wide, focus pushed forward (−X view direction)
  assert.ok(vista.pitch < 0.35, `vista pitch ${vista.pitch}`);
  assert.ok(vista.fovY > 0.75, `vista fov ${vista.fovY}`);
  assert.ok(vista.target[0] < 0, "look-ahead pushed forward at max zoom");
});

test("battle zoom rig pitch/distance fall and fovY rises monotonically in zoom", () => {
  const stops = zoomStops.map((z) => battleCameraRig(z, range, bounds));
  for (let i = 1; i < stops.length; i++) {
    assert.ok(stops[i].pitch <= stops[i - 1].pitch, `pitch ${i}`);
    assert.ok(stops[i].fovY >= stops[i - 1].fovY, `fovY ${i}`);
    assert.ok(stops[i].distance <= stops[i - 1].distance, `distance ${i}`);
    assert.ok(stops[i].zoomT >= stops[i - 1].zoomT, `zoomT ${i}`);
    assert.ok(stops[i].target[0] <= stops[i - 1].target[0], `look-ahead ${i}`);
  }
});

test("battle zoom rig is continuous across the range (no jumps)", () => {
  let prev = battleCameraRig(1, range, bounds);
  for (let z = 1; z <= 9; z += 0.25) {
    const cur = battleCameraRig(z, range, bounds);
    assert.ok(Math.abs(cur.pitch - prev.pitch) < 0.1, `pitch step at ${z}`);
    assert.ok(Math.abs(cur.fovY - prev.fovY) < 0.05, `fovY step at ${z}`);
    prev = cur;
  }
});

test("battle zoom rig is deterministic for identical inputs", () => {
  assert.deepEqual(battleCameraRig(4.25, range, bounds), battleCameraRig(4.25, range, bounds));
});

test("battle zoom rig distance scales with the field short axis", () => {
  const small = battleCameraRig(-10, range, { width: 400, height: 300 });
  const big = battleCameraRig(-10, range, { width: 1600, height: 1200 });
  assert.ok(big.distance > small.distance, "a bigger field frames from farther out");
});

test("campaign zoom rig stays a flatter, near-top-down chart", () => {
  const bOut = battleCameraRig(1, range, bounds);
  const bIn = battleCameraRig(9, range, bounds);
  const cOut = campaignCameraRig(1, range, bounds);
  const cIn = campaignCameraRig(9, range, bounds);

  // Campaign starts flatter (more vertical) and never drops as low as battle.
  assert.ok(cOut.pitch > bOut.pitch, "campaign top-down is more vertical");
  assert.ok(cIn.pitch > bIn.pitch, "campaign vista stays flatter than battle");
  assert.equal(cOut.pitch, CAMPAIGN_ZOOM_RIG_LIMITS.topDownPitch);
  assert.equal(cIn.pitch, CAMPAIGN_ZOOM_RIG_LIMITS.vistaPitch);
  // easeBias > 1 keeps campaign near top-down past the midpoint.
  const cMid = campaignCameraRig(5, range, bounds);
  assert.ok(
    cMid.pitch > (CAMPAIGN_ZOOM_RIG_LIMITS.topDownPitch + CAMPAIGN_ZOOM_RIG_LIMITS.vistaPitch) / 2,
    "stays top-down longer",
  );
});

test("campaign zoom rig pitch/distance fall and fovY rises monotonically", () => {
  const stops = zoomStops.map((z) => campaignCameraRig(z, range, bounds));
  for (let i = 1; i < stops.length; i++) {
    assert.ok(stops[i].pitch <= stops[i - 1].pitch, `pitch ${i}`);
    assert.ok(stops[i].fovY >= stops[i - 1].fovY, `fovY ${i}`);
    assert.ok(stops[i].distance <= stops[i - 1].distance, `distance ${i}`);
  }
});
