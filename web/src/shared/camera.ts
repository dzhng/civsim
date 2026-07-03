import { battleCameraRig, type CameraRigRange, type ZoomCameraRig } from "../battle/cameraRig";
import {
  projectPoint,
  unprojectToPlaneZ,
  type Camera3DParams,
} from "../../../packages/renderer-core/src/camera3d";

// Battle camera, Total War style. World units are meters, XY is the ground plane
// and +Z is up. This is a thin owner over the real 3D perspective camera
// (camera3d): the zoom curve (battleCameraRig) maps `zoom` → distance/pitch/fovY,
// and every screen↔world mapping is a real ray-cast against the ground plane
// (z = 0) so picking and DOM overlays agree with the GPU frame to the pixel.
// There is no separate 2.5D projection here — camera3d is the single owner.
const MIN_PITCH = 0.12; // near ground-level vista floor (radians off the ground)
const MAX_PITCH = Math.PI / 2 - 0.02; // just shy of straight-down top-down
const NEAR_PLANE = 1.0; // meters; reverse-Z + infinite far spends precision far out

export class Camera {
  x = 0;
  y = 0;
  zoom = 4;
  /** User tilt bias added to the zoom-driven auto pitch (middle-drag vertical).
   *  Positive = drag down = a lower, more side-on angle (smaller camera3d pitch). */
  pitchBias = 0;
  /** View rotation about the vertical, radians (Q/E and middle-drag horizontal). */
  yaw = 0;
  /** Hard view bounds (x0, y0, x1, y1). The look target is clamped inside them. */
  bounds: [number, number, number, number] | null = null;

  private zoomRange: CameraRigRange = { min: 0.4, max: 8 };
  private rigBounds = { width: 1, height: 1 };

  // Explicit field (not a constructor parameter property) so node's strip-only
  // TS loader can run this file in unit tests.
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** Feed the zoom→framing curve its range + field bounds (from scene setup). */
  setRig(zoomRange: CameraRigRange, bounds: { width: number; height: number }) {
    this.zoomRange = zoomRange;
    this.rigBounds = bounds;
  }

  private rig(): ZoomCameraRig {
    return battleCameraRig(this.zoom, this.zoomRange, this.rigBounds);
  }

  /** Normalized zoom-rig state: 0 = tactical top-down, 1 = close vista. */
  get zoomT() {
    return this.rig().zoomT;
  }

  /** Keyboard/edge pan speed, world m/s. Faster the further out the view is,
   *  but capped at the ~75%-out sweet spot — the full overview raced. */
  panSpeed() {
    const { min, max } = this.zoomRange;
    const z = Math.max(this.zoom, min + 0.25 * (max - min));
    const t = Math.max(0, Math.min(1, (z - min) / Math.max(1e-6, max - min)));
    return (600 / z) * (12 - 11.5 * t);
  }

  /** The camera3d pitch actually used this frame (auto curve + user bias, clamped). */
  get pitch() {
    return this.effectivePitch(this.rig());
  }

  private effectivePitch(rig: ZoomCameraRig) {
    return Math.max(MIN_PITCH, Math.min(MAX_PITCH, rig.pitch - this.pitchBias));
  }

  /** Rotate a yaw-0 world-frame vector into world axes by yaw. Note camera3d's
   *  yaw-0 view direction is −X (screen-right = +Y), so this is NOT a
   *  screen→world mapping — panWorld converts screen axes first. */
  private rotate(x: number, y: number): [number, number] {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return [x * c - y * s, x * s + y * c];
  }

  /** The world-space parameters of the real perspective camera this frame. The
   *  screen-centre ground hit is exactly `target.xy` (the target sits on z = 0). */
  params(): Camera3DParams {
    const rig = this.rig();
    const [ox, oy] = this.rotate(rig.target[0], rig.target[1]);
    return {
      target: [this.x + ox, this.y + oy, 0],
      distance: rig.distance,
      pitch: this.effectivePitch(rig),
      yaw: this.yaw,
      fovY: rig.fovY,
      aspect: this.canvas.width / Math.max(1, this.canvas.height),
      near: NEAR_PLANE,
    };
  }

  /** The ground point at screen centre (the camera's look target). */
  viewCenter(): [number, number] {
    const rig = this.rig();
    const [ox, oy] = this.rotate(rig.target[0], rig.target[1]);
    return [this.x + ox, this.y + oy];
  }

  setViewCenter(wx: number, wy: number) {
    const rig = this.rig();
    const [ox, oy] = this.rotate(rig.target[0], rig.target[1]);
    this.x = wx - ox;
    this.y = wy - oy;
  }

  /** The world-space ground point at a device-pixel corner, or null if that
   *  pixel looks past the horizon (no ground hit). */
  private groundAt(px: number, py: number): [number, number] | null {
    const ndcX = (px / Math.max(1, this.canvas.width)) * 2 - 1;
    const ndcY = 1 - (py / Math.max(1, this.canvas.height)) * 2;
    const hit = unprojectToPlaneZ(this.params(), ndcX, ndcY, 0);
    return hit ? [hit[0], hit[1]] : null;
  }

  /** Half the visible ground span (x, y) from the four screen corners. When a
   *  corner looks past the horizon the span is treated as 0 on that axis so the
   *  view clamps to the field edges rather than pinning to centre. */
  private visibleHalfExtent(): [number, number] {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const corners = [
      this.groundAt(0, 0),
      this.groundAt(W, 0),
      this.groundAt(0, H),
      this.groundAt(W, H),
    ];
    if (corners.some((c) => c === null)) return [0, 0];
    const xs = corners.map((c) => c![0]);
    const ys = corners.map((c) => c![1]);
    return [(Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2];
  }

  /** Keep the field in view: hold the zoom floor, then keep the look target inside
   *  the playable field. In the near-top-down overview (zoomed out) an axis the
   *  whole field fits on is pinned to the field centre so you cannot pan into empty
   *  space; in the oblique vista the view sees far past the field toward the
   *  horizon, so panning stays free and only the look target is clamped to bounds. */
  clampView() {
    this.zoom = Math.min(60, Math.max(this.zoomRange.min, this.zoom));
    if (!this.bounds) return;
    const [x0, y0, x1, y1] = this.bounds;
    // Only the near-top-down overview centres the field; the vista pans freely.
    const overview = this.pitch >= 1.0;
    const [hw, hh] = overview ? this.visibleHalfExtent() : [0, 0];
    const [cx, cy] = this.viewCenter();
    const clampedX = hw >= (x1 - x0) / 2 ? (x0 + x1) / 2 : Math.min(x1 - hw, Math.max(x0 + hw, cx));
    const clampedY = hh >= (y1 - y0) / 2 ? (y0 + y1) / 2 : Math.min(y1 - hh, Math.max(y0 + hh, cy));
    this.x += clampedX - cx;
    this.y += clampedY - cy;
  }

  /** World coords to CSS-pixel screen coords (DOM overlays). `wz` lets anchors
   *  sit on elevated terrain rather than the z = 0 plane. Points behind the
   *  camera return far off-screen so callers cull them. */
  worldToScreen(wx: number, wy: number, wz = 0): [number, number] {
    const { ndc, clipW } = projectPoint(this.params(), [wx, wy, wz]);
    const dpr = window.devicePixelRatio || 1;
    if (clipW <= 0) return [-1e5, -1e5];
    return [
      ((ndc[0] * 0.5 + 0.5) * this.canvas.width) / dpr,
      ((1 - (ndc[1] * 0.5 + 0.5)) * this.canvas.height) / dpr,
    ];
  }

  /** Canvas device-pixel coords (y down) to world coords on the ground plane
   *  (z = 0): the real picking ray → ground-plane intersection. */
  screenToWorld(px: number, py: number): [number, number] {
    const ndcX = (px / Math.max(1, this.canvas.width)) * 2 - 1;
    const ndcY = 1 - (py / Math.max(1, this.canvas.height)) * 2;
    const hit = unprojectToPlaneZ(this.params(), ndcX, ndcY, 0);
    if (!hit) return this.viewCenter();
    return [hit[0], hit[1]];
  }

  /** Pan by a device-pixel screen delta (middle/right drag): keep the world under
   *  the cursor tracking the cursor by differencing two ground ray-casts. */
  panPixels(dx: number, dy: number) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const [ax, ay] = this.screenToWorld(cx, cy);
    const [bx, by] = this.screenToWorld(cx + dx, cy + dy);
    this.x += ax - bx;
    this.y += ay - by;
    this.clampView();
  }

  /** Pan by a screen-axes world delta (right, up) — keyboard/edge scroll, kept
   *  view-relative so W always drives into the screen whatever the yaw. */
  panWorld(right: number, up: number) {
    // Screen axes in the yaw-0 world frame: right = +Y, up = −X (view direction).
    const [wx, wy] = this.rotate(-up, right);
    this.x += wx;
    this.y += wy;
    this.clampView();
  }

  /** Zoom keeping the world point under the cursor fixed. */
  zoomAt(px: number, py: number, factor: number, afterZoom?: () => void) {
    const [wx, wy] = this.screenToWorld(px, py);
    this.zoom = Math.min(60, Math.max(0.4, this.zoom * factor));
    afterZoom?.();
    const [nx, ny] = this.screenToWorld(px, py);
    this.x += wx - nx;
    this.y += wy - ny;
    this.clampView();
  }
}
