export interface CameraKeyTarget {
  panWorld(dx: number, dy: number): void;
  yaw(delta: number): void;
  pitchOrZoom(delta: number): void;
  zoomAt(px: number, py: number, factor: number): void;
  panSpeed(): number;
}

export function createCameraKeyController(
  target: CameraKeyTarget,
  opts: { edgePx?: number; sprint?: number; enabled?: () => boolean } = {},
): { update(dt: number): void; dispose(): void } {
  const edgePx = opts.edgePx ?? 14;
  const sprintMultiplier = opts.sprint ?? 3;
  const enabled = opts.enabled ?? (() => true);
  const held = new Set<string>();
  let active = true;
  let mouseX = -1;
  let mouseY = -1;

  const onKeyDown = (event: KeyboardEvent) => held.add(event.key.toLowerCase());
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.key.toLowerCase());
  const onMouseMove = (event: MouseEvent) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  };
  const onWheel = (event: WheelEvent) => {
    if (!enabled() || !(event.target instanceof HTMLCanvasElement)) return;
    event.preventDefault();
    const unitPx =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? window.innerHeight
          : 1;
    const wheelDelta = event.deltaY * unitPx;
    const dpr = window.devicePixelRatio || 1;
    target.zoomAt(event.clientX * dpr, event.clientY * dpr, Math.pow(1.0015, -wheelDelta * 0.2));
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("wheel", onWheel, { passive: false });

  return {
    update(dt: number) {
      if (!active || !enabled()) return;
      const speed = target.panSpeed() * (held.has("shift") ? sprintMultiplier : 1);
      let dx =
        (held.has("d") || held.has("arrowright") ? speed : 0) -
        (held.has("a") || held.has("arrowleft") ? speed : 0);
      let dy =
        (held.has("w") || held.has("arrowup") ? speed : 0) -
        (held.has("s") || held.has("arrowdown") ? speed : 0);
      if (mouseX >= 0 && mouseY >= 0) {
        if (mouseX < edgePx) dx -= speed;
        if (mouseX > window.innerWidth - edgePx) dx += speed;
        if (mouseY < edgePx) dy += speed;
        if (mouseY > window.innerHeight - edgePx) dy -= speed;
      }
      if (dx !== 0 || dy !== 0) target.panWorld(dx * dt, dy * dt);
      if (held.has("q")) target.yaw(0.7 * dt);
      if (held.has("e")) target.yaw(-0.7 * dt);
      if (held.has("z")) target.pitchOrZoom(0.4 * dt);
      if (held.has("x")) target.pitchOrZoom(-0.4 * dt);
    },
    dispose() {
      active = false;
      held.clear();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("wheel", onWheel);
    },
  };
}
