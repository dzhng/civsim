import { tgpu, d } from "typegpu";
import { terrainNoiseFunctions as noise } from "../../src/shaders/terrainNoise";
import {
  terrainMaterialFunctions,
  type TerrainMaterialOptions,
} from "../../src/shaders/terrainMaterial";
const terrainHash = tgpu.fn([d.vec2f], d.f32)(noise.terrainHash);
const terrainNoise = tgpu.fn([d.vec2f], d.f32)(noise.terrainNoise).$uses({ terrainHash });
const terrainFbm = tgpu.fn([d.vec2f], d.f32)(noise.terrainFbm).$uses({ terrainNoise });
const terrainRidge = tgpu.fn([d.vec2f], d.f32)(noise.terrainRidge).$uses({ terrainNoise });
const terrainWaterHash = tgpu.fn([d.vec2f], d.f32)(noise.terrainWaterHash);
export const terrainWaterNoise = tgpu
  .fn(
    [d.vec2f],
    d.f32,
  )(noise.terrainWaterNoise)
  .$uses({ terrainWaterHash });
export const terrainLinear = tgpu.fn([d.vec3f], d.vec3f)(noise.terrainLinear);
export function createTerrainSurface(options: TerrainMaterialOptions) {
  const bodies = terrainMaterialFunctions(options);
  const turfCanopy = tgpu.fn([d.f32, d.f32, d.f32], d.vec3f)(bodies.turfCanopy);
  return tgpu
    .fn(
      [d.vec3f, d.vec3f, d.vec3f, d.f32, d.f32, d.f32, d.vec2f, d.f32, d.texture2d(), d.sampler()],
      d.vec4f,
    )(bodies.terrainSurface)
    .$uses({ terrainHash, terrainFbm, terrainRidge, terrainWaterNoise, terrainLinear, turfCanopy });
}
