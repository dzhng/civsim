export type BladeFieldTierId = "near" | "mid" | "far";

export interface BladeFieldTierSpec {
  id: BladeFieldTierId;
  lodTier: 0 | 1 | 2;
  segments: number;
  minDistanceM: number;
  maxDistanceM: number;
}

export interface BladeFieldTransitionProfile {
  denseBladeEndM: number;
  farGrassStartM: number;
  farGrassEndM: number;
  nearTierEndM?: number;
  midTierEndM?: number;
  farSoftWidthScale?: number;
  /** Blades sink to turf across [start, end] so the coverage radius never
   *  shows a full-height cutoff. Production-scale rings only - the ratified
   *  close-lab profile (64m ring) keeps its hard edge (undefined = no sink). */
  edgeSinkStartM?: number;
  /** Strength of the terrain-only far grass brush. Blade-field lab routes can
   *  keep ratified blade statistics by setting this to zero. */
  terrainDetailStrength?: number;
  /** Near/mid width lift for living-meadow density. Defaults to 1. */
  nearCoverageWidthScale?: number;
  /** Lower-far width lift. Defaults to 1 and fades out by lowerFarWidthEndM so
   *  true horizon density stays sampling-owned. */
  lowerFarWidthScale?: number;
  lowerFarWidthEndM?: number;
}

export type BladeFieldTransition = Required<Omit<BladeFieldTransitionProfile, "edgeSinkStartM">> &
  Pick<BladeFieldTransitionProfile, "edgeSinkStartM">;

export interface BladeFieldMeadowFarDensityProfile {
  farGrassEndM: number;
  densityReferenceM: number;
  falloffPower: 1.5;
  farSoftWidthScale?: number;
  edgeSinkStartM?: number;
  /** Local mesh fan-out per packed record; keeps the 16-float record schema. */
  bladesPerRecord?: Partial<Record<BladeFieldTierId, number>>;
  /** Width lift applied before the far-soft band. */
  nearCoverageWidthScale?: number;
  /** Moves the mid tier into the close crop's real foreground band. */
  midTierEndM?: number;
  /** Extra lower-far width so the close foreground band does not fall
   *  back to scattered spikes. */
  lowerFarWidthScale?: number;
  lowerFarWidthEndM?: number;
}

export const LIVING_MEADOW_FAR_DENSITY_PROFILE: BladeFieldMeadowFarDensityProfile = {
  farGrassEndM: 1250,
  densityReferenceM: 300,
  falloffPower: 1.5,
  farSoftWidthScale: 3.1,
  edgeSinkStartM: 1120,
  // Far tier trades count for width one-for-one (the pen's own far-ring rule:
  // "a quarter fewer blades at a proportionally wider stroke ... identical").
  // fan 3->2 with farSoft width 2.2->3.1 bought the last ~2-3ms of the locked
  // 33ms vista budget without a visible density change.
  bladesPerRecord: { near: 6, mid: 28, far: 2 },
  nearCoverageWidthScale: 1.0,
  midTierEndM: 64,
  lowerFarWidthScale: 1.35,
  lowerFarWidthEndM: 112,
};

export const BLADE_FIELD_LOD_TIERS: readonly BladeFieldTierSpec[] = [
  { id: "near", lodTier: 0, segments: 15, minDistanceM: 0, maxDistanceM: 5 },
  { id: "mid", lodTier: 1, segments: 6, minDistanceM: 5, maxDistanceM: 20 },
  { id: "far", lodTier: 2, segments: 2, minDistanceM: 20, maxDistanceM: 64 },
];

export function transitionProfileForTiers(
  tiers: readonly BladeFieldTierSpec[],
  transition: BladeFieldTransitionProfile,
  farDensityProfile: BladeFieldMeadowFarDensityProfile,
): BladeFieldTransitionProfile {
  const farTier = tiers[tiers.length - 1] ?? BLADE_FIELD_LOD_TIERS[2];
  const farTierMaxDistanceM = Math.max(farTier.maxDistanceM, farDensityProfile.farGrassEndM);
  const farGrassEndM = Math.min(
    Math.max(farDensityProfile.farGrassEndM, transition.farGrassStartM),
    farTierMaxDistanceM,
  );
  const farGrassStartM = Math.min(
    Math.max(transition.farGrassStartM, farTier.minDistanceM),
    farGrassEndM,
  );
  const denseBladeEndM = Math.min(Math.max(transition.denseBladeEndM, 0), farGrassEndM);
  const nearTierEndM = Math.min(
    Math.max(transition.nearTierEndM ?? denseBladeEndM, 0),
    farGrassEndM,
  );
  const midTierEndM = Math.min(
    Math.max(
      farDensityProfile.midTierEndM ?? transition.midTierEndM ?? farGrassStartM,
      nearTierEndM,
    ),
    farGrassEndM,
  );
  const lowerFarWidthEndM =
    farDensityProfile.lowerFarWidthEndM ?? transition.lowerFarWidthEndM ?? midTierEndM;
  return {
    ...transition,
    denseBladeEndM,
    farGrassStartM,
    farGrassEndM,
    nearTierEndM,
    midTierEndM,
    farSoftWidthScale: farDensityProfile.farSoftWidthScale ?? transition.farSoftWidthScale,
    nearCoverageWidthScale:
      farDensityProfile.nearCoverageWidthScale ?? transition.nearCoverageWidthScale,
    lowerFarWidthScale: farDensityProfile.lowerFarWidthScale ?? transition.lowerFarWidthScale,
    lowerFarWidthEndM: Math.max(midTierEndM, lowerFarWidthEndM),
    edgeSinkStartM:
      (farDensityProfile.edgeSinkStartM ?? transition.edgeSinkStartM) === undefined
        ? undefined
        : Math.min(
            Math.max(
              farDensityProfile.edgeSinkStartM ?? transition.edgeSinkStartM!,
              farTier.minDistanceM,
            ),
            farGrassEndM,
          ),
  };
}

export function transitionSnapshot(
  transition: BladeFieldTransitionProfile,
): Readonly<BladeFieldTransition> {
  const farGrassEndM = Math.max(0, transition.farGrassEndM);
  const farGrassStartM = Math.min(Math.max(0, transition.farGrassStartM), farGrassEndM);
  const denseBladeEndM = Math.min(Math.max(transition.denseBladeEndM, 0), farGrassEndM);
  const nearTierEndM = Math.min(
    Math.max(transition.nearTierEndM ?? denseBladeEndM, 0),
    farGrassEndM,
  );
  const midTierEndM = Math.min(
    Math.max(transition.midTierEndM ?? farGrassStartM, nearTierEndM),
    farGrassEndM,
  );
  const farSoftWidthScale = transition.farSoftWidthScale ?? 1.6;
  const nearCoverageWidthScale = transition.nearCoverageWidthScale ?? 1;
  const lowerFarWidthScale = transition.lowerFarWidthScale ?? 1;
  const lowerFarWidthEndM = transition.lowerFarWidthEndM ?? midTierEndM;
  const terrainDetailStrength = transition.terrainDetailStrength ?? 1;
  return Object.freeze({
    denseBladeEndM,
    farGrassStartM,
    farGrassEndM,
    nearTierEndM,
    midTierEndM,
    farSoftWidthScale: Math.max(
      1,
      Math.min(3, Number.isFinite(farSoftWidthScale) ? farSoftWidthScale : 1.6),
    ),
    nearCoverageWidthScale: Math.max(
      1,
      Math.min(2.5, Number.isFinite(nearCoverageWidthScale) ? nearCoverageWidthScale : 1),
    ),
    lowerFarWidthScale: Math.max(
      1,
      Math.min(3, Number.isFinite(lowerFarWidthScale) ? lowerFarWidthScale : 1),
    ),
    lowerFarWidthEndM: Math.max(
      midTierEndM,
      Number.isFinite(lowerFarWidthEndM) ? lowerFarWidthEndM : 0,
    ),
    terrainDetailStrength: Math.max(
      0,
      Math.min(1, Number.isFinite(terrainDetailStrength) ? terrainDetailStrength : 1),
    ),
    edgeSinkStartM:
      transition.edgeSinkStartM === undefined
        ? undefined
        : Math.min(Math.max(transition.edgeSinkStartM, 0), farGrassEndM),
  });
}

export const BLADE_FIELD_TRANSLUCENCY = {
  // With the display cap + distance fade in place, these values read as soft
  // warm backlight with no far-field sparkle.
  rimStrength: 2.5,
  subsurfaceStrength: 5.1,
  maxDisplayEmission: 1.25,
  nearDissolveFloor: 0.3,
  rimExponent: 4.2,
  subsurfaceViewPower: 3.2,
  subsurfaceSunEdgePower: 2.2,
} as const;

export interface BladeFieldThinningProfile {
  enabled: boolean;
  densityLaw: "pen-1.5-power";
  densityReferenceM: number;
  falloffPower: 1 | 1.5;
  hashSource: "record.bladeSeed fract(seed01 * 7.13)";
  survivorAlbedoBlend: number;
}

export const MAX_BLADES_PER_RECORD = 6;

export function bladesPerRecordFor(
  profile: BladeFieldMeadowFarDensityProfile,
  tier: BladeFieldTierId,
): number {
  const value = profile.bladesPerRecord?.[tier] ?? 1;
  return Math.max(
    1,
    Math.min(MAX_BLADES_PER_RECORD, Number.isFinite(value) ? Math.floor(value) : 1),
  );
}

export function thinningProfileForTransition(
  blendSurvivors: boolean,
  farDensityProfile: BladeFieldMeadowFarDensityProfile,
): BladeFieldThinningProfile {
  return {
    // Pen-style far density thins by distance hash, while height sink remains a
    // secondary softener instead of the primary edge signal.
    enabled: blendSurvivors,
    densityLaw: "pen-1.5-power",
    densityReferenceM: farDensityProfile.densityReferenceM,
    falloffPower: farDensityProfile.falloffPower,
    hashSource: "record.bladeSeed fract(seed01 * 7.13)",
    survivorAlbedoBlend: blendSurvivors ? 0.85 : 0,
  };
}
