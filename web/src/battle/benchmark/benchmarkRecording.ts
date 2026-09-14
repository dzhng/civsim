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

  constructor(durationMs: number) {
    // 1000 samples/second exceeds supported display cadences while bounding retained data.
    this.capacity = Math.ceil(durationMs) + 1;
  }

  start(now: number) {
    this.startedAt = now;
    this.previousAt = now;
  }

  record(
    frame: BattleLoopFrameMetrics,
    camera: CameraRecord,
    phase: string,
    intendedCamera: CameraRecord,
  ) {
    if (frame.timestampMs === this.previousAt) {
      this.initial = frame;
      return;
    }
    if (this.frames.length >= this.capacity)
      throw new Error(`Benchmark recording exceeded ${this.capacity} frame samples`);
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

  firstFrame(): BattleLoopFrameMetrics | null {
    return this.initial;
  }

  samples(): readonly BenchmarkFrame[] {
    return this.frames;
  }
}
