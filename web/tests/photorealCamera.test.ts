// Spine-fidelity pin for the whole photoreal ladder: applyCamera3d must pose a
// three.js PerspectiveCamera so that projectionMatrix × matrixWorldInverse IS
// camera3d.viewProjMatrix — one projector engine-wide, no drift between the
// bespoke spine and the three substrate. Runs in node, no GPU.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Matrix4, Vector4 } from 'three';
import { applyCamera3d, PHOTOREAL_FAR_FALLBACK } from '../../packages/photoreal-renderer/src/cameraBridge.ts';
import {
  eyePosition,
  projectPoint,
  viewProjMatrix,
  type Camera3DParams,
} from '../../packages/renderer-core/src/camera3d.ts';

// The battle-ish zoom ladder: close inspection → mid battle → oblique vista →
// far campaign, across pitches/yaws/aspects. Finite far everywhere except the
// dedicated infinite-far case below.
const ZOOM_STOPS: Camera3DParams[] = [
  { target: [0, 0, 2], distance: 42, pitch: 0.5, yaw: -Math.PI / 2, fovY: 0.7, aspect: 1000 / 600, near: 1, far: 5000 },
  { target: [0, 40, 0], distance: 380, pitch: 0.8, yaw: -Math.PI / 2, fovY: 0.68, aspect: 1.5, near: 1, far: 8000 },
  { target: [0, 90, 0], distance: 210, pitch: 0.3, yaw: -Math.PI / 2, fovY: 0.83, aspect: 1.78, near: 1, far: 8000 },
  { target: [12, -30, 0], distance: 1200, pitch: 1.2, yaw: 0.4, fovY: 0.55, aspect: 1.6, near: 1, far: 20000 },
  { target: [-80, 250, 5], distance: 60, pitch: 0.12, yaw: 2.1, fovY: 0.9, aspect: 1.2, near: 0.5, far: 3000 },
];

function threeViewProj(camera: PerspectiveCamera): Matrix4 {
  return new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
}

// Relative epsilon: camera3d stores Float32Array matrices while three keeps
// float64, so agreement is bounded by float32 rounding of the shared math.
function assertMatricesMatch(actual: Matrix4, expected: Float32Array | number[], label: string, tolerance = 1e-4) {
  for (let i = 0; i < 16; i++) {
    const a = actual.elements[i];
    const e = expected[i];
    const scale = Math.max(1, Math.abs(a), Math.abs(e));
    assert.ok(
      Math.abs(a - e) <= tolerance * scale,
      `${label}: element ${i} diverges (three=${a}, camera3d=${e})`,
    );
  }
}

test('photoreal camera bridge: viewProj matches camera3d across the zoom ladder', () => {
  for (const [index, params] of ZOOM_STOPS.entries()) {
    const camera = new PerspectiveCamera();
    applyCamera3d(camera, params);
    assertMatricesMatch(threeViewProj(camera), viewProjMatrix(params), `zoom stop ${index}`);
  }
});

test('photoreal camera bridge: reverse-Z depth direction (near → 1, far → 0)', () => {
  const params = ZOOM_STOPS[1];
  const camera = new PerspectiveCamera();
  applyCamera3d(camera, params);
  const vp = threeViewProj(camera);
  const eye = eyePosition(params);
  const depthAt = (worldZOffset: number) => {
    // A point straight along the view direction at increasing distance.
    const t = params.target;
    const dir = [t[0] - eye[0], t[1] - eye[1], t[2] - eye[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    const d = (params.near + worldZOffset) / len;
    const v = new Vector4(eye[0] + dir[0] * d, eye[1] + dir[1] * d, eye[2] + dir[2] * d, 1).applyMatrix4(vp);
    return v.z / v.w;
  };
  const nearDepth = depthAt(0);
  const midDepth = depthAt(200);
  const farDepth = depthAt(params.far! - params.near - 1);
  assert.ok(Math.abs(nearDepth - 1) < 1e-4, `near plane depth should be 1, got ${nearDepth}`);
  assert.ok(nearDepth > midDepth && midDepth > farDepth, 'depth must decrease with distance (reverse-Z)');
  assert.ok(farDepth >= 0 && farDepth < 1e-3, `far plane depth should approach 0, got ${farDepth}`);
});

test('photoreal camera bridge: z-up axes and eye placement', () => {
  const params = ZOOM_STOPS[2];
  const camera = new PerspectiveCamera();
  applyCamera3d(camera, params);
  assert.deepEqual([camera.up.x, camera.up.y, camera.up.z], [0, 0, 1]);
  const eye = eyePosition(params);
  assert.ok(
    Math.hypot(camera.position.x - eye[0], camera.position.y - eye[1], camera.position.z - eye[2]) < 1e-9,
    'camera position must be camera3d\'s eye',
  );
  // World +Z must read as up-screen: raising a point raises its NDC y in both stacks.
  const vp = threeViewProj(camera);
  const t = params.target;
  const base = new Vector4(t[0], t[1], t[2], 1).applyMatrix4(vp);
  const raised = new Vector4(t[0], t[1], t[2] + 10, 1).applyMatrix4(vp);
  assert.ok(raised.y / raised.w > base.y / base.w, 'world +Z must project up-screen');
  const camera3dRaised = projectPoint(params, [t[0], t[1], t[2] + 10]);
  assert.ok(
    Math.abs(raised.y / raised.w - camera3dRaised.ndc[1]) < 1e-4,
    'three and camera3d agree on the raised point',
  );
});

test('photoreal camera bridge: omitted far converges to camera3d\'s infinite-far matrix', () => {
  const params: Camera3DParams = { ...ZOOM_STOPS[1], far: undefined };
  const camera = new PerspectiveCamera();
  applyCamera3d(camera, params);
  assert.equal(camera.far, PHOTOREAL_FAR_FALLBACK);
  assertMatricesMatch(threeViewProj(camera), viewProjMatrix(params), 'infinite-far limit');
});
