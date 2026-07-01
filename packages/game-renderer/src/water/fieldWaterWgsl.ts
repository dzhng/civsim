import { GERSTNER_WGSL } from './gerstnerField';
import { WATER_PALETTE_WGSL } from './waterPalette';
import { waterEnvironmentWgsl, WATER_ENVIRONMENTS } from './waterEnvironment';
import { waterShoreRampWgsl, FIELD_WATER_RAMP } from './waterShoreRamp';
import { WATER_SHADE_WGSL } from './waterMaterialWgsl';

// The shared on-field battle-water material (rivers, lakes, shallows, shore) —
// single-sourced so the live `groundPass` and the lab `terrainPass` fixtures render
// identical water and the field↔sea shoreline can become one material (spec
// firewall #1). It composes the frozen open-sea look (analytic Gerstner field +
// neutral Aegean palette × the golden preset + the shared shore ramp + waterShade)
// and adds the treatment the open sea does not want:
//   - the swell calmed well toward flat (a river is not the deep ocean),
//   - the open-sea whitecaps cut right down and replaced by a thin swash line of
//     foam at the waterline (foam belongs where water meets land),
//   - the sun glint cut down so near-flat river normals don't pool the whole sheen
//     into one blown-out white patch.
// It reads `cam` (time, position, sun) from the group-0 camera uniform, so the
// consuming shader must include WORLD_CAMERA_WGSL before this block. `shoreDist` is
// the caller's 0..1 distance-from-shore signal: groundPass passes the box-filtered
// water weight, terrainPass the quad's shore gradient.
export const FIELD_WATER_WGSL = `
${GERSTNER_WGSL}
${WATER_PALETTE_WGSL}
${waterEnvironmentWgsl(WATER_ENVIRONMENTS.golden)}
${waterShoreRampWgsl(FIELD_WATER_RAMP)}
${WATER_SHADE_WGSL}

fn fieldWaterColor(p: vec2f, shoreDist: f32) -> vec3f {
  var s = waterField(p, cam.time);
  // Calm the open-sea swell: flatten the ripple normal well toward up (the wave
  // field is frozen/shared, so damp the sample, not the field).
  s.normal = normalize(mix(vec3f(0.0, 0.0, 1.0), s.normal, 0.30));
  // Swash: a coherent foam line hugging the waterline — a band pinned to the very
  // lowest weights (right where the water meets the land), lightly textured so it
  // reads as breaking lace rather than a hard stripe. The open-sea whitecap foam is
  // dropped entirely: a calm river doesn't whitecap out in open water, and scattered
  // mid-water speckle reads as noise, not waves.
  let swash = smoothstep(0.16, 0.02, shoreDist) * smoothstep(0.006, 0.03, shoreDist);
  let lace = 0.72 + 0.28 * fnoise(p * 1.2 + vec2f(cam.time * 0.05, 0.0));
  s.foam = swash * lace * 0.7;
  let ramp = waterShoreRamp(shoreDist);
  // Glint band: how well the camera→fragment direction aligns with the sun azimuth,
  // cut right down (a calm river with near-flat normals would otherwise pool the
  // whole sheen into one blown-out patch; the open sea earns a broad glitter track).
  let delta = p - vec2f(cam.x, cam.y);
  let sunAzVec = vec2f(cos(cam.sunAz), sin(cam.sunAz));
  let band = smoothstep(0.1, 0.8, dot(normalize(delta), sunAzVec)) * 0.25;
  return waterShade(s, sunDirection(), band, ramp.x, ramp.y);
}
`;
