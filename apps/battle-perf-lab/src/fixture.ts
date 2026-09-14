import type { PhotorealBattleWorld } from "../../../packages/photoreal-renderer/src/battle/battleWorld";
import type { BattleEnvironmentId } from "../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../packages/game-renderer/src/environment/postParameters";
import type { GraphicsSettings } from "../../../web/src/shared/graphicsSettings";

type Draw = Parameters<PhotorealBattleWorld["draw"]>;
type Static = Parameters<PhotorealBattleWorld["setStatic"]>;
type Terrain = Parameters<PhotorealBattleWorld["setTerrain"]>;

/** Fixture data is borrowed read-only. Capture owns its buffers and must not reuse
 * live wasm views; the Three control snapshots static inputs during preparation. */
export interface BattleReplayAssets {
  readonly soldierCatalogUrl: string;
  readonly soldierUnit: Readonly<Static[0]>;
  readonly teams: readonly Static[1][number][];
  readonly classes: readonly Static[2][number][];
  readonly terrain: Readonly<Terrain[0]>;
  readonly terrainOptions: Readonly<NonNullable<Terrain[1]>>;
}

export type BattleReplaySettings = Readonly<
  Pick<GraphicsSettings, "shadows" | "grassQuality" | "grass" | "farGrass" | "bloom"> & {
    environment: BattleEnvironmentId;
    post: boolean;
    postGrade: Partial<BattlePostGradeUniforms> | null;
    viewport: Readonly<{ width: number; height: number; pixelRatio: number }>;
  }
>;

/** Semantic updates on resolved plain battle data; these are not GPU commands. */
export type BattleReplayMethod =
  | "setTime"
  | "draw"
  | "uploadUnitReadouts"
  | "drawTris"
  | "drawTacticalLines"
  | "settlePresentedFrame"
  | "render";
export type BattleReplayCommand = {
  [Method in BattleReplayMethod]: {
    readonly method: Method;
    readonly args: Parameters<PhotorealBattleWorld[Method]>;
  };
}[BattleReplayMethod];

/** Exactly the outer public updates ending at one actual presentation. */
export interface BattleReplayFrame {
  readonly frameId: number;
  readonly simTick: number;
  readonly timeSeconds: number;
  readonly camera: Readonly<Draw[5]>;
  readonly commands: readonly BattleReplayCommand[];
}
