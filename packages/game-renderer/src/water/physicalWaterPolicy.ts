// The neutral scattering colour the sea contributes beneath its sky reflection.
// These are display-authored effective albedos: pale Aegean turquoise in the
// shallows and a restrained deep-water blue offshore under the golden preset.
export const WATER_SHALLOW_ALBEDO: [number, number, number] = [0.22, 0.58, 0.6];
export const WATER_DEEP_ALBEDO: [number, number, number] = [0.025, 0.095, 0.22];
export const WATER_FOAM_ALBEDO: [number, number, number] = [0.92, 0.93, 0.94];
export const WATER_SAND_TURBIDITY_ALBEDO: [number, number, number] = [0.66, 0.58, 0.4];
// Calm water is glossy: the sun track is standard-material GGX specular from
// the live environment sun; foam stays matte.
export const WATER_ROUGHNESS = 0.105;
export const WATER_FOAM_ROUGHNESS = 0.78;
// Ripple normals must be gone before vista range: distant sun-glint facets alias.
export const LAKE_NORMAL_DETAIL_FADE_START = 120;
export const LAKE_NORMAL_DETAIL_FADE_END = 420;
