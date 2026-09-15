import { READOUT_CAMERA_BIAS } from "../../../../packages/game-renderer/src/battle/readoutData";
export const readoutVertexBodyWgsl = ` let toCamera=camera.eye.xyz-chip0.xyz;
 let inFront=step(0.0,-dot(toCamera,camera.forward.xyz));
 let anchor=chip0.xyz+normalize(toCamera)*${READOUT_CAMERA_BIAS};
 let world=anchor+camera.right.xyz*((chip1.x+quad.x*chip1.z)*chip0.w)*inFront+camera.up.xyz*((chip1.y+quad.y*chip1.w)*chip0.w)*inFront;
 let uv=quad.xy+vec2f(0.5);
 return V(camera.vp*vec4f(world,1),vec2f(cell.x+(cell.z-cell.x)*uv.x,cell.w+(cell.y-cell.w)*uv.y));`;
export const readoutFragmentBodyWgsl = ` let color=textureSample(atlas,linear,v.uv);
 if(color.a<=0.5){discard;}
 return vec4f(color.rgb,1);`;

export const readoutWgsl = `
struct Camera{vp:mat4x4f,right:vec4f,up:vec4f,eye:vec4f,forward:vec4f};
@group(0) @binding(0) var<uniform> camera:Camera;
@group(1) @binding(0) var atlas:texture_2d<f32>;
@group(1) @binding(1) var linear:sampler;
struct V{@builtin(position) clip:vec4f,@location(0) uv:vec2f};
@vertex fn vertex(@location(0) quad:vec3f,@location(1) chip0:vec4f,@location(2) chip1:vec4f,@location(3) cell:vec4f)->V{
${readoutVertexBodyWgsl}
}
@fragment fn fragment(v:V)->@location(0) vec4f{
${readoutFragmentBodyWgsl}
}`;
