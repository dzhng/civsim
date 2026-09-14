import type { BattleLoopFrameMetrics } from "../battleDebugApi";
import { ACTION_TICK_SECONDS } from "@packages/crowd-runtime/src/actionTimeline";
import type { GraphicsSettings } from "../../shared/graphicsSettings";
import { summarizeFrameIntervals } from "./benchmarkMetrics";
import { BENCHMARK_CAMERA_PHASES } from "./benchmarkCamera";
import type { BenchmarkFrame } from "./benchmarkRecording";
import type { BenchmarkStatus } from "./benchmarkRun";

export interface BenchmarkIdentity {
  userAgent: string;
  adapter: string;
  viewport: [number, number];
  framebuffer: [number, number];
  dpr: number;
  initialStateHash: string;
  soldiers: number;
  graphics: GraphicsSettings;
}

export function createBenchmarkReport(
  status: BenchmarkStatus,
  identity: BenchmarkIdentity | null,
  frames: readonly BenchmarkFrame[],
  firstFrame: BattleLoopFrameMetrics | null = null,
) {
  const summary = summarizeFrameIntervals(frames.map((frame) => frame.intervalMs));
  const phases = BENCHMARK_CAMERA_PHASES.map((phase) => ({
    ...phase,
    summary: summarizeFrameIntervals(
      frames.filter((frame) => frame.phase === phase.name).map((frame) => frame.intervalMs),
    ),
  }));
  return {
    kind: "battle-benchmark" as const,
    version: 1,
    createdAt: new Date().toISOString(),
    status,
    identity,
    measurement: "Animation-frame cadence; GPU presentation latency is not measured" as const,
    completeWindow: status.phase === "complete" && status.elapsedMs >= status.scenario.durationMs,
    simulatedSeconds:
      status.startTick === null ? 0 : (status.tick - status.startTick) * ACTION_TICK_SECONDS,
    summary,
    phases,
    frames,
    firstFrame,
  };
}
export type BenchmarkReport = ReturnType<typeof createBenchmarkReport>;
