import type { BattlePresentationReceipt } from "./renderer";
export interface PresentationTiming {
  renderCpuMs: number;
  /** Wall time while the loop awaited a renderer promise; may include library continuations. */
  renderAwaitMs: number;
  renderWallMs: number;
  asyncRenderCpuMs: number;
}
/** Keeps source submission synchronous. Only a real pending renderer result suspends
 * the loop, and cancellation suppresses every post-presentation consumer. */
export function completeBattlePresentation(
  startedAt: number,
  signal: AbortSignal,
  present: () => BattlePresentationReceipt | Promise<BattlePresentationReceipt>,
  complete: (receipt: BattlePresentationReceipt, timing: PresentationTiming) => void,
  now: () => number = () => performance.now(),
): void | Promise<void> {
  signal.throwIfAborted();
  const callStarted = now();
  const result = present();
  const callFinished = now();
  const finish = (receipt: BattlePresentationReceipt, awaited: boolean) => {
    if (signal.aborted) return;
    const completedAt = now();
    complete(receipt, {
      renderCpuMs: callStarted - startedAt + receipt.cpuMs,
      renderAwaitMs: awaited ? completedAt - callFinished : 0,
      renderWallMs: completedAt - startedAt,
      asyncRenderCpuMs: awaited ? Math.max(0, receipt.cpuMs - (callFinished - callStarted)) : 0,
    });
  };
  if (result instanceof Promise) return result.then((receipt) => finish(receipt, true));
  finish(result, false);
}

/** An exited scene cannot receive UI updates. Only its actual cancellation may
 * disappear; unrelated asynchronous failures still propagate through the drain. */
export function reportBattlePresentationFailure(
  error: unknown,
  signal: AbortSignal,
  report: (error: unknown) => void,
): void {
  if (signal.aborted) {
    if (error === signal.reason || (error instanceof DOMException && error.name === "AbortError"))
      return;
    throw error;
  }
  report(error);
}
