// @vitest-environment node

import { expect, test } from "vitest";
import { BattleGpuFrameTiming } from "./gpuFrameTiming";
import type {
  BattleGpuEvent,
  BattleGpuEventBatch,
  BattlePresentationReceipt,
} from "./battleRendererApi";

/** A renderer's event stream: the reader takes events after its own cursor and
 * takes nothing away, exactly like the observer's non-destructive retention. */
function stream(options: { retain?: number } = {}) {
  const retain = options.retain ?? 128;
  const published: BattleGpuEvent[] = [];
  let sequence = 0;
  let available = true;
  const reads: number[] = [];
  return {
    reads,
    disable() {
      available = false;
    },
    enable() {
      available = true;
    },
    publish(event: Partial<BattleGpuEvent> & Pick<BattleGpuEvent, "submissionId">) {
      const complete: BattleGpuEvent = {
        sequence: ++sequence,
        source: "battle-draw",
        status: "complete",
        reason: null,
        missingQueries: 0,
        renderMs: 4,
        computeMs: 1,
        measuredPassGpuMs: 5,
        observedGpuSpanMs: 8,
        observedGpuUnionMs: 5,
        stages: [],
        ...event,
      };
      published.push(complete);
      while (published.length > retain) published.shift();
      return complete;
    },
    read(afterSequence: number): BattleGpuEventBatch | null {
      reads.push(afterSequence);
      if (!available) return null;
      const oldestRetainedSequence = published[0]?.sequence ?? sequence + 1;
      return {
        nextSequence: sequence,
        oldestRetainedSequence,
        cursorGap: afterSequence < oldestRetainedSequence - 1,
        events: published.filter((event) => event.sequence > afterSequence),
      };
    },
  };
}

const receipt = (
  renderedFrameId: number,
  submissionId: number,
  overrides: Partial<BattlePresentationReceipt> = {},
): BattlePresentationReceipt => ({
  submitted: true,
  renderedFrameId,
  gpuSubmission: { submissionId, source: "battle-draw", backend: "raw" },
  submittedAtMs: renderedFrameId * 16,
  cpuMs: 3,
  ...overrides,
});

test("a presented frame reports its own submission once that submission completes", () => {
  const events = stream();
  const timing = new BattleGpuFrameTiming(events.read);

  timing.presented(receipt(1, 11));
  // The readback has not landed: an uncorrelated frame has no GPU time at all.
  expect(timing.correlatedFrame()).toBeNull();
  expect(timing.status()).toMatchObject({ availability: "correlating", pendingReceipts: 1 });

  timing.presented(receipt(2, 12));
  events.publish({ submissionId: 11, observedGpuSpanMs: 9.5, observedGpuUnionMs: 6.25 });
  expect(timing.correlatedFrame()).toEqual({
    renderedFrameId: 1,
    submissionId: 11,
    observedGpuSpanMs: 9.5,
    observedGpuUnionMs: 6.25,
  });

  // Frame 2 is still in flight; the exposed sample keeps frame 1's identity
  // rather than being relabelled as the newest frame.
  events.publish({ submissionId: 12, observedGpuSpanMs: 11, observedGpuUnionMs: 7 });
  expect(timing.correlatedFrame()).toMatchObject({ renderedFrameId: 2, submissionId: 12 });
  expect(timing.status()).toMatchObject({
    correlatedFrames: 2,
    pendingReceipts: 0,
    pendingCompletions: 0,
  });
});

test("a readback that arrives before its own receipt still correlates", () => {
  const events = stream();
  const timing = new BattleGpuFrameTiming(events.read);

  events.publish({ submissionId: 11, observedGpuSpanMs: 4 });
  expect(timing.correlatedFrame()).toBeNull();
  expect(timing.status()).toMatchObject({ pendingCompletions: 1, pendingReceipts: 0 });

  timing.presented(receipt(1, 11));
  expect(timing.correlatedFrame()).toMatchObject({ renderedFrameId: 1, observedGpuSpanMs: 4 });
  expect(timing.status()).toMatchObject({ pendingCompletions: 0 });
});

test("an unusable event arriving first closes its later receipt", () => {
  for (const failure of [
    { status: "incomplete" as const },
    { status: "dropped" as const },
    { missingQueries: 1 },
  ]) {
    const events = stream();
    const timing = new BattleGpuFrameTiming(events.read);
    events.publish({ submissionId: 11, ...failure });
    expect(timing.correlatedFrame()).toBeNull();

    timing.presented(receipt(1, 11));
    expect(timing.correlatedFrame()).toBeNull();
    expect(timing.status()).toMatchObject({
      pendingReceipts: 0,
      pendingCompletions: 0,
      unmeasuredSubmissions: 1,
    });
  }
});

test("an older completion never replaces a newer presented frame's sample", () => {
  const events = stream();
  const timing = new BattleGpuFrameTiming(events.read);

  timing.presented(receipt(1, 11));
  timing.presented(receipt(2, 12));
  events.publish({ submissionId: 12, observedGpuSpanMs: 20 });
  expect(timing.correlatedFrame()).toMatchObject({ renderedFrameId: 2, observedGpuSpanMs: 20 });

  events.publish({ submissionId: 11, observedGpuSpanMs: 3 });
  expect(timing.correlatedFrame()).toMatchObject({ renderedFrameId: 2, observedGpuSpanMs: 20 });
  expect(timing.status()).toMatchObject({ supersededCompletions: 1, correlatedFrames: 1 });
});

test("incomplete, dropped, gap-affected and invalid measurements report no frame time", () => {
  const events = stream();
  const timing = new BattleGpuFrameTiming(events.read);

  for (const [frame, submission] of [
    [1, 11],
    [2, 12],
    [3, 13],
    [4, 14],
    [5, 15],
  ])
    timing.presented(receipt(frame, submission));

  events.publish({ submissionId: 11, status: "incomplete", reason: "query-ring-full" });
  events.publish({ submissionId: 12, status: "dropped", reason: "submission-retention" });
  events.publish({ submissionId: 13, missingQueries: 2 });
  events.publish({ submissionId: 14, observedGpuSpanMs: null, observedGpuUnionMs: null });
  events.publish({ submissionId: 15, observedGpuSpanMs: Number.NaN });

  expect(timing.correlatedFrame()).toBeNull();
  expect(timing.status()).toMatchObject({
    unmeasuredSubmissions: 5,
    // Each unusable event closes its submission instead of leaving a receipt that
    // can never be matched.
    pendingReceipts: 0,
    correlatedFrames: 0,
  });
});

test("readiness-only submissions and repeated frozen frames create no sample", () => {
  const events = stream();
  const timing = new BattleGpuFrameTiming(events.read);

  // A startup frame's final queue identity is its readiness render, not its draw.
  timing.presented({
    ...receipt(1, 11),
    gpuSubmission: { submissionId: 11, source: "render-only", backend: "raw" },
  });
  // A frozen frame resubmits nothing and carries the previous identity forward.
  timing.presented({ ...receipt(1, 11), submitted: false });
  expect(timing.status().pendingReceipts).toBe(0);

  events.publish({ submissionId: 11, source: "render-only" });
  expect(timing.correlatedFrame()).toBeNull();
  expect(timing.status()).toMatchObject({ correlatedFrames: 0, unmeasuredSubmissions: 0 });

  // The same frame drawn for real does correlate.
  timing.presented(receipt(2, 12));
  events.publish({ submissionId: 12, observedGpuSpanMs: 6 });
  expect(timing.correlatedFrame()).toMatchObject({ renderedFrameId: 2, observedGpuSpanMs: 6 });
});

test("a backend that publishes no events reports unavailable, not zero", () => {
  const events = stream();
  events.disable();
  const timing = new BattleGpuFrameTiming(events.read);

  timing.presented(receipt(1, 11));
  expect(timing.correlatedFrame()).toBeNull();
  expect(timing.status()).toMatchObject({
    availability: "unavailable",
    pendingReceipts: 0,
    correlatedFrames: 0,
  });

  // Nothing can complete while the stream is absent, so frames are not hoarded.
  timing.presented(receipt(2, 12));
  expect(timing.correlatedFrame()).toBeNull();
  expect(timing.status().pendingReceipts).toBe(0);

  events.enable();
  timing.correlatedFrame();
  timing.presented(receipt(3, 13));
  events.publish({ submissionId: 13, observedGpuSpanMs: 2 });
  expect(timing.correlatedFrame()).toMatchObject({ renderedFrameId: 3 });
  expect(timing.status().availability).toBe("correlating");
});

test("observer retention that outruns the cursor is reported as a gap", () => {
  const events = stream({ retain: 2 });
  const timing = new BattleGpuFrameTiming(events.read);

  timing.presented(receipt(1, 11));
  expect(timing.correlatedFrame()).toBeNull();
  events.publish({ submissionId: 11, observedGpuSpanMs: 5 });
  events.publish({ submissionId: 12, source: "render-only" });
  events.publish({ submissionId: 13, source: "render-only" });

  // Frame 1's event was evicted before this reader saw it: the loss is visible
  // and the frame stays uncorrelated rather than borrowing another event.
  expect(timing.correlatedFrame()).toBeNull();
  expect(timing.status()).toMatchObject({ cursorGaps: 1, pendingReceipts: 1 });
});

test("pending receipts and completions stay bounded and report their evictions", () => {
  const events = stream();
  const timing = new BattleGpuFrameTiming(events.read);

  for (let frame = 1; frame <= 200; frame++) timing.presented(receipt(frame, 1000 + frame));
  expect(timing.status()).toMatchObject({ pendingReceipts: 64, evictedReceipts: 136 });

  for (let submission = 2000; submission < 2100; submission++)
    events.publish({ submissionId: submission });
  expect(timing.correlatedFrame()).toBeNull();
  expect(timing.status()).toMatchObject({ pendingCompletions: 64, evictedCompletions: 36 });

  // An evicted completion's late receipt correlates nothing; a retained one does.
  timing.presented(receipt(300, 2000));
  expect(timing.correlatedFrame()).toBeNull();
  timing.presented(receipt(301, 2099));
  expect(timing.correlatedFrame()).toMatchObject({ renderedFrameId: 301, submissionId: 2099 });
});

test("a disposed owner drops its sample and stops reading its renderer", () => {
  const events = stream();
  const timing = new BattleGpuFrameTiming(events.read);

  timing.presented(receipt(1, 11));
  events.publish({ submissionId: 11, observedGpuSpanMs: 7 });
  expect(timing.correlatedFrame()).not.toBeNull();

  timing.dispose();
  const reads = events.reads.length;
  timing.presented(receipt(2, 12));
  events.publish({ submissionId: 12, observedGpuSpanMs: 9 });
  expect(timing.correlatedFrame()).toBeNull();
  expect(events.reads).toHaveLength(reads);
  expect(timing.status()).toMatchObject({ pendingReceipts: 0, pendingCompletions: 0 });
});

test("the cursor advances so one read never re-counts an event", () => {
  const events = stream();
  const timing = new BattleGpuFrameTiming(events.read);

  timing.presented(receipt(1, 11));
  events.publish({ submissionId: 11 });
  timing.correlatedFrame();
  expect(timing.status().eventCursor).toBe(1);

  // Re-reading the same retained event cannot supersede or re-correlate it.
  timing.correlatedFrame();
  expect(timing.status()).toMatchObject({
    correlatedFrames: 1,
    supersededCompletions: 0,
    eventCursor: 1,
  });
  expect(events.reads).toEqual([0, 1]);
});
