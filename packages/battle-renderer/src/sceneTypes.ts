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
import type { SunShadowMode } from "../../game-renderer/src/battle/shadowPolicy";

export interface BattleTerrainInput {
  grid: BattleTerrainGrid;
  cover: BattleGroundCover;
  vista: BattleVistaGrid | null;
  lakes: readonly BattleLakeSurfaceSpec[];
  slopeBands?: BattleSlopeBands | null;
}

/** One published crowd generation: gameplay appearances and the offline property
 * atlas baked for each of them. Both are replaced together or not at all. */
export interface BattleCrowdAssets {
  assets: Record<number, AppearanceBundle>;
  atlases: Record<number, ImpostorAtlasData>;
}

export interface BattleSceneOptions extends BattleCrowdAssets {
  environment: CivsimEnvironment;
  terrain: BattleTerrainInput;
  grassProfile: BladeFieldProfile;
  width: number;
  height: number;
  samples: 1 | 4;
  outputFormat: GPUTextureFormat;
  /** The user-visible sun tier: `off`, the fitted single map, or High's two
   *  cascades. Explicit — a scene never infers a tier from a boolean. */
  shadows: SunShadowMode;
  /** Allocate formation-debug resources only for the explicit debug route. */
  debugBlocks?: boolean;
  /** Authoring landform review: neutral flat ground material, without aerial haze. */
  reviewClay?: boolean;
  grass: boolean;
  farGrass: boolean;
  bloom: boolean;
  post: boolean;
  grade: BattlePostGradeUniforms;
  signal?: AbortSignal;
}

/** Explicit asset-authoring view: inspect meshes before offline atlases exist.
 * Gameplay keeps the complete BattleSceneOptions contract. */
export type BattleMeshPreviewOptions = Omit<BattleSceneOptions, "atlases"> & { atlases: null };

export interface BattleReviewVisibility {
  ground: boolean;
  vista: boolean;
  water: boolean;
  scenery: boolean;
  crowd: boolean;
}

export const BATTLE_REVIEW_VISIBILITY: Readonly<BattleReviewVisibility> = {
  ground: true,
  vista: true,
  water: true,
  scenery: true,
  crowd: true,
};
