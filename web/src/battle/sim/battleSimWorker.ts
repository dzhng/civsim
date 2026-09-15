/** The worker entry: a browser-side host for the battle authority.
 *
 * Everything the authority does lives in `battleAuthority.ts`, so the same state
 * machine runs under a CPU test. This file only supplies the worker's clock, its
 * single earliest-deadline timer and its message channel. */
import { createBattleAuthority } from "./battleAuthority";
import type { BattleSimReply, BattleSimRequest } from "./protocol";

interface WorkerScope {
  postMessage(message: BattleSimReply, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  close(): void;
}
const scope = self as unknown as WorkerScope;

let timer: ReturnType<typeof setTimeout> | null = null;
let timerAtMs: number | null = null;

const authority = createBattleAuthority({
  post: (reply, transfer) => scope.postMessage(reply, transfer),
  now: () => performance.now(),
  // One pending wake-up, always at the earliest deadline asked for: a returned
  // credit or an unpause must not sit behind a timer aimed at the next tick.
  schedule(delayMs) {
    const delay = Math.max(0, delayMs);
    const at = performance.now() + delay;
    if (timer !== null) {
      if (timerAtMs !== null && at >= timerAtMs - 0.5) return;
      clearTimeout(timer);
    }
    timerAtMs = at;
    timer = setTimeout(() => {
      timer = null;
      timerAtMs = null;
      authority.pump();
    }, delay);
  },
  close() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    timerAtMs = null;
    scope.close();
  },
});

scope.addEventListener("message", (event: MessageEvent) =>
  authority.handle(event.data as BattleSimRequest),
);
