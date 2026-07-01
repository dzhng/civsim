// Battle camera, Total War style. World units are meters, y-up; zoom = device
// pixels per meter. Pitch/yaw rotate the ground view, and the close-vista rig can
// add mild perspective. Keep this projection paired with cameraWgsl.ts so picking
// and DOM overlays agree with the GPU frame.
export class Camera {
  x = 0;
  y = 0;
  zoom = 4;
  /** View tilt from straight-down, radians (0 = top-down 2D). Written from the
   *  zoom curve + the user's pitch bias each frame. */
  pitch = 0;
  /** User tilt added to the zoom-driven auto pitch (middle-drag vertical). */
  pitchBias = 0;
  /** View-forward target shift in world meters, driven by the zoom camera rig. */
  targetOffset = 0;
  /** Normalized zoom-rig state: 0 = tactical zoom-out, 1 = close vista. */
  zoomT = 0;
  /** Shared camera perspective term, matching renderer-core cameraUniform.ts. */
  perspective = 0;
  /** View rotation about the vertical, radians (Q/E and middle-drag horizontal). */
  yaw = 0;
  /** Hard view bounds. When zoomed out past one axis, that axis is centered. */
  bounds: [number, number, number, number] | null = null;

  constructor(private canvas: HTMLCanvasElement) {}

  /** Screen-vertical world-meters per device pixel: the view-forward axis
   *  foreshortens by cos(pitch). */
  private cosP() {
    return Math.max(0.2, Math.cos(this.pitch));
  }

  /** Rotate a screen-axes vector (right, up) into world (east, north) by yaw. */
  private screenToWorldDir(right: number, up: number): [number, number] {
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    // right axis = (cos, sin); up axis = (-sin, cos).
    return [right * c - up * s, right * s + up * c];
  }

  viewCenter(): [number, number] {
    const [ox, oy] = this.screenToWorldDir(0, this.targetOffset);
    return [this.x + ox, this.y + oy];
  }

  setViewCenter(wx: number, wy: number) {
    const [ox, oy] = this.screenToWorldDir(0, this.targetOffset);
    this.x = wx - ox;
    this.y = wy - oy;
  }

  /** Keep the camera tied to its bounds.
   *
   * The zoom floor is aspect-fit: the user may zoom out until the whole
   * bounded field is visible, but no farther. When the viewport is larger than
   * the field on an axis, that axis is pinned to the field centre; when it is
   * smaller, panning is clamped so no edge scrolls past the playable field.
   */
  clampView() {
    if (!this.bounds) return;
    const [x0, y0, x1, y1] = this.bounds;
    const cp = this.cosP();
    const bw = x1 - x0;
    const bh = y1 - y0;
    const minZoom = Math.min(this.canvas.width / bw, this.canvas.height / cp / bh);
    this.zoom = Math.min(60, Math.max(minZoom, this.zoom));
    const hw = this.canvas.width / (2 * this.zoom);
    const hh = this.canvas.height / (2 * this.zoom * cp);
    const [ox, oy] = this.screenToWorldDir(0, this.targetOffset);
    const cx = this.x + ox;
    const cy = this.y + oy;
    const clampedX = hw >= bw / 2 ? (x0 + x1) / 2 : Math.min(x1 - hw, Math.max(x0 + hw, cx));
    const clampedY = hh >= bh / 2 ? (y0 + y1) / 2 : Math.min(y1 - hh, Math.max(y0 + hh, cy));
    this.x = clampedX - ox;
    this.y = clampedY - oy;
  }

  /** World coords to CSS-pixel screen coords (for DOM overlays). */
  worldToScreen(wx: number, wy: number): [number, number] {
    const dpr = window.devicePixelRatio || 1;
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    const [cx, cy] = this.viewCenter();
    const dx = wx - cx,
      dy = wy - cy;
    // Rotate the ground by -yaw: right = (c,s), forward = (-s,c).
    const rx = dx * c + dy * s;
    const ry = -dx * s + dy * c;
    const depth = this.perspectiveDepth(ry);
    return [
      ((rx * this.zoom) / depth + this.canvas.width / 2) / dpr,
      ((-ry * this.zoom * this.cosP()) / depth + this.canvas.height / 2) / dpr,
    ];
  }

  /** Convert canvas device-pixel coords (y down) to world coords (y up). */
  screenToWorld(px: number, py: number): [number, number] {
    const screenX = px - this.canvas.width / 2;
    const screenY = -(py - this.canvas.height / 2);
    const yProjected = screenY / (this.zoom * this.cosP());
    const p = Math.max(0, this.perspective);
    const ry = p > 0 ? yProjected / Math.max(0.18, 1 - yProjected * p) : yProjected;
    const rx = (screenX / this.zoom) * this.perspectiveDepth(ry);
    const [dx, dy] = this.screenToWorldDir(rx, ry);
    const [cx, cy] = this.viewCenter();
    return [cx + dx, cy + dy];
  }

  private perspectiveDepth(forwardMeters: number) {
    return Math.max(0.32, 1 + forwardMeters * Math.max(0, this.perspective));
  }

  /** Pan by a device-pixel screen delta (middle/right drag), in the yawed frame. */
  panPixels(dx: number, dy: number) {
    const [wx, wy] = this.screenToWorldDir(-dx / this.zoom, dy / (this.zoom * this.cosP()));
    this.x += wx;
    this.y += wy;
    this.clampView();
  }

  /** Pan by a screen-axes world delta (right, up) — keyboard/edge scroll, kept
   *  view-relative so W always drives into the screen whatever the yaw. */
  panWorld(right: number, up: number) {
    const [wx, wy] = this.screenToWorldDir(right, up);
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
