import { tgpu, d } from "typegpu";
import { grassFunctions } from "../../src/shaders/grass";
export const GrassRecord = d.struct({ d0: d.vec4f, d1: d.vec4f, d2: d.vec4f, d3: d.vec4f });
export const GrassParams = d.struct({
  anchor: d.vec2f,
  nearEnd: d.f32,
  midEnd: d.f32,
  farStart: d.f32,
  farEnd: d.f32,
  farWidth: d.f32,
  edgeSink: d.f32,
  nearWidth: d.f32,
  lowerFarWidth: d.f32,
  lowerFarEnd: d.f32,
  survivor: d.f32,
  windDir: d.vec2f,
  windSpeed: d.f32,
  gustPhase: d.f32,
  bandVelocity: d.vec2f,
  bandFreq: d.f32,
  bandSharp: d.f32,
  sunDir: d.vec3f,
  rim: d.f32,
  subsurface: d.f32,
  densityRef: d.f32,
  falloff: d.f32,
  thinning: d.f32,
  maskCenter: d.vec2f,
  maskRadiusSq: d.f32,
  maskEnable: d.f32,
  wedgeForward: d.vec2f,
  wedgeSide: d.vec2f,
  wedgeSlope: d.f32,
  wedgeBack: d.f32,
  wedgeFar: d.f32,
  wedgeEnable: d.f32,
  view: d.mat4x4f,
});
const GrassVertex = d.struct({
  world: d.vec3f,
  normal: d.vec3f,
  albedo: d.vec3f,
  lightWeights: d.vec2f,
});
export const grassTier = tgpu
  .fn(
    [GrassRecord, GrassParams],
    d.i32,
  )(grassFunctions.grassTier)
  .$uses({ GrassRecord, GrassParams });
export const grassVertex = tgpu
  .fn(
    [GrassRecord, d.vec3f, GrassParams, d.vec3f, d.mat4x4f],
    GrassVertex,
  )(grassFunctions.grassVertex)
  .$uses({ GrassRecord, GrassParams, GrassVertex });
export const grassLinear = tgpu.fn([d.vec3f], d.vec3f)(grassFunctions.grassLinear);
export const grassEmissive = tgpu
  .fn(
    [d.vec3f, d.vec3f, d.vec2f, GrassParams, d.vec3f],
    d.vec3f,
  )(grassFunctions.grassEmissive)
  .$uses({ GrassParams, grassLinear });
