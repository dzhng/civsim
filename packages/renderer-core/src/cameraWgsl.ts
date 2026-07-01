export const CAMERA_UNIFORM_WGSL = `
struct Camera {
  x:f32, y:f32, zoom:f32, cosP:f32,
  width:f32, height:f32, cosYaw:f32, sinYaw:f32,
  perspective:f32, time:f32, sunAz:f32, sunEl:f32,
  // Appended real-camera fields (camera3d). Legacy projection fns below ignore
  // these; only projectReal consumes them. mat4 is 16-byte aligned (64B), the
  // vec3 eye is padded to 16B with znear/zfar filling the tail slot.
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  eye: vec3<f32>,
  znear: f32,
  zfar: f32,
};
@group(0) @binding(0) var<uniform> cam: Camera;

fn sunDirection() -> vec3f {
  let ce = cos(cam.sunEl);
  return vec3f(ce * cos(cam.sunAz), ce * sin(cam.sunAz), sin(cam.sunEl));
}
`;

export const WORLD_CAMERA_WGSL = `
${CAMERA_UNIFORM_WGSL}

fn cameraSpace(world: vec2f) -> vec2f {
  let dx = world.x - cam.x;
  let dy = world.y - cam.y;
  return vec2f(dx * cam.cosYaw + dy * cam.sinYaw, -dx * cam.sinYaw + dy * cam.cosYaw);
}

fn perspectiveDepth(ry: f32) -> f32 {
  return max(0.32, 1.0 + ry * cam.perspective);
}

// The real 3D perspective projection (camera3d's viewProj). Writes real reverse-Z
// clip-space depth — no faked world-Y painter value. The one projector the whole
// engine collapses onto in slice 04/05; slice 02 uses it on the water route only.
fn projectReal(world: vec3f) -> vec4f {
  return cam.viewProj * vec4f(world, 1.0);
}

fn projectGround(world: vec2f, normalizedDepth: f32) -> vec4f {
  let axes = cameraSpace(world);
  let depth = perspectiveDepth(axes.y);
  return vec4f(
    (axes.x * cam.zoom) / (cam.width * 0.5),
    (axes.y * cam.zoom * cam.cosP) / (cam.height * 0.5),
    normalizedDepth * depth,
    depth
  );
}

fn projectWorld3d(world: vec3f, normalizedDepth: f32) -> vec4f {
  let axes = cameraSpace(world.xy);
  let depth = perspectiveDepth(axes.y);
  return vec4f(
    (axes.x * cam.zoom) / (cam.width * 0.5),
    (axes.y * cam.zoom * cam.cosP + world.z * cam.zoom) / (cam.height * 0.5),
    normalizedDepth * depth,
    depth
  );
}

fn worldDepth3d(world: vec3f, base: f32, groundScale: f32, heightScale: f32) -> f32 {
  let axes = cameraSpace(world.xy);
  return clamp(base + axes.y * groundScale - world.z * heightScale, 0.02, 0.98);
}

fn civsimCampaignWorldDepth3d(world: vec3f) -> f32 {
  return worldDepth3d(world, 0.50, 0.0060, 0.0012);
}

fn civsimCampaignGroundDepth(world: vec2f, lift: f32) -> f32 {
  return civsimCampaignWorldDepth3d(vec3f(world, lift));
}

fn civsimBattleWorldDepth3d(world: vec3f) -> f32 {
  return worldDepth3d(world, 0.50, 0.0012, 0.0030);
}
`;
