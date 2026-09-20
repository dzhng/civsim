import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import type { WorldRay } from "@packages/renderer-core/src/camera3d";
import type { BattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainFeatures";
import type { BattleTerrainOptions } from "@packages/game-renderer/src/battle/terrainOptions";
import type { BattleCameraSnapshot } from "@packages/battle-renderer/src/types";
import type { BattleEnvironmentId } from "@packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "@packages/game-renderer/src/environment/postParameters";
import type { GraphicsSettings } from "../shared/graphicsSettings";
import type { BattlePresentation } from "./battlePresentation";

export interface BattleRendererOptions {
  environment?: BattleEnvironmentId | string | null;
  shadows?: string | null;
  post?: string | null;
  postGrade?: Partial<BattlePostGradeUniforms> | null;
  graphics?: GraphicsSettings;
}

/** Anything the renderer owns for the lifetime of a battle and releases with it. */
export interface BattleRendererDisposeHook {
  dispose(): void;
}

/** CPU-side object counts reported by the source three.js runtime: live Geometry
 * and Texture instances and compiled program records. These are not GPU buffer,
 * texture or pipeline counts, and a backend without those object tables reports
 * null rather than substituting a different measurement. */
export interface BattleRendererMemoryInfo {
  geometries: number;
  textures: number;
  programs: number | null;
}

export interface BattleSubmissionIdentity {
  submissionId: number;
  source: "battle-draw" | "render-only";
  /** Present only for source Three submissions. */
  threeFrameId?: number;
  backend?: "raw" | "typegpu" | "vgpu";
}

export interface BattlePresentationReceipt {
  submitted: boolean;
  renderedFrameId: number;
  gpuSubmission: BattleSubmissionIdentity | null;
  submittedAtMs: number;
  /** Active synchronous CPU work reported by the renderer, excluding await suspension. */
  cpuMs: number;
}

export interface BattleRendererFrameMetrics {
  renderedFrameId: number;
  gpuSubmission: BattleSubmissionIdentity | null;
  skippedFrozenFrame: boolean;
  buildMs: number;
  uploadMs: number;
  drawMs: number;
  frameCpuMs: number;
}

/** Names which measurement `performance.gpuTimeMs` actually is, so no consumer
 * has to assume two backends report the same thing.
 * `correlated-complete-submission-span` is one presented frame's own submission,
 * first measured GPU beginning to last measured end, including compute and the
 * gaps between passes. `source-render-pass-timestamp-sum` is the source three.js
 * runtime's asynchronous render-pass-only total, which belongs to no identified
 * frame and excludes compute. */
export type BattleGpuTimeMetric =
  | "correlated-complete-submission-span"
  | "source-render-pass-timestamp-sum";

/** One presented frame joined to its own completed GPU submission. Span keeps
 * inter-pass gaps; union counts overlapping passes once. The identity is the
 * frame that completed, which is normally older than the frame in flight. */
export interface BattleCorrelatedGpuFrame {
  renderedFrameId: number;
  submissionId: number;
  observedGpuSpanMs: number;
  observedGpuUnionMs: number;
}

/** The depth resource a backend has actually allocated, and the convention its
 * passes actually run under. `reversed` is read off the pass clear and the world
 * compare together — a renderer cannot declare reverse-Z without them. */
export interface BattleDepthDiagnostics {
  owner: string;
  /** False once the frame's attachments are released. */
  installed: boolean;
  format: GPUTextureFormat;
  samples: number;
  width: number;
  height: number;
  clearValue: number;
  reversed: boolean;
  requestedBytes: number;
}

/** Every drawn instance sits on the rendered surface, re-measured rather than
 * inferred from which sampler the crowd builder was handed. */
export interface BattleSeatingStats {
  checked: number;
  matches: boolean;
  span: number;
}

/** What a backend publishes about the world it has actually installed, beside
 * the frame timing. A field is null when that world is not installed, or when
 * this backend has no truthful measurement for it — never a stand-in value.
 * Measurements a backend still owes are named in `openObligations` rather than
 * approximated, so a consumer migrating onto these can see what is missing. */
export interface BattleInstalledSceneDiagnostics {
  /** Population the installed static simulation data says must be drawn. */
  expectedSoldiers: number;
  /** Ownership identity of the installed world and its one projector. */
  substrate: string | null;
  projection: string | null;
  environment: string | null;
  /** The camera of the last frame that actually presented, and the frame id it
   *  presented under. A preparation in flight is not a presentation, and the
   *  two travel together so a camera is never published beside another frame's
   *  identity. */
  camera: BattleCameraSnapshot | null;
  presentedFrameId: number | null;
  depth: BattleDepthDiagnostics | null;
  seating: BattleSeatingStats | null;
  /** Null where the backend keeps no per-frame draw-call count. */
  drawCalls: number | null;
  openObligations: readonly string[];
}

export interface BattleRendererStats {
  renderer: "gpu";
  device?: string;
  performance: {
    buildMs: number;
    uploadMs: number;
    drawMs: number;
    frameCpuMs: number;
    /** Null when no measurement is available; never zero as a stand-in. */
    gpuTimeMs: number | null;
    gpuTimeMetric: BattleGpuTimeMetric | null;
    /** Present only where the backend correlates GPU work with presentation. */
    gpuFrame?: BattleCorrelatedGpuFrame | null;
  };
  [key: string]: unknown;
}

export type BattleGpuQueryKind = "render" | "compute";

/** Queries sharing one kind and label, summed. `ms` is null unless the whole
 * submission completed; observed spans appear only where the backend records
 * timestamp ranges. */
export interface BattleGpuStage {
  kind: BattleGpuQueryKind;
  label: string;
  queries: number;
  missingQueries: number;
  ms: number | null;
  observedGpuSpanMs?: number | null;
  observedGpuUnionMs?: number | null;
}

export interface BattleGpuEvent {
  sequence: number;
  submissionId: number;
  source: "battle-draw" | "render-only";
  /** `dropped` means submission retention evicted the record before its results
   * arrived; it is not a failed submission. */
  status: "complete" | "incomplete" | "dropped";
  reason: string | null;
  missingQueries: number;
  renderMs: number | null;
  computeMs: number | null;
  /** Diagnostic sum; overlapping pass intervals can double-count elapsed time. */
  measuredPassGpuMs: number | null;
  observedGpuSpanMs?: number | null;
  observedGpuUnionMs?: number | null;
  stages: BattleGpuStage[];
  /** Present only for source Three submissions. */
  threeFrameId?: number;
  backend?: "raw" | "typegpu" | "vgpu";
  /** Opt-in per-pass detail; order is command encoding order. */
  passes?: {
    kind: BattleGpuQueryKind;
    label: string;
    ms: number | null;
    beginNs?: string;
    endNs?: string;
  }[];
}

/** A cursor over arrived results, not over submission order. `cursorGap` means
 * retention dropped events the reader had not seen yet. */
export interface BattleGpuEventBatch {
  nextSequence: number;
  oldestRetainedSequence: number;
  cursorGap: boolean;
  events: BattleGpuEvent[];
}

/** Public frontend boundary: no source renderer/world internals or draw-hook
 * emulation. Individual backends may expose additional diagnostic fields in stats. */
export interface BattleRendererApi {
  readonly ready: Promise<void>;
  readonly soldierAssets: Record<number, AppearanceBundle> | null;
  fixedTime: number | null;
  preserveFrozenEffects: boolean;

  present(
    packet: BattlePresentation,
    signal?: AbortSignal,
    startupAfterUploads?: () => void,
  ): BattlePresentationReceipt | Promise<BattlePresentationReceipt>;
  settlePresentedFrame(signal?: AbortSignal): Promise<void>;

  usesEnvironment(environment: BattleRendererOptions["environment"]): boolean;
  usesGraphicsSettings(settings: GraphicsSettings): boolean;
  setBattleAudio(audio: BattleRendererDisposeHook | null): void;
  clearBattleAudio(audio: BattleRendererDisposeHook): void;
  resize(): void;
  dispose(): void;

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[]): void;
  setTerrain(grid: BattleTerrainGrid, options?: BattleTerrainOptions): void;
  reloadSoldierAssets(): Promise<void>;

  heightAt(x: number, y: number): number;
  raycastGround(ray: WorldRay): [number, number, number] | null;

  gpuEventsSince(afterSequence: number): BattleGpuEventBatch | null;
  frameMetrics(): BattleRendererFrameMetrics;
  stats(): BattleRendererStats;
  memoryInfo(): BattleRendererMemoryInfo | null;
  debugSoldierAnim(index: number): unknown;
}
