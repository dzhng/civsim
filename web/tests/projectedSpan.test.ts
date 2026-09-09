// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  projectionFootprint,
  projectedSpanPixels,
  projectPoint,
  viewMatrix,
  projMatrix,
  eyePosition,
  type Camera3DParams,
} from "@packages/renderer-core/src/camera3d";

const camera: Camera3DParams = {
  target: [0, 0, 2.368040807505029],
  distance: 3.5,
  pitch: 0.24,
  yaw: -Math.PI / 2,
  fovY: 0.85,
  aspect: 1.6,
  near: 1,
};
test("camera-facing reference span agrees with projected endpoints at gameplay distances", () => {
  const view = viewMatrix(camera),
    projection = projectionFootprint(view, projMatrix(camera), 800, camera.near);
  for (const y of [10, 50, 100, 150, 250]) {
    const center = [0, y, 1.305] as const;
    const half = 2.61 / 2;
    const a = projectPoint(camera, [
      center[0] - view[1] * half,
      center[1] - view[5] * half,
      center[2] - view[9] * half,
    ]);
    const b = projectPoint(camera, [
      center[0] + view[1] * half,
      center[1] + view[5] * half,
      center[2] + view[9] * half,
    ]);
    const expected = Math.abs(a.ndc[1] - b.ndc[1]) * 400;
    const actual = projectedSpanPixels(projection, ...center, 2.61);
    assert.ok(Math.abs(actual - expected) < 1e-4, `${y}: ${actual} vs ${expected}`);
  }
  assert.ok(projectedSpanPixels(projection, 0, 150, 1.305, 2.61) < 16.5);
});

test("screen scale follows depth, framebuffer height, elevation and FOV rather than radial focus distance", () => {
  const scale = (p: Camera3DParams, height = 800) =>
    projectionFootprint(viewMatrix(p), projMatrix(p), height, p.near);
  const p = scale(camera);
  const forward = projectedSpanPixels(p, 0, 150, 0.9, 1.8);
  assert.ok(projectedSpanPixels(p, 150, 0, 0.9, 1.8) > forward * 10);
  assert.equal(projectedSpanPixels(p, 40, 150, 0.9, 1.8), forward);
  assert.equal(projectedSpanPixels(scale(camera, 1600), 0, 150, 0.9, 1.8), forward * 2);
  assert.ok(projectedSpanPixels(p, 0, 150, 20, 1.8) > forward);
  assert.ok(projectedSpanPixels(scale({ ...camera, fovY: 0.5 }), 0, 150, 0.9, 1.8) > forward);
  const rotated = { ...camera, yaw: 0 };
  assert.ok(Math.abs(projectedSpanPixels(scale(rotated), -150, 0, 0.9, 1.8) - forward) < 1e-5);
});

test("overhead projection remains finite while near intersections and behind-camera spans are explicit", () => {
  const overhead = { ...camera, distance: 100, pitch: Math.PI / 2 };
  const p = projectionFootprint(viewMatrix(overhead), projMatrix(overhead), 800, overhead.near);
  const size = projectedSpanPixels(p, 0, 0, 0.9, 1.8);
  assert.ok(Number.isFinite(size) && size > 0);
  const eye = eyePosition(overhead);
  assert.equal(projectedSpanPixels(p, ...eye, 1.8), 0);
  // Two metres down the view ray: a four-metre reference span crosses near.
  assert.equal(projectedSpanPixels(p, eye[0], eye[1], eye[2] - 2, 4), Infinity);
  assert.equal(projectedSpanPixels(p, eye[0], eye[1], eye[2] + 10, 1.8), 0);
});
