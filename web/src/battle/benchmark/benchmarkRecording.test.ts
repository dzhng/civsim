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
