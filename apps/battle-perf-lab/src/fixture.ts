import type {
  BattleCameraSnapshot,
  BattleTacticalLineFrame,
} from "../../../packages/battle-renderer/src/types";
import type { SoldierPlayback } from "../../../packages/crowd-runtime/src/actionTimeline";
import type { BattleStandardInstance } from "../../../packages/game-renderer/src/models/shared/battleStandardData";
import type { BattleReadoutInstance } from "../../../packages/game-renderer/src/battle/readoutData";
import type { BattleTerrainGrid } from "../../../packages/game-renderer/src/battle/terrainFeatures";
import type { BattleTerrainOptions } from "../../../packages/game-renderer/src/battle/terrainOptions";
import type { BattleEnvironmentId } from "../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../packages/game-renderer/src/environment/postParameters";
import type { GraphicsSettings } from "../../../web/src/shared/graphicsSettings";

/** Portable archived data. Readers borrow these arrays and never need the renderer
 * that originally recorded them; the archive owns their exact bytes. */
export interface BattleReplayAssets {
  readonly soldierCatalogUrl: string;
  readonly soldierUnit: Readonly<Uint32Array>;
  readonly teams: readonly number[];
  readonly classes: readonly number[];
  readonly terrain: Readonly<BattleTerrainGrid>;
  readonly terrainOptions: Readonly<BattleTerrainOptions>;
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
interface BattleReplayArguments {
  setTime: [seconds: number];
  draw: [
    positions: Float32Array,
    facings: Float32Array,
    playback: readonly SoldierPlayback[],
    alive: Float32Array,
    count: number,
    camera: BattleCameraSnapshot,
    frameDt?: number,
  ];
  uploadUnitReadouts: [
    standards: readonly BattleStandardInstance[],
    readouts: readonly BattleReadoutInstance[],
  ];
  drawTris: [vertices: Float32Array, camera: BattleCameraSnapshot];
  drawTacticalLines: [lines: BattleTacticalLineFrame, camera: BattleCameraSnapshot];
  settlePresentedFrame: [];
  render: [];
}
export type BattleReplayMethod = keyof BattleReplayArguments;
export type BattleReplayCommand = {
  [Method in BattleReplayMethod]: {
    readonly method: Method;
    readonly args: BattleReplayArguments[Method];
  };
}[BattleReplayMethod];

/** Exactly the outer public updates ending at one actual presentation. */
export interface BattleReplayFrame {
  readonly frameId: number;
  readonly simTick: number;
  readonly timeSeconds: number;
  readonly camera: Readonly<BattleCameraSnapshot>;
  readonly commands: readonly BattleReplayCommand[];
}
