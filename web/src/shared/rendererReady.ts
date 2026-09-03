import { fatalSurfaceFor, showFatalErrorSurface } from "./fatalError";

export function awaitRendererReady(
  ready: Promise<void>,
  canvas: HTMLCanvasElement,
  onReady: () => void,
): void {
  void ready.then(onReady).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    showFatalErrorSurface(canvas, fatalSurfaceFor("init", message));
  });
}
