// Shared distance-from-shore depth/haze parameters keep both sides of every
// shoreline on the same material progression:
//   depth01 — 0 at the shore (shallow Aegean turquoise) → 1 offshore (deep blue).
//   haze01  — 0 near → 1 far (the aerial-perspective dissolve into the sky).

export interface WaterShoreRamp {
  /** shore-distance where the albedo starts leaving shallow turquoise. */
  depthNear: number;
  /** shore-distance where the albedo reaches full deep blue. */
  depthFar: number;
  /** shore-distance where aerial haze begins. */
  hazeNear: number;
  /** shore-distance where the sea has fully dissolved into the haze. */
  hazeFar: number;
}

// On-field battle water (rivers, shallows), keyed on the box-filtered water weight
// (0..1). Shallow and pale to match the coastal reference (sun-bleached tan sand →
// pale turquoise shallows → light blue), never the deep-ocean navy: at full weight
// `smoothstep(0.05, 2.6, 1)` is only ~0.30, so the deepest field water stays a light
// Aegean blue while the shore reads bright turquoise. Haze is pinned ~0 (on-field
// water is close to the camera and must not dissolve into the sky).
export const FIELD_WATER_RAMP: WaterShoreRamp = { depthNear: 0.05, depthFar: 2.6, hazeNear: 1.5, hazeFar: 2.5 };

// The battle open sea (horizonPass), keyed on distance-from-shore in metres
// (`abs(worldX − shoreX)`). It meets the S8 field water at the shoreline: shallow
// turquoise at the shore, deep blue offshore, then hazing into the sky. The haze
// range is pushed far out because the battle camera stands ~360 m inland (the lab's
// 55/300 would wash the whole sea to sky).
export const BATTLE_OCEAN_RAMP: WaterShoreRamp = { depthNear: 12, depthFar: 300, hazeNear: 520, hazeFar: 1900 };

/** Terrain material transition shared by filtered weights and signed shores. */
export const TERRAIN_WATER_BLEND = [0.08, 0.55] as const;

/** Keep this affine until fragment interpolation; clamping vertices restores
 * source-grid steps along oblique coasts. Positive shore distance is wet. */
export function shoreWaterSignal(distanceMeters: number, sampleSpacingMeters: number): number {
  const [dry, wet] = TERRAIN_WATER_BLEND;
  return (dry + wet) / 2 + distanceMeters / sampleSpacingMeters;
}
