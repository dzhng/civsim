import type { BattleRendererApi } from "./battleRendererApi";
import type { BattleTimeControl } from "./battleSimTime";

export class BattleFreeze {
  private pausedBeforeFreeze = false;
  effects = false;

  constructor(
    private time: BattleTimeControl,
    private renderer: BattleRendererApi,
    private syncAudioSuspension: () => void,
    private signal?: AbortSignal,
  ) {}

  doFreeze(on = true): void {
    if (on && !this.time.frozen) this.pausedBeforeFreeze = this.time.paused;
    this.time.paused = on ? true : this.pausedBeforeFreeze;
    this.time.frozen = on;
    if (!on) this.effects = false;
    this.renderer.fixedTime = on ? 0 : null;
    this.renderer.preserveFrozenEffects = on && this.effects;
    this.syncAudioSuspension();
  }

  /** Freeze, then have the authority run to the target tick and wait until that
   * tick has been consumed and a subsequent loop presentation has completed.
   * Settling the renderer alone can redraw the preceding packet. */
  async freezeAtTick(
    target: number,
    advanceTo: (tick: number) => Promise<void>,
    afterAdvance: () => void,
    awaitPresentation: () => Promise<void>,
    options: { effects?: boolean } = {},
  ): Promise<void> {
    this.signal?.throwIfAborted();
    this.effects = options.effects === true;
    this.doFreeze(true);
    await advanceTo(target);
    this.signal?.throwIfAborted();
    afterAdvance();
    await awaitPresentation();
    this.signal?.throwIfAborted();
    await this.renderer.settlePresentedFrame(this.signal);
  }
}

/** A waiter accepts only a presentation begun after it registered. An older
 * in-flight packet cannot satisfy a freeze requested while that packet awaited. */
export class BattlePresentationBarrier {
  private started = 0;
  private failure: { error: unknown } | null = null;
  private waiters = new Set<{ after: number; resolve(): void; reject(error: unknown): void }>();
  constructor(signal: AbortSignal) {
    if (signal.aborted) this.fail(signal.reason);
    else signal.addEventListener("abort", () => this.fail(signal.reason), { once: true });
  }
  begin(): number {
    return ++this.started;
  }
  complete(presentation: number): void {
    for (const waiter of this.waiters) {
      if (presentation <= waiter.after) continue;
      this.waiters.delete(waiter);
      waiter.resolve();
    }
  }
  waitForNext(): Promise<void> {
    if (this.failure) return Promise.reject(this.failure.error);
    return new Promise((resolve, reject) => {
      this.waiters.add({ after: this.started, resolve, reject });
    });
  }
  fail(error: unknown): void {
    if (this.failure) return;
    this.failure = { error };
    for (const waiter of this.waiters) waiter.reject(error);
    this.waiters.clear();
  }
}
