import type { GrassPublication } from "./CaptureGrassResidency";
import type { BattleReplayFrame } from "./fixture";

/** The source diagnostic payload is archival metadata, not the current renderer's
 * stats API. Native replay forwards it without constructing the historical owner. */
export interface CapturedReplayFrame {
  animationFrame: number;
  grassPublications?: GrassPublication[];
  frame: BattleReplayFrame;
  reference: Record<string, unknown>;
}

export interface ReplayManifest {
  source: "production-presented";
  grassDraws: { name: string; visible: boolean; command: number[] }[];
  sourceUrl: string;
  benchmark: import("../../../web/src/battle/benchmark/benchmarkRun").BenchmarkStatus | null;
  boundaryBenchmark: ReplayManifest["benchmark"];
  provisional: true;
  capturedAt: string;
  stopped: "frame-limit" | "byte-limit" | "cancelled" | "running-boundary";
  timing: "capture-overhead-not-a-performance-run";
  framebuffer: { width: number; height: number };
  referenceImageHash: string | null;
  referenceFrameId: number | null;
  frameCount: number;
  frameBytes: number;
  assetsHash: string;
  groundHash: string;
  groundBytes: number;
  settingsHash: string;
  loadedAppearanceHash: string;
  assetsBytes: number;
  settingsBytes: number;
  loadedAppearanceEncodedBytes: number;
  largestAppearanceBytes: number;
  frameHashes: string[];
  poseHashes: string[];
  windowBytes: number;
  poseBytes: number;
}

export interface ReplayArchive {
  manifest: ReplayManifest;
  assets: Blob;
  settings: Blob;
  frames: Blob[];
  poses: Blob[];
  referenceImage?: Blob;
}
