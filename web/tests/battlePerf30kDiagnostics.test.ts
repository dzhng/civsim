// @vitest-environment node
import { test, expect } from "vitest";

// @ts-expect-error Node scene scripts have no declaration module.
import { gpuSamples, grassReading } from "../scenes/battle/battle-perf-30k.mjs";

/** One completed completed frame, as `performance.gpuFrame` publishes it beside the
 *  span in `performance.gpuTimeMs`. */
const completedReading = (frameId: number, ms: number | null) => ({
  ms,
  metric: ms === null ? null : "correlated-complete-submission-span",
  frameId,
  submissionId: frameId * 2,
});

test("a completed frame that stays on the stats seam is one sample, however often it is read", () => {
  // 150 rAF reads, four completed frames: the seam holds each frame's span
  // until a newer frame completes, so re-reading it is the same measurement.
  const readings = Array.from({ length: 150 }, (_, i) =>
    completedReading(10 + Math.floor(i / 40), 12 + Math.floor(i / 40)),
  );
  const { ms, metric } = gpuSamples(readings, completedReading(9, 11));
  expect(ms).toEqual([12, 13, 14, 15]);
  expect(metric).toBe("correlated-complete-submission-span");
});

test("the frame already cached when the window opens is not a sample of this window", () => {
  const seed = completedReading(41, 21);
  // Nothing new completes during the window: the seam keeps returning the
  // pre-window frame, and the window honestly measured nothing.
  const { ms } = gpuSamples([seed, seed, seed, seed], seed);
  expect(ms).toEqual([]);
});

test("a frame that completes during the window still counts once after the seed", () => {
  const seed = completedReading(41, 21);
  const { ms } = gpuSamples([seed, seed, completedReading(42, 23), completedReading(42, 23)], seed);
  expect(ms).toEqual([23]);
});

test("a measurement window with no completed frame yet reports no samples, not a zero", () => {
  const empty = { ms: null, metric: null, frameId: null, submissionId: null };
  const { ms, metric } = gpuSamples([empty, empty, empty], empty);
  expect(ms).toEqual([]);
  expect(metric).toBeNull();
  expect(ms).not.toContain(0);
});

test("readings missing their frame identity are not samples", () => {
  // A span with no identity cannot be told apart from the one before it.
  const unidentified = {
    ms: 17,
    metric: "correlated-complete-submission-span",
    frameId: null,
    submissionId: null,
  };
  const { ms } = gpuSamples([unidentified, unidentified], unidentified);
  expect(ms).toEqual([]);
});

test("the same frame id under a new submission is a distinct measurement", () => {
  const seed = { ms: null, metric: null, frameId: null, submissionId: null };
  const first = {
    ms: 12,
    metric: "correlated-complete-submission-span",
    frameId: 7,
    submissionId: 3,
  };
  const second = { ...first, ms: 13, submissionId: 4 };
  expect(gpuSamples([first, second], seed).ms).toEqual([12, 13]);
});

test("a run that mixes timestamp metrics reports the mismatch", () => {
  const { metric } = gpuSamples(
    [completedReading(1, 9), { ...completedReading(2, 10), metric: "unexpected-metric" }],
    completedReading(0, null),
  );
  expect(metric).toBe("correlated-complete-submission-span+unexpected-metric");
});

const residency = {
  detail: { focusRingActive: true },
  baseSample: { acceptedRecords: 900_000, recordCapacity: 1_000_000, lodStratifiedBudget: false },
  focusSample: { acceptedRecords: 60_000, recordCapacity: 65_536 },
  rebuild: { activeRecordBudget: 1_065_536, areaBudgetScale: 1, pending: false },
};

test("production grass records are the counts its GPU layers actually hold", () => {
  const grass = {
    residency,
    visibility: { base: true, ring: true, far: true },
    layers: [
      { recordCount: 840_000, capacity: 1_000_000 },
      { recordCount: 60_000, capacity: 65_536 },
    ],
  };
  const reading = grassReading(grass)!;
  expect(reading.recordCount).toBe(900_000);
  expect(reading.enabled).toBe(true);
  expect(reading.rebuild).toBe(residency.rebuild);
  expect(reading.baseSample).toBe(residency.baseSample);
  expect(reading.focusSample).toBe(residency.focusSample);
  expect(reading.detail).toBe(residency.detail);
});

test("the focus layer's records count only while the focus layer is drawn", () => {
  const grass = {
    residency,
    visibility: { base: true, ring: false, far: true },
    layers: [{ recordCount: 840_000 }, { recordCount: 60_000 }],
  };
  expect(grassReading(grass)!.recordCount).toBe(840_000);
});

test("production grass is enabled by the visibility route and draw obey, not by resident records", () => {
  // A layer that is switched off still holds every record it sampled; the
  // gate's foliage assertion must see the field go dark anyway.
  const grass = {
    residency,
    visibility: { base: false, ring: false, far: false },
    layers: [{ recordCount: 840_000 }, { recordCount: 60_000 }],
  };
  const reading = grassReading(grass)!;
  expect(reading.enabled).toBe(false);
  expect(reading.recordCount).toBe(840_000);
});

test("CPU tier, triangle and thinning columns are absent on TypeGPU, never zero", () => {
  const grass = {
    residency,
    visibility: { base: true, ring: true, far: true },
    layers: [{ recordCount: 840_000 }, { recordCount: 60_000 }],
  };
  const reading = grassReading(grass)!;
  expect(reading.submittedTriangles).toBeNull();
  expect(reading.tierRecords).toBeNull();
  expect(reading.tierDroppedByThinning).toBeNull();
  expect(reading.thinnedRecords).toBeNull();
});

test("production grass without the visibility or layer owners reads as nothing, not as a legacy mirror", () => {
  // The source shape must not answer a production question: an unrecognised payload
  // fails the floors instead of being reinterpreted.
  const sourceShaped = { ...residency, enabled: true, recordCount: 900_000 };
  expect(grassReading(sourceShaped)).toBeNull();
  expect(grassReading({ residency, layers: [{ recordCount: 1 }, { recordCount: 1 }] })).toBeNull();
  expect(grassReading({ residency, visibility: { base: true, ring: false } })).toBeNull();
  expect(grassReading(null)).toBeNull();
});
