// The single source for water's neutral albedo and the depth ramp — the colours
// the sea *is*, before any lighting mood. Kept deliberately daylight-neutral: an
// Aegean turquoise in the shallows grading to deep blue, never the dark dusk mood
// (that comes from the environment preset). This is the module the four inline
// water-colour sites collapse into when the production surfaces are rewired at
// their integration slices (S8–S10). Foam and glint have no fixed colour here —
// foam is lit white spray and the glint is the sun's own colour, both driven by
// the environment preset so they read warm at golden hour and cool under overcast.

export const WATER_PALETTE_WGSL = `
// Neutral water albedo (NOT mood): shallow → deep with the depth ramp.
const WATER_SHALLOW_ALBEDO = vec3f(0.09, 0.29, 0.40); // Aegean turquoise, blue-biased (not Caribbean green)
const WATER_DEEP_ALBEDO = vec3f(0.02, 0.07, 0.19);    // deep blue
const WATER_FOAM_ALBEDO = vec3f(0.92, 0.93, 0.94);    // white spray (lit by the preset)
const WATER_GLINT_GAIN = 1.1;                          // specular strength; colour = the sun's
const WATER_SHALLOW_SCATTER = 0.6;                     // sandy-bottom backscatter lift at the shore (sun-independent)
`;

// The campaign strategic sea's albedo — a MUTED, slightly-desaturated chart blue,
// NOT the saturated battle sea (the campaign is an antique painted chart, and the
// deep-ocean reference is explicitly not its target). This is the 4th and last inline
// water-colour site collapsed into the palette; `mapPass` mixes shallow→deep by its
// own shelf term and lays the subtle animated glint/foam over it.
// The two shader-side faces of the land-truth owner, ONE definition each
// (campaign-map-bugs 00/05 single-owner contract — no pass classifies pixels
// privately): `seaAmount` classifies the campaign-bg raster's painted pixels
// (the bake-side truth, what the raster terrain layer draws), and
// `drawnWaterAmount` is the canonical-terrain waterline (the biome-alpha
// contour the production map actually draws). A pass that must agree with the
// visible coast mixes them by the same terrainMix the map pass composites with.
export const CAMPAIGN_SEA_PALETTE_WGSL = `
const CAMPAIGN_SEA_SHALLOW = vec3f(0.40, 0.56, 0.64);
const CAMPAIGN_SEA_DEEP = vec3f(0.16, 0.30, 0.44);

fn seaAmount(rgb: vec3f) -> f32 {
  return smoothstep(0.04, 0.14, rgb.b - max(rgb.r, rgb.g * 0.88));
}

fn drawnWaterAmount(biomeAlpha: f32) -> f32 {
  return 1.0 - smoothstep(0.497, 0.503, biomeAlpha);
}
`;
