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
   * tick has actually been consumed here, so a capture can never read a state from
   * before the advance it asked for. */
  async freezeAtTick(
    target: number,
    advanceTo: (tick: number) => Promise<void>,
    afterAdvance: () => void,
    options: { effects?: boolean } = {},
  ): Promise<void> {
    this.effects = options.effects === true;
    this.doFreeze(true);
    await advanceTo(target);
    afterAdvance();
    await this.renderer.settlePresentedFrame(this.signal);
  }
}
