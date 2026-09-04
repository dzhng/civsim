// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  projectPoint,
  unprojectToPlaneZ,
  type Camera3DParams,
} from "@packages/renderer-core/src/camera3d.ts";
import { battleCameraRig } from "../src/battle/cameraRig.ts";

// Battle picking is a real 3D ray-cast against the ground plane (z = 0).
// The production Camera delegates screen↔world to camera3d's projectPoint /
// unprojectToPlaneZ through this exact ndc↔pixel mapping, so testing that mapping
// proves the gameplay round-trip without a DOM canvas.
const W = 1280;
const H = 720;
const range = { min: 0.4, max: 8 };
const bounds = { width: 900, height: 620 };

// Build the same Camera3DParams the Camera would for a given zoom, framed at the
// world origin (yaw 0), matching web/src/shared/camera.ts.
function params(zoom: number): Camera3DParams {
  const rig = battleCameraRig(zoom, range, bounds);
  return {
    target: [rig.target[0], rig.target[1], 0],
    distance: rig.distance,
    pitch: rig.pitch,
    yaw: 0,
    fovY: rig.fovY,
    aspect: W / H,
    near: 1,
  };
}

function worldToPx(p: Camera3DParams, wx: number, wy: number) {
  const { ndc, clipW } = projectPoint(p, [wx, wy, 0]);
  return {
    px: (ndc[0] * 0.5 + 0.5) * W,
    py: (1 - (ndc[1] * 0.5 + 0.5)) * H,
    clipW,
  };
}

function pxToWorld(p: Camera3DParams, px: number, py: number): [number, number] | null {
  const ndcX = (px / W) * 2 - 1;
  const ndcY = 1 - (py / H) * 2;
  const hit = unprojectToPlaneZ(p, ndcX, ndcY, 0);
  return hit ? [hit[0], hit[1]] : null;
}

// A grid of pixels in the lower-central band that provably hits the ground under
// perspective (upper pixels look at the horizon/sky where no ground hit exists).
const zoomStops = [0.6, 1.5, 3, 5, 7.5];

test("worldToScreen(screenToWorld(px)) round-trips on the ground plane at every zoom", () => {
  for (const zoom of zoomStops) {
    const p = params(zoom);
    for (let py = H * 0.5; py <= H * 0.95; py += H * 0.15) {
      for (let px = W * 0.15; px <= W * 0.85; px += W * 0.175) {
        const world = pxToWorld(p, px, py);
        assert.ok(world, `ground hit at zoom ${zoom}, px (${px | 0},${py | 0})`);
        const back = worldToPx(p, world![0], world![1]);
        assert.ok(back.clipW > 0, "projected point is in front of the camera");
        assert.ok(Math.abs(back.px - px) < 0.3, `x round-trip zoom ${zoom}: ${back.px} vs ${px}`);
        assert.ok(Math.abs(back.py - py) < 0.3, `y round-trip zoom ${zoom}: ${back.py} vs ${py}`);
      }
    }
  }
});

test("a click at a unit centroid picks that unit", () => {
  // Three unit centroids on the ground near the framed centre.
  const centroids: Array<[number, number]> = [
    [0, -20],
    [40, 30],
    [-55, 10],
  ];
  const p = params(4);
  const pickAtPixel = (px: number, py: number): number => {
    const world = pxToWorld(p, px, py);
    if (!world) return -1;
    let best = -1;
    let bestD = 18; // ~unit half-frontage select radius, world meters
    for (let u = 0; u < centroids.length; u++) {
      const d = Math.hypot(centroids[u][0] - world[0], centroids[u][1] - world[1]);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  };
  for (let u = 0; u < centroids.length; u++) {
    const { px, py, clipW } = worldToPx(p, centroids[u][0], centroids[u][1]);
    assert.ok(clipW > 0, `centroid ${u} is in view`);
    assert.equal(pickAtPixel(px, py), u, `click on centroid ${u} selects unit ${u}`);
  }
});
