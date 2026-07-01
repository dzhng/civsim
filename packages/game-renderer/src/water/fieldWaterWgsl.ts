import { GERSTNER_WGSL } from './gerstnerField';
import { WATER_PALETTE_WGSL } from './waterPalette';
import { waterEnvironmentWgsl, WATER_ENVIRONMENTS } from './waterEnvironment';
import { waterShoreRampWgsl, FIELD_WATER_RAMP } from './waterShoreRamp';
import { WATER_SHADE_WGSL, CIVSIM_WATER_COLOR_WGSL } from './waterMaterialWgsl';

// The on-field battle-water material (rivers, lakes, shallows, shore) — single-
// sourced so the live `groundPass` and the lab `terrainPass` fixtures render identical
// water. It is the shared `civsimWaterColor` at **agitation 0** (calm: near-flat swell,
// no open-sea whitecaps, cut glint), plus a thin swash line of foam pinned to the
// waterline. Because the open sea (horizonPass) is the SAME `civsimWaterColor`, the two
// meet at the shore as one material (spec firewall #1): the field water is agitation 0
// and the sea ramps up from 0 at the shore, so there is no stripe by construction.
// Reads `cam` from the group-0 camera uniform, so the consuming shader must include
// WORLD_CAMERA_WGSL before this block. `shoreDist` is the caller's 0..1 distance-from-
// shore signal: groundPass passes the box-filtered water weight, terrainPass the quad's
// shore gradient.
export const FIELD_WATER_WGSL = `
${GERSTNER_WGSL}
${WATER_PALETTE_WGSL}
${waterEnvironmentWgsl(WATER_ENVIRONMENTS.golden)}
${waterShoreRampWgsl(FIELD_WATER_RAMP)}
${WATER_SHADE_WGSL}
${CIVSIM_WATER_COLOR_WGSL}

fn fieldWaterColor(p: vec2f, shoreDist: f32) -> vec3f {
  // Swash: a coherent foam line hugging the waterline — a band pinned to the very
  // lowest weights (right where the water meets the land), lightly textured so it
  // reads as breaking lace rather than a hard stripe.
  let swash = smoothstep(0.16, 0.02, shoreDist) * smoothstep(0.006, 0.03, shoreDist);
  let lace = 0.72 + 0.28 * fnoise(p * 1.2 + vec2f(cam.time * 0.05, 0.0));
  let ramp = waterShoreRamp(shoreDist);
  return civsimWaterColor(p, ramp.x, ramp.y, 0.0, swash * lace * 0.7);
}
`;
