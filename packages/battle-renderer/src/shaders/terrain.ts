import { WORLD_CAMERA_WGSL } from "../../../renderer-core/src/cameraWgsl";
import { terrainMaterialFunctions, type TerrainMaterialOptions } from "./terrainMaterial";
import { terrainNoiseFunctions } from "./terrainNoise";

/** Shader entrypoints independent of GPU resource allocation. */
export function terrainShaders(
  environmentShader: string,
  options: TerrainMaterialOptions,
  mode: "beauty" | "material",
  invariantPosition: boolean,
  receiveSunShadow = false,
) {
  const common =
    WORLD_CAMERA_WGSL +
    environmentShader +
    Object.entries(terrainNoiseFunctions)
      .map(([name, body]) => `fn ${name}${body}`)
      .join("\n") +
    `
   struct TerrainState {farStrength:f32,shadow:f32,pad:vec2f};
   @group(1) @binding(0) var<uniform> terrainState:TerrainState;
   @group(1) @binding(1) var earthSdf:texture_2d<f32>;
   @group(1) @binding(2) var earthSampler:sampler;
   struct VertexOut {${invariantPosition ? "@invariant " : ""}@builtin(position) clip:vec4f,@location(0) position:vec3f,@location(1) normal:vec3f,@location(2) color:vec3f,@location(3) tint:f32,@location(4) water:f32,@location(5) viewNormalGeometry:vec3f};
  `;
  const shade =
    mode === "beauty"
      ? `shadeWorldSurface(surface.rgb,vec3f(0),surface.a,geometryRoughnessFromView(v.viewNormalGeometry),0.0,1.0,normalize(v.normal),v.position,terrainState.shadow${receiveSunShadow ? "*sampleSunShadow(v.position,normalize(v.normal),v.clip.xy)" : ""})`
      : "surface";
  const output =
    options.vistaBand === "farFog" && mode === "beauty"
      ? `let shaded=${shade};return vec4f(shaded.rgb,vistaOpacity(v.position,cam.eye));`
      : `return ${shade};`;
  const vistaOpacity = `fn vistaOpacity${vistaOpacityWgsl}`;
  return {
    ground:
      common +
      vistaOpacity +
      Object.entries(terrainMaterialFunctions(options))
        .map(([name, body]) => `fn ${name}${body}`)
        .join("\n") +
      `
   @vertex fn vertex(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) water:f32,@location(3) tint:f32,@location(4) color:vec3f)->VertexOut {return VertexOut(projectWorld(p),p,n,color,tint,water,normalize((environment.worldToView*vec4f(n,0)).xyz));}
   @fragment fn fragment(v:VertexOut)->@location(0) vec4f {
    let surface=terrainSurface(v.position,v.normal,v.color,v.tint,v.water,cam.time,cam.focus,terrainState.farStrength,earthSdf,earthSampler);
    ${output}
   }`,
    horizon:
      common +
      `
    @vertex fn vertex(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) color:vec3f)->VertexOut {return VertexOut(projectWorld(p),p,n,color,0,0,normalize((environment.worldToView*vec4f(n,0)).xyz));}
    @fragment fn fragment(v:VertexOut)->@location(0) vec4f {let surface=vec4f(terrainLinear(clamp(v.color,vec3f(0),vec3f(1))),0.92);return ${shade};}
   `,
  };
}

export const vistaOpacityWgsl = `(position:vec3f,eye:vec3f)->f32{return 1.0-smoothstep(-0.012,0.05,normalize(position-eye).z);}`;
