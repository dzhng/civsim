// The shared water shading WGSL — one `waterShade` consumed identically by both
// fields and (from Slice 8) all three production surfaces, so the look is single-
// sourced. It reads only a `WaterSample` (the frozen seam struct), never the
// technique.
//
// Slices 2–4 scope: silhouette + foam + sun glint, still neutral grey.
// `waterShade` shades the water body by slope (`normal · sunDir`), adds a narrow
// specular sun-glint streak, and lays neutral white-grey whitecaps over it by
// `sample.foam`. Colour (Slice 5) extends this later; the albedo, foam and glint
// colours stay neutral until then (aesthetics creed: don't bake light into albedo).
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
fn waterShade(sample: WaterSample, sunDir: vec3f, glintBand: f32) -> vec3f {
  let n = normalize(sample.normal);
  let diff = clamp(dot(n, sunDir), 0.0, 1.0);
  // A soft sky-fill term keeps shadowed troughs from going black so the swell
  // reads as a lit surface, not a cutout.
  let sky = clamp(n.z, 0.0, 1.0);
  let albedo = vec3f(0.40);
  var col = albedo * (0.46 + 0.42 * diff + 0.12 * sky);
  let foam = clamp(sample.foam, 0.0, 1.0);
  // Sun glint: a narrow specular lobe toward the sun's mirror, banded to the sun
  // azimuth and clamped so it never blows out. Suppressed on foam — spray
  // scatters, it doesn't mirror.
  let halfv = normalize(sunDir + WATER_VIEW_DIR);
  // A moderately broad lobe so sun-facing faces light up all the way from the
  // horizon down into the near foreground (a narrow lobe only catches the far
  // waves and the column dies at the horizon). Foam only half-suppresses the
  // glint so the streak still carries through the whitecapped near field.
  let spec = pow(clamp(dot(n, halfv), 0.0, 1.0), 70.0);
  let glint = min(spec * glintBand * 2.6, 1.3) * (1.0 - foam * 0.5);
  // Provisional warm sun tint so the glint reads as a distinct streak against the
  // white foam even in neutral grey — the streak's whole signature is its colour.
  // Slice 5 moves this constant into waterPalette (a refactor, not new behaviour).
  col = col + vec3f(1.0, 0.84, 0.52) * glint;
  // Whitecaps: a neutral white-grey placeholder, lit flatly (spray, not a mirror).
  return mix(col, vec3f(0.82, 0.83, 0.84), foam);
}`;
