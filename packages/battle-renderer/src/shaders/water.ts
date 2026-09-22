import * as policy from "../../../game-renderer/src/water/photorealWaterPolicy";
import * as physical from "../../../game-renderer/src/water/physicalWaterPolicy";
import { BATTLE_OCEAN_RAMP } from "../../../game-renderer/src/water/waterShoreRamp";

/** Displacement and response bodies for the typed water pipeline.
 * Wave, lighting and field-response dependencies come from their shared owners. */
export function waterShaderBodies(lake: boolean) {
  const f = (value: number) => `${value}${Number.isInteger(value) ? ".0" : ""}`;
  const v = (value: number[]) => `vec3f(${value.map(f).join(",")})`;
  const ramp = lake ? policy.LAKE_SHORE_RAMP : BATTLE_OCEAN_RAMP;
  const vertex = `
    let position=vec3f(p.xy,waterField(p.xy,cam.time).height*${lake ? f(policy.LAKE_SWELL_SCALE) : `smoothstep(0.0,${f(ramp.depthFar)},abs(p.x-water.shoreX))`}+${lake ? "water.baseZ" : "p.z"});
    return VertexOut(projectWorld(position),position,shore);
  `;
  const fragment = `
    let p=v.position.xy;
    let sample=waterField(p,cam.time);
    let viewDist=${lake ? "length(v.position-cam.eye)" : "length(p-cam.focus)"};
    ${
      lake
        ? `
    let jitter=(terrainWaterNoise(p*0.09+vec2f(3,7))-0.5)*13.0+(terrainWaterNoise(p*0.28+vec2f(11,2))-0.5)*5.0+(terrainWaterNoise(p*0.62+vec2f(5,9))-0.5)*2.2;
    let shore=max(v.shore+jitter,0.0);
    let depth=smoothstep(${f(ramp.depthNear)},${f(ramp.depthFar)},shore);
    let turbidity=smoothstep(0.0,0.22,depth);
    let depth01=max(depth,0.42);
    let foam=0.0;
    let strength=mix(${f(policy.LAKE_NORMAL_STRENGTH)},${f(policy.LAKE_NORMAL_DETAIL_FAR)},smoothstep(${f(physical.LAKE_NORMAL_DETAIL_FADE_START)},${f(physical.LAKE_NORMAL_DETAIL_FADE_END)},viewDist));
    `
        : `
    let shore=abs(p.x-water.shoreX);
    let join=smoothstep(0.0,${f(ramp.depthFar)},shore);
    let depth01=smoothstep(${f(ramp.depthNear)},${f(ramp.depthFar)},shore);
    let turbidity=smoothstep(${f(policy.SEA_SAND_TURBIDITY_DEPTH_START)},${f(policy.SEA_SAND_TURBIDITY_DEPTH_END)},depth01);
    let agitation=smoothstep(0.0,3200.0,shore);
    let fieldWater=fieldWaterResponse(p,v.shore,cam.time,viewDist);
    let foam=mix(fieldWater.foam,clamp(sample.foam*agitation,0.0,1.0),join);
    let fieldStrength=mix(${f(policy.FIELD_WATER_NORMAL_DETAIL_FAR)},${f(policy.FIELD_WATER_NORMAL_STRENGTH)},fieldWater.detail);
    let oceanStrength=mix(0.3,1.0,agitation)*mix(${f(policy.SEA_NORMAL_DETAIL_NEAR)},${f(policy.SEA_NORMAL_DETAIL_FAR)},smoothstep(${f(policy.SEA_NORMAL_DETAIL_FADE_START)},${f(policy.SEA_NORMAL_DETAIL_FADE_END)},viewDist));
    let strength=mix(fieldStrength,oceanStrength,join);
    `
    }
    let normal=normalize(mix(vec3f(0,0,1),sample.normal,strength));
    let shallow=mix(${v(physical.WATER_SAND_TURBIDITY_ALBEDO)},${v(physical.WATER_SHALLOW_ALBEDO)},turbidity);
    let oceanAlbedo=mix(mix(shallow,${v(physical.WATER_DEEP_ALBEDO)},depth01),${v(physical.WATER_FOAM_ALBEDO)},foam);
    ${
      lake
        ? "let albedo=terrainLinear(oceanAlbedo);"
        : `
    let albedo=mix(fieldWater.albedo,terrainLinear(oceanAlbedo),join);`
    }

    let roughness=${lake ? "max(0.3," : ""}mix(${f(physical.WATER_ROUGHNESS)},${f(physical.WATER_FOAM_ROUGHNESS)},foam)${lake ? ")" : ""};
    return shadeWorldSurface(albedo,vec3f(0),roughness,0.0,0.0,1.0,normal,v.position,1.0);
  `;
  return { vertex, fragment };
}
