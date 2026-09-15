import type { BattleRenderer, BattleRendererMemoryInfo } from "./renderer";

export interface BattleSubmissionIdentity {
  submissionId: number;
  source: "battle-draw" | "render-only";
  /** Present only for source Three submissions. */
  threeFrameId?: number;
  backend?: "raw" | "typegpu" | "vgpu";
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
export interface BattleRendererStats {
  renderer: "gpu";
  device?: string;
  performance: {
    buildMs: number;
    uploadMs: number;
    drawMs: number;
    frameCpuMs: number;
    gpuTimeMs: number | null;
  };
  [key: string]: unknown;
}
/** Public frontend boundary: no source renderer/world internals or draw-hook
 * emulation. Individual backends may expose additional diagnostic fields in stats. */
export interface BattleRendererApi extends Pick<
  BattleRenderer,
  | "ready"
  | "soldierAssets"
  | "fixedTime"
  | "preserveFrozenEffects"
  | "present"
  | "usesEnvironment"
  | "usesGraphicsSettings"
  | "dispose"
  | "setBattleAudio"
  | "clearBattleAudio"
  | "resize"
  | "setStatic"
  | "setTerrain"
  | "pxPerWorldAt"
  | "heightAt"
  | "raycastGround"
  | "reloadSoldierAssets"
  | "settlePresentedFrame"
  | "gpuEventsSince"
> {
  frameMetrics(): BattleRendererFrameMetrics;
  stats(): BattleRendererStats;
  memoryInfo(): BattleRendererMemoryInfo | null;
  debugSoldierAnim(index: number): unknown;
}
