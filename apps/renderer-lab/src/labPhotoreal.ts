import { PhotorealWorld } from '@packages/photoreal-renderer/src/world';

import { type Camera3DParams } from '@packages/renderer-core/src/camera3d';
import type { LabContext } from './labShell';

export type PhotorealRouteContext = Pick<LabContext, 'canvas' | 'status' | 'params'>;

// Camera presets carried over from the 06 bake-off contract (same framing the
// verdict shots and frame-time tables were judged at). Aspect is filled from
// the live canvas; only applyCamera3d may turn these into a three camera pose.
export const YAW = -Math.PI / 2;

export function camera3dFor(
  preset: { target: readonly number[]; distance: number; pitch: number; yaw: number; fovY: number; near: number; far: number },
  aspect: number,
): Camera3DParams {
  return {
    target: [preset.target[0], preset.target[1], preset.target[2]],
    distance: preset.distance,
    pitch: preset.pitch,
    yaw: preset.yaw,
    fovY: preset.fovY,
    aspect,
    near: preset.near,
    far: preset.far,
  };
}

export function canvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  return { width: canvas.clientWidth || 1000, height: canvas.clientHeight || 600 };
}

export function startLoop(world: PhotorealWorld, params: URLSearchParams, frame: (nowMs: number) => void) {
  const fixedT = params.has('t') ? Number(params.get('t')) : null;
  const t0 = performance.now();
  const loop = (now: number) => {
    world.setTime(fixedT ?? (now - t0) / 1000);
    frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
