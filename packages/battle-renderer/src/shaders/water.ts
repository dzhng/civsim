import { WORLD_CAMERA_WGSL } from "../../../renderer-core/src/cameraWgsl";
import { photorealGerstnerWaves } from "../../../game-renderer/src/water/photorealGerstnerWaves";
import * as policy from "../../../game-renderer/src/water/photorealWaterPolicy";
import * as physical from "../../../game-renderer/src/water/physicalWaterPolicy";
import { BATTLE_OCEAN_RAMP } from "../../../game-renderer/src/water/waterShoreRamp";
import { terrainNoiseFunctions } from "./terrainNoise";

/** Exact source wave constants and surface response, expressed for native WGSL.
 * Lighting, GGX, IBL and fog are supplied by the shared environment owner. */
export function waterShaderBodies(lake: boolean) {
  const f = (value: number) => `${value}${Number.isInteger(value) ? ".0" : ""}`;
  const v = (value: number[]) => `vec3f(${value.map(f).join(",")})`;
  const ramp = lake ? policy.LAKE_SHORE_RAMP : BATTLE_OCEAN_RAMP;
  const waveTerms = photorealGerstnerWaves()
    .map(
      (wave, i) => `
    let phase${i}=dot(vec2f(${f(wave.dirX)},${f(wave.dirY)}),p)*${f(wave.k)}-t*${f(wave.omega * 0.42)}+${f(wave.phase)};
    let hump${i}=sin(phase${i})*0.5+0.5;
    h+=(hump${i}*hump${i}-0.333)*${f(wave.amplitude * policy.SEA_SWELL_SCALE)};
    slope+=vec2f(${f(wave.dirX)},${f(wave.dirY)})*(hump${i}*cos(phase${i})*${f(wave.amplitude * policy.SEA_SWELL_SCALE * 2 * wave.k)});
  `,
    )
    .join("\n");
  const field = `
    var h=0.0;var slope=vec2f(0);
    ${waveTerms}
    let crest=smoothstep(${f(policy.SEA_FOAM_HEIGHT_START)},${f(policy.SEA_FOAM_HEIGHT_END)},h);
    let agitation=smoothstep(${f(policy.SEA_FOAM_SLOPE_START)},${f(policy.SEA_FOAM_SLOPE_END)},dot(slope,slope));
    let speckle=terrainWaterNoise(p*0.5+vec2f(t*0.1,t*0.05))*0.42+terrainWaterNoise(p*1.3-vec2f(t*0.06,t*0.09))*0.34+terrainWaterNoise(p*3.0+vec2f(t*0.04,t*(-0.07)))*0.24;
    return WaterField(h,normalize(vec3f(-slope,1)),crest*agitation*smoothstep(${f(policy.SEA_FOAM_SPECKLE_START)},${f(policy.SEA_FOAM_SPECKLE_END)},speckle)*${f(policy.SEA_FOAM_SCALE)});
  `;
  const vertex = `
    let position=vec3f(p.xy,waterField(p.xy,cam.time).height*${f(lake ? policy.LAKE_SWELL_SCALE : 1)}+water.baseZ);
    return VertexOut(projectWorld(position),position,shore);
  `;
  const fragment = `
    let p=v.position.xy;
    let sample=waterField(p,cam.time);
    let viewDist=length(p-cam.focus);
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
    let depth01=smoothstep(${f(ramp.depthNear)},${f(ramp.depthFar)},shore);
    let turbidity=smoothstep(${f(policy.SEA_SAND_TURBIDITY_DEPTH_START)},${f(policy.SEA_SAND_TURBIDITY_DEPTH_END)},depth01);
    let agitation=smoothstep(0.0,3200.0,shore);
    let foam=clamp(sample.foam*agitation,0.0,1.0);
    let strength=mix(0.3,1.0,agitation)*mix(${f(policy.SEA_NORMAL_DETAIL_NEAR)},${f(policy.SEA_NORMAL_DETAIL_FAR)},smoothstep(${f(policy.SEA_NORMAL_DETAIL_FADE_START)},${f(policy.SEA_NORMAL_DETAIL_FADE_END)},viewDist));
    `
    }
    let normal=normalize(mix(vec3f(0,0,1),sample.normal,strength));
    let shallow=mix(${v(physical.WATER_SAND_TURBIDITY_ALBEDO)},${v(physical.WATER_SHALLOW_ALBEDO)},turbidity);
    let albedo=terrainLinear(mix(mix(shallow,${v(physical.WATER_DEEP_ALBEDO)},depth01),${v(physical.WATER_FOAM_ALBEDO)},foam));
    let roughness=${lake ? "max(0.3," : ""}mix(${f(physical.WATER_ROUGHNESS)},${f(physical.WATER_FOAM_ROUGHNESS)},foam)${lake ? ")" : ""};
    return shadeWorldSurface(albedo,vec3f(0),roughness,0.0,0.0,1.0,normal,v.position,1.0);
  `;
  return { field, vertex, fragment };
}

/** Public WGSL entrypoints compose the same bodies used by typed pipelines. */
export function waterShader(environment: string, lake: boolean) {
  const body = waterShaderBodies(lake);
  return (
    WORLD_CAMERA_WGSL +
    environment +
    Object.entries(terrainNoiseFunctions)
      .map(([name, text]) => `fn ${name}${text}`)
      .join("\n") +
    `
  struct WaterState {baseZ:f32,shoreX:f32,pad:vec2f};
  @group(1) @binding(0) var<uniform> water:WaterState;
  struct WaterField {height:f32,normal:vec3f,foam:f32};
  fn waterField(p:vec2f,t:f32)->WaterField {${body.field}}
  struct VertexOut {@invariant @builtin(position) clip:vec4f,@location(0) position:vec3f,@location(1) shore:f32};
  @vertex fn vertex(@location(0) p:vec3f,@location(1) shore:f32)->VertexOut {${body.vertex}}
  @fragment fn fragment(v:VertexOut)->@location(0) vec4f {${body.fragment}}`
  );
}
