import { describe, expect, it } from "vitest";
import { BenchmarkRun } from "./benchmarkRun";
import { BATTLE_BENCHMARK_SCENARIO } from "./benchmarkScenario";

const scenario = { ...BATTLE_BENCHMARK_SCENARIO, startTick: 6, durationMs: 300_000 };

describe("battle benchmark lifecycle", () => {
  it("counts the whole wall-clock window even when the simulation falls behind", () => {
    const run = new BenchmarkRun(scenario, 100);
    run.frame(1000, 6, -1);
    run.frame(301_000, 2000, -1);
    expect(run.status()).toMatchObject({
      phase: "complete",
      elapsedMs: 300_000,
      preparationMs: 900,
      startTick: 6,
      tick: 2000,
      reason: "Timed window complete",
    });
  });

  it("reports an early victory with its actual duration", () => {
    const run = new BenchmarkRun(scenario, 0);
    run.frame(100, 6, -1);
    run.frame(900, 30, 1);
    expect(run.status()).toMatchObject({
      phase: "complete",
      elapsedMs: 800,
      reason: "Early victory — short run",
    });
    run.frame(100_000, 4000, -1);
    expect(run.status().elapsedMs).toBe(800);
  });

  it("cannot leave a cancelled preparation or later claim completion", () => {
    const run = new BenchmarkRun(scenario, 0);
    run.frame(10, 2, -1);
    run.cancel(20, 2);
    // Ticks the authority may still be finishing cannot revive a cancelled run.
    run.frame(400_000, 6, -1);
    expect(run.status()).toMatchObject({
      phase: "cancelled",
      tick: 2,
      elapsedMs: 0,
      preparationMs: 20,
    });
  });

  it("cancels a running battle while retaining its elapsed time and simulation ticks", () => {
    const run = new BenchmarkRun(scenario, 0);
    run.frame(100, 6, -1);
    run.frame(600, 18, -1);
    run.cancel(850, 22);
    expect(run.status()).toMatchObject({
      phase: "cancelled",
      startTick: 6,
      tick: 22,
      elapsedMs: 750,
    });
  });

  it("retains partial run timing on interruption and starts a new run independently", () => {
    const run = new BenchmarkRun(scenario, 0);
    run.frame(100, 6, -1);
    run.fail("Interrupted — tab hidden", 1100, 30);
    run.cancel(1200, 30);
    expect(run.status()).toMatchObject({
      phase: "failed",
      elapsedMs: 1000,
      tick: 30,
      reason: "Interrupted — tab hidden",
    });
    expect(new BenchmarkRun(scenario, 1200).status()).toMatchObject({
      phase: "preparing",
      tick: 0,
      elapsedMs: 0,
    });
  });

  it("updates observations without repainting progress more than four times per second", () => {
    const run = new BenchmarkRun(scenario, 0);
    const seen: string[] = [];
    run.subscribe((status) => seen.push(`${status.phase}:${status.tick}`));
    run.frame(0, 0, -1);
    run.frame(100, 1, -1);
    run.frame(200, 2, -1);
    expect(run.status().tick).toBe(2);
    run.frame(250, 3, -1);
    run.frame(251, 6, -1);
    run.cancel(252, 6);
    expect(seen).toEqual(["preparing:0", "preparing:0", "preparing:3", "running:6", "cancelled:6"]);
  });

  it("rejects a scenario that ends before its timed start", () => {
    const run = new BenchmarkRun(scenario, 0);
    run.frame(1000, 4, 0);
    expect(run.status()).toMatchObject({
      phase: "failed",
      startTick: null,
      elapsedMs: 0,
      reason: "Battle ended during preparation",
    });
  });
});
