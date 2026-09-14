// @vitest-environment node
import { expect, test } from "vitest";
import {
  binFrameIntervals,
  summarizeFrameIntervals,
} from "../src/battle/benchmark/benchmarkMetrics";

test("average FPS divides delivered intervals by elapsed time", () => {
  const result = summarizeFrameIntervals([10, 30]);
  expect(result.averageFps).toBe(50);
  expect(result.durationMs).toBe(40);
  expect(result.validCount).toBe(2);
});

test("FPS lows average the slowest rounded-up fraction of raw frame times", () => {
  const intervals = [...Array(999).fill(10), 20, 40];
  const result = summarizeFrameIntervals(intervals);
  expect(result.low1PercentFps).toBeCloseTo(1000 / (150 / 11), 10);
  expect(result.low01PercentFps).toBeCloseTo(1000 / 30, 10);
  expect(result.minFps).toBe(25);
  expect(result.maxFps).toBe(100);
  expect(result.p50FrameMs).toBe(10);
  expect(result.p95FrameMs).toBe(10);
  expect(result.p99FrameMs).toBe(10);
  expect(result.maxFrameMs).toBe(40);
  expect(intervals.at(-1)).toBe(40);
});

test("invalid intervals are counted while strict spike thresholds and ranks use valid samples", () => {
  const result = summarizeFrameIntervals([0, -1, NaN, Infinity, -Infinity, 10, 25, 33.33, 50, 100]);
  expect(result.invalidCount).toBe(5);
  expect(result.validCount).toBe(5);
  expect(result.durationMs).toBeCloseTo(218.33, 10);
  expect(result.averageFps).toBeCloseTo(5000 / 218.33, 10);
  expect(result.spikes).toEqual({ over25Ms: 3, over33_33Ms: 2, over50Ms: 1 });
  expect(result.p50FrameMs).toBe(33.33);
  expect(result.p95FrameMs).toBe(100);
  expect(result.p99FrameMs).toBe(100);
  expect(result.low1PercentFps).toBe(10);
  expect(result.low01PercentFps).toBe(10);
});

test("chart bins keep the original spike and minimum at their timestamps across widths", () => {
  const samples = [
    { elapsedMs: 10, intervalMs: 10, phase: "pan" },
    { elapsedMs: 130, intervalMs: 120, phase: "pan" },
    { elapsedMs: 150, intervalMs: 20, phase: "zoom" },
    { elapsedMs: 200, intervalMs: 50, phase: "zoom" },
  ];
  const { bins: wide } = binFrameIntervals(samples, 2);
  expect(wide).toEqual([
    { startMs: 0, endMs: 100, min: samples[0], max: samples[0], count: 1 },
    { startMs: 100, endMs: 200, min: samples[2], max: samples[1], count: 3 },
  ]);
  expect(wide[1].max).toBe(samples[1]);
  const { bins: narrow } = binFrameIntervals(samples, 1);
  expect(narrow[0].max).toBe(samples[1]);
  expect(narrow[0].min).toBe(samples[0]);
  expect(narrow[0].max.elapsedMs).toBe(130);
});

test("chart binning reports invalid samples and keeps time buckets ordered without mutating input", () => {
  const first = { elapsedMs: 10, intervalMs: 10 };
  const last = { elapsedMs: 200, intervalMs: 30 };
  const samples = [
    last,
    { elapsedMs: NaN, intervalMs: 80 },
    first,
    { elapsedMs: -1, intervalMs: 60 },
    { elapsedMs: 100, intervalMs: 0 },
    { elapsedMs: Infinity, intervalMs: 100 },
  ];
  const result = binFrameIntervals(samples, 4);
  expect(result.invalidCount).toBe(4);
  expect(result.bins).toEqual([
    { startMs: 0, endMs: 50, min: first, max: first, count: 1 },
    { startMs: 150, endMs: 200, min: last, max: last, count: 1 },
  ]);
  expect(samples[0]).toBe(last);
});

test("a nonpositive or noninteger chart width is rejected explicitly", () => {
  for (const binCount of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => binFrameIntervals([], binCount)).toThrow(RangeError);
  }
});

test("empty and all-invalid recordings report unavailable metrics instead of zero FPS", () => {
  for (const intervals of [[], [0, NaN, Infinity]]) {
    expect(summarizeFrameIntervals(intervals)).toEqual({
      validCount: 0,
      invalidCount: intervals.length,
      durationMs: 0,
      averageFps: null,
      low1PercentFps: null,
      low01PercentFps: null,
      minFps: null,
      maxFps: null,
      p50FrameMs: null,
      p95FrameMs: null,
      p99FrameMs: null,
      maxFrameMs: null,
      spikes: { over25Ms: 0, over33_33Ms: 0, over50Ms: 0 },
    });
  }
  expect(binFrameIntervals([], 10)).toEqual({ bins: [], invalidCount: 0 });
  expect(binFrameIntervals([{ elapsedMs: 50, intervalMs: NaN }], 10)).toEqual({
    bins: [],
    invalidCount: 1,
  });
});
