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
`;
