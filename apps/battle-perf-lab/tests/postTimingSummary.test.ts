import { describe, it, expect } from "vitest";
import { postPassNames, summarizePostSamples } from "../candidates/raw-post/timingSummary";
import type { NativeGpuEvent } from "../../../packages/battle-renderer/src/nativeGpuTelemetry";
const event = (values: (number | null)[]): NativeGpuEvent => ({
  backend: "raw",
  source: "render-only",
  submissionId: 1,
  sequence: 1,
  status: "complete",
  reason: null,
  missingQueries: 0,
  renderMs: 0,
  computeMs: 0,
  measuredPassGpuMs: 0,
  observedGpuSpanMs: null,
  observedGpuUnionMs: null,
  stages: [],
  passes: values.map((ms) => ({ kind: "render", label: "post", ms })),
});
describe("post pass diagnostic", () => {
  it("maps ordered passes to the pyramid and final output without combining samples", () => {
    expect(postPassNames(true)).toEqual([
      "highpass",
      "horizontal-0",
      "vertical-0",
      "horizontal-1",
      "vertical-1",
      "horizontal-2",
      "vertical-2",
      "horizontal-3",
      "vertical-3",
      "horizontal-4",
      "vertical-4",
      "composite",
      "grade-agx-output",
    ]);
    const a = Array.from({ length: 13 }, (_, i) => i + 1);
    const result = summarizePostSamples([event(a), event(a.map((n) => n + 2))], true);
    expect(result[12]).toEqual({
      name: "grade-agx-output",
      samples: 2,
      meanMs: 14,
      minMs: 13,
      medianMs: 15,
      p95Ms: 15,
      maxMs: 15,
    });
    expect(summarizePostSamples([event([8])], false)[0].meanMs).toBe(8);
  });
  it("refuses partial, missing or wrong-count timings rather than inventing zeros", () => {
    expect(() => summarizePostSamples([], false)).toThrow();
    expect(() => summarizePostSamples([event([null])], false)).toThrow();
    expect(() => summarizePostSamples([event([1, 2])], false)).toThrow();
    expect(() => summarizePostSamples([{ ...event([1]), status: "incomplete" }], false)).toThrow();
  });
});
