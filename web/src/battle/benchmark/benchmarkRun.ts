import type { BattleBenchmarkScenario } from "./benchmarkScenario";

export type BenchmarkPhase = "preparing" | "running" | "complete" | "cancelled" | "failed";
export interface BenchmarkStatus {
  phase: BenchmarkPhase;
  scenario: BattleBenchmarkScenario;
  preparationMs: number;
  elapsedMs: number;
  startTick: number | null;
  tick: number;
  reason: string | null;
}

/** Timing and termination only. The production battle loop owns every sim tick. */
export class BenchmarkRun {
  private state: BenchmarkStatus;
  private runningAt: number | null = null;
  private lastPublishedAt = -Infinity;
  private listeners = new Set<(status: BenchmarkStatus) => void>();

  constructor(
    readonly scenario: BattleBenchmarkScenario,
    private readonly createdAt: number,
  ) {
    this.state = {
      phase: "preparing",
      scenario,
      preparationMs: 0,
      elapsedMs: 0,
      startTick: null,
      tick: 0,
      reason: null,
    };
  }

  status(): BenchmarkStatus {
    return { ...this.state };
  }
  get active() {
    return this.state.phase === "preparing" || this.state.phase === "running";
  }

  subscribe(listener: (status: BenchmarkStatus) => void) {
    this.listeners.add(listener);
    listener(this.status());
    return () => {
      this.listeners.delete(listener);
    };
  }

  prepareStep(tick: number, advance: () => void, now: () => number, budgetMs = 8) {
    const began = now();
    let advanced = 0;
    while (this.state.phase === "preparing" && tick + advanced < this.scenario.startTick) {
      advance();
      advanced++;
      // A simulation tick is indivisible; even a slow tick must finish normally.
      if (now() - began >= budgetMs) break;
    }
    return advanced;
  }

  frame(now: number, tick: number, victor: number) {
    if (!this.active) return;
    const previousPhase = this.state.phase;
    this.state.tick = tick;
    if (this.state.phase === "preparing") {
      this.state.preparationMs = Math.max(0, now - this.createdAt);
      if (victor >= 0) return this.finish("failed", "Battle ended during preparation", now, tick);
      if (tick >= this.scenario.startTick) {
        this.runningAt = now;
        this.state.startTick = tick;
        this.state.phase = "running";
      }
    } else {
      this.state.elapsedMs = Math.max(0, now - this.runningAt!);
      if (victor >= 0) return this.finish("complete", "Early victory — short run", now, tick);
      if (this.state.elapsedMs >= this.scenario.durationMs)
        return this.finish("complete", "Timed window complete", now, tick);
    }
    this.publish(now, previousPhase !== this.state.phase);
  }

  cancel(now: number, tick: number) {
    this.finish("cancelled", "Cancelled — partial run", now, tick);
  }
  fail(reason: string, now: number, tick: number) {
    this.finish("failed", reason, now, tick);
  }

  private finish(phase: BenchmarkPhase, reason: string, now: number, tick: number) {
    if (!this.active) return;
    this.state.phase = phase;
    this.state.reason = reason;
    this.state.tick = tick;
    if (this.runningAt !== null) this.state.elapsedMs = Math.max(0, now - this.runningAt);
    else this.state.preparationMs = Math.max(0, now - this.createdAt);
    this.publish(now, true);
  }
  private publish(now: number, force: boolean) {
    if (!force && now - this.lastPublishedAt < 250) return;
    this.lastPublishedAt = now;
    for (const listener of this.listeners) listener(this.status());
  }
}
