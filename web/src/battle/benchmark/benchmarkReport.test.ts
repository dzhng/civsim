import { expect, test } from "vitest";
import { createBenchmarkReport } from "./benchmarkReport";
import { BATTLE_BENCHMARK_SCENARIO } from "./benchmarkScenario";
import type { BenchmarkStatus } from "./benchmarkRun";

test("an interrupted window cannot become a complete result merely by lasting five minutes", () => {
  const status: BenchmarkStatus = {
    phase: "failed",
    scenario: BATTLE_BENCHMARK_SCENARIO,
    preparationMs: 5000,
    elapsedMs: 300000,
    startTick: 9000,
    tick: 15000,
    reason: "Interrupted — tab hidden",
  };
  const report = createBenchmarkReport(status, null, []);
  expect(report.completeWindow).toBe(false);
  expect(report.simulatedSeconds).toBe(200);
  expect(report.summary.averageFps).toBeNull();
  expect(report.phases.every((p) => p.summary.averageFps === null)).toBe(true);
});

test("a held recording declares itself renderer-only while a live export carries no scope", () => {
  const status: BenchmarkStatus = {
    phase: "complete",
    scenario: { ...BATTLE_BENCHMARK_SCENARIO, startTick: 12000 },
    preparationMs: 5000,
    elapsedMs: 300000,
    startTick: 12000,
    tick: 12000,
    reason: "Timed window complete",
  };
  const scope = {
    measurement: "renderer-only",
    simulation: "held",
    tick: 12000,
    initialStateHash: "7",
    finalStateHash: "7",
  } as const;
  const held = createBenchmarkReport(status, null, [], null, null, scope);
  expect(held).toMatchObject({
    kind: "battle-benchmark-renderer-only",
    scope,
    simulatedSeconds: 0,
  });
  const live = createBenchmarkReport(status, null, []);
  expect(live.kind).toBe("battle-benchmark");
  expect(Object.keys(live)).not.toContain("scope");
});
