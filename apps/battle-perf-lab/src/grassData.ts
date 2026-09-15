import { bladeGeometryData } from "../../../packages/game-renderer/src/battle/bladeGeometry";
import {
  LIVING_MEADOW_FAR_DENSITY_PROFILE,
  bladesPerRecordFor,
} from "../../../packages/game-renderer/src/battle/bladeFieldPolicy";
import type { BladeFieldProfile } from "../../../packages/game-renderer/src/battle/battleGrassResidency";
import type {
  BladeFieldTransition,
  BladeFieldThinningProfile,
} from "../../../packages/game-renderer/src/battle/bladeFieldPolicy";
import type {
  BattleGrassResidency,
  GrassResidencyLayer,
} from "../../../packages/game-renderer/src/battle/battleGrassResidency";

export interface GrassGeometry {
  positions: Float32Array;
  indices: Uint16Array;
}
export interface GrassFrame {
  anchor: readonly [number, number];
  view: ArrayLike<number>;
  transition: Readonly<BladeFieldTransition>;
  thinning: BladeFieldThinningProfile;
  mask: NonNullable<GrassResidencyLayer["circle"]>;
  wedge: NonNullable<ReturnType<BattleGrassResidency["snapshot"]>["wedge"]>;
  wind: {
    direction: readonly [number, number];
    speed: number;
    gustPhase: number;
    velocity: readonly [number, number];
    frequency: number;
    sharpness: number;
  };
  sun: readonly [number, number, number];
  rim: number;
  subsurface: number;
}
export function grassUniformData(s: GrassFrame): Float32Array<ArrayBuffer> {
  const p = s.transition,
    w = s.wind,
    m = s.mask,
    c = s.wedge;
  if (s.view.length !== 16) throw new Error("Grass requires camera view matrix");
  const values = new Float32Array(56);
  values.set([
    ...s.anchor,
    p.nearTierEndM,
    p.midTierEndM,
    p.farGrassStartM,
    p.farGrassEndM,
    p.farSoftWidthScale,
    p.edgeSinkStartM ?? Math.max(0, p.farGrassEndM - 0.001),
    p.nearCoverageWidthScale,
    p.lowerFarWidthScale,
    p.lowerFarWidthEndM,
    s.thinning.survivorAlbedoBlend,
    ...w.direction,
    w.speed,
    w.gustPhase,
    ...w.velocity,
    w.frequency,
    w.sharpness,
    ...s.sun,
    s.rim,
    s.subsurface,
    s.thinning.densityReferenceM,
    s.thinning.falloffPower,
    +s.thinning.enabled,
    ...m.center,
    m.radiusSq,
    +m.enabled,
    ...c.forward,
    ...c.side,
    c.halfWidthSlope,
    c.backMarginM,
    c.farMarginM,
    +c.enabled,
  ]);
  values.set(s.view, 40);
  return values;
}

/** Geometry choices match the source layer for all runtime adapters. */
export function grassGeometries(profile: BladeFieldProfile) {
  return profile.tiers.map((tier) =>
    bladeGeometryData(
      tier.segments,
      bladesPerRecordFor(LIVING_MEADOW_FAR_DENSITY_PROFILE, tier.id),
    ),
  );
}
