import type { SimClock } from "../shared/simClock";
import type { BattleRenderer } from "./renderer";

export class BattleFreeze {
  private pausedBeforeFreeze = false;
  effects = false;

  constructor(
    private clock: SimClock,
    private renderer: BattleRenderer,
    private syncAudioSuspension: () => void,
  ) {}

  doFreeze(on = true): void {
    if (on && !this.clock.frozen) this.pausedBeforeFreeze = this.clock.paused;
    this.clock.paused = on ? true : this.pausedBeforeFreeze;
    this.clock.frozen = on;
    if (!on) this.effects = false;
    this.renderer.fixedTime = on ? 0 : null;
    this.renderer.preserveFrozenEffects = on && this.effects;
    this.syncAudioSuspension();
  }

  freezeAtTick(
    target: number,
    currentTick: () => number,
    advance: (ticks: number) => void,
    afterAdvance: () => void,
    options: { effects?: boolean } = {},
  ) {
    this.effects = options.effects === true;
    this.doFreeze(true);
    const ticks = target - currentTick();
    if (ticks > 0) advance(ticks);
    afterAdvance();
    return this.renderer.settlePresentedFrame();
  }
}
