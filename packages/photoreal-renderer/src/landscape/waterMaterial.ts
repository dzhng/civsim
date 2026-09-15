import {
  cos,
  float,
  length,
  max,
  mix,
  normalize,
  sin,
  transformNormalToView,
  vec2,
  vec3,
} from "three/tsl";
import {
  FIELD_WATER_RAMP,
  type WaterShoreRamp,
} from "../../../game-renderer/src/water/waterShoreRamp";
import {
  fnoiseN,
  linearAlbedo,
  rgbNode,
  saturateN,
  smoothstepN,
  type LandscapeFrameUniforms,
  type FloatNode,
  type Vec2Node,
  type Vec3Node,
} from "./shaderNodes";

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
// Field ripple detail fades before distant fragments alias under the sun.
const FIELD_WATER_DETAIL_FADE_START = 120;
const FIELD_WATER_DETAIL_FADE_END = 420;

/** waterShoreRamp(shoreDist) → depth01 (the haze leg of the shared ramp
 *  table is a bespoke-WGSL knob; photoreal haze is the aerial owner's). */
export function shoreDepthNode(ramp: WaterShoreRamp, shoreDist: FloatNode): FloatNode {
  return smoothstepN(ramp.depthNear, ramp.depthFar, shoreDist);
}

interface WaterSurfaceNodes {
  /** Neutral albedo (depth-graded blue + foam). */
  albedo: Vec3Node;
  foam: FloatNode;
  roughness: FloatNode;
  normal?: Vec3Node;
}

/** Linear water albedo and roughness shared by terrain, ocean and lakes.
 * The world environment lights it; scene aerial perspective owns haze. */
export function waterSurfaceNodes(
  depth01: FloatNode,
  foamRaw: FloatNode,
  shoreTurbidity: FloatNode | null = null,
): WaterSurfaceNodes {
  const foam = saturateN(foamRaw).toVar();
  const shallow = shoreTurbidity
    ? mix(rgbNode(WATER_SAND_TURBIDITY_ALBEDO), rgbNode(WATER_SHALLOW_ALBEDO), shoreTurbidity)
    : rgbNode(WATER_SHALLOW_ALBEDO);
  let albedo = mix(shallow, rgbNode(WATER_DEEP_ALBEDO), depth01);
  albedo = mix(albedo, rgbNode(WATER_FOAM_ALBEDO), foam);
  albedo = linearAlbedo(albedo);
  const roughness = mix(float(WATER_ROUGHNESS), float(WATER_FOAM_ROUGHNESS), foam);
  return { albedo, foam, roughness };
}

/** fieldWaterWgsl fieldWaterColor's surface terms — the on-field battle water
 *  (calm: swash lace pinned to the waterline, no swell), keyed on the
 *  box-filtered water weight. The ground material blends these over turf by
 *  the same weight. */
export function fieldWaterSurfaceNodes(
  frame: LandscapeFrameUniforms,
  p: Vec2Node,
  shoreDist: FloatNode,
): WaterSurfaceNodes {
  const swash = smoothstepN(0.16, 0.02, shoreDist).mul(smoothstepN(0.006, 0.03, shoreDist));
  const viewDist = length(p.sub(vec2(frame.focus))).toVar();
  const detailFade = smoothstepN(
    FIELD_WATER_DETAIL_FADE_START,
    FIELD_WATER_DETAIL_FADE_END,
    viewDist,
  );
  const detail = float(1.0).sub(detailFade).toVar();
  const lace = fnoiseN(p.mul(1.2).add(vec2(frame.time.mul(0.05), 0.0)))
    .mul(0.28)
    .add(0.72);
  return waterSurfaceNodes(
    shoreDepthNode(FIELD_WATER_RAMP, shoreDist),
    swash.mul(lace).mul(0.7).mul(detail),
  );
}

/** Campaign distance is signed kilometres (negative wet). Depth is a bounded
 * visual proxy, not bathymetry: narrow rivers remain shallow and calm. Coverage
 * belongs to the source-conforming mesh and is applied by the ground material. */
export function campaignWaterSurfaceNodes(
  frame: LandscapeFrameUniforms,
  p: Vec2Node,
  signedShore: FloatNode,
) {
  const offshore = max(signedShore.negate(), 0).toVar();
  const depthProxy = smoothstepN(0.25, 12, offshore).mul(0.82).toVar();
  const phase = frame.time.mod(8).mul(Math.PI / 4);
  const lace = smoothstepN(0.36, 0.72, fnoiseN(p.mul(1.7))).toVar();
  const pulse = sin(offshore.mul(5).sub(phase)).mul(0.12).add(0.88);
  const surf = float(1)
    .sub(smoothstepN(0.05, 0.85, offshore))
    .mul(lace)
    .mul(pulse)
    .mul(0.35);
  const water = waterSurfaceNodes(depthProxy, surf);
  const detail = smoothstepN(0.4, 4, offshore).mul(0.008);
  const drift = vec2(sin(phase), cos(phase)).mul(0.35);
  const ripples = p.mul(0.75).add(drift);
  const normal = transformNormalToView(
    normalize(
      vec3(
        fnoiseN(ripples).sub(0.5).mul(detail),
        fnoiseN(ripples.add(vec2(17, 9)))
          .sub(0.5)
          .mul(detail),
        1,
      ),
    ),
  );
  return { ...water, roughness: max(water.roughness, 0.24), normal };
}
