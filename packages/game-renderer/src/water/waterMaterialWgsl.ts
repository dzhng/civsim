// The shared water shading WGSL — one `waterShade` consumed identically by both
// fields and (from Slice 8) all three production surfaces, so the look is single-
// sourced. It reads only a `WaterSample` (the frozen seam struct), never the
// technique.
//
// Slice 2 scope: silhouette / value only. `waterShade` returns a NEUTRAL GREY
// shaded purely by slope (`normal · sunDir`) so the crest/trough geometry reads
// on its own. Colour (Slice 5), foam (Slice 3), and glint (Slice 4) extend this
// function later; the albedo stays neutral until then (aesthetics creed: don't
// bake light into albedo).

export const WATER_SHADE_WGSL = `
fn waterShade(sample: WaterSample, sunDir: vec3f) -> vec3f {
  let n = normalize(sample.normal);
  let diff = clamp(dot(n, sunDir), 0.0, 1.0);
  // A soft sky-fill term keeps shadowed troughs from going black so the swell
  // reads as a lit surface, not a cutout.
  let sky = clamp(n.z, 0.0, 1.0);
  let albedo = vec3f(0.40);
  return albedo * (0.46 + 0.42 * diff + 0.12 * sky);
}`;
