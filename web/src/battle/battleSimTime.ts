import type { BattleSimClient } from "./sim/battleSimClient";

/** The battle's time controls. Pause, speed and the snapshot freeze are player and
 * harness intent held here and mirrored to the authority, which owns the ticking.
 * Presentation time is derived from when completed ticks actually arrived, so the
 * camera keeps its own cadence and never waits on a tick to draw a frame. */
export interface BattleTimeControl {
  paused: boolean;
  timeScale: number;
  frozen: boolean;
}

export class BattleSimTime implements BattleTimeControl {
  private pausedIntent = false;
  private timeScaleIntent = 1;
  private frozenIntent = false;
  private hidden = false;
  private holding = true;

  constructor(private readonly sim: BattleSimClient) {}

  get paused(): boolean {
    return this.pausedIntent;
  }
  set paused(value: boolean) {
    this.pausedIntent = value;
    this.sync();
  }

  get timeScale(): number {
    return this.timeScaleIntent;
  }
  set timeScale(value: number) {
    this.timeScaleIntent = value;
    this.sync();
  }

  /** Snapshot freeze: the sim holds at a known tick so a pixel capture is
   * reproducible. It pauses the authority without owning the player's pause. */
  get frozen(): boolean {
    return this.frozenIntent;
  }
  set frozen(value: boolean) {
    this.frozenIntent = value;
    this.sync();
  }

  /** A hidden tab stops the authority rather than banking ticks to replay on
   * return; the battle resumes where the player left it. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.sync();
  }

  /** Held until the battle is actually on screen, so no combat happens behind the
   * loading cover. A scripted advance still runs: a capture or a benchmark
   * preparation asks for ticks explicitly. */
  setHolding(holding: boolean): void {
    this.holding = holding;
    this.sync();
  }

  /** Where the crowd should be sampled this frame. */
  presentationTick(nowMs: number): number {
    return this.frozenIntent ? this.sim.tick() : this.sim.presentationTick(nowMs);
  }

  /** How far into the pending tick presentation currently stands, 0..1. */
  alphaAt(nowMs: number): number {
    const tick = this.presentationTick(nowMs);
    return this.frozenIntent ? 0 : Math.min(1, Math.max(0, tick - Math.floor(tick)));
  }

  private sync(): void {
    this.sim.paused = this.pausedIntent || this.frozenIntent;
    this.sim.timeScale = this.timeScaleIntent;
    this.sim.suspended = this.hidden || this.holding;
  }
}
