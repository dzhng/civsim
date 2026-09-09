import { fatalSurfaceFor, showFatalErrorSurface } from "./fatalError";

export function awaitRendererReady(
  ready: Promise<void>,
  canvas: HTMLCanvasElement,
  onReady: () => void,
  signal?: AbortSignal,
  onError?: () => void,
): void {
  void ready
    .then(() => {
      if (!signal?.aborted) onReady();
    })
    .catch((error: unknown) => {
      if (signal?.aborted) return;
      onError?.();
      const message = error instanceof Error ? error.message : String(error);
      showFatalErrorSurface(canvas, fatalSurfaceFor("init", message));
    });
}
