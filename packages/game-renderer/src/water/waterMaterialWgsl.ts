// The shared water shading WGSL — one `waterShade` consumed identically by both
// fields and (from Slice 8) all three production surfaces, so the look is single-
// sourced. It reads only a `WaterSample` (the frozen seam struct), never the
// technique.
//
// Slices 2–3 scope: silhouette + foam, still neutral grey. `waterShade` shades
// the water body by slope (`normal · sunDir`) and lays neutral white-grey
// whitecaps over it by `sample.foam`. Colour (Slice 5) and glint (Slice 4) extend
// this function later; the albedo and foam colour stay neutral until then
// (aesthetics creed: don't bake light into albedo).

export const WATER_SHADE_WGSL = `
fn waterShade(sample: WaterSample, sunDir: vec3f) -> vec3f {
  let n = normalize(sample.normal);
  let diff = clamp(dot(n, sunDir), 0.0, 1.0);
  // A soft sky-fill term keeps shadowed troughs from going black so the swell
  // reads as a lit surface, not a cutout.
  let sky = clamp(n.z, 0.0, 1.0);
  let albedo = vec3f(0.40);
  let water = albedo * (0.46 + 0.42 * diff + 0.12 * sky);
  // Whitecaps: a neutral white-grey placeholder laid on the crests. Foam is lit
  // flatly (it is spray, not a mirror) so it stays bright in shadowed troughs.
  let foamCol = vec3f(0.82, 0.83, 0.84);
  return mix(water, foamCol, clamp(sample.foam, 0.0, 1.0));
}`;
