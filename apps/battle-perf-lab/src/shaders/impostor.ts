import { WORLD_CAMERA_WGSL } from "../../../../packages/renderer-core/src/cameraWgsl";
import { soldierFactionWGSL } from "./soldierFaction";

export function impostorShader(environment: string, columns: number, rows: number): string {
  return `${WORLD_CAMERA_WGSL}
${environment}
${soldierFactionWGSL}
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
  let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  let quad=corners[index];
  let world=instance.xyz+billboard.right.xyz*(quad.x*billboardData.y*0.5)+billboard.up.xyz*(quad.y*billboardData.z*0.5);
  let local=quad*0.5+vec2f(0.5);
  return VertexOut(projectWorld(world),world,local,vec4f(instance.w,billboardData.w,living.x,billboardData.x));
}
@fragment fn fragment(v:VertexOut)->@location(0) vec4f {
  let row=floor(v.properties.w/f32(${columns}));let col=v.properties.w-row*f32(${columns});
  let atlasUv=vec2f((col+v.uv.x)/f32(${columns}),(row+1.0-v.uv.y)/f32(${rows}));
  let sample=textureSample(albedoAtlas,atlasSampler,atlasUv);
  let coverage=max(sample.a,0.0001);
  let orm=textureSample(ormAtlas,atlasSampler,atlasUv)/coverage;
  if(sample.a<=0.08){discard;}
  let normalContact=textureSample(normalAtlas,atlasSampler,atlasUv)/coverage;
  let n=normalize(normalContact.rgb*2.0-vec3f(1));
  let c=cos(v.properties.y);let s=sin(v.properties.y);
  let worldNormal=normalize(vec3f(n.x*c-n.y*s,n.x*s+n.y*c,n.z));
  let albedo=mix(sample.rgb/coverage,factionAccent(v.properties.x),orm.a);
  let ao=orm.r*mix(1.0,normalContact.a,v.properties.z);
  // Source cutout is opaque after alpha testing, and does not receive shadows.
  return shadeWorldSurface(albedo,vec3f(0),orm.g,0.0,orm.b,ao,worldNormal,v.world,1.0);
}
`;
}
