// The shared water shading WGSL — one `waterShade` consumed identically by both
// fields and (from Slice 8) all three production surfaces, so the look is single-
// sourced. It reads only a `WaterSample` (the frozen seam struct), never the
// technique.
//
// The shared water shading, single-sourced for both fields and all three
// production surfaces. It composes: a neutral depth-ramped albedo (waterPalette)
// × the environment preset light (waterEnvironment) — warm key + cool fill so the
// mood lives in the light, never the albedo; a narrow sun-glint streak in the
// sun's own colour; and lit whitecap foam. It reads only a `WaterSample`, a sun
// direction, a glint band, and a depth (0 near/shallow → 1 far/deep); the palette
// and preset arrive as injected `WATER_*` constants (the plane pass composes them
// before this snippet).
//
// `viewDir` is a constant surface→camera approximation — the battle water camera
// is a near-fixed tilted-ortho view, so a single view vector places the glint
// streak correctly without a per-fragment eye ray.

export const WATER_SHADE_WGSL = `
const WATER_VIEW_DIR = vec3f(0.0, -0.62, 0.78);

// glintBand (0..1) concentrates the specular into the sun-track band. The 2.5D
// ortho projector has a near-constant view direction, so specular alone would
// sparkle on matching facets across the whole sea ("sequins"); the caller masks
// it to the sun's azimuth so it reads as one coherent streak, computed where the
// fragment's world direction is known (the plane pass).
fn waterShade(sample: WaterSample, sunDir: vec3f, glintBand: f32, depth01: f32, haze01: f32) -> vec3f {
  // Neutral albedo graded shallow→deep, then lit by the preset. The mood is all
  // in WATER_KEY/WATER_FILL/WATER_EXPOSURE — the albedo carries no warmth.
  let albedo = mix(WATER_SHALLOW_ALBEDO, WATER_DEEP_ALBEDO, depth01);
  let n = normalize(sample.normal);
  let diff = clamp(dot(n, sunDir), 0.0, 1.0);
  // A soft sky term keeps shadowed troughs lit by the cool fill so the swell
  // reads as a surface, not a cutout.
  let sky = clamp(n.z * 0.5 + 0.5, 0.0, 1.0);
  let light = WATER_KEY * (0.34 + 0.66 * diff) + WATER_FILL * (0.28 + 0.32 * sky);
  var col = albedo * light * WATER_EXPOSURE;
  let foam = clamp(sample.foam, 0.0, 1.0);
  // Sun glint, the sun's own colour (WATER_KEY), banded to the sun azimuth: a
  // broad soft sheen (the warm sun-glitter track that makes the water carry the
  // key toward the sun) plus sharp sparkles on the wave faces. Foam only half-
  // suppresses it so the track carries through the whitecapped foreground.
  let halfv = normalize(sunDir + WATER_VIEW_DIR);
  let facing = clamp(dot(n, halfv), 0.0, 1.0);
  let sparkle = pow(facing, 70.0) * 1.4;
  let sheen = pow(facing, 6.0) * 0.5;
  // Fade the glint into the distance so the far crests melt fully into the haze
  // instead of leaving a bright sparkle band at the seam.
  let glint = min((sparkle + sheen) * glintBand, 1.5) * (1.0 - foam * 0.5) * (1.0 - haze01);
  col = col + WATER_KEY * WATER_GLINT_GAIN * glint;
  // Whitecaps: white spray lit by the environment (warm at golden, cool under
  // overcast) — the same-material two-light proof runs through here.
  let foamLit = WATER_FOAM_ALBEDO * (WATER_KEY * 0.55 + WATER_FILL * 0.45) * WATER_EXPOSURE;
  let surface = mix(col, foamLit, foam);
  // Aerial perspective: the far sea desaturates into the preset haze so it meets
  // the sky with no hard horizon line. haze01 reaches ~1 at the plane's far edge,
  // where WATER_HAZE equals the sky, so the seam dissolves.
  return mix(surface, WATER_HAZE, clamp(haze01, 0.0, 1.0));
}`;
