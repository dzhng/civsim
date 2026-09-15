import type { AppearanceBundle } from "../../../packages/soldier-assets/src/appearanceBundle";
import type { ImpostorAtlasData } from "../../../packages/soldier-assets/src/impostorAtlas";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../packages/game-renderer/src/environment/postParameters";
import type { BladeFieldProfile } from "../../../packages/game-renderer/src/battle/battleGrassResidency";
import type {
  BattleTerrainGrid,
  BattleGroundCover,
  BattleSlopeBands,
} from "../../../packages/game-renderer/src/battle/terrainFeatures";
import type { BattleVistaGrid } from "../../../packages/game-renderer/src/battle/vistaSurface";
import type { BattleLakeSurfaceSpec } from "../../../packages/game-renderer/src/water/battleWaterGeometry";

export interface BattleTerrainInput {
  grid: BattleTerrainGrid;
  cover: BattleGroundCover;
  vista: BattleVistaGrid | null;
  lakes: readonly BattleLakeSurfaceSpec[];
  slopeBands?: BattleSlopeBands | null;
}

export interface BattleSceneOptions {
  environment: CivsimEnvironment;
  assets: Record<number, AppearanceBundle>;
  atlases: Record<number, ImpostorAtlasData>;
  terrain: BattleTerrainInput;
  grassProfile: BladeFieldProfile;
  width: number;
  height: number;
  samples: 1 | 4;
  outputFormat: GPUTextureFormat;
  shadows: boolean;
  grass: boolean;
  farGrass: boolean;
  bloom: boolean;
  post: boolean;
  grade: BattlePostGradeUniforms;
  signal?: AbortSignal;
}
