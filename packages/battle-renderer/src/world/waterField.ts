import { tgpu, d, std } from "typegpu";
import { waterFieldBody } from "../shaders/waterField";
import { terrainWaterNoise } from "./terrainFunctions";
import { TERRAIN_WATER_BLEND } from "../../../game-renderer/src/water/waterShoreRamp";
import {
  FIELD_WATER_NORMAL_STRENGTH,
  FIELD_WATER_NORMAL_DETAIL_FAR,
} from "../../../game-renderer/src/water/photorealWaterPolicy";
import {
  LAKE_NORMAL_DETAIL_FADE_START,
  LAKE_NORMAL_DETAIL_FADE_END,
} from "../../../game-renderer/src/water/physicalWaterPolicy";

const WaterField = d.struct({ height: d.f32, normal: d.vec3f, foam: d.f32 });
export const waterField = tgpu
  .fn(
    [d.vec2f, d.f32],
    WaterField,
  )(`(p:vec2f,t:f32)->WaterField{${waterFieldBody()}}`)
  .$uses({ WaterField, terrainWaterNoise });

/** Field water keeps fixed geometry; only wet lighting normals join the shared waves. */
export const fieldWaterNormal = tgpu.fn(
  [d.vec3f, d.f32, d.vec3f, d.f32],
  d.vec3f,
)((ground, coverage, wave, viewDistance) => {
  "use gpu";
  if (coverage <= TERRAIN_WATER_BLEND[0]) return d.vec3f(ground);
  const blend = std.smoothstep(TERRAIN_WATER_BLEND[0], TERRAIN_WATER_BLEND[1], coverage);
  const detail = std.smoothstep(
    LAKE_NORMAL_DETAIL_FADE_START,
    LAKE_NORMAL_DETAIL_FADE_END,
    viewDistance,
  );
  const strength = std.mix(FIELD_WATER_NORMAL_STRENGTH, FIELD_WATER_NORMAL_DETAIL_FAR, detail);
  const wet = std.normalize(std.mix(d.vec3f(0, 0, 1), wave, strength * blend * blend));
  return std.normalize(std.mix(ground, wet, blend));
});
