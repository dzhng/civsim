import { describe, expect, it } from "vitest";
import { BenchmarkRun } from "./benchmarkRun";
import { BATTLE_BENCHMARK_SCENARIO } from "./benchmarkScenario";
import type { BenchmarkAuthority } from "./benchmarkAuthority";

const scenario = { ...BATTLE_BENCHMARK_SCENARIO, startTick: 6, durationMs: 300_000 };
const LIVE: BenchmarkAuthority = { kind: "live" };

describe("battle benchmark lifecycle", () => {
  it("counts the whole wall-clock window even when the simulation falls behind", () => {
    const run = new BenchmarkRun(scenario, 100, LIVE);
    run.frame(1000, 6, -1, "hash");
    run.frame(301_000, 2000, -1, "hash");
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
    const run = new BenchmarkRun(scenario, 0, LIVE);
    run.frame(100, 6, -1, "hash");
    run.frame(900, 30, 1, "hash");
    expect(run.status()).toMatchObject({
      phase: "complete",
      elapsedMs: 800,
      reason: "Early victory — short run",
    });
    run.frame(100_000, 4000, -1, "hash");
    expect(run.status().elapsedMs).toBe(800);
  });

  it("cannot leave a cancelled preparation or later claim completion", () => {
    const run = new BenchmarkRun(scenario, 0, LIVE);
    run.frame(10, 2, -1, "hash");
    run.cancel(20, 2);
    // Ticks the authority may still be finishing cannot revive a cancelled run.
    run.frame(400_000, 6, -1, "hash");
    expect(run.status()).toMatchObject({
      phase: "cancelled",
      tick: 2,
      elapsedMs: 0,
      preparationMs: 20,
    });
  });

  it("cancels a running battle while retaining its elapsed time and simulation ticks", () => {
    const run = new BenchmarkRun(scenario, 0, LIVE);
    run.frame(100, 6, -1, "hash");
    run.frame(600, 18, -1, "hash");
    run.cancel(850, 22);
    expect(run.status()).toMatchObject({
      phase: "cancelled",
      startTick: 6,
      tick: 22,
      elapsedMs: 750,
    });
  });

  it("retains partial run timing on interruption and starts a new run independently", () => {
    const run = new BenchmarkRun(scenario, 0, LIVE);
    run.frame(100, 6, -1, "hash");
    run.fail("Interrupted — tab hidden", 1100, 30);
    run.cancel(1200, 30);
    expect(run.status()).toMatchObject({
      phase: "failed",
      elapsedMs: 1000,
      tick: 30,
      reason: "Interrupted — tab hidden",
    });
    expect(new BenchmarkRun(scenario, 1200, LIVE).status()).toMatchObject({
      phase: "preparing",
      tick: 0,
      elapsedMs: 0,
    });
  });

  it("updates observations without repainting progress more than four times per second", () => {
    const run = new BenchmarkRun(scenario, 0, LIVE);
    const seen: string[] = [];
    run.subscribe((status) => seen.push(`${status.phase}:${status.tick}`));
    run.frame(0, 0, -1, "hash");
    run.frame(100, 1, -1, "hash");
    run.frame(200, 2, -1, "hash");
    expect(run.status().tick).toBe(2);
    run.frame(250, 3, -1, "hash");
    run.frame(251, 6, -1, "hash");
    run.cancel(252, 6);
    expect(seen).toEqual(["preparing:0", "preparing:0", "preparing:3", "running:6", "cancelled:6"]);
  });

  it("rejects preparation that advances past the canonical start", () => {
    const run = new BenchmarkRun(scenario, 0, LIVE);
    run.frame(1000, 7, -1, "hash");
    expect(run.status()).toMatchObject({
      phase: "failed",
      startTick: null,
      elapsedMs: 0,
      reason: "Preparation advanced past the canonical start tick",
    });
  });

  it("rejects a scenario that ends before its timed start", () => {
    const run = new BenchmarkRun(scenario, 0, LIVE);
    run.frame(1000, 4, 0, "hash");
    expect(run.status()).toMatchObject({
      phase: "failed",
      startTick: null,
      elapsedMs: 0,
      reason: "Battle ended during preparation",
    });
  });

  it("releases the authority when live timing starts, but not while preparation is cancelled", () => {
    const run = new BenchmarkRun(scenario, 0, LIVE);
    run.frame(10, 2, -1, "a");
    expect(run.holdsAuthority).toBe(true);
    run.frame(100, 6, -1, "b");
    expect(run.holdsAuthority).toBe(false);
    run.frame(600, 18, -1, "c");
    expect(run.status()).toMatchObject({ phase: "running", tick: 18 });
    expect(run.heldScope()).toBeNull();

    const cancelled = new BenchmarkRun(scenario, 0, LIVE);
    cancelled.frame(10, 2, -1, "a");
    cancelled.cancel(20, 2);
    expect(cancelled.holdsAuthority).toBe(true);
  });
});

describe("held renderer-only benchmark", () => {
  const held: BenchmarkAuthority = { kind: "held", tick: 12 };

  it("prepares to the held tick and keeps that exact authority through the timed window", () => {
    const run = new BenchmarkRun(scenario, 0, held);
    run.frame(50, 6, -1, "prep");
    expect(run.status().phase).toBe("preparing");
    run.frame(100, 12, -1, "contact");
    expect(run.status()).toMatchObject({ phase: "running", startTick: 12 });
    expect(run.status().scenario.startTick).toBe(12);
    run.frame(150_100, 12, -1, "contact");
    run.frame(300_100, 12, -1, "contact");
    expect(run.status()).toMatchObject({
      phase: "complete",
      tick: 12,
      elapsedMs: 300_000,
      reason: "Timed window complete",
    });
    expect(run.holdsAuthority).toBe(true);
    expect(run.heldScope()).toEqual({
      measurement: "renderer-only",
      simulation: "held",
      tick: 12,
      initialStateHash: "contact",
      finalStateHash: "contact",
    });
  });

  it("fails when the held authority advances or its state changes at the same tick", () => {
    const advanced = new BenchmarkRun(scenario, 0, held);
    advanced.frame(100, 12, -1, "contact");
    advanced.frame(200, 13, -1, "next");
    expect(advanced.status()).toMatchObject({
      phase: "failed",
      tick: 13,
      elapsedMs: 100,
      reason: "Held simulation authority changed",
    });

    const republished = new BenchmarkRun(scenario, 0, held);
    republished.frame(100, 12, -1, "contact");
    republished.frame(200, 12, -1, "order accepted");
    expect(republished.status().reason).toBe("Held simulation authority changed");
    expect(republished.heldScope()).toMatchObject({
      initialStateHash: "contact",
      finalStateHash: "order accepted",
    });
  });

  it("keeps holding after cancellation and ignores later observations", () => {
    const run = new BenchmarkRun(scenario, 0, held);
    run.frame(100, 12, -1, "contact");
    run.cancel(900, 12);
    run.frame(1000, 14, -1, "later");
    expect(run.status()).toMatchObject({ phase: "cancelled", tick: 12, elapsedMs: 800 });
    expect(run.holdsAuthority).toBe(true);
    expect(run.heldScope()?.finalStateHash).toBe("contact");
  });
});

for (const terminal of ["complete", "cancelled", "failed"] as const) {
  it(`holds authority as soon as a live run is ${terminal}`, () => {
    const run = new BenchmarkRun({ ...BATTLE_BENCHMARK_SCENARIO, durationMs: 100 }, 0, {
      kind: "live",
    });
    const holds: boolean[] = [];
    run.subscribe(() => holds.push(run.holdsAuthority));
    run.frame(0, run.scenario.startTick, -1, "a");
    expect(run.holdsAuthority).toBe(false);
    if (terminal === "complete") run.frame(101, run.scenario.startTick + 3, -1, "b");
    else if (terminal === "cancelled") run.cancel(101, run.scenario.startTick + 3);
    else run.fail("interrupted", 101, run.scenario.startTick + 3);
    expect(run.status().phase).toBe(terminal);
    expect(holds.at(-1)).toBe(true);
  });
}
