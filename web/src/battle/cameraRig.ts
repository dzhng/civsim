export interface CameraRigBounds {
  width: number;
  height: number;
}

export interface CameraRigRange {
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// The zoom rig maps zoom → framing for the real 3D perspective camera
// (`camera3d.ts`):
// near-top-down when zoomed OUT (zoomT = 0), a low oblique cinematic vista when
// zoomed IN (zoomT = 1). `pitch` follows camera3d's convention — π/2 is straight
// down, small is near the horizon — so it DECREASES as you zoom in. The caller
// (`web/src/shared/camera.ts` for battle) fills `yaw` (0 for battle), `aspect`
// (live width/height), and `near`, and adds the ground view-centre to `target`
// (the rig returns a forward look-ahead offset along −X, the yaw-0 view direction
// — the camera focuses ahead of your line so the field opens out toward the
// horizon instead of tilting in place).

/** Camera3DParams-shaped subset produced by the zoom rig, plus the exported
 *  `zoomT` (grass density / haze depth read it). */
export interface ZoomCameraRig {
  /** Forward look-ahead offset from the view centre, world space (+Z up). */
  target: [number, number, number];
  distance: number;
  /** Radians; π/2 = top-down, small = oblique vista. Decreases with zoom. */
  pitch: number;
  /** Vertical field of view, radians. Widens as you zoom in. */
  fovY: number;
  /** 0 = zoomed out (top-down), 1 = zoomed in (vista). */
  zoomT: number;
}

interface RigCurve {
  topDownPitch: number;
  vistaPitch: number;
  topDownFovY: number;
  vistaFovY: number;
  /** distance = fieldReach * factor, lerped out to the close endpoint. */
  distOutFactor: number;
  distInFactor: number;
  /** Optional absolute cap for the zoomed-in endpoint, in world meters. */
  distInMeters?: number;
  /** Forward look-ahead at max zoom, as a fraction of the field's short axis. */
  maxForwardFraction: number;
  /** >1 keeps the framing near-top-down for more of the zoom range before it
   *  drops into the oblique vista (campaign stays a flat chart longer). */
  easeBias: number;
}

// Battle: a genuine near-top-down tactical read through most of the range,
// only dropping toward the low cinematic vista in the final zoom stretch.
const BATTLE_CURVE: RigCurve = {
  topDownPitch: 1.35, // ~77° down — near-vertical tactical
  vistaPitch: 0.24, // ~14° — low, just above soldier eye height at 10m
  topDownFovY: 0.5, // ~29° — narrow, keeps formations legible top-down
  vistaFovY: 0.85, // ~49° — wide cinematic
  distOutFactor: 2.0,
  distInFactor: 0.6,
  distInMeters: 10,
  maxForwardFraction: 0.3,
  easeBias: 20,
};

// Campaign: a strategic chart. Flatter (stays near-top-down longer via easeBias),
// never drops as low, and keeps a narrower FOV so the map reads as a map.
const CAMPAIGN_CURVE: RigCurve = {
  topDownPitch: 1.42, // ~81° down — almost straight-down chart
  vistaPitch: 0.55, // ~32° — gentle tilt, never a full ground-level vista
  topDownFovY: 0.45,
  vistaFovY: 0.65,
  distOutFactor: 2.2,
  distInFactor: 0.9,
  maxForwardFraction: 0.18,
  easeBias: 1.8,
};

export const BATTLE_ZOOM_RIG_LIMITS = curveLimits(BATTLE_CURVE);
export const CAMPAIGN_ZOOM_RIG_LIMITS = curveLimits(CAMPAIGN_CURVE);

export function battleCameraRig(
  zoom: number,
  zoomRange: CameraRigRange,
  bounds: CameraRigBounds,
): ZoomCameraRig {
  return rigForZoom(BATTLE_CURVE, zoom, zoomRange, bounds);
}

export function campaignCameraRig(
  zoom: number,
  zoomRange: CameraRigRange,
  bounds: CameraRigBounds,
): ZoomCameraRig {
  return rigForZoom(CAMPAIGN_CURVE, zoom, zoomRange, bounds);
}

function rigForZoom(
  curve: RigCurve,
  zoom: number,
  zoomRange: CameraRigRange,
  bounds: CameraRigBounds,
): ZoomCameraRig {
  const min = Math.max(0.0001, Math.min(zoomRange.min, zoomRange.max));
  const max = Math.max(min + 0.0001, Math.max(zoomRange.min, zoomRange.max));
  const zoomT = clamp01((zoom - min) / (max - min));
  // One eased parameter drives every axis, so pitch/fovY/distance/target move
  // together and each stays monotonic in zoom. `easeBias` shapes how long the
  // framing lingers near top-down before committing to the vista.
  const eased = Math.pow(smoothstep(zoomT), curve.easeBias);
  const fieldReach = Math.max(1, Math.min(bounds.width, bounds.height));
  const closeDistance = Math.min(
    fieldReach * curve.distInFactor,
    curve.distInMeters ?? Number.POSITIVE_INFINITY,
  );
  const distance = lerp(fieldReach * curve.distOutFactor, closeDistance, eased);
  const closeForward = Math.min(fieldReach * curve.maxForwardFraction, closeDistance * 1.25);
  const forward = lerp(0, closeForward, eased);
  return {
    target: [-forward, 0, 0],
    distance,
    pitch: lerp(curve.topDownPitch, curve.vistaPitch, eased),
    fovY: lerp(curve.topDownFovY, curve.vistaFovY, eased),
    zoomT,
  };
}

function curveLimits(curve: RigCurve) {
  return {
    topDownPitch: curve.topDownPitch,
    vistaPitch: curve.vistaPitch,
    topDownFovY: curve.topDownFovY,
    vistaFovY: curve.vistaFovY,
    maxForwardFraction: curve.maxForwardFraction,
  } as const;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
