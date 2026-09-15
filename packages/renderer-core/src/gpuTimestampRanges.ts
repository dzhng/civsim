export interface GpuTimestampRange {
  beginNs: bigint;
  endNs: bigint;
}

/** Observed queue-clock interval coverage, not physical GPU busy time.
 * Span retains gaps; union counts overlapping intervals only once. Subtract in
 * bigint before conversion so a large timestamp epoch cannot erase short work. */
export function summarizeGpuTimestampRanges(ranges: readonly GpuTimestampRange[]): {
  observedGpuSpanMs: number;
  observedGpuUnionMs: number;
} | null {
  if (!ranges.length || ranges.some(({ beginNs, endNs }) => beginNs < 0n || endNs < beginNs))
    return null;
  const ordered = [...ranges].sort((a, b) =>
    a.beginNs < b.beginNs ? -1 : a.beginNs > b.beginNs ? 1 : 0,
  );
  const first = ordered[0].beginNs;
  let start = first,
    end = ordered[0].endNs,
    union = 0n;
  for (const range of ordered.slice(1)) {
    if (range.beginNs > end) {
      union += end - start;
      start = range.beginNs;
      end = range.endNs;
    } else if (range.endNs > end) end = range.endNs;
  }
  union += end - start;
  const observedGpuSpanMs = Number(end - first) / 1e6;
  const observedGpuUnionMs = Number(union) / 1e6;
  return Number.isFinite(observedGpuSpanMs) && Number.isFinite(observedGpuUnionMs)
    ? { observedGpuSpanMs, observedGpuUnionMs }
    : null;
}
