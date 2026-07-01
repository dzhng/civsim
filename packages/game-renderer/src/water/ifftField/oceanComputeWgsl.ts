// The GPU half of candidate B: evolve the baked Phillips spectrum by the
// dispersion relation, then inverse-FFT it into a height texture. Three compute
// entry points run in order each frame inside one compute pass:
//
//   update  — htilde(k,t) = h0(k)·e^{iωt} + conj(h0(-k))·e^{-iωt}   (ω = √(g|k|))
//   fftRow  — 1D inverse FFT of every row of the spectrum (in place)
//   fftCol  — 1D inverse FFT of every column, then write the real, recentred,
//             normalised spatial height to the output texture
//
// The 1D FFT is a textbook shared-memory radix-2 Cooley–Tukey: one workgroup per
// line, one thread per element, bit-reversal into a scratch array, then log2(N)
// butterfly stages with a workgroup barrier between each. `WG` (= N) is an
// override constant so the same module serves any power-of-two resolution.

export const OCEAN_COMPUTE_MAX_N = 256;

export function oceanComputeWgsl(): string {
  return `
struct OceanParams { n: u32, logN: u32, time: f32, patchSize: f32 };
@group(0) @binding(0) var<uniform> params: OceanParams;
@group(0) @binding(1) var<storage, read> h0: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> spectrum: array<vec2f>;
@group(0) @binding(3) var oceanOut: texture_storage_2d<rgba16float, write>;

const PI: f32 = 3.14159265359;
const G: f32 = 9.81;
const MAX_N: u32 = ${OCEAN_COMPUTE_MAX_N}u;

override WG: u32 = 128u;

var<workgroup> scratchA: array<vec2f, MAX_N>;
var<workgroup> scratchB: array<vec2f, MAX_N>;

fn cmul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn bitrev(i: u32, bits: u32) -> u32 {
  var x = i;
  var r = 0u;
  for (var b = 0u; b < bits; b = b + 1u) {
    r = (r << 1u) | (x & 1u);
    x = x >> 1u;
  }
  return r;
}

// Inverse FFT (positive twiddle sign, unnormalised) of scratchA[0..n] into
// scratchB[0..n]. Caller fills scratchA, then reads scratchB[lid].
fn fftShared(lid: u32, n: u32, logN: u32) {
  scratchB[bitrev(lid, logN)] = scratchA[lid];
  workgroupBarrier();
  for (var s = 1u; s <= logN; s = s + 1u) {
    let m = 1u << s;
    let half = m >> 1u;
    let k = lid % m;
    if (k < half) {
      let angle = 2.0 * PI * f32(k) / f32(m);    // inverse transform → +sign
      let w = vec2f(cos(angle), sin(angle));
      let a = scratchB[lid];
      let b = cmul(w, scratchB[lid + half]);
      scratchB[lid] = a + b;
      scratchB[lid + half] = a - b;
    }
    workgroupBarrier();
  }
}

@compute @workgroup_size(16, 16)
fn update(@builtin(global_invocation_id) gid: vec3u) {
  let n = params.n;
  if (gid.x >= n || gid.y >= n) { return; }
  let idx = gid.y * n + gid.x;
  let kx = 2.0 * PI * (f32(gid.x) - f32(n) * 0.5) / params.patchSize;
  let ky = 2.0 * PI * (f32(gid.y) - f32(n) * 0.5) / params.patchSize;
  let km = max(1e-4, sqrt(kx * kx + ky * ky));
  let w = sqrt(G * km);
  let theta = w * params.time;
  let c = cos(theta);
  let s = sin(theta);
  let cell = h0[idx];
  spectrum[idx] = cmul(cell.xy, vec2f(c, s)) + cmul(cell.zw, vec2f(c, -s));
}

@compute @workgroup_size(WG)
fn fftRow(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid3: vec3u) {
  let n = params.n;
  let lid = lid3.x;
  let row = wg.x;
  scratchA[lid] = spectrum[row * n + lid];
  workgroupBarrier();
  fftShared(lid, n, params.logN);
  spectrum[row * n + lid] = scratchB[lid];
}

@compute @workgroup_size(WG)
fn fftCol(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid3: vec3u) {
  let n = params.n;
  let lid = lid3.x;            // row index within the column
  let col = wg.x;
  scratchA[lid] = spectrum[lid * n + col];
  workgroupBarrier();
  fftShared(lid, n, params.logN);
  // Real part, recentred by (-1)^(x+y), normalised by 1/N² for the 2D inverse.
  let recenter = select(1.0, -1.0, ((col + lid) & 1u) == 1u);
  let h = scratchB[lid].x * recenter / f32(n * n);
  textureStore(oceanOut, vec2u(col, lid), vec4f(h, 0.0, 0.0, 0.0));
}
`;
}
