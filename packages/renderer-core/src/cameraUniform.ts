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
}

export function cameraUniformData(camera: CameraSnapshot): Float32Array {
  const pitch = camera.pitch ?? 0;
  const yaw = camera.yaw ?? 0;
  return new Float32Array([
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
    0,
    0,
  ]);
}

export function worldToScreen(camera: CameraSnapshot, wx: number, wy: number): [number, number] {
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
