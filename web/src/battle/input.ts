import type { Camera } from '../shared/camera';

export interface OrderSink {
  /** All player units whose centers fall in the world-space rect. */
  unitsInRect(x0: number, y0: number, x1: number, y1: number): number[];
  /** Every living player unit (ctrl+A). */
  allUnits(): number[];
  pickUnit(x: number, y: number): number;
  /** Drag-move: translate the whole selection, preserving facing. */
  dragMove(units: number[], dx: number, dy: number): void;
  /** Point order for the selection (move/attack/disengage + run on double). */
  orderPoint(units: number[], x: number, y: number, shift: boolean, double: boolean, alt: boolean): void;
  /** Right-drag: move to (x, y) and end facing `facing` (the drag arrow). */
  orderFacing(units: number[], x: number, y: number, facing: number, queued: boolean): void;
  togglePace(units: number[]): void;
  reform(units: number[]): void;
  toggleWeapon(units: number[]): void;
  toggleKite(units: number[]): void;
  togglePursue(units: number[]): void;
  toggleFire(units: number[]): void;
}

const DRAG_PX = 7;

export class Input {
  selected: number[] = [];
  /** Pan velocity from held keys + screen edges (read by main). */
  panX = 0;
  panY = 0;
  /** Screen-space selection box while dragging, for the DOM rectangle. */
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Latest mouse position (CSS px), for hover cards. */
  mouseCss: [number, number] = [-1, -1];
  /** World-space translation of an in-progress drag-move of the selection. */
  dragDelta: [number, number] | null = null;
  /** In-progress right-drag: press point + current cursor (world). */
  rightDrag: { x: number; y: number; facing: number } | null = null;

  /** All listeners detach (and the pan interval stops) when `signal` aborts. */
  constructor(canvas: HTMLCanvasElement, camera: Camera, sink: OrderSink, signal: AbortSignal) {
    const dpr = () => window.devicePixelRatio || 1;
    const held = new Set<string>();

    let lDown: [number, number] | null = null;
    let rDown: [number, number] | null = null;
    let lastRightUp = 0;

    let dragMoving = false;
    let mouseX = -1; // -1 = mouse never seen: edge-pan stays off
    let mouseY = -1;
    let mDown: [number, number] | null = null;
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault(); // no autoscroll: middle button drags the camera
        mDown = [e.clientX, e.clientY];
      }
      if (e.button === 0) {
        lDown = [e.clientX, e.clientY];
        // Starting the drag ON a selected unit grabs the whole selection
        // (Total War drag-move); anywhere else it is a selection box.
        const [wx, wy] = camera.screenToWorld(e.clientX * dpr(), e.clientY * dpr());
        const hit = sink.pickUnit(wx, wy);
        dragMoving = hit >= 0 && this.selected.includes(hit);
      }
      if (e.button === 2) rDown = [e.clientX, e.clientY];
    }, { signal });

    let rLast: [number, number] | null = null;
    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      this.mouseCss = [e.clientX, e.clientY];
      if (mDown) {
        // Total War middle-drag: horizontal rotates the view (yaw), vertical
        // tilts it (pitch). Drag down → a lower, more side-on angle.
        camera.yaw += (e.clientX - mDown[0]) * 0.006;
        camera.pitchBias = Math.max(-0.45, Math.min(1.0, camera.pitchBias + (e.clientY - mDown[1]) * 0.004));
        mDown = [e.clientX, e.clientY];
      }
      if (rDown && this.selected.length === 0) {
        // No selection: the right button drags the camera itself.
        if (rLast) camera.panPixels((e.clientX - rLast[0]) * dpr(), (e.clientY - rLast[1]) * dpr());
        rLast = [e.clientX, e.clientY];
      }
      if (rDown) {
        const moved = Math.hypot(e.clientX - rDown[0], e.clientY - rDown[1]);
        if (moved > DRAG_PX && this.selected.length > 0) {
          const [px, py] = camera.screenToWorld(rDown[0] * dpr(), rDown[1] * dpr());
          const [cx, cy] = camera.screenToWorld(e.clientX * dpr(), e.clientY * dpr());
          this.rightDrag = { x: px, y: py, facing: Math.atan2(cy - py, cx - px) };
        } else {
          this.rightDrag = null;
        }
      }
      if (lDown) {
        const moved = Math.hypot(e.clientX - lDown[0], e.clientY - lDown[1]);
        if (dragMoving) {
          const [ax, ay] = camera.screenToWorld(lDown[0] * dpr(), lDown[1] * dpr());
          const [bx, by] = camera.screenToWorld(e.clientX * dpr(), e.clientY * dpr());
          this.dragDelta = moved > DRAG_PX ? [bx - ax, by - ay] : null;
        } else {
          this.box = moved > DRAG_PX ? { x0: lDown[0], y0: lDown[1], x1: e.clientX, y1: e.clientY } : null;
        }
      }
    }, { signal });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && lDown) {
        const [sx, sy] = lDown;
        lDown = null;
        if (dragMoving) {
          dragMoving = false;
          if (this.dragDelta) {
            sink.dragMove(this.selected, this.dragDelta[0], this.dragDelta[1]);
            this.dragDelta = null;
          } else {
            // A plain click on a selected unit: re-select just it.
            const [wx, wy] = camera.screenToWorld(sx * dpr(), sy * dpr());
            const u = sink.pickUnit(wx, wy);
            this.selected = u >= 0 ? [u] : [];
          }
          return;
        }
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
      if (e.button === 1) mDown = null;
      if (e.button === 2 && rDown) {
        const [sx, sy] = rDown;
        rDown = null;
        rLast = null;
        const drag = this.rightDrag;
        this.rightDrag = null;
        if (this.selected.length === 0) return;
        const moved = Math.hypot(e.clientX - sx, e.clientY - sy);
        if (moved > DRAG_PX && drag) {
          // Drag arrow: go to the press point, face the cursor direction.
          sink.orderFacing(this.selected, drag.x, drag.y, drag.facing, e.shiftKey);
        } else {
          const [bx, by] = camera.screenToWorld(e.clientX * dpr(), e.clientY * dpr());
          const now = performance.now();
          const double = now - lastRightUp < 350;
          lastRightUp = now;
          sink.orderPoint(this.selected, bx, by, e.shiftKey, double, e.altKey);
        }
      }
    }, { signal });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });

    window.addEventListener('keydown', (e) => {
      held.add(e.key.toLowerCase());
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.selected = sink.allUnits();
        return;
      }
      // Camera reset (Total War: Backspace re-levels and faces north).
      if (e.key === 'Backspace') { camera.yaw = 0; camera.pitchBias = 0; e.preventDefault(); return; }
      const sel = this.selected;
      if (sel.length === 0) return;
      if (e.key === 'r') sink.togglePace(sel);
      if (e.key === 'g') sink.reform(sel);
      if (e.key === 'h') sink.togglePursue(sel);
      if (e.key === 'v') sink.toggleFire(sel);
      if (e.key === 'x') sink.toggleWeapon(sel);
      if (e.key === 'k') sink.toggleKite(sel); // (moved off E, now a camera-rotate key)
    }, { signal });
    window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()), { signal });

    // Continuous pan: held keys + screen edges, applied by the main loop.
    const panTimer = setInterval(() => {
      const speed = 600 / camera.zoom;
      let px = (held.has('d') || held.has('arrowright') ? speed : 0) - (held.has('a') || held.has('arrowleft') ? speed : 0);
      let py = (held.has('w') || held.has('arrowup') ? speed : 0) - (held.has('s') || held.has('arrowdown') ? speed : 0);
      const EDGE = 14;
      if (mouseX >= 0 && mouseY >= 0) {
        if (mouseX < EDGE) px -= speed;
        if (mouseX > window.innerWidth - EDGE) px += speed;
        if (mouseY < EDGE) py += speed;
        if (mouseY > window.innerHeight - EDGE) py -= speed;
      }
      this.panX = px;
      this.panY = py;
      // Q/E rotate the camera (Total War), continuous while held.
      if (held.has('q')) camera.yaw -= 0.035;
      if (held.has('e')) camera.yaw += 0.035;
    }, 50);
    signal.addEventListener('abort', () => clearInterval(panTimer));

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        camera.zoomAt(e.clientX * dpr(), e.clientY * dpr(), Math.pow(1.0015, -e.deltaY));
      },
      { passive: false, signal },
    );
  }
}
