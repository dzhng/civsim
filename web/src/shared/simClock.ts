export class SimClock {
  paused = false;
  timeScale = 1;
  frozen = false;

  private readonly tickHz: number;
  private readonly maxTicksPerFrame: number;
  private lastMs: number | null = null;
  private accumulatedTicks = 0;
  private currentTick = 0;

  constructor(o: { tickHz: number; maxTicksPerFrame: number }) {
    this.tickHz = o.tickHz;
    this.maxTicksPerFrame = o.maxTicksPerFrame;
  }

  advance(nowMs: number): number {
    if (this.lastMs === null) {
      this.lastMs = nowMs;
      return 0;
    }

    const elapsedSeconds = Math.min(Math.max(0, nowMs - this.lastMs) / 1000, 0.25);
    this.lastMs = nowMs;
    if (this.paused || this.frozen) return 0;

    this.accumulatedTicks += elapsedSeconds * this.tickHz * this.timeScale;
    const cap = Math.max(0, Math.floor(this.maxTicksPerFrame * this.timeScale));
    const ticks = Math.min(Math.floor(this.accumulatedTicks), cap);
    this.accumulatedTicks -= ticks;
    this.currentTick += ticks;
    if (ticks === cap) this.accumulatedTicks = 0;
    return ticks;
  }

  get tick(): number {
    return this.currentTick;
  }

  get alpha(): number {
    return this.accumulatedTicks;
  }
}
