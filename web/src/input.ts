import type { Camera } from './camera';

export interface OrderSink {
  /** All player units whose centers fall in the world-space rect. */
  unitsInRect(x0: number, y0: number, x1: number, y1: number): number[];
  pickUnit(x: number, y: number): number;
  /** Point order for the selection (move/attack/withdraw + run on double). */
  orderPoint(units: number[], x: number, y: number, shift: boolean, double: boolean): void;
  /** Line-paint order: form along the segment, facing perpendicular. */
  orderLine(units: number[], x0: number, y0: number, x1: number, y1: number): void;
  togglePace(units: number[]): void;
  toggleStance(units: number[]): void;
  toggleCharge(units: number[]): void;
  reform(units: number[]): void;
  togglePursue(units: number[]): void;
  toggleFire(units: number[]): void;
}

const DRAG_PX = 7;

export class Input {
  selected: number[] = [];
  /** Pan velocity from held keys, world m/s at current zoom (read by main). */
  panX = 0;
  panY = 0;
  /** Screen-space selection box while dragging, for the DOM rectangle. */
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(canvas: HTMLCanvasElement, camera: Camera, sink: OrderSink) {
    const dpr = () => window.devicePixelRatio || 1;
    const held = new Set<string>();

    let lDown: [number, number] | null = null;
    let rDown: [number, number] | null = null;
    let lastRightUp = 0;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) lDown = [e.clientX, e.clientY];
      if (e.button === 2) rDown = [e.clientX, e.clientY];
    });

    window.addEventListener('mousemove', (e) => {
      if (lDown) {
        const moved = Math.hypot(e.clientX - lDown[0], e.clientY - lDown[1]);
        this.box = moved > DRAG_PX ? { x0: lDown[0], y0: lDown[1], x1: e.clientX, y1: e.clientY } : null;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && lDown) {
        const [sx, sy] = lDown;
        lDown = null;
        if (this.box) {
          const [ax, ay] = camera.screenToWorld(this.box.x0 * dpr(), this.box.y0 * dpr());
          const [bx, by] = camera.screenToWorld(this.box.x1 * dpr(), this.box.y1 * dpr());
          this.selected = sink.unitsInRect(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
          this.box = null;
        } else {
          const [wx, wy] = camera.screenToWorld(sx * dpr(), sy * dpr());
          const u = sink.pickUnit(wx, wy);
          this.selected = u >= 0 ? [u] : [];
        }
      }
      if (e.button === 2 && rDown) {
        const [sx, sy] = rDown;
        rDown = null;
        if (this.selected.length === 0) return;
        const moved = Math.hypot(e.clientX - sx, e.clientY - sy);
        const [ax, ay] = camera.screenToWorld(sx * dpr(), sy * dpr());
        const [bx, by] = camera.screenToWorld(e.clientX * dpr(), e.clientY * dpr());
        if (moved > DRAG_PX) {
          sink.orderLine(this.selected, ax, ay, bx, by);
        } else {
          const now = performance.now();
          const double = now - lastRightUp < 350;
          lastRightUp = now;
          sink.orderPoint(this.selected, bx, by, e.shiftKey, double);
        }
      }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      held.add(e.key.toLowerCase());
      const sel = this.selected;
      if (sel.length === 0) return;
      if (e.key === 'r') sink.togglePace(sel);
      if (e.key === 'f') sink.toggleStance(sel);
      if (e.key === 'c') sink.toggleCharge(sel);
      if (e.key === 'g') sink.reform(sel);
      if (e.key === 'h') sink.togglePursue(sel);
      if (e.key === 'v') sink.toggleFire(sel);
    });
    window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));

    // Continuous pan from held keys, applied by the main loop.
    setInterval(() => {
      const speed = 600 / camera.zoom; // px-ish per second, zoom-relative
      this.panX = (held.has('d') || held.has('arrowright') ? speed : 0) - (held.has('a') || held.has('arrowleft') ? speed : 0);
      this.panY = (held.has('w') || held.has('arrowup') ? speed : 0) - (held.has('s') || held.has('arrowdown') ? speed : 0);
    }, 50);

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        camera.zoomAt(e.clientX * dpr(), e.clientY * dpr(), Math.pow(1.0015, -e.deltaY));
      },
      { passive: false },
    );
  }
}
