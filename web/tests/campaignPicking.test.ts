import assert from 'node:assert/strict';
import test from 'node:test';
import { campaignCameraRig } from '../src/battle/cameraRig.ts';
import {
  screenToWorld,
  world3dToScreen,
  worldToScreen,
  type CameraSnapshot,
} from '../../packages/renderer-core/src/cameraUniform.ts';

// Slice 05: campaign picking is a real 3D ray-cast against the ground plane
// (z = 0) and label/marker placement is a real projection — both flow through
// cameraUniform's screenToWorld / worldToScreen, which delegate to camera3d when
// `camera3d` is set. This builds the exact CameraSnapshot the CampaignRenderer
// does (yaw = −π/2 to keep the map's world orientation) and proves the round-trip
// without a DOM canvas.
const W = 1280;
const H = 800;
const range = { min: 0.16, max: 8 };
const bounds = { width: 1600, height: 1200 };

// Mirror CampaignRenderer.cameraParamsFor + the legacy scalars it still packs:
// the rig owns pitch/fovY, distance derives from the chart scale (device px per
// world km) so the vertical ground span at the target is height / scale, and the
// screen-centre ground hit is exactly (x, y).
function snapshot(x: number, y: number, scale: number): CameraSnapshot {
  const rig = campaignCameraRig(scale, range, bounds);
  const viewHeight = H / Math.max(0.0001, scale);
  return {
    x,
    y,
    zoom: scale,
    pitch: 0,
    yaw: 0,
    perspective: 0,
    width: W,
    height: H,
    camera3d: {
      target: [x, y, 0],
      distance: viewHeight / (2 * Math.tan(rig.fovY / 2)),
      pitch: rig.pitch,
      yaw: -Math.PI / 2,
      fovY: rig.fovY,
      aspect: W / H,
      near: 1,
    },
  };
}

const zoomStops = [0.2, 0.6, 1.6, 3.6, 6];

test('campaign worldToScreen(screenToWorld(px)) round-trips on the ground plane at every zoom', () => {
  for (const scale of zoomStops) {
    const cam = snapshot(40, -30, scale);
    // Lower-central band provably hits the ground (upper pixels look past the
    // horizon at the oblique end where no ground hit exists).
    for (let py = H * 0.45; py <= H * 0.92; py += H * 0.15) {
      for (let px = W * 0.15; px <= W * 0.85; px += W * 0.175) {
        const [wx, wy] = screenToWorld(cam, px, py);
        const [bx, by] = worldToScreen(cam, wx, wy);
        assert.ok(Math.abs(bx - px) < 0.4, `x round-trip scale ${scale}: ${bx} vs ${px}`);
        assert.ok(Math.abs(by - py) < 0.4, `y round-trip scale ${scale}: ${by} vs ${py}`);
      }
    }
  }
});

test('campaign camera keeps the chart scale: east km at the target project at scale px/km', () => {
  for (const scale of zoomStops) {
    const cam = snapshot(40, -30, scale);
    const [ax] = worldToScreen(cam, 40, -30);
    const [bx] = worldToScreen(cam, 50, -30); // 10 km east of the look target
    const pxPerKm = (bx - ax) / 10;
    assert.ok(
      Math.abs(pxPerKm - scale) < scale * 0.02,
      `scale ${scale}: ${pxPerKm} px/km at the target`,
    );
  }
});

test('campaign camera keeps the map orientation: east → screen right, north → screen up', () => {
  const cam = snapshot(0, 0, 1.6);
  const [cx, cy] = worldToScreen(cam, 0, 0); // screen centre = look target (x,y)
  const [ex, ey] = worldToScreen(cam, 120, 0); // 120 km east (+X)
  const [nx, ny] = worldToScreen(cam, 0, 120); // 120 km north (+Y)
  assert.ok(ex > cx + 5, `east is to the right of centre: ${ex} vs ${cx}`);
  assert.ok(Math.abs(ey - cy) < 40, `east stays near the horizontal: ${ey} vs ${cy}`);
  assert.ok(ny < cy - 5, `north is above centre: ${ny} vs ${cy}`);
  assert.ok(Math.abs(nx - cx) < 40, `north stays near the vertical: ${nx} vs ${cx}`);
});

test('a click on a city maps back to that city (nearest-loc pick)', () => {
  // A handful of "cities" on the ground near the framed centre.
  const cities: Array<[number, number]> = [
    [40, -30],
    [110, 10],
    [-20, 60],
    [10, -90],
  ];
  const cam = snapshot(30, -10, 3.6);
  const pickNearest = (px: number, py: number): number => {
    const [wx, wy] = screenToWorld(cam, px, py);
    let best = -1;
    let bestD = 24; // world-km select radius
    for (let i = 0; i < cities.length; i++) {
      const d = Math.hypot(cities[i][0] - wx, cities[i][1] - wy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  for (let i = 0; i < cities.length; i++) {
    // Cities sit on relief in-game; the label/marker anchor projects at the
    // model's z, but the ground pick is against z = 0 — test the z = 0 anchor.
    const [sx, sy] = world3dToScreen(cam, cities[i][0], cities[i][1], 0);
    assert.equal(pickNearest(sx, sy), i, `click on city ${i} selects city ${i}`);
  }
});
