import { linearAlbedoWgsl } from "./soldierFaction";
import {
  STANDARD_WAVE as w,
  STANDARD_WAVE_BACK_LOBE,
} from "../../../game-renderer/src/models/shared/standardAsset";
import { STANDARD_SURFACE as s } from "../../../game-renderer/src/models/shared/battleStandardData";
import { WORLD_CAMERA_WGSL } from "../../../renderer-core/src/cameraWgsl";
const rgb = (v: readonly number[]) => `vec3f(${v.join(",")})`;
export const standardFunctions = {
  vertex: `(local0:vec3f,normal0:vec3f,uvwm:vec4f,pose:vec4f,details:vec4f,time:f32)->StandardVertex {
 let primary=sin(time*${w.primaryTime}+details.y+local0.x*${w.primaryX}+local0.z*${w.primaryZ});
 let secondary=sin(time*${w.secondaryTime}+details.y*${w.secondaryPhase}+local0.x*${w.secondaryX}-local0.z*${w.secondaryZ});
 let wave=primary*${w.primaryMix}+secondary*${w.secondaryMix};
 let shaped=mix(wave,wave*${STANDARD_WAVE_BACK_LOBE},step(0.0,wave));
 let local=vec3f(local0.x,local0.y+uvwm.z*details.z*shaped,local0.z)*details.x;
 let cy=cos(pose.w);let sy=sin(pose.w);
 let world=vec3f(pose.x+local.x*cy-local.y*sy,pose.y+local.x*sy+local.y*cy,pose.z+local.z);
 let normal=normalize(vec3f(normal0.x*cy-normal0.y*sy,normal0.x*sy+normal0.y*cy,normal0.z));
 return StandardVertex(world,normal);
 }`,
  surface: `(material:f32,selected:f32,field:vec3f)->StandardSurface {
 let gold=${rgb(s.gold)};let pole=${rgb(s.pole)};
 let mPole=1.0-step(.5,material);let mHardware=step(.5,material)*(1.0-step(1.5,material));
 let mCloth=step(1.5,material)*(1.0-step(2.5,material));let mTrim=step(2.5,material)*(1.0-step(3.5,material));let mEmblem=step(3.5,material)*(1.0-step(4.5,material));
 let cloth=clamp(mCloth+mTrim+mEmblem,0.0,1.0);let lift=selected*cloth;
 let base=pole*mPole+gold*mHardware+field*mCloth+gold*mTrim+gold*mEmblem;
 let albedo=clamp(base*(1.0+lift*${s.selectedAlbedo})+gold*lift*${s.selectedGold},vec3f(0),vec3f(1));
 let emissive=field*cloth*${s.clothEmission}+gold*lift*${s.selectedEmission};
 return StandardSurface(standardLinear(albedo),standardLinear(emissive),mix(${s.roughness},${s.metalRoughness},clamp(mHardware+mTrim+mEmblem,0.0,1.0)),clamp((mHardware+mTrim+mEmblem)*${s.metalness},0.0,${s.maxMetalness}));
 }`,
  linear: linearAlbedoWgsl,
};
export const standardTypes = `struct StandardVertex{world:vec3f,normal:vec3f};struct StandardSurface{albedo:vec3f,emissive:vec3f,roughness:f32,metalness:f32};`;
export function standardsShader(environment: string) {
  return (
    WORLD_CAMERA_WGSL +
    environment +
    standardTypes +
    `
fn standardLinear${standardFunctions.linear}
fn standardVertex${standardFunctions.vertex}
fn standardSurface${standardFunctions.surface}
struct StandardState{view:mat4x4f,time:vec4f};
@group(1) @binding(0) var<uniform> standard:StandardState;
struct Out{@builtin(position) position:vec4f,@location(0) world:vec3f,@location(1) viewNormal:vec3f,@location(2) geometryNormal:vec3f,@location(3) field:vec3f,@location(4) materialSelected:vec2f};
@vertex fn vertex(@location(0) local:vec3f,@location(1) normal:vec3f,@location(2) uvwm:vec4f,@location(3) pose:vec4f,@location(4) details:vec4f,@location(5) field:vec3f)->Out{
 let v=standardVertex(local,normal,uvwm,pose,details,standard.time.x);
 return Out(projectWorld(v.world),v.world,normalize((standard.view*vec4f(v.normal,0)).xyz),normalize((standard.view*vec4f(normal,0)).xyz),field,vec2f(uvwm.w,details.w));
}
@fragment fn fragment(v:Out)->@location(0) vec4f{
 let view=mat3x3f(standard.view[0].xyz,standard.view[1].xyz,standard.view[2].xyz);
 let normal=normalize(transpose(view)*normalize(v.viewNormal));
 let surface=standardSurface(v.materialSelected.x,v.materialSelected.y,v.field);
 return shadeWorldSurface(surface.albedo,surface.emissive,surface.roughness,geometryRoughnessFromView(v.geometryNormal),surface.metalness,1.0,normal,v.world,1.0);
}`
  );
}
