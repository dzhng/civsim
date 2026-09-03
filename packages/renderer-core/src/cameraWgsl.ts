// The one camera uniform + the one projector. Every pass binds this struct at
// @group(0) @binding(0) and projects world positions through `projectWorld`
// (camera3d's reverse-Z view-projection). The packed Float32Array layout lives
// in cameraUniform.ts and must match this struct field-for-field.
//
// Besides the matrices, the struct carries a small set of NON-PROJECTION
// scalars. Each survives for a named consumer purpose (documented inline) —
// none of them participates in projection, which has exactly one owner:
// cam.viewProj.
const CAMERA_UNIFORM_WGSL = `
struct Camera {
  // camera3d's reverse-Z perspective view-projection — the ONE projector.
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  // World-space eye position (vec3 padded to 16B by znear).
  eye: vec3<f32>,
  znear: f32,
  // focus — the camera's ground view centre. Consumers: distance-keyed surface
  // effects (frameShell terrain haze, water shore ramp, water glint falloff).
  focus: vec2f,
  // width/height — device-pixel viewport. Consumers: screen-space offsets and
  // NDC→pixel mapping in the label/marker shaders.
  width: f32,
  height: f32,
  // zoom — device pixels per world unit at the look target (the campaign chart
  // scale). Consumer: the campaign map's sea-shimmer zoom gate. Detail gate
  // only, never projection.
  zoom: f32,
  // tilt — sin(camera pitch): 1 = top-down chart, → 0 toward the horizon.
  // Consumer: the campaign map's sea-shimmer tilt gate.
  tilt: f32,
  // time — animation clock (seconds) for water/scenery; 0 in frozen snapshots.
  time: f32,
  // zfar — far plane distance; 0 = infinite-far sentinel.
  zfar: f32,
  // Sun azimuth/elevation (radians) — the frame's light direction.
  sunAz: f32,
  sunEl: f32,
  pad0: f32,
  pad1: f32,
};
@group(0) @binding(0) var<uniform> cam: Camera;

fn sunDirection() -> vec3f {
  let ce = cos(cam.sunEl);
  return vec3f(ce * cos(cam.sunAz), ce * sin(cam.sunAz), sin(cam.sunEl));
}
`;

export const WORLD_CAMERA_WGSL = `
${CAMERA_UNIFORM_WGSL}

// The one projector: camera3d's real perspective projection. Writes real
// reverse-Z clip-space depth (near → 1, far → 0) against the engine-wide
// depth32float world depth buffer.
fn projectWorld(world: vec3f) -> vec4f {
  return cam.viewProj * vec4f(world, 1.0);
}

// The battle fog grading axis: signed ground distance from the view centre
// along view-forward (the eye→focus ground direction). The ground and grass
// passes ramp their distance haze against it, so ground beyond the view centre
// fades toward the horizon while the near field stays clear.
fn viewForwardDist(world: vec2f) -> f32 {
  let fwd = normalize(cam.focus - cam.eye.xy);
  return dot(world - cam.focus, fwd);
}
`;
