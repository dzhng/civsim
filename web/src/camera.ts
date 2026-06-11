// 2D orthographic camera. World units are meters, y-up.
// zoom = device pixels per meter.
export class Camera {
  x = 0;
  y = 0;
  zoom = 4;
  /** Hard view bounds (the painted world: map + wilds). Set once known. */
  bounds: [number, number, number, number] | null = null;

  constructor(private canvas: HTMLCanvasElement) {}

  /** Keep the entire viewport inside the painted world — no black, ever. */
  clampView() {
    if (!this.bounds) return;
    const [x0, y0, x1, y1] = this.bounds;
    const minZoom = Math.max(this.canvas.width / (x1 - x0), this.canvas.height / (y1 - y0));
    this.zoom = Math.min(60, Math.max(minZoom, this.zoom));
    const hw = this.canvas.width / (2 * this.zoom);
    const hh = this.canvas.height / (2 * this.zoom);
    this.x = Math.min(x1 - hw, Math.max(x0 + hw, this.x));
    this.y = Math.min(y1 - hh, Math.max(y0 + hh, this.y));
  }

  /** [scaleX, scaleY, centerX, centerY] for the vertex shader. */
  uniform(): [number, number, number, number] {
    return [(2 * this.zoom) / this.canvas.width, (2 * this.zoom) / this.canvas.height, this.x, this.y];
  }

  /** World coords to CSS-pixel screen coords (for DOM overlays). */
  worldToScreen(wx: number, wy: number): [number, number] {
    const dpr = window.devicePixelRatio || 1;
    return [
      ((wx - this.x) * this.zoom + this.canvas.width / 2) / dpr,
      ((this.y - wy) * this.zoom + this.canvas.height / 2) / dpr,
    ];
  }

  /** Convert canvas device-pixel coords (y down) to world coords (y up). */
  screenToWorld(px: number, py: number): [number, number] {
    return [
      this.x + (px - this.canvas.width / 2) / this.zoom,
      this.y - (py - this.canvas.height / 2) / this.zoom,
    ];
  }

  panPixels(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y += dy / this.zoom;
    this.clampView();
  }

  /** Zoom keeping the world point under the cursor fixed. */
  zoomAt(px: number, py: number, factor: number) {
    const [wx, wy] = this.screenToWorld(px, py);
    this.zoom = Math.min(60, Math.max(0.4, this.zoom * factor));
    const [nx, ny] = this.screenToWorld(px, py);
    this.x += wx - nx;
    this.y += wy - ny;
    this.clampView();
  }
}
