export interface CameraRigBounds {
  width: number;
  height: number;
}

export interface CameraRig {
  pitch: number;
  targetOffset: number;
  perspective: number;
  zoomT: number;
}

export interface CameraRigRange {
  min: number;
  max: number;
}

const TOP_DOWN_PITCH = 0.08;
const VISTA_PITCH = 1.02;
const MIN_TARGET_OFFSET = 0;
const MAX_TARGET_OFFSET_FRACTION = 0.25;
const MAX_PERSPECTIVE = 0.006;

export function cameraForZoom(zoom: number, zoomRange: CameraRigRange, bounds: CameraRigBounds): CameraRig {
  const min = Math.max(0.0001, Math.min(zoomRange.min, zoomRange.max));
  const max = Math.max(min + 0.0001, Math.max(zoomRange.min, zoomRange.max));
  const rawT = (zoom - min) / (max - min);
  const zoomT = clamp01(rawT);
  const eased = smoothstep(zoomT);
  const fieldReach = Math.max(1, Math.min(bounds.width, bounds.height));
  const targetOffset = lerp(MIN_TARGET_OFFSET, fieldReach * MAX_TARGET_OFFSET_FRACTION, eased);
  return {
    pitch: lerp(TOP_DOWN_PITCH, VISTA_PITCH, eased),
    targetOffset,
    perspective: lerp(0, MAX_PERSPECTIVE, eased),
    zoomT,
  };
}

export const BATTLE_CAMERA_RIG_LIMITS = {
  topDownPitch: TOP_DOWN_PITCH,
  vistaPitch: VISTA_PITCH,
  maxTargetOffsetFraction: MAX_TARGET_OFFSET_FRACTION,
  maxPerspective: MAX_PERSPECTIVE,
} as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
