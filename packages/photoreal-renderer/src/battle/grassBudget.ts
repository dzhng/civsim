import type { BladeFieldTransitionProfile } from "./bladeFieldLayer";

export interface ActiveGrassRecordBudgetProfile {
  maxRecords: number;
  minActiveRecords: number;
  rebuildMarginM: number;
  closeDensityReferenceRecords?: number;
  closeDensityReferenceRadiusM?: number;
  vistaTransitionDefaults: Pick<BladeFieldTransitionProfile, "farGrassEndM">;
}

export function activeGrassRecordBudget(
  profile: ActiveGrassRecordBudgetProfile,
  activeSampleRadiusM: number,
): { maxRecords: number; areaScale: number; baselineRadiusM: number } {
  const baselineRadiusM = Math.max(
    1,
    profile.vistaTransitionDefaults.farGrassEndM + profile.rebuildMarginM,
  );
  const activeRadiusM = Math.max(0, activeSampleRadiusM);
  const areaScale = Math.min(
    1,
    (activeRadiusM * activeRadiusM) / (baselineRadiusM * baselineRadiusM),
  );
  const scaled = Math.ceil(profile.maxRecords * areaScale);
  const closeDensityBudget =
    profile.closeDensityReferenceRecords && profile.closeDensityReferenceRadiusM
      ? Math.ceil(
          profile.closeDensityReferenceRecords *
            ((activeRadiusM * activeRadiusM) /
              Math.max(
                1,
                profile.closeDensityReferenceRadiusM * profile.closeDensityReferenceRadiusM,
              )),
        )
      : 0;
  const floor = Math.min(profile.maxRecords, Math.max(0, profile.minActiveRecords));
  return {
    maxRecords: Math.min(profile.maxRecords, Math.max(floor, scaled, closeDensityBudget)),
    areaScale: Number(areaScale.toFixed(4)),
    baselineRadiusM,
  };
}
