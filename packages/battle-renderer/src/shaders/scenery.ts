import { LEAF_ATLAS_RGB_GAIN } from "../../../game-renderer/src/models/shared/leafAtlas";

export const sceneryVertexBodyWgsl = ` let cy=cos(style.z);let sy=sin(style.z);
 let world=vec3f(pose.x+(p.x*cy-p.y*sy)*pose.z,pose.y+(p.x*sy+p.y*cy)*pose.z,pose.w+p.z*style.y);
 let normal=normalize(vec3f(n.x*cy-n.y*sy,n.x*sy+n.y*cy,n.z));
 // The source's custom shading normal rotates with the prop, while its geometry
 // roughness uses the unrotated normal attribute through the mesh view matrix.
 return V(projectWorld(world),world,normal,color,uv,clamp(style.x,0,1),style.w,normalize((environment.worldToView*vec4f(n,0)).xyz));`;
export const sceneryLeafBodyWgsl = ` let texel=textureSample(leaf,leafSampler,clamp(v.uv,vec2f(0),vec2f(1)));
 let mask=step(0.0,v.uv.x);
 let alpha=v.color.a*mix(1.0,texel.a*v.presence,mask);
 if(alpha<=0.5){discard;}
 let detail=mix(vec3f(1),texel.rgb*${LEAF_ATLAS_RGB_GAIN},mask);
 let display=clamp(v.color.rgb*(v.shade*0.18+0.88)*detail,vec3f(0),vec3f(1));
 let linear=select(pow(display*0.9478672986+vec3f(0.0521327014),vec3f(2.4)),display*0.0773993808,display<=vec3f(0.04045));
 return vec4f(linear,alpha);`;
