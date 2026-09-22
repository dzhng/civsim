import type { WaterShoreRamp } from "./waterShoreRamp";
import { LAKE_NORMAL_DETAIL_FADE_START, LAKE_NORMAL_DETAIL_FADE_END } from "./physicalWaterPolicy";
// 12b trap: the sea looked right nearby but sparkled like aliasing in the
// grazing upper band. Fade normal detail with distance from the battle focus;
// aerial haze remains owned by scene.fogNode.
export const SEA_NORMAL_DETAIL_NEAR = 0.84;
export const SEA_NORMAL_DETAIL_FAR = 0.18;
export const SEA_NORMAL_DETAIL_FADE_START = 720;
export const SEA_NORMAL_DETAIL_FADE_END = 2300;
export const SEA_GLINT_HOT_LUMA_THRESHOLD = 246;
export const SEA_GLINT_HOT_FRACTION_MAX = 0.07;
export const SEA_GLINT_CENTER_SHARE_MIN = 0.6;
export const SEA_SURFACE_OWNER = "skyModel-ibl-standard-pbr" as const;
// Sea state: calm Aegean, waves present but not choppy, with battle water near
// shore. One knob scales every
// wave amplitude (photoreal sea only; the shared bespoke baker is untouched).
// Foam height thresholds scale with it so whitecap coverage stays consistent.
export const SEA_SWELL_SCALE = 0.55;
export const SEA_FOAM_HEIGHT_START = 0.52 * SEA_SWELL_SCALE;
export const SEA_FOAM_HEIGHT_END = 1.55 * SEA_SWELL_SCALE;
export const SEA_FOAM_SLOPE_START = 0.12;
export const SEA_FOAM_SLOPE_END = 0.58;
export const SEA_FOAM_SPECKLE_START = 0.56;
export const SEA_FOAM_SPECKLE_END = 0.78;
export const SEA_FOAM_SCALE = 0.74;
export const SEA_SAND_TURBIDITY_DEPTH_START = 0.04;
export const SEA_SAND_TURBIDITY_DEPTH_END = 0.26;
export const LAKE_SHORE_RAMP: WaterShoreRamp = {
  depthNear: 2,
  depthFar: 90,
  hazeNear: 160,
  hazeFar: 900,
};
// 0.035 z-fought the ground at vista distance (cobblestone mosaic - compose
// rounds 1-2); 0.3 stays visually seated and clears depth precision.
export const LAKE_SURFACE_LIFT_M = 0.3;
export const LAKE_SWELL_SCALE = 0.035;
// Enough ripple normal to break the sun disk - at ocean-glint smoothness a
// becalmed lake becomes a mirror and renders as a blown-white patch.
export const LAKE_NORMAL_STRENGTH = 0.42;
export const LAKE_NORMAL_DETAIL_FAR = 0.08;
// Undisplaced field water keeps calmer surface cues than standalone wave geometry.
export const FIELD_WATER_NORMAL_STRENGTH = 0.05;
export const FIELD_WATER_NORMAL_DETAIL_FAR = 0.01;
export const FIELD_WATER_DETAIL_FADE_START = LAKE_NORMAL_DETAIL_FADE_START;
export const FIELD_WATER_DETAIL_FADE_END = LAKE_NORMAL_DETAIL_FADE_END;
