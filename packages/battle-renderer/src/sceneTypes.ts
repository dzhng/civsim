import type { AppearanceBundle } from "../../soldier-assets/src/appearanceBundle";
import type { ImpostorAtlasData } from "../../soldier-assets/src/impostorAtlas";
import type { CivsimEnvironment } from "../../game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../game-renderer/src/environment/postParameters";
import type { BladeFieldProfile } from "../../game-renderer/src/battle/battleGrassResidency";
import type {
  BattleTerrainGrid,
  BattleGroundCover,
  BattleSlopeBands,
} from "../../game-renderer/src/battle/terrainFeatures";
import type { BattleVistaGrid } from "../../game-renderer/src/battle/vistaSurface";
import type { BattleLakeSurfaceSpec } from "../../game-renderer/src/water/battleWaterGeometry";

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
