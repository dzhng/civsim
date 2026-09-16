import { TANGENT_FRAME_EPSILON_SQUARED } from "../../../../packages/soldier-assets/src/skin";
import { soldierFactionWGSL } from "./soldierFaction";
import { WORLD_CAMERA_WGSL } from "../../../../packages/renderer-core/src/cameraWgsl";

/** Authored properties/skinning match crowdLayer and soldierSurface. This does
 * not replace the common pose kernel; palette matrices are prepared once and
 * shared by beauty and shadow audiences. */
export const crowdDerivativeDiagnostic = `(uv:vec2f,n:vec3f)->vec4f {
  let normal=normalize(n);let d=max(abs(dpdx(normal)),abs(dpdy(normal)));
  return vec4f(dpdx(uv.x),dpdxFine(uv.x),dpdxCoarse(uv.x),max(max(d.x,d.y),d.z));
}`;
export const crowdQuadDiagnostic = `(uv:vec2f,n:vec3f)->vec4f {
  let normal=normalize(n);let d=max(abs(dpdx(normal)),abs(dpdy(normal)));
  return vec4f(uv.x,dpdx(uv.x),dpdy(uv.x),max(max(d.x,d.y),d.z));
}`;
export type SoldierDiagnostic = "geometry-normal" | "uv" | "derivatives" | "primitive" | "quad";
export function soldierShader(
  bones: number,
  environment: string,
  images: { baseColor: boolean; normal: boolean; orm: boolean },
  diagnostic?: SoldierDiagnostic,
  invariantPosition = true,
  depthOnly = false,
  receiveSunShadow = false,
): string {
  return `${WORLD_CAMERA_WGSL}
    ${environment}
    fn crowdDerivatives${crowdDerivativeDiagnostic}
    fn crowdQuad${crowdQuadDiagnostic}
    @group(1) @binding(0) var<storage,read> palette:array<mat4x4f>;
    @group(2) @binding(0) var materialTable:texture_2d<f32>;
    @group(2) @binding(1) var baseMap:texture_2d<f32>;
    @group(2) @binding(2) var baseSampler:sampler;
    @group(2) @binding(3) var normalMap:texture_2d<f32>;
    @group(2) @binding(4) var normalSampler:sampler;
    @group(2) @binding(5) var ormMap:texture_2d<f32>;
    @group(2) @binding(6) var ormSampler:sampler;
    fn unitDirection${soldierUnitDirectionWgsl}
    ${soldierFactionWGSL}
    struct VertexOut {
      @builtin(position) ${invariantPosition ? "@invariant" : ""} position:vec4f,
      @location(0) world:vec3f,@location(1) normal:vec3f,@location(2) tangent:vec3f,
      @location(3) uv:vec2f,@location(4) color:vec3f,
      @location(5) @interpolate(flat) material:u32,
      @location(6) factionMask:f32,@location(7) properties:vec3f,
      @location(8) @interpolate(flat) tangentSign:f32,
      @location(9) geometryNormalView:vec3f,
      ${diagnostic === "primitive" ? "@location(10) @interpolate(flat) vertexId:u32," : ""}
    };
    @vertex fn vertex(
      ${diagnostic === "primitive" ? "@builtin(vertex_index) vertexIndex:u32," : ""}
      @location(0) position:vec3f,@location(1) normal:vec3f,@location(2) color:vec4f,
      @location(3) joints:vec4f,@location(4) weights:vec4f,@location(5) uv:vec2f,
      @location(6) tangent:vec4f,@location(7) material:f32,@location(8) factionMask:f32,
      @location(9) inst0:vec4f,@location(10) inst1:vec4f,@location(11) inst2:vec4f,
    )->VertexOut {
${soldierVertexBodyWgsl(bones, diagnostic)}
    }
    ${
      depthOnly
        ? ""
        : `@fragment fn fragment(v:VertexOut,@builtin(front_facing) front:bool)->@location(0) vec4f {
${soldierSurfacePreludeWgsl(images)}      return ${diagnostic === "quad" ? "crowdQuad(v.uv,v.geometryNormalView)" : diagnostic === "primitive" ? "vec4f(f32(v.vertexId)+1.0,f32(v.material),v.uv)" : diagnostic === "derivatives" ? "crowdDerivatives(v.uv,v.geometryNormalView)" : diagnostic === "geometry-normal" ? "vec4f(normalize(v.geometryNormalView),geometryRoughnessFromView(v.geometryNormalView))" : diagnostic === "uv" ? "vec4f(v.uv,dpdx(v.uv.x),dpdy(v.uv.y))" : `shadeWorldSurface(clamp(albedo,vec3f(0),vec3f(1)),vec3f(0),properties.r*mix(1.0,orm.g,flags.b),geometryRoughnessFromView(v.geometryNormalView),properties.g*mix(1.0,orm.b,flags.b),mix(1.0,orm.r,flags.a*properties.b)*v.properties.z,n,v.world,${receiveSunShadow ? "sampleSunShadow(v.world,n,v.position.xy)" : "1.0"})`};
    }`
    }
  `;
}

export const soldierUnitDirectionWgsl = `(d:vec3f,fallback:vec3f)->vec3f {
      let largest=max(max(abs(d.x),abs(d.y)),abs(d.z));
      let bounded=d/max(largest,select(0.0,1.0,largest==0.0));
      return mix(fallback,bounded/sqrt(max(dot(bounded,bounded),${TANGENT_FRAME_EPSILON_SQUARED})),select(0.0,1.0,largest>0.0));
    }`;

export function soldierVertexBodyWgsl(bones: number, diagnostic?: SoldierDiagnostic) {
  return `      let start=u32(inst1.y)*${bones}u;
      // Exact-zero influences after the first add nothing; skip their palette loads.
      var skin=palette[start+u32(joints.x)]*weights.x;
      if(weights.y!=0.0){skin+=palette[start+u32(joints.y)]*weights.y;}
      if(weights.z!=0.0){skin+=palette[start+u32(joints.z)]*weights.z;}
      if(weights.w!=0.0){skin+=palette[start+u32(joints.w)]*weights.w;}
      let c0=skin[0];let c1=skin[1];let c2=skin[2];let c3=skin[3];
      let local=c0*position.x+c1*position.y+c2*position.z+c3;
      let n=normalize((c0*normal.x+c1*normal.y+c2*normal.z).xyz);
      let t=unitDirection((c0*tangent.x+c1*tangent.y+c2*tangent.z).xyz,vec3f(0));
      let angle=inst0.z-1.5707964;let co=cos(angle);let si=sin(angle);
      let p=local.xyz*inst1.x;
      let world=vec3f(inst0.x+p.x*co-p.y*si,inst0.y+p.x*si+p.y*co,p.z+inst2.x);
      let worldN=vec3f(n.x*co-n.y*si,n.x*si+n.y*co,n.z);
      let worldT=vec3f(t.x*co-t.y*si,t.x*si+t.y*co,t.z);
      let contact=mix(0.45,1.0,smoothstep(0.0,0.42,local.z));
      return VertexOut(projectWorld(world),world,worldN,worldT,uv,color.rgb,u32(material),factionMask,vec3f(inst0.w,inst2.z,mix(1.0,contact,1.0-inst2.z)),tangent.w,normalize((environment.worldToView*vec4f(worldN,0)).xyz)${diagnostic === "primitive" ? ",vertexIndex" : ""});`;
}

export function soldierSurfacePreludeWgsl(images: {
  baseColor: boolean;
  normal: boolean;
  orm: boolean;
}) {
  return `      let base=textureLoad(materialTable,vec2i(i32(v.material),0),0);
      let properties=textureLoad(materialTable,vec2i(i32(v.material),1),0);
      let flags=textureLoad(materialTable,vec2i(i32(v.material),2),0);
      let albedoMap=${images.baseColor ? "textureSample(baseMap,baseSampler,v.uv).rgb" : "vec3f(1)"};
      let orm=${images.orm ? "textureSample(ormMap,ormSampler,v.uv).rgb" : "vec3f(1)"};
      var n=normalize(v.normal);
      ${
        images.normal
          ? `
      // TSL dFdy lowers to -dpdy on WebGPU. Keep its face-fallback orientation.
      let face=unitDirection(cross(dpdx(v.world),-dpdy(v.world))*select(-1.0,1.0,front),vec3f(0,0,1));
      let normalUsable=dot(v.normal,v.normal)>${TANGENT_FRAME_EPSILON_SQUARED};
      n=mix(face,unitDirection(v.normal,face),select(0.0,1.0,normalUsable));
      let sourceT=unitDirection(v.tangent,vec3f(0));
      let projectedT=sourceT-n*dot(n,sourceT);
      let t=unitDirection(projectedT,vec3f(0));
      let decoded=textureSample(normalMap,normalSampler,v.uv).rgb*2.0-vec3f(1);
      let mapped=unitDirection(vec3f(decoded.xy*properties.a,decoded.z),vec3f(0,0,1));
      let result=unitDirection(t*mapped.x+cross(n,t)*v.tangentSign*mapped.y+n*mapped.z,n);
      n=mix(n,result,select(0.0,1.0,flags.g>0.0 && normalUsable && dot(v.tangent,v.tangent)>${TANGENT_FRAME_EPSILON_SQUARED} && dot(projectedT,projectedT)>${TANGENT_FRAME_EPSILON_SQUARED}));
      `
          : ""
      }
      var albedo=v.color*base.rgb*mix(vec3f(1),albedoMap,flags.r);
      albedo=mix(albedo,factionAccent(v.properties.x),clamp(v.factionMask,0.0,1.0));
      let corpse=v.properties.y;
      let lum=dot(albedo,vec3f(0.3,0.59,0.11));
      albedo=mix(albedo,vec3f(lum)*0.62+vec3f(0.06,0.04,0.03),corpse*0.7);
`;
}
