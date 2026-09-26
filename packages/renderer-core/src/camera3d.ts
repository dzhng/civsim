// The real 3D perspective camera — the ONE projection owner engine-wide: the
// single source of truth for view/projection matrices and screen↔world mapping,
// shared by the GPU uniform packer (cameraUniform.ts), the zoom rigs
// (cameraRig.ts), and CPU picking. Pure and GPU-free: everything here is
// unit-tested with no device.
//
// World convention: XY is the ground plane, +Z is up (matches skinnedPipeline's
// vertex convention). Matrices are column-major (mat4.ts) so they upload to a
// WGSL `mat4x4<f32>` verbatim. Depth is reverse-Z in WebGPU clip space (near → 1,
// far → 0).

import {
  identity,
  invert,
  lookAt,
  multiply,
  perspectiveReverseZ,
  transformVec4,
  type Mat4,
  type Vec3,
  type Vec4,
} from "./mat4";

export type { Mat4, Vec3 } from "./mat4";

export interface Camera3DParams {
  /** Point the camera orbits and looks at, in world space (XY ground, +Z up). */
  target: Vec3;
  /** Eye distance from `target`. */
  distance: number;
  /** Elevation of the eye above the ground plane, radians. π/2 = straight down
   *  (top-down); small = near the horizon (oblique vista). */
  pitch: number;
  /** Azimuth around +Z, radians. */
  yaw: number;
  /** Vertical field of view, radians. */
  fovY: number;
  /** Viewport aspect (width / height). */
  aspect: number;
  /** Near plane distance (> 0). */
  near: number;
  /** Far plane distance. Omit for an infinite far plane. */
  far?: number;
}

// Far plane for a consumer that cannot take an infinite far plane; the canonical
// projection above still omits `far` for the infinite limit. three@0.185 has no
// infinite-far branch (Matrix4.makePerspective NaNs on far=Infinity), so such a
// consumer substitutes this huge finite plane. Under reverse-Z the depth terms
// converge to the infinite limit (A=0, B=near) at ~near/far relative error —
// inside the epsilon web/tests/photorealCamera.test.ts pins the two stacks to.
export const FINITE_CAMERA_FAR_FALLBACK = 1e7;

// Eye position derived from the orbit params. Pitch is clamped just shy of
// vertical so `lookAt`'s up vector never degenerates at exact top-down.
export function eyePosition(p: Camera3DParams): Vec3 {
  const pitch = Math.min(Math.PI / 2 - 1e-3, Math.max(-Math.PI / 2 + 1e-3, p.pitch));
  const cp = Math.cos(pitch);
  return [
    p.target[0] + p.distance * cp * Math.cos(p.yaw),
    p.target[1] + p.distance * cp * Math.sin(p.yaw),
    p.target[2] + p.distance * Math.sin(pitch),
  ];
}

export function viewMatrix(p: Camera3DParams): Mat4 {
  return lookAt(eyePosition(p), p.target, [0, 0, 1]);
}

export function projMatrix(p: Camera3DParams): Mat4 {
  return perspectiveReverseZ(p.fovY, p.aspect, p.near, p.far);
}

export function viewProjMatrix(p: Camera3DParams): Mat4 {
  return multiply(projMatrix(p), viewMatrix(p));
}

export function invViewProj(p: Camera3DParams): Mat4 {
  return invert(viewProjMatrix(p)) ?? identity();
}

/** Caller-owned accepted pose and scratch, independent of mutable rig parameters. */
export interface PreparedCamera {
  view: Mat4;
  projection: Mat4;
  viewProjection: Mat4;
  inverseViewProjection: Mat4;
  eye: Vec3;
  scratch: [...Vec4];
}

export function createPreparedCamera(): PreparedCamera {
  return {
    view: identity(),
    projection: identity(),
    viewProjection: identity(),
    inverseViewProjection: identity(),
    eye: [0, 0, 0],
    scratch: [0, 0, 0, 1],
  };
}

export function prepareCamera(out: PreparedCamera, p: Camera3DParams): PreparedCamera {
  out.view = viewMatrix(p);
  out.projection = projMatrix(p);
  out.viewProjection = multiply(out.projection, out.view);
  out.inverseViewProjection = invert(out.viewProjection) ?? identity();
  out.eye = eyePosition(p);
  return out;
}

export interface ProjectedPoint {
  ndc: [...Vec3];
  /** Homogeneous w: positive in front of the camera. */
  clipW: number;
}

function projectClip(out: ProjectedPoint, clip: Vec4): ProjectedPoint {
  const w = clip[3];
  const inv = w !== 0 ? 1 / w : 0;
  out.ndc[0] = clip[0] * inv;
  out.ndc[1] = clip[1] * inv;
  out.ndc[2] = clip[2] * inv;
  out.clipW = w;
  return out;
}

export function projectPoint(p: Camera3DParams, world: Vec3): ProjectedPoint {
  const clip = transformVec4([0, 0, 0, 0], viewProjMatrix(p), [world[0], world[1], world[2], 1]);
  return projectClip({ ndc: [0, 0, 0], clipW: 0 }, clip);
}

export function projectPrepared(
  out: ProjectedPoint,
  camera: PreparedCamera,
  x: number,
  y: number,
  z: number,
): ProjectedPoint {
  const v = camera.scratch;
  v[0] = x;
  v[1] = y;
  v[2] = z;
  v[3] = 1;
  return projectClip(out, transformVec4(v, camera.viewProjection, v));
}

/** Pixels per world meter at a world point. */
export type PxPerWorldSampler = (x: number, y: number, z: number) => number;

/** Preserve the overlay sizing policy based on Euclidean eye distance, rather
 * than projected depth. It is an approximation off-axis. `viewportHeightPx`
 * selects CSS or device pixels; resolve the eye and lens once per frame. */
export function pxPerWorldSampler(p: Camera3DParams, viewportHeightPx: number): PxPerWorldSampler {
  const eye = eyePosition(p);
  const pxPerMeterAtUnitDistance = viewportHeightPx / (2 * Math.tan(p.fovY / 2));
  return (x, y, z) =>
    pxPerMeterAtUnitDistance / Math.max(0.001, Math.hypot(eye[0] - x, eye[1] - y, eye[2] - z));
}

/** Frame-owned projection scale: no matrices or vectors allocated per body. */
export interface ProjectionFootprint {
  view: ArrayLike<number>;
  pixelsPerViewUnit: number;
  perspective: boolean;
  near: number;
}

export function projectionFootprint(
  view: ArrayLike<number>,
  projection: ArrayLike<number>,
  viewportHeight: number,
  near: number,
): ProjectionFootprint {
  return {
    view,
    pixelsPerViewUnit: (Math.abs(projection[5]) * viewportHeight) / 2,
    perspective: projection[15] === 0,
    near,
  };
}

export function projectionDepth(
  projection: ProjectionFootprint,
  x: number,
  y: number,
  z: number,
): number {
  const m = projection.view;
  return -(m[2] * x + m[6] * y + m[10] * z + m[14]);
}

/** Only a perspective footprint grows without bound as a span approaches the
 * eye, so only a perspective near crossing demands full detail. An orthographic
 * span covers the same pixels at every depth, near crossing or not. Both LOD
 * audiences ask this of the projection rather than deciding it themselves. */
export function nearCrossingDemandsFullDetail(
  projection: ProjectionFootprint,
  depth: number,
  halfExtent: number,
): boolean {
  return projection.perspective && depth - halfExtent <= projection.near;
}

/** Camera-facing span, stable at overhead views. Wholly near/behind spans make
 * no view contribution. */
export function projectedSpanPixels(
  projection: ProjectionFootprint,
  x: number,
  y: number,
  z: number,
  span: number,
): number {
  const depth = projectionDepth(projection, x, y, z);
  if (depth + span / 2 <= projection.near) return 0;
  if (nearCrossingDemandsFullDetail(projection, depth, span / 2)) return Infinity;
  return (span * projection.pixelsPerViewUnit) / (projection.perspective ? depth : 1);
}

// Rays originate at the analytic eye and use the reverse-Z near plane (depth 1).
// Differencing near/far points would fail for the infinite far plane.
export interface WorldRay {
  origin: Vec3;
  dir: Vec3;
}
export type MutableWorldRay = { [K in keyof WorldRay]: [...WorldRay[K]] };

function rayFromClip(out: MutableWorldRay, eye: Vec3, clip: Vec4): MutableWorldRay {
  const iw = clip[3] !== 0 ? 1 / clip[3] : 0;
  let dx = clip[0] * iw - eye[0],
    dy = clip[1] * iw - eye[1],
    dz = clip[2] * iw - eye[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l;
  dy /= l;
  dz /= l;
  out.origin[0] = eye[0];
  out.origin[1] = eye[1];
  out.origin[2] = eye[2];
  out.dir[0] = dx;
  out.dir[1] = dy;
  out.dir[2] = dz;
  return out;
}

export function screenRay(p: Camera3DParams, ndcX: number, ndcY: number): WorldRay {
  const clip = transformVec4([0, 0, 0, 0], invViewProj(p), [ndcX, ndcY, 1, 1]);
  return rayFromClip({ origin: [0, 0, 0], dir: [0, 0, 0] }, eyePosition(p), clip);
}

export function rayPrepared(
  out: MutableWorldRay,
  camera: PreparedCamera,
  ndcX: number,
  ndcY: number,
): MutableWorldRay {
  const v = camera.scratch;
  v[0] = ndcX;
  v[1] = ndcY;
  v[2] = 1;
  v[3] = 1;
  return rayFromClip(out, camera.eye, transformVec4(v, camera.inverseViewProjection, v));
}

// Intersect the pixel ray with the horizontal plane z = planeZ — the picking
// primitive (pick against the ground, or a unit's mean elevation). Returns null
// when the ray is parallel to the plane or the hit is behind the eye.
export function unprojectToPlaneZ(
  p: Camera3DParams,
  ndcX: number,
  ndcY: number,
  planeZ: number,
): Vec3 | null {
  const { origin, dir } = screenRay(p, ndcX, ndcY);
  if (Math.abs(dir[2]) < 1e-9) return null;
  const t = (planeZ - origin[2]) / dir[2];
  if (t < 0) return null;
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}

// A chart-style framing spec: centre the view on a ground point at a given
// scale (device px per world unit) with a tilt away from top-down. This is how
// the renderer-lab review routes (and their pick harness) frame fixtures —
// legibility knobs, not a second projection. `chartCamera3d` resolves the spec
// into real Camera3DParams; the projection owner stays camera3d.
export interface ChartCameraSpec {
  /** Ground point at the screen centre. */
  x: number;
  y: number;
  /** Device pixels per world unit at the centre (screen-x direction). */
  zoom: number;
  /** Tilt away from top-down, radians. 0 = straight down. */
  pitch?: number;
  /** Bearing, radians. 0 = world +Y up-screen (the 2D chart orientation). */
  yaw?: number;
}

// The one vertical FOV every chart-framed lab route shares. Narrow enough that
// a chart framing stays chart-like; the production battle/campaign rigs own
// their own curves.
const CHART_CAMERA_FOV_Y = 0.55;

export function chartCamera3d(spec: ChartCameraSpec, viewportHeightPx: number): Camera3DParams {
  const zoom = Math.max(0.0001, spec.zoom);
  const distance = Math.max(1e-3, viewportHeightPx) / (2 * zoom * Math.tan(CHART_CAMERA_FOV_Y / 2));
  return {
    target: [spec.x, spec.y, 0],
    distance,
    // Chart pitch tilts away from top-down; camera3d pitch is elevation above
    // the ground plane (π/2 = top-down).
    pitch: Math.PI / 2 - Math.min(Math.PI / 2 - 0.05, Math.max(0, spec.pitch ?? 0)),
    // Chart yaw 0 = +Y up-screen, which is camera3d yaw −π/2 (eye south of the
    // target looking north).
    yaw: (spec.yaw ?? 0) - Math.PI / 2,
    fovY: CHART_CAMERA_FOV_Y,
    aspect: 1, // overridden by the live viewport in cameraUniformData
    near: Math.min(1, Math.max(0.05, distance * 0.01)),
  };
}
