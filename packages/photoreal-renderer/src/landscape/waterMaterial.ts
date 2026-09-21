import {
  cos,
  float,
  fwidth,
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
  fbmN,
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

import {
  WATER_SHALLOW_ALBEDO,
  WATER_DEEP_ALBEDO,
  WATER_FOAM_ALBEDO,
  WATER_SAND_TURBIDITY_ALBEDO,
  WATER_ROUGHNESS,
  WATER_FOAM_ROUGHNESS,
  LAKE_NORMAL_DETAIL_FADE_START,
  LAKE_NORMAL_DETAIL_FADE_END,
} from "../../../game-renderer/src/water/physicalWaterPolicy";

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
    LAKE_NORMAL_DETAIL_FADE_START,
    LAKE_NORMAL_DETAIL_FADE_END,
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
  // Multi-scale scattering breaks the flat distance halo while preserving the
  // source shore. Fine variation keeps broad interiors from becoming flat fills.
  const shoal = fbmN(p.mul(0.16)).toVar();
  const scatteringScale = shoal.mul(1.5).add(0.45);
  const depth = smoothstepN(0, 12, offshore.mul(scatteringScale)).toVar();
  const phase = frame.time.mod(8).mul(Math.PI / 4);
  const drift = vec2(sin(phase), cos(phase)).mul(0.35);
  const texture = fbmN(p.mul(1.2).add(drift)).sub(0.5);
  const depthProxy = saturateN(depth.mul(0.82).add(texture.mul(0.09))).toVar();
  // The source distance is sampled on a kilometre lattice; a sub-kilometre
  // foam band disappears at regional scale and leaves isolated square flecks.
  const lace = fbmN(p.mul(1.4).add(drift)).toVar();
  const surfWidth = lace.mul(2.8).add(0.7);
  // Preserve foam contrast as a broken band becomes only a few pixels wide;
  // close views keep blue channel interiors rather than filling with white.
  const surfStrength = mix(float(0.42), float(0.9), smoothstepN(0.2, 0.5, length(fwidth(p))));
  const surf = float(1)
    .sub(smoothstepN(0, 1, offshore.div(surfWidth)))
    .mul(smoothstepN(0.38, 0.7, lace))
    .mul(surfStrength);
  const water = waterSurfaceNodes(depthProxy, surf);
  const detail = smoothstepN(0.4, 4, offshore).mul(0.014);
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
