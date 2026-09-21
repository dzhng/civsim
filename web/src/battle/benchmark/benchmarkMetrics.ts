/** Aggregate raw intervals before chart downsampling. Invalid intervals are counted
 * separately; no valid samples means null metrics. Frame percentiles use nearest rank. */
export function summarizeFrameIntervals(intervalsMs: readonly number[]) {
  const sorted = intervalsMs.filter(isValidInterval).sort((a, b) => a - b);
  const durationMs = sorted.reduce((total, ms) => total + ms, 0);
  const n = sorted.length;
  const percentile = (fraction: number): number | null =>
    n ? sorted[Math.ceil(n * fraction) - 1] : null;
  const lowFps = (fraction: number): number | null => {
    if (!n) return null;
    const count = Math.ceil(n * fraction);
    let total = 0;
    for (let i = n - count; i < n; i++) total += sorted[i];
    return (1000 * count) / total;
  };
  return {
    validCount: n,
    invalidCount: intervalsMs.length - n,
    durationMs,
    averageFps: n ? (1000 * n) / durationMs : null,
    low1PercentFps: lowFps(0.01),
    low01PercentFps: lowFps(0.001),
    minFps: n ? 1000 / sorted[n - 1] : null,
    maxFps: n ? 1000 / sorted[0] : null,
    p50FrameMs: percentile(0.5),
    p95FrameMs: percentile(0.95),
    p99FrameMs: percentile(0.99),
    maxFrameMs: n ? sorted[n - 1] : null,
    spikes: {
      over25Ms: sorted.filter((ms) => ms > 25).length,
      over33_33Ms: sorted.filter((ms) => ms > 33.33).length,
      over50Ms: sorted.filter((ms) => ms > 50).length,
    },
  };
}

export type FrameIntervalSummary = ReturnType<typeof summarizeFrameIntervals>;

function isValidInterval(ms: number): boolean {
  return Number.isFinite(ms) && ms > 0;
}

export interface TimestampedFrameInterval {
  /** Interval end, measured from the start of the timed run. */
  elapsedMs: number;
  intervalMs: number;
}

export interface FrameIntervalBin<T> {
  startMs: number;
  endMs: number;
  min: T;
  max: T;
  count: number;
}

/** Equal-time bins span zero through the last valid timestamp; empty bins are omitted.
 * Bins are left-closed, with the final endpoint included. Original samples preserve
 * exact timestamps and hover metadata; ties retain the first source sample. */
export function binFrameIntervals<T extends TimestampedFrameInterval>(
  samples: readonly T[],
  binCount: number,
): { bins: FrameIntervalBin<T>[]; invalidCount: number } {
  if (!Number.isSafeInteger(binCount) || binCount <= 0) {
    throw new RangeError("binCount must be a positive safe integer");
  }
  const valid = samples.filter(
    (sample) =>
      Number.isFinite(sample.elapsedMs) &&
      sample.elapsedMs >= 0 &&
      isValidInterval(sample.intervalMs),
  );
  let endMs = 0;
  for (const sample of valid) endMs = Math.max(endMs, sample.elapsedMs);
  const bins = new Map<number, FrameIntervalBin<T>>();
  for (const sample of valid) {
    const index =
      endMs > 0 ? Math.min(binCount - 1, Math.floor((sample.elapsedMs / endMs) * binCount)) : 0;
    const bin = bins.get(index);
    if (bin) {
      bin.count++;
      if (sample.intervalMs < bin.min.intervalMs) bin.min = sample;
      if (sample.intervalMs > bin.max.intervalMs) bin.max = sample;
    } else {
      bins.set(index, {
        startMs: (index / binCount) * endMs,
        endMs: ((index + 1) / binCount) * endMs,
        min: sample,
        max: sample,
        count: 1,
      });
    }
  }
  return {
    bins: [...bins.entries()].sort(([a], [b]) => a - b).map(([, bin]) => bin),
    invalidCount: samples.length - valid.length,
  };
}
