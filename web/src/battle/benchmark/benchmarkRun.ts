import type { BenchmarkAuthority } from "./benchmarkAuthority";
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
/** A held run measures rendering only: its simulation never leaves the start tick. */
export interface HeldBenchmarkScope {
  measurement: "renderer-only";
  simulation: "held";
  tick: number;
  /** Authority hash when timing started. */
  initialStateHash: string | null;
  /** Authority hash seen by the latest recorded frame; cancellation does not resample it. */
  finalStateHash: string | null;
}

/** Timing and termination only. The production battle loop owns every sim tick. */
export class BenchmarkRun {
  readonly scenario: BattleBenchmarkScenario;
  private readonly held: HeldBenchmarkScope | null;
  private state: BenchmarkStatus;
  private runningAt: number | null = null;
  private lastPublishedAt = -Infinity;
  private listeners = new Set<(status: BenchmarkStatus) => void>();

  constructor(
    scenario: BattleBenchmarkScenario,
    private readonly createdAt: number,
    authority: BenchmarkAuthority,
  ) {
    // Preparation is unchanged: a held run prepares to its held tick and times from it.
    this.scenario =
      authority.kind === "held" ? { ...scenario, startTick: authority.tick } : scenario;
    this.held =
      authority.kind === "held"
        ? {
            measurement: "renderer-only",
            simulation: "held",
            tick: authority.tick,
            initialStateHash: null,
            finalStateHash: null,
          }
        : null;
    this.state = {
      phase: "preparing",
      scenario: this.scenario,
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
  elapsedAt(now: number) {
    return this.runningAt === null ? 0 : Math.max(0, now - this.runningAt);
  }
  heldScope(): HeldBenchmarkScope | null {
    return this.held && { ...this.held };
  }
  /** The authority holds its contact tick until timing starts; a held run never releases it. */
  get holdsAuthority() {
    return this.held !== null || this.runningAt === null;
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

  frame(now: number, tick: number, victor: number, stateHash: string) {
    if (!this.active) return;
    const previousPhase = this.state.phase;
    this.state.tick = tick;
    if (this.state.phase === "preparing") {
      this.state.preparationMs = Math.max(0, now - this.createdAt);
      if (victor >= 0) return this.finish("failed", "Battle ended during preparation", now, tick);
      if (tick > this.scenario.startTick)
        return this.finish(
          "failed",
          "Preparation advanced past the canonical start tick",
          now,
          tick,
        );
      if (tick === this.scenario.startTick) {
        this.runningAt = now;
        this.state.startTick = tick;
        this.state.phase = "running";
        if (this.held) this.held.initialStateHash = this.held.finalStateHash = stateHash;
      }
    } else {
      this.state.elapsedMs = this.elapsedAt(now);
      if (this.held) {
        this.held.finalStateHash = stateHash;
        if (tick !== this.held.tick || stateHash !== this.held.initialStateHash)
          return this.finish("failed", "Held simulation authority changed", now, tick);
      }
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
    if (this.runningAt !== null) this.state.elapsedMs = this.elapsedAt(now);
    else this.state.preparationMs = Math.max(0, now - this.createdAt);
    this.publish(now, true);
  }
  private publish(now: number, force: boolean) {
    if (!force && now - this.lastPublishedAt < 250) return;
    this.lastPublishedAt = now;
    for (const listener of this.listeners) listener(this.status());
  }
}
