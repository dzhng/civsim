// The production water field is a sum of directional gravity waves with deep-water
// dispersion (ω = √(gk)) and sharpened crests, evaluated in closed form with an
// analytic normal. No GPU resources, no compute, no per-frame upload.
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

/** One baked directional wave shared by every Gerstner-family water surface. */
interface GerstnerWave {
  dirX: number;
  dirY: number;
  /** metres */
  wavelength: number;
  /** metres */
  amplitude: number;
}

// The discretised ocean spectrum: deterministic (seeded), one source of truth
// for every Gerstner-family water surface.
export function bakeGerstnerWaves(): GerstnerWave[] {
  const rng = mulberry32(WAVE_SEED);
  const longL = 96;
  const shortL = 6.5; // down into fine chop so the big swells carry small-scale ripple
  const waves: GerstnerWave[] = [];
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
    // Quantise once so all consumers see identical waves.
    waves.push({
      dirX: Number(dx.toFixed(4)),
      dirY: Number(dy.toFixed(4)),
      wavelength: Number(wavelength.toFixed(2)),
      amplitude: Number(amp.toFixed(3)),
    });
  }
  return waves;
}
