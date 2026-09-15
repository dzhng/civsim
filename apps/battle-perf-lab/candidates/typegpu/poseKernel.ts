import { tgpu, d } from "typegpu";
import {
  posePaletteHelpers as h,
  posePaletteBodyWgsl,
} from "../../../../packages/renderer-core/src/posePaletteWgsl";
const Local = d.struct({ t: d.vec3f, q: d.vec4f, s: d.vec3f });
const V = d.ptrStorage(d.arrayOf(d.vec4f, 0));
const U = d.ptrStorage(d.arrayOf(d.u32, 0));
const paletteSin = tgpu.fn([d.f32], d.f32)(h.paletteSin);
const paletteSlerp = tgpu
  .fn(
    [d.vec4f, d.vec4f, d.f32],
    d.vec4f,
  )(h.paletteSlerp)
  .$uses({ paletteSin });
const paletteBlend = tgpu
  .fn(
    [Local, Local, d.f32],
    Local,
  )(h.paletteBlend)
  .$uses({ PaletteLocal: Local, paletteSlerp });
const paletteRead = tgpu.fn([V, d.u32], Local)(h.paletteRead).$uses({ PaletteLocal: Local });
const paletteSnapshot = tgpu
  .fn(
    [V, V, d.u32, d.u32, d.u32],
    Local,
  )(h.paletteSnapshot)
  .$uses({ PaletteLocal: Local, paletteRead });
const paletteSample = tgpu
  .fn(
    [V, U, d.vec4u, d.u32, d.u32, d.u32],
    Local,
  )(h.paletteSample)
  .$uses({ PaletteLocal: Local, paletteRead, paletteBlend });
const paletteTrs = tgpu.fn([Local], d.mat4x4f)(h.paletteTrs).$uses({ PaletteLocal: Local });
export function typegpuPoseKernel(bones: number) {
  return tgpu
    .fn(
      [
        V,
        U,
        d.ptrStorage(d.arrayOf(d.mat4x4f, 0)),
        d.ptrStorage(d.arrayOf(d.vec4u, 0)),
        V,
        V,
        d.ptrStorage(d.arrayOf(d.mat4x4f, 0), "read-write"),
        d.u32,
        d.u32,
        d.u32,
      ],
      d.u32,
    )(posePaletteBodyWgsl(bones))
    .$uses({ PaletteLocal: Local, paletteSnapshot, paletteSample, paletteBlend, paletteTrs });
}
