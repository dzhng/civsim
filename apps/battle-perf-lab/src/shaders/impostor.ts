import { WORLD_CAMERA_WGSL } from "../../../../packages/renderer-core/src/cameraWgsl";
import { soldierFactionWGSL } from "./soldierFaction";

export const impostorTypesWgsl = `
struct ImpostorVertex { world:vec3f,uv:vec2f,properties:vec4f };
struct ImpostorSurface { base:vec3f,normal:vec3f,roughness:f32,metal:f32,ao:f32 };
`;
export const impostorVertexWgsl = `(index:u32,instance:vec4f,billboardData:vec4f,living:f32,right:vec3f,up:vec3f)->ImpostorVertex {
  let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  let quad=corners[index];
  let world=instance.xyz+right*(quad.x*billboardData.y*0.5)+up*(quad.y*billboardData.z*0.5);
  let local=quad*0.5+vec2f(0.5);
  return ImpostorVertex(world,local,vec4f(instance.w,billboardData.w,living,billboardData.x));
}`;
export function impostorSurfaceWgsl(columns: number, rows: number): string {
  return `(uv:vec2f,properties:vec4f,albedoAtlas:texture_2d<f32>,normalAtlas:texture_2d<f32>,ormAtlas:texture_2d<f32>,atlasSampler:sampler)->ImpostorSurface {
  let row=floor(properties.w/f32(${columns}));let col=properties.w-row*f32(${columns});
  let atlasUv=vec2f((col+uv.x)/f32(${columns}),(row+1.0-uv.y)/f32(${rows}));
  let sample=textureSample(albedoAtlas,atlasSampler,atlasUv);
  let coverage=max(sample.a,0.0001);
  let orm=textureSample(ormAtlas,atlasSampler,atlasUv)/coverage;
  if(sample.a<=0.08){discard;}
  let normalContact=textureSample(normalAtlas,atlasSampler,atlasUv)/coverage;
  let n=normalize(normalContact.rgb*2.0-vec3f(1));
  let c=cos(properties.y);let s=sin(properties.y);
  let worldNormal=normalize(vec3f(n.x*c-n.y*s,n.x*s+n.y*c,n.z));
  let albedo=mix(sample.rgb/coverage,factionAccent(properties.x),orm.a);
  let ao=orm.r*mix(1.0,normalContact.a,properties.z);
  return ImpostorSurface(albedo,worldNormal,orm.g,orm.b,ao);
}`;
}
export function impostorShader(environment: string, columns: number, rows: number): string {
  return `${WORLD_CAMERA_WGSL}
${environment}
${soldierFactionWGSL}
${impostorTypesWgsl}
fn impostorVertex${impostorVertexWgsl}
fn impostorSurface${impostorSurfaceWgsl(columns, rows)}
struct ImpostorView {right:vec4f,up:vec4f};
@group(1) @binding(0) var<uniform> billboard:ImpostorView;
@group(1) @binding(1) var albedoAtlas:texture_2d<f32>;
@group(1) @binding(2) var normalAtlas:texture_2d<f32>;
@group(1) @binding(3) var ormAtlas:texture_2d<f32>;
@group(1) @binding(4) var atlasSampler:sampler;
// Match the source single beauty pass clip contract; no equal-depth prepass consumes this layer.
struct VertexOut {
  @builtin(position) position:vec4f,
  @location(0) world:vec3f,
  @location(1) uv:vec2f,
  @location(2) properties:vec4f,
};
@vertex fn vertex(@builtin(vertex_index) index:u32,@location(0) instance:vec4f,@location(1) billboardData:vec4f,@location(2) living:vec4f)->VertexOut {
  let v=impostorVertex(index,instance,billboardData,living.x,billboard.right.xyz,billboard.up.xyz);
  return VertexOut(projectWorld(v.world),v.world,v.uv,v.properties);
}
@fragment fn fragment(v:VertexOut)->@location(0) vec4f {
  let s=impostorSurface(v.uv,v.properties,albedoAtlas,normalAtlas,ormAtlas,atlasSampler);
  return shadeWorldSurface(s.base,vec3f(0),s.roughness,0.0,s.metal,s.ao,s.normal,v.world,1.0);
}
`;
}
