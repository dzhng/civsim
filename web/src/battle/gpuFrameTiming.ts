import type {
  BattleCorrelatedGpuFrame,
  BattleGpuEvent,
  BattleGpuEventBatch,
  BattlePresentationReceipt,
} from "./battleRendererApi";

/** Presented frames waiting for their measurement, and measurements waiting for
 * their frame. Readbacks land a frame or two after presentation, so both sides
 * hold a few entries; anything older than this is a frame nobody will ask about
 * again, and dropping it is reported rather than silently growing. */
const MAX_PENDING = 64;

/** Observable state of the join: an empty sample must be explainable as "no
 * measurement arrived yet", "the backend measures nothing", or "retention
 * dropped it", never as zero GPU time. */
export interface BattleGpuCorrelationStatus {
  /** `unavailable` means the backend published no event stream at the last read —
   * an unsupported device or the lab's disabled query control. `unknown` means no
   * read has happened yet. */
  availability: "unknown" | "correlating" | "unavailable";
  eventCursor: number;
  /** Reads that found retention had already evicted unseen events. */
  cursorGaps: number;
  pendingReceipts: number;
  pendingCompletions: number;
  evictedReceipts: number;
  evictedCompletions: number;
  correlatedFrames: number;
  /** Battle-draw submissions whose measurement cannot be used: incomplete,
   * dropped by observer retention, missing queries, or non-finite values. */
  unmeasuredSubmissions: number;
  /** Completions that arrived after a newer presented frame was already published. */
  supersededCompletions: number;
}

interface Measurement {
  observedGpuSpanMs: number;
  observedGpuUnionMs: number;
}

/** Joins successful presentation receipts to the GPU events measuring their own
 * submission, so a frame's GPU cost is reported under the identity of the frame
 * that actually presented it.
 *
 * The join owns no GPU work: it reads the renderer's existing non-destructive
 * event stream through a cursor and never waits for completion. Readbacks may
 * arrive before or after their receipt and in any order, so both sides are held
 * until matched. The published sample keeps its own frame and submission id — it
 * is the last frame that completed, which is normally older than the frame in
 * flight, and it is never relabelled as the current one. */
export class BattleGpuFrameTiming {
  private readonly receipts = new Map<number, number>();
  private readonly completions = new Map<number, Measurement | null>();
  private sample: BattleCorrelatedGpuFrame | null = null;
  private availability: BattleGpuCorrelationStatus["availability"] = "unknown";
  private cursor = 0;
  private cursorGaps = 0;
  private evictedReceipts = 0;
  private evictedCompletions = 0;
  private correlatedFrames = 0;
  private unmeasuredSubmissions = 0;
  private supersededCompletions = 0;
  private disposed = false;

  /** `events` is the renderer's own cursor read; returning null is the explicit
   * "this backend publishes no GPU events" answer, not an empty batch. */
  constructor(private readonly events: (afterSequence: number) => BattleGpuEventBatch | null) {}

  /** Record one presentation result. Frames that submitted nothing — a repeated
   * frozen image — carry the previous submission's identity and must not create a
   * new one, and readiness/render-only submissions are not the presented frame. */
  presented(receipt: BattlePresentationReceipt): void {
    if (this.disposed) return;
    const identity = receipt.gpuSubmission;
    if (!receipt.submitted || !identity || identity.source !== "battle-draw") return;
    const completed = this.completions.get(identity.submissionId);
    if (this.completions.has(identity.submissionId)) {
      this.completions.delete(identity.submissionId);
      if (completed) this.publish(receipt.renderedFrameId, identity.submissionId, completed);
      return;
    }
    this.receipts.set(identity.submissionId, receipt.renderedFrameId);
    this.evictedReceipts += evictOldest(this.receipts);
  }

  /** The newest presented frame whose own submission has completed, or null when
   * nothing has completed yet. Reads pending events first. */
  correlatedFrame(): BattleCorrelatedGpuFrame | null {
    this.pump();
    // A value, not the held sample: a consumer editing what it reads must not
    // move the frame this owner compares later completions against.
    return this.sample && { ...this.sample };
  }

  status(): BattleGpuCorrelationStatus {
    return {
      availability: this.availability,
      eventCursor: this.cursor,
      cursorGaps: this.cursorGaps,
      pendingReceipts: this.receipts.size,
      pendingCompletions: this.completions.size,
      evictedReceipts: this.evictedReceipts,
      evictedCompletions: this.evictedCompletions,
      correlatedFrames: this.correlatedFrames,
      unmeasuredSubmissions: this.unmeasuredSubmissions,
      supersededCompletions: this.supersededCompletions,
    };
  }

  /** Releases the join with its renderer. A disposed owner keeps reporting its
   * counters but publishes nothing further, so a late readback cannot resurrect a
   * sample for a renderer that no longer exists. */
  dispose(): void {
    this.disposed = true;
    this.sample = null;
    this.receipts.clear();
    this.completions.clear();
  }

  private pump(): void {
    if (this.disposed) return;
    const batch = this.events(this.cursor);
    if (!batch) {
      // Nothing can ever complete for the frames held here, so they are released
      // rather than held against a backend that measures nothing.
      this.availability = "unavailable";
      this.receipts.clear();
      this.completions.clear();
      return;
    }
    this.availability = "correlating";
    if (batch.cursorGap) this.cursorGaps++;
    this.cursor = batch.nextSequence;
    for (const event of batch.events) this.observe(event);
  }

  private observe(event: BattleGpuEvent): void {
    // Readiness and other render-only submissions are not the presented frame.
    if (event.source !== "battle-draw") return;
    const frameId = this.receipts.get(event.submissionId);
    // One event closes its submission either way: a submission the observer could
    // not measure will never produce a second, usable result.
    this.receipts.delete(event.submissionId);
    const measurement = usableMeasurement(event);
    if (!measurement) {
      this.unmeasuredSubmissions++;
    }
    if (frameId === undefined) {
      // Retain failures too: a later receipt must not wait for a measurement
      // that the observer has already declared unusable.
      this.completions.set(event.submissionId, measurement);
      this.evictedCompletions += evictOldest(this.completions);
      return;
    }
    if (measurement) this.publish(frameId, event.submissionId, measurement);
  }

  private publish(renderedFrameId: number, submissionId: number, measured: Measurement): void {
    // Out-of-order completion must not walk the reported frame backwards.
    if (this.sample && renderedFrameId <= this.sample.renderedFrameId) {
      this.supersededCompletions++;
      return;
    }
    this.sample = { renderedFrameId, submissionId, ...measured };
    this.correlatedFrames++;
  }
}

/** Only a complete battle-draw measurement with every query present and finite,
 * non-negative values is a frame time. Incomplete, dropped and invalid events
 * stay unreported rather than contributing a partial or zero total. */
function usableMeasurement(event: BattleGpuEvent): Measurement | null {
  if (event.status !== "complete" || event.missingQueries !== 0) return null;
  const { observedGpuSpanMs, observedGpuUnionMs } = event;
  if (!measured(observedGpuSpanMs) || !measured(observedGpuUnionMs)) return null;
  return { observedGpuSpanMs, observedGpuUnionMs };
}

/** A backend that records no timestamp ranges reports them absent or null; a
 * driver that returns nonsense reports NaN or a reversed interval. */
function measured(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Maps iterate in insertion order, so the front of the iteration is oldest. */
function evictOldest(pending: Map<number, unknown>): number {
  let evicted = 0;
  for (const oldest of pending.keys()) {
    if (pending.size <= MAX_PENDING) break;
    pending.delete(oldest);
    evicted++;
  }
  return evicted;
}
