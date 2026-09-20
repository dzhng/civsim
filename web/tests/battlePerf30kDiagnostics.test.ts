// @vitest-environment node
import { test, expect } from "vitest";

// @ts-expect-error Node scene scripts have no declaration module.
import { assertKnownRoute, gpuSamples, grassReading } from "../scenes/battle/battle-perf-30k.mjs";

/** One completed raw frame, as `performance.gpuFrame` publishes it beside the
 *  span in `performance.gpuTimeMs`. */
const rawReading = (frameId: number, ms: number | null) => ({
  ms,
  metric: ms === null ? null : "correlated-complete-submission-span",
  frameId,
  submissionId: frameId * 2,
});

const sourceReading = (ms: number | null) => ({
  ms,
  metric: ms === null ? null : "source-render-pass-timestamp-sum",
  frameId: null,
  submissionId: null,
});

test("a raw frame that stays on the stats seam is one sample, however often it is read", () => {
  // 150 rAF reads, four completed frames: the seam holds each frame's span
  // until a newer frame completes, so re-reading it is the same measurement.
  const readings = Array.from({ length: 150 }, (_, i) =>
    rawReading(10 + Math.floor(i / 40), 12 + Math.floor(i / 40)),
  );
  const { ms, metric } = gpuSamples(readings, rawReading(9, 11), "raw");
  expect(ms).toEqual([12, 13, 14, 15]);
  expect(metric).toBe("correlated-complete-submission-span");
});

test("the frame already cached when the window opens is not a sample of this window", () => {
  const seed = rawReading(41, 21);
  // Nothing new completes during the window: the seam keeps returning the
  // pre-window frame, and the window honestly measured nothing.
  const { ms } = gpuSamples([seed, seed, seed, seed], seed, "raw");
  expect(ms).toEqual([]);
});

test("a frame that completes during the window still counts once after the seed", () => {
  const seed = rawReading(41, 21);
  const { ms } = gpuSamples([seed, seed, rawReading(42, 23), rawReading(42, 23)], seed, "raw");
  expect(ms).toEqual([23]);
});

test("a raw window with no completed frame yet reports no samples, not a zero", () => {
  const empty = { ms: null, metric: null, frameId: null, submissionId: null };
  const { ms, metric } = gpuSamples([empty, empty, empty], empty, "raw");
  expect(ms).toEqual([]);
  expect(metric).toBeNull();
  expect(ms).not.toContain(0);
});

test("raw readings missing their frame identity are not samples", () => {
  // A span with no identity cannot be told apart from the one before it.
  const unidentified = {
    ms: 17,
    metric: "correlated-complete-submission-span",
    frameId: null,
    submissionId: null,
  };
  const { ms } = gpuSamples([unidentified, unidentified], unidentified, "raw");
  expect(ms).toEqual([]);
});

test("the same frame id under a new submission is a distinct raw measurement", () => {
  const seed = { ms: null, metric: null, frameId: null, submissionId: null };
  const first = {
    ms: 12,
    metric: "correlated-complete-submission-span",
    frameId: 7,
    submissionId: 3,
  };
  const second = { ...first, ms: 13, submissionId: 4 };
  expect(gpuSamples([first, second], seed, "raw").ms).toEqual([12, 13]);
});

test("source keeps its uncorrelated render-pass sum semantics: every read is a reading", () => {
  // The source value belongs to no identified frame, so the gate has always
  // counted reads of it. Migration may not quietly redefine that.
  const readings = [sourceReading(9), sourceReading(9), sourceReading(9)];
  const { ms, metric } = gpuSamples(readings, sourceReading(9), "source");
  expect(ms).toEqual([9, 9, 9]);
  expect(metric).toBe("source-render-pass-timestamp-sum");
});

test("a missing source measurement is dropped rather than counted as zero", () => {
  const { ms } = gpuSamples(
    [sourceReading(null), sourceReading(8), sourceReading(null)],
    sourceReading(null),
    "source",
  );
  expect(ms).toEqual([8]);
});

test("a run that mixed two metrics reports both rather than claiming one", () => {
  const { metric } = gpuSamples(
    [sourceReading(9), { ...rawReading(3, 10) }],
    sourceReading(null),
    "source",
  );
  expect(metric).toBe("correlated-complete-submission-span+source-render-pass-timestamp-sum");
});

const residency = {
  detail: { focusRingActive: true },
  baseSample: { acceptedRecords: 900_000, recordCapacity: 1_000_000, lodStratifiedBudget: false },
  focusSample: { acceptedRecords: 60_000, recordCapacity: 65_536 },
  rebuild: { activeRecordBudget: 1_065_536, areaBudgetScale: 1, pending: false },
};

test("raw grass records are the counts its GPU layers actually hold", () => {
  const grass = {
    residency,
    visibility: { base: true, ring: true, far: true },
    layers: [
      { recordCount: 840_000, capacity: 1_000_000 },
      { recordCount: 60_000, capacity: 65_536 },
    ],
  };
  const reading = grassReading(grass, "raw")!;
  expect(reading.recordCount).toBe(900_000);
  expect(reading.enabled).toBe(true);
  expect(reading.rebuild).toBe(residency.rebuild);
  expect(reading.baseSample).toBe(residency.baseSample);
  expect(reading.focusSample).toBe(residency.focusSample);
  expect(reading.detail).toBe(residency.detail);
});

test("the raw focus layer's records count only while the focus layer is drawn", () => {
  const grass = {
    residency,
    visibility: { base: true, ring: false, far: true },
    layers: [{ recordCount: 840_000 }, { recordCount: 60_000 }],
  };
  expect(grassReading(grass, "raw")!.recordCount).toBe(840_000);
});

test("raw grass is enabled by the visibility route and draw obey, not by resident records", () => {
  // A layer that is switched off still holds every record it sampled; the
  // gate's foliage assertion must see the field go dark anyway.
  const grass = {
    residency,
    visibility: { base: false, ring: false, far: false },
    layers: [{ recordCount: 840_000 }, { recordCount: 60_000 }],
  };
  const reading = grassReading(grass, "raw")!;
  expect(reading.enabled).toBe(false);
  expect(reading.recordCount).toBe(840_000);
});

test("CPU tier, triangle and thinning columns are absent on raw, never zero", () => {
  const grass = {
    residency,
    visibility: { base: true, ring: true, far: true },
    layers: [{ recordCount: 840_000 }, { recordCount: 60_000 }],
  };
  const reading = grassReading(grass, "raw")!;
  expect(reading.submittedTriangles).toBeNull();
  expect(reading.tierRecords).toBeNull();
  expect(reading.tierDroppedByThinning).toBeNull();
  expect(reading.thinnedRecords).toBeNull();
});

test("raw grass without the visibility or layer owners reads as nothing, not as source", () => {
  // The source shape must not answer a raw question: an unrecognised payload
  // fails the floors instead of being reinterpreted.
  const sourceShaped = { ...residency, enabled: true, recordCount: 900_000 };
  expect(grassReading(sourceShaped, "raw")).toBeNull();
  expect(
    grassReading({ residency, layers: [{ recordCount: 1 }, { recordCount: 1 }] }, "raw"),
  ).toBeNull();
  expect(grassReading({ residency, visibility: { base: true, ring: false } }, "raw")).toBeNull();
  expect(grassReading(null, "raw")).toBeNull();
});

test("source grass keeps reading its flattened blade-field mirror", () => {
  const grass = {
    ...residency,
    enabled: true,
    recordCount: 900_000,
    submittedTriangles: 12_345,
    thinnedRecords: 640,
    tiers: {
      near: { records: 10, droppedByThinning: 1 },
      mid: { records: 20, droppedByThinning: 2 },
      far: { records: 30, droppedByThinning: 3 },
    },
  };
  const reading = grassReading(grass, "source")!;
  expect(reading.recordCount).toBe(900_000);
  expect(reading.enabled).toBe(true);
  expect(reading.submittedTriangles).toBe(12_345);
  expect(reading.thinnedRecords).toBe(640);
  expect(reading.tierRecords).toEqual({ near: 10, mid: 20, far: 30 });
  expect(reading.tierDroppedByThinning).toEqual({ near: 1, mid: 2, far: 3 });
  expect(reading.rebuild).toBe(residency.rebuild);
});

test("an unset route is the incumbent source renderer, and both routes are known", () => {
  expect(assertKnownRoute("source")).toBe("source");
  expect(assertKnownRoute("raw")).toBe("raw");
});

test("a mistyped route is rejected rather than quietly measuring source", () => {
  for (const typo of [
    "rwa",
    "Raw",
    "RAW",
    "native",
    "three",
    " raw",
    "",
    "constructor",
    "__proto__",
  ])
    expect(() => assertKnownRoute(typo)).toThrow(/VERIFY_BATTLE_ROUTE/);
});
