import assert from 'node:assert/strict';
import test from 'node:test';
import { BATTLE_CAMERA_RIG_LIMITS, cameraForZoom } from '../src/battle/cameraRig.ts';

const range = { min: 1, max: 9 };
const bounds = { width: 900, height: 600 };

test('camera rig clamps zoomT and endpoint pitch', () => {
  const out = cameraForZoom(-10, range, bounds);
  const vista = cameraForZoom(99, range, bounds);

  assert.equal(out.zoomT, 0);
  assert.equal(vista.zoomT, 1);
  assert.equal(out.pitch, BATTLE_CAMERA_RIG_LIMITS.topDownPitch);
  assert.equal(vista.pitch, BATTLE_CAMERA_RIG_LIMITS.vistaPitch);
});

test('camera rig pitch and target offset increase monotonically with zoom', () => {
  const stops = [1, 2, 4, 6, 9].map((zoom) => cameraForZoom(zoom, range, bounds));
  for (let i = 1; i < stops.length; i++) {
    assert.ok(stops[i].pitch >= stops[i - 1].pitch, `pitch ${i}`);
    assert.ok(stops[i].targetOffset >= stops[i - 1].targetOffset, `targetOffset ${i}`);
    assert.ok(stops[i].perspective >= stops[i - 1].perspective, `perspective ${i}`);
    assert.ok(stops[i].zoomT >= stops[i - 1].zoomT, `zoomT ${i}`);
  }
});

test('camera rig is deterministic for identical inputs', () => {
  const a = cameraForZoom(4.25, range, bounds);
  const b = cameraForZoom(4.25, range, bounds);
  assert.deepEqual(a, b);
});

test('camera rig look-ahead is bounded by the shorter battlefield axis', () => {
  const wide = cameraForZoom(99, range, { width: 1600, height: 600 });
  const tall = cameraForZoom(99, range, { width: 600, height: 1600 });

  assert.equal(wide.targetOffset, tall.targetOffset);
  assert.equal(wide.targetOffset, 600 * BATTLE_CAMERA_RIG_LIMITS.maxTargetOffsetFraction);
});

test('camera rig leaves the playable mid zoom in an RTS pitch band', () => {
  const mid = cameraForZoom(3.75, range, bounds);
  assert.ok(mid.pitch > 0.18 && mid.pitch < 0.5, JSON.stringify(mid));
});
