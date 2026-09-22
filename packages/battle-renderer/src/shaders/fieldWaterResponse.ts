import * as physical from "../../../game-renderer/src/water/physicalWaterPolicy";
import { FIELD_WATER_RAMP } from "../../../game-renderer/src/water/waterShoreRamp";

const f = (value: number) => `${value.toExponential(16)}f`;
const rgb = (value: readonly number[]) => `vec3f(${value.map(f).join(",")})`;

/** Shared linear field-water response for ground and the adjoining ocean edge. */
export const fieldWaterResponseBody = `(p:vec2f,coverage:f32,time:f32,viewDistance:f32)->FieldWaterResponse {
 let rawWater=clamp(coverage,0.0,1.0);
 let swash=smoothstep(0.16,0.02,rawWater)*smoothstep(0.006,0.03,rawWater);
 let detail=1.0-smoothstep(${f(physical.LAKE_NORMAL_DETAIL_FADE_START)},${f(physical.LAKE_NORMAL_DETAIL_FADE_END)},viewDistance);
 let lace=terrainWaterNoise(p*1.2+vec2f(time*0.05,0))*0.28+0.72;
 let foam=clamp(swash*lace*0.7*detail,0.0,1.0);
 let depth=smoothstep(${f(FIELD_WATER_RAMP.depthNear)},${f(FIELD_WATER_RAMP.depthFar)},rawWater);
 let albedo=terrainLinear(mix(mix(${rgb(physical.WATER_SHALLOW_ALBEDO)},${rgb(physical.WATER_DEEP_ALBEDO)},depth),${rgb(physical.WATER_FOAM_ALBEDO)},foam));
 let roughness=mix(${f(physical.WATER_ROUGHNESS)},${f(physical.WATER_FOAM_ROUGHNESS)},foam);
 return FieldWaterResponse(albedo,foam,roughness,detail);
}`;
