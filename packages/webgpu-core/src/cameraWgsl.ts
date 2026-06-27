export const CAMERA_UNIFORM_WGSL = `
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32, perspective:f32, pad0:f32, pad1:f32, pad2:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;
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
`;
