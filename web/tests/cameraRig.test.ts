// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
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
  assert.ok(Math.abs(vista.pitch - BATTLE_ZOOM_RIG_LIMITS.vistaPitch) < 1e-12);
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

test("battle zoom rig holds the down-looking angle through most of the range", () => {
  const mid = battleCameraRig(5, range, bounds);
  const threeQuarter = battleCameraRig(7, range, bounds);
  const lastFifteenStart = battleCameraRig(7.8, range, bounds);

  assert.ok(mid.pitch > 1.15, `mid zoom should still look down, pitch ${mid.pitch}`);
  assert.ok(
    threeQuarter.pitch > 0.7,
    `three-quarter zoom should not be horizon-like yet, pitch ${threeQuarter.pitch}`,
  );
  assert.ok(
    lastFifteenStart.pitch > 1.0,
    `last 15% should still start down-looking, pitch ${lastFifteenStart.pitch}`,
  );
  assert.ok(
    mid.pitch > (BATTLE_ZOOM_RIG_LIMITS.topDownPitch + BATTLE_ZOOM_RIG_LIMITS.vistaPitch) / 2,
  );
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

test("battle zoom rig is continuous through physical wheel steps", () => {
  let previous = battleCameraRig(range.min, range, bounds);
  for (let distance = previous.distance * 0.99; distance >= 10; distance *= 0.99) {
    let lo = range.min,
      hi = range.max;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (battleCameraRig(mid, range, bounds).distance > distance) lo = mid;
      else hi = mid;
    }
    const current = battleCameraRig((lo + hi) / 2, range, bounds);
    assert.ok(Math.abs(current.pitch - previous.pitch) < 0.02, `pitch step at ${distance}m`);
    assert.ok(Math.abs(current.fovY - previous.fovY) < 0.01, `lens step at ${distance}m`);
    previous = current;
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

test("battle zoom stops at the soldier-height vista instead of magnifying past it", () => {
  const endpoint = battleCameraRig(9, range, bounds);
  assert.ok(endpoint.distance >= 8 && endpoint.distance <= 12);
  for (const zoom of [12, 28, 99]) {
    assert.deepEqual(battleCameraRig(zoom, range, bounds), endpoint);
  }
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

test("battle auto tilt follows army overview, oblique approach, and soldier-height framing", () => {
  for (const field of [bounds, { width: 2400, height: 1600 }]) {
    for (let zoom = range.min; zoom <= range.max; zoom += 0.001) {
      const rig = battleCameraRig(zoom, range, field);
      if (rig.distance >= 700)
        assert.ok(rig.pitch >= 1.3, `overview pitch ${rig.pitch} at ${rig.distance}m`);
      if (rig.distance >= 400 && rig.distance <= 500)
        assert.ok(
          rig.pitch < 1.34 && rig.pitch > 1.2,
          `army-wide view should begin tilting: ${rig.pitch} at ${rig.distance}m`,
        );
      if (rig.distance >= 90 && rig.distance <= 110)
        assert.ok(
          rig.pitch > 0.65 && rig.pitch < 0.85,
          `approach should be oblique: ${rig.pitch} at ${rig.distance}m`,
        );
    }
    const closest = battleCameraRig(99, range, field);
    // The supplied soldier-height reference leaves sky in roughly the upper
    // sixth of the frame. The horizontal horizon's projected height is stable
    // across terrain because this is the lens/pitch contract, not ground relief.
    const horizonY = (1 - Math.tan(closest.pitch) / Math.tan(closest.fovY / 2)) / 2;
    assert.ok(horizonY > 0.12 && horizonY < 0.2, `closest horizon ${horizonY}`);
  }
});
