import { tgpu, d } from "typegpu";
import {
  soldierUnitDirectionWgsl,
  soldierVertexBodyWgsl,
  soldierSurfacePreludeWgsl,
} from "../../src/shaders/soldier";
import { linearAlbedoWgsl, factionAccentWgsl } from "../../src/shaders/soldierFaction";
import { typegpuCameraLayout } from "./camera";
import { environmentLayout, type TypegpuEnvironment } from "./environment";
import { typegpuPaletteLayout } from "./posePalette";
export const SoldierVertex = d.struct({
  position: d.vec4f,
  world: d.vec3f,
  normal: d.vec3f,
  tangent: d.vec3f,
  uv: d.vec2f,
  color: d.vec3f,
  material: d.u32,
  factionMask: d.f32,
  properties: d.vec3f,
  tangentSign: d.f32,
  geometryNormalView: d.vec3f,
});
export const materialLayout = tgpu
  .bindGroupLayout({
    materialTable: { texture: d.texture2d(d.f32), sampleType: "unfilterable-float" },
    baseMap: { texture: d.texture2d() },
    baseSampler: { sampler: "filtering" },
    normalMap: { texture: d.texture2d() },
    normalSampler: { sampler: "filtering" },
    ormMap: { texture: d.texture2d() },
    ormSampler: { sampler: "filtering" },
  })
  .$idx(2);
const unitDirection = tgpu.fn([d.vec3f, d.vec3f], d.vec3f)(soldierUnitDirectionWgsl);
const linearAlbedo = tgpu.fn([d.vec3f], d.vec3f)(linearAlbedoWgsl);
const factionAccent = tgpu.fn([d.f32], d.vec3f)(factionAccentWgsl).$uses({ linearAlbedo });
export function crowdVertexAlgorithm(bones: number) {
  const projectWorld = tgpu
    .fn(
      [d.vec3f],
      d.vec4f,
    )(`(world:vec3f)->vec4f{return cam.viewProj*vec4f(world,1);}`)
    .$uses({
      get cam() {
        return typegpuCameraLayout.$.cam;
      },
    });
  return tgpu
    .fn(
      [
        d.vec3f,
        d.vec3f,
        d.vec4f,
        d.vec4f,
        d.vec4f,
        d.vec2f,
        d.vec4f,
        d.f32,
        d.f32,
        d.vec4f,
        d.vec4f,
        d.vec4f,
      ],
      SoldierVertex,
    )(
      `(position:vec3f,normal:vec3f,color:vec4f,joints:vec4f,weights:vec4f,uv:vec2f,tangent:vec4f,material:f32,factionMask:f32,inst0:vec4f,inst1:vec4f,inst2:vec4f)->VertexOut{${soldierVertexBodyWgsl(bones)}}`,
    )
    .$uses({
      VertexOut: SoldierVertex,
      get palette() {
        return typegpuPaletteLayout.$.palette;
      },
      get environment() {
        return environmentLayout.$.data;
      },
      projectWorld,
      unitDirection,
    });
}
export function crowdFragmentAlgorithm(
  images: { baseColor: boolean; normal: boolean; orm: boolean },
  env: TypegpuEnvironment,
) {
  const shadeWorldSurface = tgpu.fn(
    [d.vec3f, d.vec3f, d.f32, d.f32, d.f32, d.f32, d.vec3f, d.vec3f, d.f32],
    d.vec4f,
  )((base, emissive, rough, geom, metal, ao, n, p, shadow) => {
    "use gpu";
    return env.shade(
      base,
      emissive,
      rough,
      geom,
      metal,
      ao,
      n,
      p,
      shadow,
      typegpuCameraLayout.$.cam.eye,
    );
  });
  return tgpu
    .fn(
      [SoldierVertex, d.bool],
      d.vec4f,
    )(
      `(v:VertexOut,front:bool)->vec4f{${soldierSurfacePreludeWgsl(images)}return shadeWorldSurface(clamp(albedo,vec3f(0),vec3f(1)),vec3f(0),properties.r*mix(1.0,orm.g,flags.b),geometryRoughnessFromView(v.geometryNormalView),properties.g*mix(1.0,orm.b,flags.b),mix(1.0,orm.r,flags.a*properties.b)*v.properties.z,n,v.world,1.0);}`,
    )
    .$uses({
      VertexOut: SoldierVertex,
      get materialTable() {
        return materialLayout.$.materialTable;
      },
      get baseMap() {
        return materialLayout.$.baseMap;
      },
      get baseSampler() {
        return materialLayout.$.baseSampler;
      },
      get normalMap() {
        return materialLayout.$.normalMap;
      },
      get normalSampler() {
        return materialLayout.$.normalSampler;
      },
      get ormMap() {
        return materialLayout.$.ormMap;
      },
      get ormSampler() {
        return materialLayout.$.ormSampler;
      },
      unitDirection,
      factionAccent,
      shadeWorldSurface,
      geometryRoughnessFromView: env.geometryRoughnessFromView,
    });
}
