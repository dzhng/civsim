export interface CameraSnapshot {
  x: number;
  y: number;
  zoom: number;
  pitch?: number;
  yaw?: number;
  width: number;
  height: number;
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
  return [
    rx * camera.zoom + camera.width / 2,
    -ry * camera.zoom * cosP + camera.height / 2,
  ];
}

