import type { SoldierPlayback } from "@packages/crowd-runtime/src/actionTimeline";
import type { BattleStandardInstance } from "@packages/game-renderer/src/models/shared/battleStandardData";
import type { BattleReadoutInstance } from "@packages/game-renderer/src/battle/readoutData";
import type { BattleTacticalLineFrame } from "@packages/photoreal-renderer/src/battle/battleWorld";
import type { Camera } from "../shared/camera";

/** The renderer only needs this immutable view of a live Camera. */
export type BattleRenderCamera = Pick<Camera, "zoom" | "zoomT" | "viewCenter" | "params">;
export function captureBattleRenderCamera(camera: BattleRenderCamera): BattleRenderCamera {
  const center = [...camera.viewCenter()] as [number, number];
  const p = camera.params();
  const params = { ...p, target: [...p.target] as [number, number, number] };
  return {
    zoom: camera.zoom,
    zoomT: camera.zoomT,
    viewCenter: () => [...center],
    params: () => params,
  };
}
export interface BattleCrowdPresentation {
  positions: Float32Array;
  facings: Float32Array;
  playback: readonly SoldierPlayback[];
  alive: Float32Array;
  count: number;
  observationTick: number;
  frameDt: number;
  standards: readonly BattleStandardInstance[];
  readouts: readonly BattleReadoutInstance[];
  triangles: Float32Array;
}
/** Built synchronously after interpolation. Owned presentation arrays stay borrowed
 * until present settles; the scene must not prepare another packet concurrently. */
export interface BattlePresentation {
  /** Candidate presentation time is captured before resource awaits. Under the `wall`
   * clock the synchronous source keeps its existing per-hook clock sampling until
   * temporal parity is reviewed; the `benchmark` clock is a held benchmark's elapsed
   * visual time, which every renderer, the source included, animates from. */
  timeSeconds: number;
  clock: "wall" | "benchmark";
  fixedTime: number | null;
  preserveFrozenEffects: boolean;
  crowd: BattleCrowdPresentation | null;
  camera: BattleRenderCamera;
  tacticalLines: BattleTacticalLineFrame;
}
