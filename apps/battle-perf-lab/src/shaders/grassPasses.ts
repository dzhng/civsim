import { WORLD_CAMERA_WGSL } from "../../../../packages/renderer-core/src/cameraWgsl";
import { grassTypesWGSL, grassRoutingWGSL, grassVertexWGSL } from "./grass";
export function grassRoutingShader(indexCounts: readonly number[]) {
  return (
    grassTypesWGSL +
    grassRoutingWGSL +
    `
struct Command { indexCount:u32,instanceCount:atomic<u32>,firstIndex:u32,baseVertex:i32,firstInstance:u32 };
@group(0) @binding(0) var<storage,read> records:array<GrassRecord>;
@group(0) @binding(1) var<uniform> params:GrassParams;
@group(0) @binding(2) var<storage,read_write> commands:array<Command,3>;
@group(0) @binding(3) var<storage,read_write> nearList:array<u32>;
@group(0) @binding(4) var<storage,read_write> midList:array<u32>;
@group(0) @binding(5) var<storage,read_write> farList:array<u32>;
@group(0) @binding(6) var<uniform> activeCount:vec4u;
@compute @workgroup_size(1) fn reset(){
 let counts=array<u32,3>(${indexCounts.map((n) => `${n}u`).join(",")});
 for(var i=0u;i<3u;i++){commands[i].indexCount=counts[i];atomicStore(&commands[i].instanceCount,0u);commands[i].firstIndex=0u;commands[i].baseVertex=0;commands[i].firstInstance=0u;}
}
@compute @workgroup_size(64) fn route(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=activeCount.x){return;}
 let tier=grassTier(records[id.x],params);if(tier<0){return;}
 let slot=atomicAdd(&commands[u32(tier)].instanceCount,1u);
 if(tier==0){nearList[slot]=id.x;}else if(tier==1){midList[slot]=id.x;}else{farList[slot]=id.x;}
}`
  );
}
export function grassDrawShader(environment: string, paramsGroup = 2, paramsBinding = 0) {
  return (
    WORLD_CAMERA_WGSL +
    grassTypesWGSL +
    grassVertexWGSL +
    environment +
    `
@group(1) @binding(0) var<storage,read> records:array<GrassRecord>;
@group(1) @binding(1) var<storage,read> visible:array<u32>;
@group(${paramsGroup}) @binding(${paramsBinding}) var<uniform> grass:GrassParams;
struct VertexOut {@builtin(position) @invariant position:vec4f,@location(0) world:vec3f,@location(1) normal:vec3f,@location(2) albedo:vec3f,@location(3) weights:vec2f};
@vertex fn vertex(@location(0) local:vec3f,@builtin(instance_index) instance:u32)->VertexOut {
 let v=grassVertex(records[visible[instance]],local,grass,cam.eye,grass.view);
 return VertexOut(projectWorld(v.world),v.world,v.normal,v.albedo,v.lightWeights);
}
@fragment fn beauty(v:VertexOut)->@location(0) vec4f {
 let normal=normalize(v.normal);
 // Production blade geometry has constant (0,0,1) attribute normals; authored
 // shading normals do not feed Three's normalViewGeometry roughness derivative.
 return shadeWorldSurface(grassLinear(v.albedo),grassEmissive(normal,v.world,v.weights,grass,cam.eye),0.96,0.0,0.0,1.0,normal,v.world,1.0);
}
@fragment fn depth(v:VertexOut)->@location(0) vec4f {return vec4f(0,0,0,1);}
`
  );
}
