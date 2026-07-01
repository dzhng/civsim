import { eyePosition, invViewProj, projectPoint, unprojectToPlaneZ, viewProjMatrix, type Camera3DParams } from './camera3d';

export interface CameraSnapshot {
  x: number;
  y: number;
  zoom: number;
  pitch?: number;
  yaw?: number;
  perspective?: number;
  width: number;
  height: number;
  /** Animation clock (seconds), packed into the camera uniform's first free pad
   *  so any fragment/vertex stage can drive time-varying effects (water, etc.)
   *  without a second bind group. Defaults to 0 — unset means a frozen frame. */
  time?: number;
  /** Sun azimuth/elevation (radians) packed into the remaining camera pads — the
   *  frame's light direction for water glint (and future sky/effects). Defaults to
   *  the battle sun convention so an unset sun matches terrain lighting. */
  sunAzimuth?: number;
  sunElevation?: number;
  /** The real 3D perspective camera (camera3d, the ONE projection owner). When set,
   *  its resolved `viewProj`/`invViewProj`/`eye`/`znear`/`zfar` are packed into the
   *  appended tail of the uniform for `projectReal`-based passes. `aspect` is
   *  overridden by the live width/height so the projection follows every resize.
   *  Legacy (2.5D `projectGround`/`projectWorld3d`) passes ignore this tail, so the
   *  first 12 scalars stay byte-identical whether it is present or not. Slice 02:
   *  only the water bake-off route supplies it. */
  camera3d?: Camera3DParams;
}

// The camera uniform is a superset: 12 legacy 2.5D scalars followed by the real
// camera's matrices/eye. std140/WGSL 16-byte alignment (mat4 = 64B, vec3 padded
// to 16B) places viewProj at float 12 (byte 48), invViewProj at float 28 (112),
// eye at float 44 (176), znear at float 47 (188), zfar at float 48 (192); the
// struct rounds up to 52 floats. Growing here is additive — legacy passes read
// only floats 0..11.
export const CAMERA_UNIFORM_FLOATS = 52;
export const CAMERA_UNIFORM_BYTES = CAMERA_UNIFORM_FLOATS * 4;
const VIEW_PROJ_OFFSET = 12;
const INV_VIEW_PROJ_OFFSET = 28;
const EYE_OFFSET = 44;
const ZNEAR_OFFSET = 47;
const ZFAR_OFFSET = 48;

// The battle sun convention (cf. horizonPass/groundPass inline `normalize(...)`),
// expressed as azimuth/elevation so water glint agrees with terrain lighting when
// no preset overrides it.
export const DEFAULT_SUN_AZIMUTH = Math.atan2(-0.28, -0.40);
export const DEFAULT_SUN_ELEVATION = Math.asin(0.87 / Math.hypot(0.40, 0.28, 0.87));

export function cameraUniformData(camera: CameraSnapshot): Float32Array {
  const pitch = camera.pitch ?? 0;
  const yaw = camera.yaw ?? 0;
  const data = new Float32Array(CAMERA_UNIFORM_FLOATS);
  data.set([
    camera.x,
    camera.y,
    camera.zoom,
    Math.max(0.2, Math.cos(pitch)),
    camera.width,
    camera.height,
    Math.cos(yaw),
    Math.sin(yaw),
    Math.max(0, camera.perspective ?? 0),
    camera.time ?? 0,
    camera.sunAzimuth ?? DEFAULT_SUN_AZIMUTH,
    camera.sunElevation ?? DEFAULT_SUN_ELEVATION,
  ], 0);
  if (camera.camera3d) {
    // Single owner: camera3d resolves the matrices. Aspect always follows the live
    // viewport so the projection is correct across resizes without the caller
    // re-supplying it.
    const params: Camera3DParams = { ...camera.camera3d, aspect: camera.width / camera.height };
    data.set(viewProjMatrix(params), VIEW_PROJ_OFFSET);
    data.set(invViewProj(params), INV_VIEW_PROJ_OFFSET);
    const eye = eyePosition(params);
    data[EYE_OFFSET] = eye[0];
    data[EYE_OFFSET + 1] = eye[1];
    data[EYE_OFFSET + 2] = eye[2];
    data[ZNEAR_OFFSET] = params.near;
    data[ZFAR_OFFSET] = params.far ?? 0; // 0 = infinite far sentinel
  }
  return data;
}

// camera3d params for the CPU projection helpers, aspect pinned to the live
// viewport (single owner, matching cameraUniformData's GPU packing).
function realParams(camera: CameraSnapshot): Camera3DParams {
  return { ...(camera.camera3d as Camera3DParams), aspect: camera.width / Math.max(1, camera.height) };
}

// World point (device-pixel screen space, y-down). Points behind the camera
// return far off-screen so callers cull them, matching the legacy contract.
function realWorldToScreen(camera: CameraSnapshot, world: [number, number, number]): [number, number] {
  const { ndc, clipW } = projectPoint(realParams(camera), world);
  if (clipW <= 0) return [-1e5, -1e5];
  return [(ndc[0] * 0.5 + 0.5) * camera.width, (1 - (ndc[1] * 0.5 + 0.5)) * camera.height];
}

export function worldToScreen(camera: CameraSnapshot, wx: number, wy: number): [number, number] {
  if (camera.camera3d) return realWorldToScreen(camera, [wx, wy, 0]);
  const c = Math.cos(camera.yaw ?? 0);
  const s = Math.sin(camera.yaw ?? 0);
  const dx = wx - camera.x;
  const dy = wy - camera.y;
  const rx = dx * c + dy * s;
  const ry = -dx * s + dy * c;
  const cosP = Math.max(0.2, Math.cos(camera.pitch ?? 0));
  const perspective = Math.max(0, camera.perspective ?? 0);
  const depth = Math.max(0.32, 1 + ry * perspective);
  return [
    (rx * camera.zoom) / depth + camera.width / 2,
    (-ry * camera.zoom * cosP) / depth + camera.height / 2,
  ];
}

export function world3dToScreen(camera: CameraSnapshot, wx: number, wy: number, wz: number): [number, number] {
  if (camera.camera3d) return realWorldToScreen(camera, [wx, wy, wz]);
  const c = Math.cos(camera.yaw ?? 0);
  const s = Math.sin(camera.yaw ?? 0);
  const dx = wx - camera.x;
  const dy = wy - camera.y;
  const rx = dx * c + dy * s;
  const ry = -dx * s + dy * c;
  const cosP = Math.max(0.2, Math.cos(camera.pitch ?? 0));
  const perspective = Math.max(0, camera.perspective ?? 0);
  const depth = Math.max(0.32, 1 + ry * perspective);
  return [
    (rx * camera.zoom) / depth + camera.width / 2,
    (-(ry * camera.zoom * cosP + wz * camera.zoom) / depth) + camera.height / 2,
  ];
}

export function screenToWorld(camera: CameraSnapshot, sx: number, sy: number): [number, number] {
  if (camera.camera3d) {
    const params = realParams(camera);
    const ndcX = (sx / Math.max(1, camera.width)) * 2 - 1;
    const ndcY = 1 - (sy / Math.max(1, camera.height)) * 2;
    const hit = unprojectToPlaneZ(params, ndcX, ndcY, 0);
    if (hit) return [hit[0], hit[1]];
    return [camera.camera3d.target[0], camera.camera3d.target[1]];
  }
  const zoom = Math.max(0.0001, camera.zoom);
  const cosP = Math.max(0.2, Math.cos(camera.pitch ?? 0));
  const perspective = Math.max(0, camera.perspective ?? 0);
  const screenX = sx - camera.width * 0.5;
  const screenY = -(sy - camera.height * 0.5);
  const yProjected = screenY / (zoom * cosP);
  const ry = perspective > 0 ? yProjected / Math.max(0.18, 1 - yProjected * perspective) : yProjected;
  const depth = Math.max(0.32, 1 + ry * perspective);
  const rx = (screenX / zoom) * depth;
  const c = Math.cos(camera.yaw ?? 0);
  const s = Math.sin(camera.yaw ?? 0);
  return [
    camera.x + rx * c - ry * s,
    camera.y + rx * s + ry * c,
  ];
}
