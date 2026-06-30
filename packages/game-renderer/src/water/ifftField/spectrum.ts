// Candidate B init — the JONSWAP/Phillips ocean spectrum h0(k), baked once on
// the CPU and uploaded to a storage buffer. Each per-frame compute pass evolves
// this static spectrum by the dispersion relation and inverse-FFTs it into a
// height field, so the random phase/amplitude structure is fixed here and the
// motion is added on the GPU.
//
// We use Tessendorf's Phillips spectrum (the standard ocean h0): a windy,
// direction-biased gravity-wave distribution. h0(k) = (1/√2)(ξr + iξi)√P(k) with
// ξ ~ N(0,1). For each cell we store both h0(k) and conj(h0(-k)) so the GPU
// update is a single read.

export interface OceanSpectrumParams {
  /** Grid resolution per side (power of two). */
  n: number;
  /** Physical tile size in metres (the field repeats every `patch`). */
  patch: number;
  /** Wind speed (m/s) — sets the dominant wavelength via L = V²/g. */
  windSpeed: number;
  /** Wind direction (radians), the dominant wave-travel bearing. */
  windAngle: number;
  /** Overall amplitude of the spectrum. */
  amplitude: number;
  /** Small-wavelength cutoff (metres) suppressing sub-`cutoff` chop. */
  cutoff: number;
  /** Deterministic seed for the Gaussian phases. */
  seed: number;
}

export const DEFAULT_OCEAN_SPECTRUM: OceanSpectrumParams = {
  n: 128,
  patch: 220,
  windSpeed: 14,
  windAngle: 0.6,
  amplitude: 2.6e-3,
  cutoff: 1.4,
  seed: 0x0cea0001,
};

const GRAVITY = 9.81;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard-normal sample via Box–Muller from a uniform PRNG. */
function gaussian(rng: () => number): number {
  const u = Math.max(1e-7, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function phillips(kx: number, ky: number, p: OceanSpectrumParams): number {
  const k2 = kx * kx + ky * ky;
  if (k2 < 1e-12) return 0;
  const k4 = k2 * k2;
  const l = (p.windSpeed * p.windSpeed) / GRAVITY; // largest wave from this wind
  const wx = Math.cos(p.windAngle);
  const wy = Math.sin(p.windAngle);
  const kDotW = (kx * wx + ky * wy) / Math.sqrt(k2);
  // Softened directional weighting: a dominant swell bearing plus a broad spread
  // so the open sea reads as choppy, not corduroy (a fair candidate, not a
  // strawman — pure |k̂·ŵ|² over-aligns every wave at this distant camera).
  const directional = 0.32 + 0.68 * kDotW * kDotW;
  const damp = Math.exp(-k2 * p.cutoff * p.cutoff); // kill the smallest ripples
  return p.amplitude * (Math.exp(-1 / (k2 * l * l)) / k4) * directional * damp;
}

/** h0 and conj(h0(-k)) interleaved as vec4 per cell, row-major: [h0.re, h0.im,
 *  h0conj.re, h0conj.im]. The GPU update reads exactly this layout. */
export function bakeOceanSpectrum(p: OceanSpectrumParams = DEFAULT_OCEAN_SPECTRUM): Float32Array {
  const { n, patch } = p;
  const rng = mulberry32(p.seed);
  // First pass: independent h0 per cell so we can read h0(-k) by symmetry.
  const h0 = new Float32Array(n * n * 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const kx = (2 * Math.PI * (x - n / 2)) / patch;
      const ky = (2 * Math.PI * (y - n / 2)) / patch;
      const root = Math.sqrt(phillips(kx, ky, p) / 2);
      const i = (y * n + x) * 2;
      h0[i] = gaussian(rng) * root;
      h0[i + 1] = gaussian(rng) * root;
    }
  }
  // Second pass: pack h0 with conj(h0(-k)).
  const out = new Float32Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const mx = (n - x) % n;
      const my = (n - y) % n;
      const o = (y * n + x) * 4;
      const a = (y * n + x) * 2;
      const b = (my * n + mx) * 2;
      out[o] = h0[a];
      out[o + 1] = h0[a + 1];
      out[o + 2] = h0[b]; // conj(h0(-k)).re =  h0(-k).re
      out[o + 3] = -h0[b + 1]; // conj(h0(-k)).im = -h0(-k).im
    }
  }
  return out;
}
