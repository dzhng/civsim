import { fieldWaterResponseBody } from "../shaders/fieldWaterResponse";
import { tgpu, d } from "typegpu";
import { terrainNoiseFunctions as noise } from "../shaders/terrainNoise";
import { terrainMaterialFunctions, type TerrainMaterialOptions } from "../shaders/terrainMaterial";
export const terrainHash = tgpu.fn([d.vec2f], d.f32)(noise.terrainHash);
export const terrainNoise = tgpu.fn([d.vec2f], d.f32)(noise.terrainNoise).$uses({ terrainHash });
const terrainFbm = tgpu.fn([d.vec2f], d.f32)(noise.terrainFbm).$uses({ terrainNoise });
export const terrainRidge = tgpu.fn([d.vec2f], d.f32)(noise.terrainRidge).$uses({ terrainNoise });
const terrainWaterHash = tgpu.fn([d.vec2f], d.f32)(noise.terrainWaterHash);
export const terrainWaterNoise = tgpu
  .fn(
    [d.vec2f],
    d.f32,
  )(noise.terrainWaterNoise)
  .$uses({ terrainWaterHash });
export const terrainLinear = tgpu.fn([d.vec3f], d.vec3f)(noise.terrainLinear);
const FieldWaterResponse = d.struct({
  albedo: d.vec3f,
  foam: d.f32,
  roughness: d.f32,
  detail: d.f32,
});
export const fieldWaterResponse = tgpu
  .fn(
    [d.vec2f, d.f32, d.f32, d.f32],
    FieldWaterResponse,
  )(fieldWaterResponseBody)
  .$uses({ FieldWaterResponse, terrainWaterNoise, terrainLinear });
export function createTerrainSurface(options: TerrainMaterialOptions) {
  const bodies = terrainMaterialFunctions(options);
  const turfCanopy = tgpu.fn([d.f32, d.f32, d.f32], d.vec3f)(bodies.turfCanopy);
  return tgpu
    .fn(
      [
        d.vec3f,
        d.vec3f,
        d.vec3f,
        d.vec3f,
        d.f32,
        d.f32,
        d.vec2f,
        d.f32,
        d.texture2d(),
        d.sampler(),
        d.texture2d(),
        d.sampler(),
      ],
      d.vec4f,
    )(bodies.terrainSurface)
    .$uses({
      terrainHash,
      terrainFbm,
      terrainRidge,
      fieldWaterResponse,
      terrainLinear,
      turfCanopy,
    });
}
