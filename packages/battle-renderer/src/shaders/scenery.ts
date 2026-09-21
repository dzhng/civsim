import { WORLD_CAMERA_WGSL } from "../../../renderer-core/src/cameraWgsl";
import { LEAF_ATLAS_RGB_GAIN } from "../../../game-renderer/src/models/shared/leafAtlas";

/** Existing battle prop surface and instance pose. Resources/passes belong to
 * each runtime. The pinned source shadow graph uses vertex alpha only. */
export function sceneryShader(environment: string, shadows: boolean, invariant = true) {
  return `${WORLD_CAMERA_WGSL}
${environment}
@group(1) @binding(0) var leaf:texture_2d<f32>;
@group(1) @binding(1) var leafSampler:sampler;
struct V {
 @builtin(position) ${invariant ? "@invariant " : ""}clip:vec4f,
 @location(0) world:vec3f,@location(1) normal:vec3f,
 @location(2) color:vec4f,@location(3) uv:vec2f,@location(4) shade:f32,
 @location(5) geometryNormalView:vec3f,
};
@vertex fn vertex(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) color:vec4f,
 @location(3) uv:vec2f,@location(4) pose:vec4f,@location(5) style:vec4f)->V {
${sceneryVertexBodyWgsl}
}
fn leafColor(v:V)->vec4f {
${sceneryLeafBodyWgsl}
}
@fragment fn fragment(v:V)->@location(0) vec4f {
 let color=leafColor(v);
 let lit=shadeWorldSurface(color.rgb,vec3f(0),0.9,geometryRoughnessFromView(v.geometryNormalView),0,1,normalize(v.normal),v.world,${shadows ? "sampleSunShadow(v.world,normalize(v.normal),v.clip.xy)" : "1.0"});
 // The source is opaque: alpha cuts coverage, then surviving output alpha is one.
 return vec4f(lit.rgb,1);
}
// Three's shadow override uses colorNode.a but does not forward opacityNode.
// Preserve its full leaf-card silhouettes in the parity workload.
@fragment fn shadowFragment(v:V) { if(v.color.a<=0.5){discard;} }
`;
}

export const sceneryVertexBodyWgsl = ` let cy=cos(style.z);let sy=sin(style.z);
 let world=vec3f(pose.x+(p.x*cy-p.y*sy)*pose.z,pose.y+(p.x*sy+p.y*cy)*pose.z,pose.w+p.z*style.y);
 let normal=normalize(vec3f(n.x*cy-n.y*sy,n.x*sy+n.y*cy,n.z));
 // The source's custom shading normal rotates with the prop, while its geometry
 // roughness uses the unrotated normal attribute through the mesh view matrix.
 return V(projectWorld(world),world,normal,color,uv,clamp(style.x,0,1),normalize((environment.worldToView*vec4f(n,0)).xyz));`;
export const sceneryLeafBodyWgsl = ` let texel=textureSample(leaf,leafSampler,clamp(v.uv,vec2f(0),vec2f(1)));
 let mask=step(0.0,v.uv.x);
 let alpha=v.color.a*mix(1.0,texel.a,mask);
 if(alpha<=0.5){discard;}
 let detail=mix(vec3f(1),texel.rgb*${LEAF_ATLAS_RGB_GAIN},mask);
 let display=clamp(v.color.rgb*(v.shade*0.18+0.88)*detail,vec3f(0),vec3f(1));
 let linear=select(pow(display*0.9478672986+vec3f(0.0521327014),vec3f(2.4)),display*0.0773993808,display<=vec3f(0.04045));
 return vec4f(linear,alpha);`;
