import type { DirectionalLight } from "three";
import {
  eyePosition,
  unprojectToPlaneZ,
  type Camera3DParams,
} from "../../../renderer-core/src/camera3d";

/** Fit the existing sun without changing its direction, color or shadow quality. */
export function fitSunShadowRect(
  sun: DirectionalLight,
  rect: [number, number, number, number],
  stabilize = false,
) {
  const [x, y, w, h] = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  // Re-anchor the sun on the map centre (same direction — shading identical)
  // so the ortho volume needs only the map's half-diagonal.
  const dir = sun.position.clone().sub(sun.target.position).normalize();
  sun.target.position.set(cx, cy, 0);
  const half = Math.hypot(w, h) / 2 + 40;
  // The light must sit OUTSIDE the whole ortho volume; real battle rectangles
  // can span roughly 1500 m in light space.
  const reach = half + 200;
  sun.position.set(cx + dir.x * reach, cy + dir.y * reach, dir.z * reach);
  const shadow = sun.shadow;
  const cam = shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 1;
  cam.far = reach * 2;
  cam.updateProjectionMatrix();
  if (stabilize) {
    const texel = (half * 2) / shadow.mapSize.x;
    const right = cam.up.clone().cross(dir).normalize();
    const up = dir.clone().cross(right);
    for (const axis of [right, up]) {
      const offset = sun.target.position.dot(axis);
      const shift = Math.round(offset / texel) * texel - offset;
      sun.target.position.addScaledVector(axis, shift);
      sun.position.addScaledVector(axis, shift);
    }
  }
  shadow.needsUpdate = true;
}

/** Keep the full view footprint: clipping it to map edges changes texel scale while panning. */
export function fitSunShadowView(sun: DirectionalLight, pose: Camera3DParams) {
  const points = [eyePosition(pose)];
  for (const x of [-1, 1])
    for (const y of [-1, 1]) {
      const hit = unprojectToPlaneZ(pose, x, y, 0);
      if (hit) points.push(hit);
    }
  const x0 = Math.min(...points.map((p) => p[0]));
  const y0 = Math.min(...points.map((p) => p[1]));
  const x1 = Math.max(...points.map((p) => p[0]));
  const y1 = Math.max(...points.map((p) => p[1]));
  if (x1 > x0 && y1 > y0) fitSunShadowRect(sun, [x0, y0, x1 - x0, y1 - y0], true);
}
