import type { PhotorealBattleWorld } from "../../../packages/photoreal-renderer/src/battle/battleWorld";
import type { BattleEnvironmentId } from "../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../packages/photoreal-renderer/src/post/postChain";
import type { GraphicsSettings } from "../../../web/src/shared/graphicsSettings";

type Draw = Parameters<PhotorealBattleWorld["draw"]>;
type Static = Parameters<PhotorealBattleWorld["setStatic"]>;
type Terrain = Parameters<PhotorealBattleWorld["setTerrain"]>;
type Readouts = Parameters<PhotorealBattleWorld["uploadUnitReadouts"]>;

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

/** Source observations preserve production crowd building and per-frame LOD work. */
export interface BattleReplayFrame {
  readonly frameId: number;
  readonly simTick: number;
  readonly timeSeconds: number;
  readonly frameDt: number;
  readonly camera: Readonly<Draw[5]>;
  readonly positions: Draw[0];
  readonly facings: Draw[1];
  readonly playback: Draw[2];
  readonly alive: Draw[3];
  readonly count: Draw[4];
  readonly standards: Readouts[0];
  readonly readouts: Readouts[1];
  readonly triangles: Parameters<PhotorealBattleWorld["drawTris"]>[0];
  readonly tacticalLines: Readonly<Parameters<PhotorealBattleWorld["drawTacticalLines"]>[0]>;
}
