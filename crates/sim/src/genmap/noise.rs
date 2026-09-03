#[derive(Clone, Copy)]
pub(super) struct NoiseSample {
    pub value: f32,
    pub dx: f32,
    pub dy: f32,
}

pub(super) fn mix64(mut h: u64) -> u64 {
    h ^= h >> 30;
    h = h.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    h ^= h >> 27;
    h = h.wrapping_mul(0x94d0_49bb_1331_11eb);
    h ^ (h >> 31)
}

pub(super) fn hash01(seed: u64) -> f32 {
    ((mix64(seed) >> 40) as f32) / 16_777_216.0
}

pub(super) fn hash_cell01(x: i32, y: i32, seed: u64) -> f32 {
    let mut h = (x as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ (y as u64).wrapping_mul(0xBF58_476D_1CE4_E5B9)
        ^ seed.wrapping_mul(0x94D0_49BB_1331_11EB);
    h ^= h >> 31;
    h = h.wrapping_mul(0xD1B5_4A32_D192_ED03);
    h ^= h >> 27;
    (h >> 40) as f32 / 16_777_216.0
}

pub(super) fn smoothstep(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    smooth(t)
}

pub(super) fn value_noise_nearest(seed: u64, x: f32, y: f32, scale: f32) -> f32 {
    let gx = (x / scale).floor() as i32;
    let gy = (y / scale).floor() as i32;
    hash_cell01(gx, gy, seed)
}

pub(super) fn value_noise_bilinear(seed: u64, x: f32, y: f32, scale: f32) -> f32 {
    value_noise_bilinear_deriv(seed, x, y, scale).value
}

pub(super) fn value_noise_bilinear_deriv(seed: u64, x: f32, y: f32, scale: f32) -> NoiseSample {
    let gx = x / scale;
    let gy = y / scale;
    let x0 = gx.floor() as i32;
    let y0 = gy.floor() as i32;
    let fx = gx - x0 as f32;
    let fy = gy - y0 as f32;
    let sx = smooth(fx);
    let sy = smooth(fy);
    let dsx = smooth_deriv(fx) / scale;
    let dsy = smooth_deriv(fy) / scale;
    let a = hash_cell01(x0, y0, seed);
    let b = hash_cell01(x0 + 1, y0, seed);
    let c = hash_cell01(x0, y0 + 1, seed);
    let d = hash_cell01(x0 + 1, y0 + 1, seed);
    let top = a + (b - a) * sx;
    let bot = c + (d - c) * sx;
    NoiseSample {
        value: top + (bot - top) * sy,
        dx: ((b - a) * (1.0 - sy) + (d - c) * sy) * dsx,
        dy: (bot - top) * dsy,
    }
}

fn smooth(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

fn smooth_deriv(t: f32) -> f32 {
    6.0 * t * (1.0 - t)
}
