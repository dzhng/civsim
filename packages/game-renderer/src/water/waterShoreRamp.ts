// The shared distance-from-shore depth/haze ramp — the load-bearing firewall
// (spec firewall #1). BOTH the on-field battle water (groundPass, Slice 8) and the
// open-sea plane (Slice 9) call this one helper so both sides of every shoreline
// are the *same* material and a seam cannot exist by construction. Given a
// monotonic "distance from shore" signal it emits the two ramps `waterShade`
// consumes:
//   depth01 — 0 at the shore (shallow Aegean turquoise) → 1 offshore (deep blue).
//   haze01  — 0 near → 1 far (the aerial-perspective dissolve into the sky).
//
// The signal's units are the caller's choice, and the near/far knobs move with
// them: the open-sea lab plane keys on camera distance in metres, the field water
// keys on its box-filtered water weight (0..1). The defaults reproduce the lab
// plane's original inline constants exactly, so the frozen `water-*.mjs` scenes
// stay byte-identical when the plane pass adopts the helper.

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

// The open-sea lab plane's historical inline ramp (waterPlanePass, keyed on camera
// distance in metres). Default so the frozen look scenes don't move.
export const LAB_OPEN_SEA_RAMP: WaterShoreRamp = { depthNear: 20, depthFar: 420, hazeNear: 55, hazeFar: 300 };

// On-field battle water (rivers, shallows), keyed on the box-filtered water weight
// (0..1). Shallow: the depth ramp climbs slowly and never reaches the open sea's
// abyssal blue — at full weight `smoothstep(0.05, 1.8, 1)` is only ~0.36, so the
// deepest river stays a mid Aegean blue while the shore reads turquoise. Haze is
// pinned ~0 (on-field water is close to the camera and must not dissolve into the sky).
export const FIELD_WATER_RAMP: WaterShoreRamp = { depthNear: 0.05, depthFar: 1.8, hazeNear: 1.5, hazeFar: 2.5 };

/** Emit `fn waterShoreRamp(shoreDist: f32) -> vec2f` returning (depth01, haze01). */
export function waterShoreRampWgsl(ramp: WaterShoreRamp = LAB_OPEN_SEA_RAMP): string {
  return `
fn waterShoreRamp(shoreDist: f32) -> vec2f {
  let depth01 = smoothstep(${ramp.depthNear.toFixed(3)}, ${ramp.depthFar.toFixed(3)}, shoreDist);
  let haze01 = smoothstep(${ramp.hazeNear.toFixed(3)}, ${ramp.hazeFar.toFixed(3)}, shoreDist);
  return vec2f(depth01, haze01);
}`;
}
