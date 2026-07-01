import type { WaterFieldId, WaterFieldSource, WaterFieldStats } from './waterField';

// Candidate A — analytic Gerstner-style ocean, and (per the Slice 1 bake-off) the
// production water field. A sum of many directional gravity waves with deep-water
// dispersion (ω = √(gk)) and sharpened crests, evaluated in closed form with an
// analytic normal. No GPU resources, no compute, no per-frame upload:
// `bindGroupLayout()`/`bindGroup()` are null and `ensureFrame` is a no-op.
//
// The wave set is a discretised ocean spectrum baked once on the CPU: wavelengths
// log-spaced from long swell to short chop, amplitudes falling with wavelength,
// and directions stratified around the full circle with jitter. The many spread
// directions are what keep the open sea reading as an irregular, isotropic swell
// instead of a single raked "corduroy" grain — the failure mode of a handful of
// aligned Gerstner waves. Deterministic (seeded) so snapshots stay stable.

const WAVE_COUNT = 20;
const WAVE_SEED = 0x5eed_a1;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// vec4(dirX, dirY, wavelength m, amplitude m) per wave, as a WGSL array literal.
function bakeWaveArray(): string {
  const rng = mulberry32(WAVE_SEED);
  const longL = 96;
  const shortL = 6.5; // down into fine chop so the big swells carry small-scale ripple
  const rows: string[] = [];
  for (let i = 0; i < WAVE_COUNT; i++) {
    const t = i / (WAVE_COUNT - 1);
    const wavelength = longL * (shortL / longL) ** t * (0.85 + 0.3 * rng());
    // Stratified direction: one wave per equal arc, jittered — even coverage of
    // the full circle without the clustering random sampling would give.
    const angle = 2 * Math.PI * ((i + 0.5 * rng()) / WAVE_COUNT);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // Longer waves carry more amplitude (a red spectrum); jittered so no single
    // train dominates the grain.
    const amp = 2.7 * (wavelength / longL) ** 0.7 * (0.7 + 0.6 * rng());
    rows.push(`vec4f(${dx.toFixed(4)}, ${dy.toFixed(4)}, ${wavelength.toFixed(2)}, ${amp.toFixed(3)})`);
  }
  return `array<vec4f, ${WAVE_COUNT}>(\n    ${rows.join(',\n    ')}\n  )`;
}

function gerstnerWgsl(): string {
  return `
struct WaterSample { height: f32, normal: vec3f, foam: f32 };

const WATER_WAVES = ${bakeWaveArray()};

fn fhash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
fn fnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fhash(i), fhash(i + vec2f(1.0, 0.0)), u.x),
             mix(fhash(i + vec2f(0.0, 1.0)), fhash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn waterField(p: vec2f, t: f32) -> WaterSample {
  var waves = WATER_WAVES;
  let g = 9.81;
  var h = 0.0;
  var slopeX = 0.0;
  var slopeY = 0.0;
  for (var i = 0; i < ${WAVE_COUNT}; i = i + 1) {
    let wv = waves[i];
    let dir = wv.xy;
    let k = 6.2831853 / wv.z;             // angular wavenumber from wavelength
    let amp = wv.w;
    let w = sqrt(g * k);                  // deep-water dispersion
    // Per-wave phase offset so the trains don't all align at the world origin
    // (which otherwise focuses into a standing rosette in the middle of the view).
    let ph0 = fract(sin(f32(i) * 127.1 + wv.z * 3.71) * 43758.5453) * 6.2831853;
    let phase = dot(dir, p) * k - w * t * 0.42 + ph0;
    let s = sin(phase);
    let c = cos(phase);
    let hump = s * 0.5 + 0.5;             // 0..1 wave profile
    let sharp = pow(hump, 2.0);           // narrow peaks, wide flat troughs (trochoidal read)
    h = h + amp * (sharp - 0.333);
    let dHump = pow(hump, 1.0) * c;       // d(sharp)/d(phase)
    let dphase = amp * 2.0 * dHump * k;
    slopeX = slopeX + dphase * dir.x;
    slopeY = slopeY + dphase * dir.y;
  }
  var out: WaterSample;
  out.height = h;
  out.normal = normalize(vec3f(-slopeX, -slopeY, 1.0));
  // Whitecaps cap the crest TOPS — keyed on height (a scalar, so the foam is
  // isotropic blobs, not the radial streaks a slope-face signal makes under this
  // foreshortened camera). Two octaves of fine grain break the caps into dense
  // granular spray rather than flat white or hard slivers.
  let cover = smoothstep(1.3, 3.1, h);
  // Speckle: foam appears only where a three-octave noise is high, so the crest
  // caps break into granular spray instead of solid white regions. The finest
  // octave keeps the near-foreground patches from clumping into opaque blobs.
  let speckle = fnoise(p * 0.5 + vec2f(t * 0.10, t * 0.05)) * 0.42
              + fnoise(p * 1.3 - vec2f(t * 0.06, t * 0.09)) * 0.34
              + fnoise(p * 3.0 + vec2f(t * 0.04, -t * 0.07)) * 0.24;
  out.foam = cover * smoothstep(0.42, 0.66, speckle) * 0.9;
  return out;
}`;
}

// The analytic field WGSL: the `WaterSample` struct + `waterField(p, t)` + its noise
// helpers. Exported so the per-fragment field-water material (fieldWaterWgsl) can
// inline it directly — field water is always analytic Gerstner (a per-fragment pass
// cannot bind a compute-IFFT field), so it needs the WGSL, not the seam.
export const GERSTNER_WGSL = gerstnerWgsl();

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
