import { expect, test } from "vitest";
import { BenchmarkRecording } from "./benchmarkRecording";
import type { BattleLoopFrameMetrics } from "../battleDebugApi";

const frame = (id: number, time: number): BattleLoopFrameMetrics => ({
  frameId: id,
  timestampMs: time,
  intervalMs: 999,
  ready: true,
  simTick: 9000 + id,
  ticksAdvanced: 1,
  simCpuMs: 3,
  renderCpuMs: 2,
  loopCpuMs: 6,
  renderer: {
    renderedFrameId: id,
    gpuSubmission: null,
    skippedFrozenFrame: false,
    buildMs: 1,
    uploadMs: 0,
    drawMs: 1,
    frameCpuMs: 2,
  },
});
const camera = { center: [75, -120] as [number, number], distance: 200, yaw: -1.57, pitch: 0.65 };

test("recording excludes preparation and keeps a timed stall at its actual location", () => {
  const recording = new BenchmarkRecording(300_000);
  recording.start(1000);
  recording.record(frame(1, 1000), camera, "tactical", camera);
  recording.record(frame(2, 1016), camera, "tactical", camera);
  recording.record(frame(3, 1116), camera, "pan", { ...camera, distance: 45 });
  const samples = recording.samples();
  expect(samples.map((s) => [s.elapsedMs, s.intervalMs])).toEqual([
    [16, 16],
    [116, 100],
  ]);
  expect(samples[1]).toMatchObject({
    phase: "pan",
    simTick: 9003,
    loopCpuMs: 6,
    camera: { distance: 200 },
    intendedCamera: { distance: 45 },
  });
});

test("recordings bound retained samples instead of silently dropping a slow tail", () => {
  const recording = new BenchmarkRecording(1);
  recording.start(0);
  recording.record(frame(1, 1), camera, "tactical", camera);
  recording.record(frame(2, 2), camera, "tactical", camera);
  expect(() => recording.record(frame(3, 100), camera, "tactical", camera)).toThrow(/exceeded 2/);
  expect(recording.samples()).toHaveLength(2);
});

test("GPU collection matches recorded identities despite out-of-order completion and excludes preparation", () => {
  const recording = new BenchmarkRecording(300_000);
  recording.start(1000, 10);
  const a = frame(1, 1016);
  a.renderer.gpuSubmission = { submissionId: 101, threeFrameId: 701, source: "battle-draw" };
  const b = frame(2, 1032);
  b.renderer.gpuSubmission = { submissionId: 102, threeFrameId: 702, source: "battle-draw" };
  recording.record(a, camera, "tactical", camera);
  recording.record(b, camera, "tactical", camera);
  const result = (submissionId: number, sequence: number) => ({
    submissionId,
    sequence,
    threeFrameId: 600 + submissionId,
    source: "battle-draw" as const,
    status: "complete" as const,
    reason: null,
    missingQueries: 0,
    renderMs: 2,
    computeMs: 1,
    measuredPassGpuMs: 3,
    stages: [],
  });
  recording.collectGpu({
    nextSequence: 12,
    oldestRetainedSequence: 1,
    cursorGap: false,
    events: [result(100, 11), result(102, 12)],
  });
  const partial = recording.gpuSnapshot();
  expect(partial.results.map((event) => event.submissionId)).toEqual([102]);
  expect(partial.unresolvedSubmissionIds).toEqual([101]);
  recording.collectGpu({
    nextSequence: 13,
    oldestRetainedSequence: 1,
    cursorGap: false,
    events: [result(101, 13)],
  });
  expect(recording.gpuSnapshot().pendingOrMissingCount).toBe(0);
  expect(recording.gpuSnapshot().results.map((event) => event.submissionId)).toEqual([102, 101]);
  expect(recording.samples().map((sample) => sample.renderer.gpuSubmission?.submissionId)).toEqual([
    101, 102,
  ]);
  expect(partial.unresolvedSubmissionIds).toEqual([101]);
  expect(partial.results.map((event) => event.submissionId)).toEqual([102]);
});

test("GPU cursor gaps and incomplete results remain explicit in partial recordings", () => {
  const recording = new BenchmarkRecording(300_000);
  recording.start(1000, 10);
  const a = frame(1, 1016);
  a.renderer.gpuSubmission = { submissionId: 101, threeFrameId: 701, source: "battle-draw" };
  const b = frame(2, 1032);
  b.renderer.gpuSubmission = { submissionId: 102, threeFrameId: 702, source: "battle-draw" };
  recording.record(a, camera, "tactical", camera);
  recording.record(b, camera, "tactical", camera);
  const batch = {
    nextSequence: 21,
    oldestRetainedSequence: 20,
    cursorGap: true,
    events: [
      {
        sequence: 21,
        submissionId: 102,
        threeFrameId: 702,
        source: "battle-draw" as const,
        status: "incomplete" as const,
        reason: "timestamps-unavailable",
        missingQueries: 1,
        renderMs: null,
        computeMs: null,
        measuredPassGpuMs: null,
        stages: [],
      },
    ],
  };
  recording.collectGpu(batch);
  recording.collectGpu(batch);
  const snapshot = recording.gpuSnapshot();
  expect(snapshot).toMatchObject({
    cursorGapCount: 1,
    lostEventCount: 9,
    pendingOrMissingCount: 1,
  });
  expect(snapshot.unresolvedSubmissionIds).toEqual([101]);
  expect(snapshot.results[0]).toMatchObject({ status: "incomplete", measuredPassGpuMs: null });
});
