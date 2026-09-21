import { MEADOW } from "../../../game-renderer/src/battle/meadowPalette";
const rgb = (value: readonly number[]) =>
  `vec3f(${value.map((v) => v.toExponential(16)).join(",")})`;

/** Pinned bladeFieldLayer operations; packed records and resolved policy stay caller-owned. */
export const grassTypesWGSL = `
struct GrassRecord { d0:vec4f,d1:vec4f,d2:vec4f,d3:vec4f };
struct GrassParams {
 anchor:vec2f,nearEnd:f32,midEnd:f32,
 farStart:f32,farEnd:f32,farWidth:f32,edgeSink:f32,
 nearWidth:f32,lowerFarWidth:f32,lowerFarEnd:f32,survivor:f32,
 windDir:vec2f,windSpeed:f32,gustPhase:f32,
 bandVelocity:vec2f,bandFreq:f32,bandSharp:f32,
 sunDir:vec3f,rim:f32,
 subsurface:f32,densityRef:f32,falloff:f32,thinning:f32,
 maskCenter:vec2f,maskRadiusSq:f32,maskEnable:f32,
 maskTileM:f32,maskKeepInside:f32,
 wedgeForward:vec2f,wedgeSide:vec2f,
 wedgeSlope:f32,wedgeBack:f32,wedgeFar:f32,wedgeEnable:f32,
 view:mat4x4f,
};
struct GrassVertex { world:vec3f,normal:vec3f,albedo:vec3f,lightWeights:vec2f };
`;

export const grassFunctions = {
  grassTier: `(record:GrassRecord,p:GrassParams)->i32 {
 let dist=length(p.anchor-record.d0.xy);
 // grassCoverage.ts owns this rule; bladeFieldLayer.ts's route pass and the
 // CPU tile sampler evaluate the same expression. Quantising to the residency
 // tile is what keeps the base field's hole and the focus field's coverage the
 // same shape, so no cell is drawn twice and none is left bare.
 let tileM=max(p.maskTileM,1e-6);
 let tileLow=floor(record.d0.xy/tileM)*tileM;
 let tileNearest=clamp(p.maskCenter,tileLow,tileLow+vec2f(tileM,tileM));
 let maskPoint=mix(record.d0.xy,tileNearest,vec2f(step(1e-6,p.maskTileM)));
 let delta=maskPoint-p.maskCenter;
 let covered=step(dot(delta,delta),p.maskRadiusSq);
 let mask=mix(1.0,mix(1.0-covered,covered,p.maskKeepInside),p.maskEnable);
 let wedgeDelta=record.d0.xy-p.anchor;
 let depth=dot(wedgeDelta,p.wedgeForward);
 let lateral=abs(dot(wedgeDelta,p.wedgeSide));
 let inside=step(-p.wedgeBack,depth)*step(depth,p.wedgeFar);
 let halfWidth=(depth+p.wedgeBack)*p.wedgeSlope+24.0;
 let wedge=mix(1.0,inside*step(lateral,halfWidth),p.wedgeEnable);
 let hash=fract(clamp(record.d2.z/16777215.0,0.0,1.0)*7.13);
 var survival=1.0;var farEnd=p.farEnd+1000000.0;
 if(p.thinning>0.0){survival=min(1.0,pow(p.densityRef/max(dist,0.001),p.falloff));farEnd=p.farEnd;}
 if(hash<survival*mask*wedge){
  if(dist<p.nearEnd){return 0;}
  if(dist<p.midEnd){return 1;}
  if(dist<farEnd){return 2;}
 }
 return -1;
}`,
  grassVertex: `(record:GrassRecord,local:vec3f,p:GrassParams,eye:vec3f,view:mat4x4f)->GrassVertex {
 let d0=record.d0;let d1=record.d1;let d2=record.d2;let d3=record.d3;
 var base=d0.xyz;
 let eyeDist=length(p.anchor-base.xy);
 let farSoft=smoothstep(p.farStart,p.farEnd,eyeDist);
 let shape=select(0.0,farSoft,p.survivor>0.0);
 let lowerBoost=smoothstep(p.midEnd,p.midEnd+0.001,eyeDist)*(1.0-smoothstep(p.midEnd,p.lowerFarEnd,eyeDist));
 let width=d1.x*mix(0.85,1.35,clamp(d2.w,0.0,1.0))*mix(p.nearWidth,1.0,farSoft)*mix(1.0,p.lowerFarWidth,lowerBoost)*mix(1.0,p.farWidth,shape);
 let clump=clamp(d2.w,0.0,1.0);
 let bladeSeed01=clamp(d2.z/16777215.0,0.0,1.0);
 let clumpSeed01=clamp(d2.y/16777215.0,0.0,1.0);
 let copy=local.z;let scatter=smoothstep(0.01,0.99,copy);
 let hashA=fract(bladeSeed01*7.13+copy*0.37+clumpSeed01*0.19);
 let hashB=fract(bladeSeed01*5.31+copy*0.61+clumpSeed01*0.43);
 let yaw=d2.x+(hashA-0.5)*0.72*scatter;
 let terrainNormal=normalize(vec3f(d3.xy,max(d3.z,0.08)));
 let forward=normalize(vec3f(cos(yaw),sin(yaw),0.0));
 let tangentForward=normalize(forward-terrainNormal*dot(forward,terrainNormal));
 let side=normalize(cross(tangentForward,terrainNormal));
 let angle=hashA*6.28318530718;let radius=mix(0.35,0.95,hashB)*scatter;
 base=base+side*cos(angle)*radius+tangentForward*sin(angle)*radius*0.72;
 let fadeEnd=clamp(max(eye.z-base.z,0.0)*1.2,4.5,16.0);
 let behind=smoothstep(0.5,-1.5,(view*vec4f(base,1.0)).z);
 var nearDissolve=1.0;var edgeSink=1.0;
 if(p.survivor>0.0){nearDissolve=smoothstep(fadeEnd*0.45,fadeEnd,length(eye-base));edgeSink=smoothstep(p.farEnd,p.edgeSink,eyeDist);}
 let nearFade=nearDissolve*behind;
 let transNear=mix(0.3,1.0,nearFade);
 let height=max(d1.y*mix(0.52,1.32,clump),0.16)*nearFade*mix(1.0,0.42,shape)*edgeSink;
 let bend=d1.z*mix(1.34,0.94,shape);
 let t=clamp(local.y,0.0,1.0);let u=1.0-t;let t2=t*t;let u2=u*u;
 let seconds=p.gustPhase/max(length(p.bandVelocity),0.001);
 let bandPoint=base.xy-p.bandVelocity*seconds;
 let windSide=vec2f(-p.windDir.y,p.windDir.x);
 let along=dot(bandPoint,p.windDir);let across=dot(bandPoint,windSide);
 let bandPhase=along*p.bandFreq+sin(across*0.045)*0.85+sin((along+across*0.55)*0.019)*0.3;
 let wave=sin(bandPhase);
 let peak=pow(smoothstep(0.05,1.0,wave),p.bandSharp);
 let trough=pow(smoothstep(0.05,1.0,-wave),1.2);
 let band=clamp(peak*1.8-trough*0.85,-0.8,1.8);
 let jitter=(hashA-0.5)*0.22+(clumpSeed01-0.5)*0.08;
 let windDir=normalize(vec3f(p.windDir.x*cos(jitter)-p.windDir.y*sin(jitter),p.windDir.x*sin(jitter)+p.windDir.y*cos(jitter),0.0));
 let heightProfile=log((max(height,0.015)+0.06)/0.06)*0.19523;
 let amplitude=heightProfile*max(p.windSpeed,0.0)*clamp(0.55+band*0.72,0.3,1.8)*0.018;
 let windWave=sin(d1.w+bandPhase*0.8+clumpSeed01*1.7-t*0.75);
 let offset=windDir*windWave*height*amplitude;
 let clumpBend=mix(0.76,1.18,clump);
 let p0=base;
 let p1=base+terrainNormal*height*0.28+tangentForward*bend*height*0.1;
 let p2=base+terrainNormal*height*0.7+tangentForward*bend*height*0.34*clumpBend+offset*0.56;
 let p3=base+terrainNormal*height+tangentForward*bend*height*0.62*clumpBend+offset;
 let center=p0*(u2*u)+p1*3.0*u2*t+p2*3.0*u*t2+p3*t2*t;
 let tangent=normalize((p1-p0)*3.0*u2+(p2-p1)*6.0*u*t+(p3-p2)*3.0*t2);
 let geoNormal=normalize(cross(side,tangent));
 let shoulder=mix(0.6,1.02,smoothstep(0.0,0.16,t));
 let bodyTaper=pow(1.0-t,mix(0.5,0.62,shape));
 let tipTaper=pow(1.0-smoothstep(0.78,1.0,t),mix(1.15,1.55,shape));
 let widthFactor=shoulder*bodyTaper*tipTaper;
 let cameraDir=normalize(eye-center);let viewSide=dot(cameraDir,side);
 let centerMask=min(pow(1.0-t,0.48)*pow(t+0.05,0.33),widthFactor*1.1);
 let viewBulk=pow(abs(viewSide),1.12)*centerMask*width*2.35;
 let bladeSide=local.x*2.0;
 let world=center+side*width*widthFactor*bladeSide+geoNormal*viewBulk*bladeSide;
 let normal=normalize(mix(geoNormal+side*viewSide*0.18,terrainNormal,0.94));
 let body=mix(mix(mix(mix(${rgb(MEADOW.blade.base)},${rgb(MEADOW.blade.low)},smoothstep(0.0,0.28,t)),${rgb(MEADOW.blade.mid)},smoothstep(0.18,0.54,t)),${rgb(MEADOW.blade.upper)},smoothstep(0.46,0.78,t)),${rgb(MEADOW.blade.tip)},smoothstep(0.72,1.0,t));
 let tipWeight=smoothstep(0.38,1.0,t);
 let dryTip=smoothstep(0.72,1.0,t)*${MEADOW.blade.dryTipMix};
 let heightAo=mix(0.5,1.0,clamp(pow(t,0.6),0.0,1.0));
 let clumpFactor=mix(0.92,1.08,clamp(d2.y,0.0,1.0));
 let bladeFactor=mix(0.94,1.04,fract(clamp(d2.z,0.0,1.0)*7.13));
 let shaded=mix(body,${rgb(MEADOW.blade.dry)},dryTip)*heightAo*mix(0.42,1.18,clump)*clumpFactor*bladeFactor*mix(0.92,0.72,shape);
 let flash=peak*smoothstep(0.58,1.0,t)*transNear*edgeSink*mix(1.0,0.5,shape);
 let desat=mix(shaded,vec3f(dot(shaded,vec3f(0.333))),smoothstep(18.0,42.0,eyeDist)*0.16);
 let sheen=mix(desat,${rgb(MEADOW.blade.sheen)},clamp(flash*0.5,0.0,0.58));
 let albedo=clamp(mix(sheen,${rgb(MEADOW.blade.ringMeadow)},farSoft*p.survivor),vec3f(0),vec3f(1));
 let falloff=1.0-smoothstep(p.nearEnd,p.midEnd,length(eye.xy-base.xy));
 return GrassVertex(world,normal,albedo,vec2f(tipWeight*heightAo*transNear*edgeSink*falloff,clamp(flash*0.24,0.0,0.22)));
}`,
  grassLinear: `(display:vec3f)->vec3f {
 return select(pow(display*0.9478672986+vec3f(0.0521327014),vec3f(2.4)),display*0.0773993808,display<=vec3f(0.04045));
}`,
  grassEmissive: `(normal:vec3f,world:vec3f,weights:vec2f,p:GrassParams,eye:vec3f)->vec3f {
 let viewDir=normalize(eye-world);let sun=normalize(p.sunDir);
 let backLight=clamp(dot(viewDir,-sun),0.0,1.0);
 let fresnel=pow(1.0-clamp(dot(normalize(normal),viewDir),0.0,1.0),4.2);
 let rim=smoothstep(0.05,0.85,backLight)*fresnel*weights.x*p.rim;
 let subsurface=pow(backLight,3.2)*pow(clamp(1.0-abs(dot(normalize(normal),sun)),0.0,1.0),2.2)*weights.x*p.subsurface;
 return grassLinear(${rgb(MEADOW.blade.trans)}*clamp(rim+subsurface,0.0,1.25))+grassLinear(${rgb(MEADOW.blade.sheen)}*weights.y);
}`,
};
export const grassRoutingWGSL = `fn grassTier${grassFunctions.grassTier}`;
export const grassVertexWGSL = ["grassVertex", "grassLinear", "grassEmissive"]
  .map((name) => `fn ${name}${grassFunctions[name as keyof typeof grassFunctions]}`)
  .join("\n");
