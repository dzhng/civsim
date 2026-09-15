import type { FormationLine } from "./orders";
import type { Camera } from "../shared/camera";
import { createCameraKeyController } from "../shared/cameraKeys";

export interface OrderSink {
  /** Player units whose projected centers fall in the viewport CSS-pixel rect. */
  unitsInScreenRect(x0: number, y0: number, x1: number, y1: number): number[];
  /** Every living player unit (ctrl+A). */
  allUnits(): number[];
  /** Which player unit is at this world point, answered by the sim that owns the
   * rule. It resolves a round trip later, so a press defers the decision it needs
   * the answer for rather than guessing one here. */
  pickUnit(x: number, y: number): Promise<number>;
  /** Drag-move: translate the whole selection, preserving facing. */
  dragMove(units: number[], dx: number, dy: number): void;
  /** Point order for the selection (move/attack/disengage + run on double). */
  orderPoint(
    units: number[],
    x: number,
    y: number,
    shift: boolean,
    double: boolean,
    alt: boolean,
  ): void;
  /** Right-drag paints the formation front edge. */
  orderLine(units: number[], line: FormationLine, queued: boolean): void;
  togglePace(units: number[]): void;
  reform(units: number[]): void;
  toggleKite(units: number[]): void;
  togglePursue(units: number[]): void;
  toggleFire(units: number[]): void;
}

const DRAG_PX = 7;
export class Input {
  selected: number[] = [];
  /** Screen-space selection box while dragging, for the DOM rectangle. */
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Latest mouse position (CSS px), for hover cards. */
  mouseCss: [number, number] = [-1, -1];
  /** World-space translation of an in-progress drag-move of the selection. */
  dragDelta: [number, number] | null = null;
  /** In-progress Right-drag: press point + current cursor (world). */
  rightDrag: FormationLine | null = null;
  private readonly cameraKeys: ReturnType<typeof createCameraKeyController>;

  /** All listeners detach when `signal` aborts. */
  constructor(
    canvas: HTMLCanvasElement,
    camera: Camera,
    sink: OrderSink,
    signal: AbortSignal,
    onZoomChange: () => void = () => {},
  ) {
    const pickGround = (x: number, y: number) => {
      const rect = canvas.getBoundingClientRect();
      return camera.screenToWorld(
        ((x - rect.left) * canvas.width) / Math.max(1, rect.width),
        ((y - rect.top) * canvas.height) / Math.max(1, rect.height),
      );
    };
    let lDown: [number, number] | null = null;
    let rDown: {
      start: [number, number];
      ground: [number, number] | null;
      dragged: boolean;
    } | null = null;
    let lastRightUp = 0;

    // null while a press is still waiting on the authority's pick. The gesture
    // behaves as a selection box meanwhile — the common case — and converts to a
    // drag-move if the answer says the press landed on the selection.
    let dragMoving: boolean | null = false;
    let pickGeneration = 0;
    let mDown: [number, number] | null = null;
    canvas.addEventListener(
      "mousedown",
      (e) => {
        if (e.button === 1) {
          e.preventDefault(); // no autoscroll: middle button drags the camera
          mDown = [e.clientX, e.clientY];
        }
        if (e.button === 0) {
          lDown = [e.clientX, e.clientY];
          // Starting the drag ON a selected unit grabs the whole selection
          // (Total War drag-move); anywhere else it is a selection box.
          const point = pickGround(e.clientX, e.clientY);
          const generation = ++pickGeneration;
          dragMoving = point ? null : false;
          if (point)
            void sink.pickUnit(...point).then((hit) => {
              if (generation !== pickGeneration) return;
              dragMoving = hit >= 0 && this.selected.includes(hit);
              if (dragMoving) this.box = null;
            });
        }
        if (e.button === 2)
          rDown = {
            start: [e.clientX, e.clientY],
            ground: pickGround(e.clientX, e.clientY),
            dragged: false,
          };
      },
      { signal },
    );

    window.addEventListener(
      "mousemove",
      (e) => {
        this.mouseCss = [e.clientX, e.clientY];
        if (mDown) {
          // Middle-drag reorients ABOUT THE EYE: the camera stays put and the
          // view ray re-aims. Drag right → look right, drag down → look down
          // so dragging behaves like turning the viewer's head.
          camera.yawAboutEye(-(e.clientX - mDown[0]) * 0.006);
          camera.pitchAboutEye((e.clientY - mDown[1]) * 0.004);
          mDown = [e.clientX, e.clientY];
        }
        if (rDown) {
          const moved = Math.hypot(e.clientX - rDown.start[0], e.clientY - rDown.start[1]);
          if (moved > DRAG_PX) rDown.dragged = true;
          const start = rDown.ground;
          const end = pickGround(e.clientX, e.clientY);
          this.rightDrag =
            this.selected.length > 0 && moved > DRAG_PX && start && end
              ? {
                  x0: start[0],
                  y0: start[1],
                  x1: end[0],
                  y1: end[1],
                }
              : null;
        }

        if (lDown) {
          const moved = Math.hypot(e.clientX - lDown[0], e.clientY - lDown[1]);
          if (dragMoving === true) {
            const a = pickGround(...lDown);
            const b = pickGround(e.clientX, e.clientY);
            this.dragDelta = moved > DRAG_PX && a && b ? [b[0] - a[0], b[1] - a[1]] : null;
          } else {
            this.box =
              moved > DRAG_PX ? { x0: lDown[0], y0: lDown[1], x1: e.clientX, y1: e.clientY } : null;
          }
        }
      },
      { signal },
    );

    window.addEventListener(
      "mouseup",
      (e) => {
        if (e.button === 0 && lDown) {
          const [sx, sy] = lDown;
          lDown = null;
          const dragged = dragMoving === true && this.dragDelta !== null;
          const generation = ++pickGeneration;
          dragMoving = false;
          if (dragged) {
            sink.dragMove(this.selected, this.dragDelta![0], this.dragDelta![1]);
            this.dragDelta = null;
            return;
          }
          this.dragDelta = null;
          if (this.box) {
            this.selected = sink.unitsInScreenRect(
              Math.min(this.box.x0, this.box.x1),
              Math.min(this.box.y0, this.box.y1),
              Math.max(this.box.x0, this.box.x1),
              Math.max(this.box.y0, this.box.y1),
            );
            this.box = null;
            return;
          }
          // A plain click selects whatever the authority names under the press
          // point, including re-selecting a single unit out of the selection.
          const point = pickGround(sx, sy);
          if (!point) {
            this.selected = [];
            return;
          }
          void sink.pickUnit(...point).then((unit) => {
            if (generation !== pickGeneration) return;
            this.selected = unit >= 0 ? [unit] : [];
          });
        }
        if (e.button === 1) mDown = null;
        if (e.button === 2 && rDown) {
          const gesture = rDown;
          const [sx, sy] = gesture.start;
          rDown = null;
          const drag = this.rightDrag;
          this.rightDrag = null;
          if (this.selected.length === 0) return;
          const moved = Math.hypot(e.clientX - sx, e.clientY - sy);
          if (moved > DRAG_PX && drag) {
            const end = pickGround(e.clientX, e.clientY);
            if (end) sink.orderLine(this.selected, { ...drag, x1: end[0], y1: end[1] }, e.shiftKey);
          } else {
            if (gesture.dragged || moved > DRAG_PX) return;
            const point = pickGround(e.clientX, e.clientY);
            if (!point) return;
            const [bx, by] = point;
            const now = performance.now();
            const double = now - lastRightUp < 350;
            lastRightUp = now;
            sink.orderPoint(this.selected, bx, by, e.shiftKey, double, e.altKey);
          }
        }
      },
      { signal },
    );

    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });

    window.addEventListener(
      "keydown",
      (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          this.selected = sink.allUnits();
          return;
        }
        // Camera reset (Total War: Backspace/Home re-level to the default north-up view).
        if (e.key === "Backspace" || e.key === "Home") {
          camera.resetLook();
          e.preventDefault();
          return;
        }
        const sel = this.selected;
        if (sel.length === 0) return;
        if (e.key === "r") sink.togglePace(sel);
        if (e.key === "g") sink.reform(sel);
        if (e.key === "h") sink.togglePursue(sel);
        if (e.key === "v") sink.toggleFire(sel);
        if (e.key === "k") sink.toggleKite(sel); // E belongs to camera rotation
      },
      { signal },
    );
    this.cameraKeys = createCameraKeyController(
      {
        panWorld: (dx, dy) => camera.panWorld(dx, dy),
        yaw: (delta) => camera.yawAboutEye(delta),
        pitchOrZoom: (delta) => camera.pitchAboutEye(delta),
        zoomAt: (px, py, factor) => {
          // Twice the shared wheel travel for battle inspection.
          camera.zoomAt(px, py, factor * factor, onZoomChange);
        },
        panSpeed: () => camera.panSpeed(),
      },
      { canvas, edgeEnabled: () => !rDown && !mDown && !lDown },
    );
    signal.addEventListener("abort", () => this.cameraKeys.dispose());
  }

  updateCamera(dt: number): void {
    this.cameraKeys.update(dt);
  }
}
