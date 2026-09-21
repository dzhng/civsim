import type { BattleGpuEvent, BattleGpuEventBatch } from "../battleRendererApi";
import type { BattleLoopFrameMetrics } from "../battleDebugApi";
import type { BenchmarkCameraSample } from "./benchmarkCamera";

type CameraRecord = Omit<BenchmarkCameraSample, "phase">;
export interface BenchmarkFrame extends BattleLoopFrameMetrics {
  elapsedMs: number;
  sourceIntervalMs: number;
  phase: string;
  camera: CameraRecord;
  intendedCamera: CameraRecord;
}

/** The first timed frame establishes a boundary; preparation never becomes an FPS interval. */
export class BenchmarkRecording {
  private initial: BattleLoopFrameMetrics | null = null;
  private startedAt = 0;
  private previousAt = 0;
  private readonly frames: BenchmarkFrame[] = [];
  private readonly capacity: number;
  private gpuCursor = 0;
  private readonly gpuSubmissions = new Set<number>();
  private readonly gpuResults = new Map<number, BattleGpuEvent>();
  private gpuCursorGaps = 0;
  private lostGpuEvents = 0;

  constructor(durationMs: number) {
    // 1000 samples/second exceeds supported display cadences while bounding retained data.
    this.capacity = Math.ceil(durationMs) + 1;
  }

  start(now: number, gpuCursor = 0) {
    this.gpuCursor = gpuCursor;
    this.startedAt = now;
    this.previousAt = now;
  }

  record(
    frame: BattleLoopFrameMetrics,
    camera: CameraRecord,
    phase: string,
    intendedCamera: CameraRecord,
  ) {
    if (this.frames.length >= this.capacity)
      throw new Error(`Benchmark recording exceeded ${this.capacity} frame samples`);
    const submission = frame.renderer.gpuSubmission;
    if (submission) this.gpuSubmissions.add(submission.submissionId);
    if (frame.timestampMs === this.previousAt) {
      this.initial = frame;
      return;
    }
    this.frames.push({
      ...frame,
      elapsedMs: frame.timestampMs - this.startedAt,
      sourceIntervalMs: frame.intervalMs,
      intervalMs: frame.timestampMs - this.previousAt,
      phase,
      camera,
      intendedCamera,
    });
    this.previousAt = frame.timestampMs;
  }

  get gpuEventCursor(): number {
    return this.gpuCursor;
  }

  collectGpu(batch: BattleGpuEventBatch | null): void {
    if (!batch || batch.nextSequence <= this.gpuCursor) return;
    if (batch.cursorGap) {
      this.gpuCursorGaps++;
      this.lostGpuEvents += Math.max(0, batch.oldestRetainedSequence - this.gpuCursor - 1);
    }
    this.gpuCursor = batch.nextSequence;
    for (const event of batch.events) {
      // Preparation may resolve after timing starts; retain only identities
      // captured with benchmark CPU samples. Maps stay bounded by frame capacity.
      if (this.gpuSubmissions.has(event.submissionId))
        this.gpuResults.set(event.submissionId, event);
    }
  }

  gpuSnapshot() {
    const unresolvedSubmissionIds = [...this.gpuSubmissions].filter(
      (id) => !this.gpuResults.has(id),
    );
    return {
      coverage: "Exact submission-matched render and compute pass queries",
      exclusions:
        "Uploads, copies, queue wait, presentation and outside-submission work are not measured",
      terminalPolicy: "Snapshot at run end; unresolved queries are not awaited",
      trackedSubmissions: this.gpuSubmissions.size,
      pendingOrMissingCount: unresolvedSubmissionIds.length,
      unresolvedSubmissionIds,
      cursorGapCount: this.gpuCursorGaps,
      lostEventCount: this.lostGpuEvents,
      results: [...this.gpuResults.values()],
    };
  }

  firstFrame(): BattleLoopFrameMetrics | null {
    return this.initial;
  }

  samples(): readonly BenchmarkFrame[] {
    return this.frames;
  }
}
