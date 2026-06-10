// 2D orthographic camera. World units are meters, y-up.
// zoom = device pixels per meter.
export class Camera {
  x = 0;
  y = 0;
  zoom = 4;

  constructor(private canvas: HTMLCanvasElement) {}

  /** [scaleX, scaleY, centerX, centerY] for the vertex shader. */
  uniform(): [number, number, number, number] {
    return [(2 * this.zoom) / this.canvas.width, (2 * this.zoom) / this.canvas.height, this.x, this.y];
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
  }

  /** Zoom keeping the world point under the cursor fixed. */
  zoomAt(px: number, py: number, factor: number) {
    const [wx, wy] = this.screenToWorld(px, py);
    this.zoom = Math.min(60, Math.max(0.8, this.zoom * factor));
    const [nx, ny] = this.screenToWorld(px, py);
    this.x += wx - nx;
    this.y += wy - ny;
  }
}
