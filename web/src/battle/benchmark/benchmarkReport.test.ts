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
