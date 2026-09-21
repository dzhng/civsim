// The ONLY way a three.js camera gets posed. camera3d (the engine-wide
// projection owner) resolves the orbit params; this bridge copies the resulting
// z-up pose and reverse-Z projection onto a three PerspectiveCamera, so the two
// matrix stacks are the SAME projector — pinned by web/tests/photorealCamera.test.ts.
// No route hand-rolls orbit math.
import type { PerspectiveCamera } from 'three';
import {
  eyePosition,
  FINITE_CAMERA_FAR_FALLBACK,
  type Camera3DParams,
} from '../../renderer-core/src/camera3d';

export function applyCamera3d(camera: PerspectiveCamera, p: Camera3DParams): void {
  // z-up world: XY is the ground plane, matching camera3d's convention.
  camera.up.set(0, 0, 1);
  camera.fov = (p.fovY * 180) / Math.PI;
  camera.aspect = p.aspect;
  camera.near = p.near;
  camera.far = p.far ?? FINITE_CAMERA_FAR_FALLBACK;
  const eye = eyePosition(p);
  camera.position.set(eye[0], eye[1], eye[2]);
  camera.lookAt(p.target[0], p.target[1], p.target[2]);
  // Reverse-Z projection, matching PhotorealWorld's `reversedDepthBuffer` option
  // and the engine depth contract. `_reversedDepth` is the renderer-managed
  // backing field behind the read-only `reversedDepth` getter; setting it here
  // keeps CPU-side matrices identical to what the GPU consumes even before the
  // first render (three is version-pinned at 0.185.1; the unit test pins this).
  (camera as unknown as { _reversedDepth: boolean })._reversedDepth = true;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
