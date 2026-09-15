/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compareRuns, type RunInput, type RunManifest } from "./compareRuns";
import { summarizeFrameIntervals } from "../../../web/src/battle/benchmark/benchmarkMetrics";
import { BENCHMARK_CAMERA_PHASES } from "../../../web/src/battle/benchmark/benchmarkCamera";

function input(runId: string, backend: RunManifest["backend"] = "raw") {
  const frames = Array.from({ length: 600 }, (_, i) => ({
    elapsedMs: (i + 1) * 500,
    intervalMs: 500,
    phase: (
      BENCHMARK_CAMERA_PHASES.find((p) => (i + 1) * 500 < p.endMs) ??
      BENCHMARK_CAMERA_PHASES.at(-1)!
    ).name,
    renderer: {
      renderedFrameId: i + 1,
      gpuSubmission: { submissionId: i + 1, ...(backend === "three" ? {} : { backend }) },
    },
  }));
  return {
    manifest: {
      runId,
      backend,
      commit: "a".repeat(40),
      dirtyDiffSha256: null,
      buildSha256: "b".repeat(64),
      configSha256: "c".repeat(64),
      dependenciesSha256: "d".repeat(64),
      assetsSha256: "e".repeat(64),
      wasmSha256: "f".repeat(64),
      startedAt: "2026-09-15T10:00:00Z",
      order: runId === "a" ? 0 : 1,
      hardware: {
        machine: "test-machine",
        os: "test-os",
        browser: "test-browser",
        adapter: "test-adapter",
        power: "AC",
        display: "test-display",
      },
      quietHost: { verified: true, evidence: "test://quiet" },
      validation: { passed: true, evidence: "test://checks" },
    },
    report: {
      kind: "battle-benchmark",
      version: 2,
      completeWindow: true,
      status: {
        phase: "complete",
        elapsedMs: 300000,
        startTick: 9000,
        tick: 12000,
        scenario: {
          id: "test",
          version: 1,
          simSeed: 12,
          mapSeed: "7",
          armySource: "generated-default",
          orders: "player-nearest-enemy-at-tick-zero",
          startTick: 9000,
          durationMs: 300000,
          cameraScript: "contact-9000-v2",
        },
      },
      identity: {
        userAgent: "test",
        adapter: "test",
        initialStateHash: "same",
        viewport: [1440, 900],
        framebuffer: [2880, 1800],
        dpr: 2,
        soldiers: 15560,
        graphics: {
          shadows: "single",
          grassQuality: "standard",
          grass: true,
          farGrass: true,
          bloom: true,
          audio: { masterVolume: 0.5, muted: true, birds: true, water: true },
        },
      },
      frames,
      summary: summarizeFrameIntervals(frames.map((f) => f.intervalMs)),
      phases: BENCHMARK_CAMERA_PHASES.map((p) => ({
        ...p,
        summary: summarizeFrameIntervals(
          frames.filter((f) => f.phase === p.name).map((f) => f.intervalMs),
        ),
      })),
      firstFrame: {
        renderer: {
          renderedFrameId: 0,
          gpuSubmission: { submissionId: 0, ...(backend === "three" ? {} : { backend }) },
        },
      },
      simulatedSeconds: 100,
      gpu: null,
    },
  };
}
/** Counters must agree with the recorded submissions: id 0 is the untimed boundary
 * frame and 1-600 are the timed frames, so anything unresolved stays declared. */
function withGpu(report: ReturnType<typeof input>["report"], results: ObjectValue[]) {
  const resolved = new Set(results.map((result) => result.submissionId));
  const unresolvedSubmissionIds = Array.from({ length: 601 }, (_, i) => i).filter(
    (id) => !resolved.has(id),
  );
  return {
    ...report,
    gpu: {
      trackedSubmissions: 601,
      pendingOrMissingCount: unresolvedSubmissionIds.length,
      unresolvedSubmissionIds,
      cursorGapCount: 0,
      lostEventCount: 0,
      results,
    },
  };
}
type ObjectValue = Record<string, unknown>;
const completeResult = (submissionId: number, fields: ObjectValue): ObjectValue => ({
  status: "complete",
  submissionId,
  backend: "raw",
  missingQueries: 0,
  renderMs: 1,
  computeMs: 0,
  stages: [{ label: "main", ms: 1 }],
  ...fields,
});
/** Frame index i carries elapsed (i+1)*500 ms, so 0-58 are tactical and 59 opens pan. */
const phaseOf = (result: ReturnType<typeof compareRuns>["runs"][number], name: string) =>
  result.phases.find((phase) => phase.name === name)!;

describe("offline matched benchmark report", () => {
  test("retains existing FPS definitions and exposes missing GPU timing and unequal sim progression", () => {
    const a = input("a"),
      b = input("b", "typegpu");
    b.report.status.tick = 12600;
    b.report.simulatedSeconds = 120;
    const result = compareRuns(a, b);
    expect(result.issues).toEqual([]);
    expect(result.eligible).toBe(true);
    expect(result.runs[0].summary.averageFps).toBe(2);
    expect(result.runs[0].gpu).toMatchObject({ available: false, pendingOrMissingCount: null });
    expect(result.runs[1].simulation).toMatchObject({
      endTick: 12600,
      simulatedSeconds: 120,
      simulatedSecondsPerWallSecond: 0.4,
    });
  });
  test("rejects changed workload and contaminated evidence", () => {
    const a = input("a"),
      b = input("b");
    b.report.identity.framebuffer = [1440, 900];
    b.manifest.quietHost.verified = false;
    const result = compareRuns(a, b);
    expect(result.eligible).toBe(false);
    expect(result.issues).toContain("pair mismatch: workload identity");
    expect(result.issues).toContain("b: manifest.quietHost not verified");
  });
  test("rejects forged summaries and skipped presentation boundaries", () => {
    const a = input("a"),
      b = input("b");
    b.report.summary.averageFps = 60;
    b.report.frames[3].renderer.renderedFrameId = 3;
    const result = compareRuns(a, b);
    expect(result.issues).toContain("b: exported summary disagrees with raw intervals");
    expect(result.issues).toContain("b: nonmonotonic or inconsistent presentation history");
  });
  test("rejects an early victory marked complete and an omitted phase", () => {
    const a = input("a"),
      b = input("b");
    b.report.status.elapsedMs = 100000;
    b.report.phases.pop();
    const result = compareRuns(a, b);
    expect(result.issues).toContain("b: incomplete five-minute window");
    expect(result.issues).toContain("b: phase definitions disagree with camera script");
  });
  test("only declared shadow setting may vary within shadow-cost pair", () => {
    const a = input("a"),
      b = input("b");
    b.report.identity.graphics.shadows = "off";
    expect(compareRuns(a, b).eligible).toBe(false);
    expect(compareRuns(a, b, "shadow-cost").eligible).toBe(true);
    b.manifest.configSha256 = "1".repeat(64);
    expect(compareRuns(a, b, "shadow-cost").issues).toContain("pair mismatch: configSha256");
  });
  test("uncollected hardware and contradictory backend are not inferred", () => {
    const a = input("a"),
      b = input("b");
    (b.manifest as RunManifest).hardware.power = null;
    b.manifest.backend = "vgpu";
    const result = compareRuns(a, b);
    expect(result.issues).toContain("b: manifest.hardware.power uncollected");
    expect(result.issues).toContain("b: submission backend disagrees with manifest");
  });
  test("malformed JSON cannot become eligible", () => {
    expect(() =>
      compareRuns(input("a"), { manifest: {} as RunManifest, report: {} } as RunInput),
    ).toThrow();
  });
  test("CPU zeros remain measured and incomplete GPU submissions do not enter distributions", () => {
    const a = input("a"),
      b = input("b");
    Object.assign(b.report.frames[0], { simCpuMs: 0, renderCpuMs: 10 });
    Object.assign(b.report.frames[1], { simCpuMs: 20, renderCpuMs: 30 });
    const run: RunInput = {
      manifest: b.manifest,
      report: {
        ...b.report,
        gpu: {
          trackedSubmissions: 601,
          pendingOrMissingCount: 599,
          unresolvedSubmissionIds: Array.from({ length: 599 }, (_, i) => i + 2),
          cursorGapCount: 0,
          lostEventCount: 0,
          results: [
            {
              status: "complete",
              submissionId: 0,
              backend: "raw",
              missingQueries: 0,
              measuredPassGpuMs: 8,
              observedGpuSpanMs: 5,
              observedGpuUnionMs: 4,
              renderMs: 6,
              computeMs: 2,
              stages: [{ label: "main", ms: 6 }],
            },
            {
              status: "incomplete",
              submissionId: 1,
              backend: "raw",
              measuredPassGpuMs: 999,
              stages: [{ label: "main", ms: 999 }],
            },
          ],
        },
      },
    };
    const result = compareRuns(a, run).runs[1];
    expect(result.cpu.simCpuMs).toMatchObject({
      count: 2,
      missingOrInvalidCount: 598,
      meanMs: 10,
      p99Ms: 20,
    });
    expect(result.gpu.durations.measuredPassGpuMs).toMatchObject({ count: 1, meanMs: 8 });
    expect(result.gpu.durations.observedGpuSpanMs).toMatchObject({ count: 1, meanMs: 5 });
    expect(result.gpu.durations.observedGpuUnionMs).toMatchObject({ count: 1, meanMs: 4 });
    expect(result.gpu.observedRangeResults).toBe(1);
    expect(result.gpu.stages.main).toMatchObject({ count: 1, p95Ms: 6 });
    expect(result.gpu.pendingOrMissingCount).toBe(599);
  });
  test("phase CPU distributions partition the run and follow the camera phase owner", () => {
    const a = input("a"),
      b = input("b");
    Object.assign(b.report.frames[0], { simCpuMs: 4 });
    Object.assign(b.report.frames[1], { simCpuMs: 6 });
    Object.assign(b.report.frames[59], { simCpuMs: 20 });
    b.report.frames[1].phase = "return";
    const run = compareRuns(a, b).runs[1];
    expect(run.issues).toContain("phase label disagrees with frame timestamp");
    expect(phaseOf(run, "tactical").cpu.simCpuMs).toMatchObject({
      count: 2,
      meanMs: 5,
      missingOrInvalidCount: 57,
    });
    expect(phaseOf(run, "pan").cpu.simCpuMs).toMatchObject({ count: 1, meanMs: 20 });
    // The forged label named "return", whose own 61 frames stay entirely unmeasured.
    expect(phaseOf(run, "return").cpu.simCpuMs).toMatchObject({
      count: 0,
      meanMs: null,
      missingOrInvalidCount: 61,
    });
    expect(run.phases.reduce((total, phase) => total + phase.cpu.simCpuMs.count, 0)).toBe(
      run.cpu.simCpuMs.count,
    );
    expect(
      run.phases.reduce((total, phase) => total + phase.cpu.simCpuMs.missingOrInvalidCount, 0),
    ).toBe(run.cpu.simCpuMs.missingOrInvalidCount);
  });
  test("the boundary submission belongs to the opening phase and is counted once", () => {
    const a = input("a"),
      b = input("b");
    const run: RunInput = {
      manifest: b.manifest,
      report: withGpu(b.report, [
        completeResult(0, { measuredPassGpuMs: 3, observedGpuSpanMs: 2, observedGpuUnionMs: 2 }),
        completeResult(60, { measuredPassGpuMs: 9, observedGpuSpanMs: 4, observedGpuUnionMs: 3 }),
      ]),
    };
    const result = compareRuns(a, run).runs[1];
    expect(result.issues).toEqual([]);
    const tactical = phaseOf(result, "tactical"),
      pan = phaseOf(result, "pan");
    expect(tactical.gpu).toMatchObject({ matchedSubmissions: 60, completeResults: 1 });
    expect(tactical.gpu.durations.measuredPassGpuMs).toMatchObject({ count: 1, meanMs: 3 });
    expect(pan.gpu).toMatchObject({ matchedSubmissions: 120, completeResults: 1 });
    expect(pan.gpu.durations.measuredPassGpuMs).toMatchObject({ count: 1, meanMs: 9 });
    expect(result.phases.reduce((total, phase) => total + phase.gpu.matchedSubmissions, 0)).toBe(
      result.gpu.trackedSubmissions,
    );
    expect(result.phases.reduce((total, phase) => total + phase.gpu.completeResults, 0)).toBe(
      result.gpu.completeResults,
    );
  });
  test("phase spans and unions stay distinct from the double-counting pass sum", () => {
    const a = input("a"),
      b = input("b");
    const run: RunInput = {
      manifest: b.manifest,
      report: withGpu(b.report, [
        completeResult(1, {
          renderMs: 8,
          computeMs: 4,
          measuredPassGpuMs: 12,
          observedGpuSpanMs: 2,
          observedGpuUnionMs: 1.8,
          stages: [
            { label: "world", ms: 8, observedGpuSpanMs: 1.2, observedGpuUnionMs: 1.2 },
            { label: "post", ms: 4, observedGpuSpanMs: 1.1, observedGpuUnionMs: 1.1 },
          ],
        }),
      ]),
    };
    const tactical = phaseOf(compareRuns(a, run).runs[1], "tactical");
    expect(tactical.gpu.durations.measuredPassGpuMs).toMatchObject({ count: 1, meanMs: 12 });
    expect(tactical.gpu.durations.observedGpuSpanMs).toMatchObject({ count: 1, meanMs: 2 });
    expect(tactical.gpu.durations.observedGpuUnionMs).toMatchObject({ count: 1, meanMs: 1.8 });
    expect(tactical.gpu.observedRangeResults).toBe(1);
  });
  test("absent, partial and unresolved phase ranges stay missing instead of zero", () => {
    const a = input("a"),
      b = input("b");
    const run: RunInput = {
      manifest: b.manifest,
      report: withGpu(b.report, [
        completeResult(1, {
          measuredPassGpuMs: 5,
          observedGpuSpanMs: null,
          observedGpuUnionMs: null,
        }),
        completeResult(2, { measuredPassGpuMs: 6, observedGpuSpanMs: 3 }),
        { status: "incomplete", submissionId: 3, backend: "raw", stages: [] },
      ]),
    };
    const result = compareRuns(a, run).runs[1];
    expect(result.issues).toContain("invalid observed GPU range metrics");
    const tactical = phaseOf(result, "tactical");
    expect(tactical.gpu).toMatchObject({
      matchedSubmissions: 60,
      completeResults: 2,
      incompleteResults: 1,
      unresolvedSubmissions: 57,
      observedRangeResults: 0,
      missingRangeResults: 2,
    });
    expect(tactical.gpu.durations.measuredPassGpuMs).toMatchObject({ count: 2, meanMs: 5.5 });
    for (const key of ["observedGpuSpanMs", "observedGpuUnionMs"])
      expect(tactical.gpu.durations[key]).toMatchObject({
        count: 0,
        missingOrInvalidCount: 2,
        meanMs: null,
        maxMs: null,
      });
  });
  test("corrupt simulated seconds are rejected using the simulation time owner", () => {
    const a = input("a"),
      b = input("b");
    b.report.simulatedSeconds = 999;
    expect(compareRuns(a, b).issues).toContain(
      "b: simulated seconds disagree with tick progression",
    );
  });
  test("CLI writes rejected-pair evidence and preserves existing output", () => {
    const dir = mkdtempSync(join(tmpdir(), "benchmark-pair-"));
    try {
      const a = input("a"),
        b = input("b");
      b.manifest.quietHost.verified = false;
      const left = join(dir, "left.json"),
        right = join(dir, "right.json"),
        output = join(dir, "result.json");
      writeFileSync(left, JSON.stringify(a));
      writeFileSync(right, JSON.stringify(b));
      const args = [
        fileURLToPath(new URL("./compare.ts", import.meta.url)),
        "parity",
        left,
        right,
        output,
      ];
      expect(spawnSync("bun", args).status).toBe(1);
      const before = readFileSync(output, "utf8");
      expect(JSON.parse(before)).toMatchObject({
        eligible: false,
        inputs: [{ path: left }, { path: right }],
      });
      expect(spawnSync("bun", args).status).not.toBe(0);
      expect(readFileSync(output, "utf8")).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("review regressions reject phase swaps, sequence gaps and post-terminal samples", () => {
    const a = input("a"),
      b = input("b");
    b.report.frames.forEach((f) => {
      f.renderer.renderedFrameId *= 2;
      if (f.phase === "pan") f.phase = "zoom";
      else if (f.phase === "zoom") f.phase = "pan";
    });
    const extra = {
      ...b.report.frames.at(-1)!,
      elapsedMs: 300500,
      renderer: {
        ...b.report.frames.at(-1)!.renderer,
        renderedFrameId: 1202,
        gpuSubmission: { submissionId: 601, backend: "raw" as const },
      },
    };
    b.report.frames.push(extra);
    b.report.status.elapsedMs = 300500;
    const issues = compareRuns(a, b).issues;
    expect(issues).toContain("b: phase label disagrees with frame timestamp");
    expect(issues).toContain("b: nonmonotonic or inconsistent presentation history");
    expect(issues).toContain("b: samples retained after terminal window boundary");
  });
  test("an empty GPU snapshot reports unavailable timing and corrupt counters are rejected", () => {
    const a = input("a"),
      b = input("b");
    const gpu = {
      trackedSubmissions: 601,
      pendingOrMissingCount: 601,
      unresolvedSubmissionIds: Array.from({ length: 601 }, (_, i) => i),
      cursorGapCount: 0,
      lostEventCount: 0,
      results: [],
    };
    const run = { manifest: b.manifest, report: { ...b.report, gpu } };
    expect(compareRuns(a, run).runs[1].gpu).toMatchObject({
      snapshotPresent: true,
      available: false,
    });
    gpu.trackedSubmissions = -1;
    expect(compareRuns(a, run).issues).toContain("b: invalid GPU counter trackedSubmissions");
  });
});
