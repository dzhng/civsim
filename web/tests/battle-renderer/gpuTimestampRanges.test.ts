// @vitest-environment node
import { describe, expect, it } from "vitest";
import { summarizeGpuTimestampRanges } from "../../../packages/renderer-core/src/gpuTimestampRanges";
const r = (beginNs: bigint, endNs: bigint) => ({ beginNs, endNs });
describe("observed GPU interval metrics", () => {
  it("unions unordered nested and overlapping ranges without mutating inputs", () => {
    const ranges = [r(3000000n, 7000000n), r(1000000n, 5000000n), r(2000000n, 4000000n)];
    expect(summarizeGpuTimestampRanges(ranges)).toEqual({
      observedGpuSpanMs: 6,
      observedGpuUnionMs: 6,
    });
    expect(ranges[0].beginNs).toBe(3000000n);
  });
  it("retains gaps only in span and merges touching ranges", () => {
    expect(
      summarizeGpuTimestampRanges([r(1n, 1000001n), r(1000001n, 2000001n), r(4000001n, 5000001n)]),
    ).toEqual({ observedGpuSpanMs: 5, observedGpuUnionMs: 3 });
  });
  it("subtracts exact nanoseconds at an epoch beyond Number precision", () => {
    const epoch = 2n ** 63n;
    expect(
      summarizeGpuTimestampRanges([r(epoch, epoch + 37n), r(epoch + 20n, epoch + 70n)]),
    ).toEqual({ observedGpuSpanMs: 0.00007, observedGpuUnionMs: 0.00007 });
  });
  it("rejects empty, reset/reversed, negative data but allows quantized zero duration", () => {
    for (const ranges of [[], [r(10n, 9n)], [r(-1n, 1n)]])
      expect(summarizeGpuTimestampRanges(ranges)).toBeNull();
    expect(summarizeGpuTimestampRanges([r(0n, 0n)])).toEqual({
      observedGpuSpanMs: 0,
      observedGpuUnionMs: 0,
    });
  });
});
