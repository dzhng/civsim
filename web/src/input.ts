import type { Camera } from './camera';

export interface OrderSink {
  pickUnit(x: number, y: number): number;
  orderMove(unit: number, x: number, y: number): void;
  togglePace(unit: number): void;
}

const DRAG_THRESHOLD_PX = 5;

/** Left-drag pans, left-click selects, right-click orders, R toggles pace. */
export class Input {
  selected = -1;

  constructor(canvas: HTMLCanvasElement, camera: Camera, sink: OrderSink) {
    const dpr = () => window.devicePixelRatio || 1;
    let dragging = false;
    let moved = 0;
    let last: [number, number] = [0, 0];

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = 0;
      last = [e.clientX, e.clientY];
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - last[0];
      const dy = e.clientY - last[1];
      moved += Math.abs(dx) + Math.abs(dy);
      last = [e.clientX, e.clientY];
      camera.panPixels(dx * dpr(), dy * dpr());
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !dragging) return;
      dragging = false;
      if (moved < DRAG_THRESHOLD_PX) {
        const [wx, wy] = camera.screenToWorld(e.clientX * dpr(), e.clientY * dpr());
        this.selected = sink.pickUnit(wx, wy);
      }
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.selected < 0) return;
      const [wx, wy] = camera.screenToWorld(e.clientX * dpr(), e.clientY * dpr());
      sink.orderMove(this.selected, wx, wy);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' && this.selected >= 0) sink.togglePace(this.selected);
    });

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
