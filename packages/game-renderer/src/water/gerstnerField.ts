import type { WaterFieldId, WaterFieldSource, WaterFieldStats } from './waterField';

// Candidate A — analytic Gerstner-style ocean. A sum of directional gravity
// waves with deep-water dispersion (ω = √(gk)), sharpened crests, and an
// analytic normal/foam derived in closed form. No GPU resources, no compute, no
// per-frame upload: `bindGroupLayout()`/`bindGroup()` are null and `ensureFrame`
// is a no-op. This is the perf floor and the capability/weak-GPU fallback the
// IFFT route degrades to.
//
// Each octave rotates direction and ~doubles spatial frequency while amplitude
// falls geometrically — a coarse JONSWAP-shaped spectrum sampled at a handful of
// bands, which at the distant 2.5D ortho camera is the whole visible story.

const GERSTNER_WGSL = `
struct WaterSample { height: f32, normal: vec3f, foam: f32 };

const WATER_WAVE_COUNT: i32 = 8;

fn waterField(p: vec2f, t: f32) -> WaterSample {
  var h = 0.0;
  var slopeX = 0.0;
  var slopeY = 0.0;
  var crest = 0.0;
  var amp = 0.58;
  var freq = 0.042;                      // base spatial frequency (cycles / metre)
  var dir = normalize(vec2f(0.86, 0.50));
  let g = 9.81;
  var ampSum = 0.0001;
  for (var i = 0; i < WATER_WAVE_COUNT; i = i + 1) {
    let k = freq * 6.2831853;            // angular wavenumber
    let w = sqrt(g * k);                 // deep-water dispersion
    let phase = dot(dir, p) * k - w * t * 0.42;
    let s = sin(phase);
    let c = cos(phase);
    let hump = s * 0.5 + 0.5;            // 0..1 wave profile
    let sharp = pow(hump, 1.7);          // sharpen toward Gerstner-like peaks
    h = h + amp * (sharp - 0.34);
    // d(sharp)/d(phase) = 1.7 * hump^0.7 * 0.5 * c
    let dHump = 0.85 * pow(hump, 0.7) * c;
    let dphase = amp * 1.7 * dHump * k;
    slopeX = slopeX + dphase * dir.x;
    slopeY = slopeY + dphase * dir.y;
    crest = crest + max(0.0, c) * amp * (freq / 0.042) * 0.25;
    ampSum = ampSum + amp;
    amp = amp * 0.62;
    freq = freq * 1.92;
    dir = vec2f(dir.x * 0.62 - dir.y * 0.78, dir.x * 0.78 + dir.y * 0.62); // rotate ~51.5°
  }
  var out: WaterSample;
  out.height = h;
  out.normal = normalize(vec3f(-slopeX, -slopeY, 1.0));
  out.foam = clamp(crest / ampSum * 1.5 - 0.62, 0.0, 1.0);
  return out;
}`;

export class GerstnerWaterField implements WaterFieldSource {
  readonly id: WaterFieldId = 'gerstner';

  constructor(private readonly fallbackFor: WaterFieldId | null = null) {}

  wgslSample(): string {
    return GERSTNER_WGSL;
  }

  bindGroupLayout(): GPUBindGroupLayout | null {
    return null;
  }

  ensureFrame(): void {
    // analytic — nothing to dispatch.
  }

  bindGroup(): GPUBindGroup | null {
    return null;
  }

  stats(): WaterFieldStats {
    return { id: this.id, fieldResolution: 1, storageBytes: 0, fallbackFor: this.fallbackFor };
  }

  destroy(): void {
    // no GPU resources.
  }
}
