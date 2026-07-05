//! True-meter generated battle landforms.
//!
//! The field is authored over the full vista domain (`recipe.vista_extent`)
//! even though slice 02 samples only the playable center. East/west ridge masses
//! therefore have their feet inside the map and their bulk just beyond it.

use super::MapRecipe;
use crate::math::Vec2;

const CORRIDOR_HALF_W: f32 = 390.0;
const CORRIDOR_EDGE_W: f32 = 230.0;
const RIDGE_FOOT_X: f32 = 520.0;
const RIDGE_CREST_X: f32 = 1320.0;
const FLANK_DETAIL_MIN_M: f32 = 7.0;
const FLANK_DETAIL_MAX_M: f32 = 17.0;
const CORRIDOR_DETAIL_M: f32 = 5.0;
const APRON_FLATTEN: f32 = 0.36;

pub fn height(recipe: &MapRecipe, p: Vec2) -> f32 {
    let vista_half_w = recipe.half_w * recipe.vista_extent.max(1.0);
    let vista_half_h = recipe.half_h * recipe.vista_extent.max(1.0);
    let corridor = corridor_mask(recipe, p);
    let flank = smoothstep(RIDGE_FOOT_X, recipe.half_w * 0.92, p.x.abs());
    let apron = deployment_apron_mask(recipe, p.y);

    let warp = Vec2::new(
        fbm(recipe.seed ^ 0x6e43_9d21, p.x, p.y, 620.0, 3).value - 0.5,
        fbm(recipe.seed ^ 0x3a91_c2ef, p.x + 173.0, p.y - 97.0, 580.0, 3).value - 0.5,
    );
    let warped = Vec2::new(p.x + warp.x * 95.0, p.y + warp.y * 115.0);

    let broad = fbm(recipe.seed ^ 0x2081_9f4d, warped.x, warped.y, 420.0, 4);
    let mid = fbm(
        recipe.seed ^ 0xa9ef_0713,
        warped.x - 81.0,
        warped.y + 43.0,
        205.0,
        3,
    );
    let fine = fbm(
        recipe.seed ^ 0x55d1_40af,
        warped.x + 29.0,
        warped.y - 151.0,
        92.0,
        2,
    );

    let detail_slope2 =
        broad.dx * broad.dx + broad.dy * broad.dy + mid.dx * mid.dx + mid.dy * mid.dy;
    let slope_damped = 1.0 / (1.0 + detail_slope2 * 26_000.0);
    let corridor_amp = CORRIDOR_DETAIL_M * mix(1.0, APRON_FLATTEN, apron * corridor);
    let flank_amp = mix(FLANK_DETAIL_MIN_M, FLANK_DETAIL_MAX_M, flank);
    let detail_amp = mix(corridor_amp, flank_amp, flank);
    let rolling =
        ((broad.value - 0.5) * 1.25 + (mid.value - 0.5) * 0.85 + (fine.value - 0.5) * 0.35)
            * detail_amp
            * slope_damped;

    let south_rise = low_oval(p.x, p.y + 645.0, 360.0, 190.0) * 6.6;
    let north_swell = low_oval(p.x - 115.0, p.y - 360.0, 470.0, 260.0) * 4.1;
    let central_basin = low_oval(p.x + 155.0, p.y - 25.0, 430.0, 310.0) * -4.6;
    let corridor_grade = (p.y / vista_half_h).clamp(-1.0, 1.0) * 2.2;
    let floor = (rolling + south_rise + north_swell + central_basin + corridor_grade)
        * mix(1.0, 0.58, apron * corridor);

    let side = if p.x < 0.0 { -1.0 } else { 1.0 };
    let side_seed = if side < 0.0 { 0xb48d_6129 } else { 0x7f23_a8cb };
    let crest_t = smoothstep(RIDGE_FOOT_X, RIDGE_CREST_X, p.x.abs());
    let vista_side_t = (p.x.abs() / vista_half_w).clamp(0.0, 1.0);
    let ridge_domain_x = side * (p.x.abs() - recipe.half_w * 0.72);
    let ridge_noise = fbm(
        recipe.seed ^ side_seed,
        ridge_domain_x + warp.x * 160.0,
        p.y + warp.y * 180.0,
        250.0,
        4,
    );
    let ridge_core = ridged(ridge_noise.value);
    let ridge_strata = ridged(value_noise(
        recipe.seed ^ side_seed ^ 0x9c2b_7f91,
        ridge_domain_x * 1.7,
        p.y + ridge_noise.value * 190.0,
        150.0,
    ));
    let edge_mass = 46.0 + 34.0 * ridge_core + 20.0 * ridge_strata + 12.0 * vista_side_t;
    let ridge = edge_mass * crest_t * (0.72 + 0.28 * flank);

    let spur_noise = fbm(
        recipe.seed ^ side_seed ^ 0xdb4f_0f35,
        p.x * 0.82 + side * 211.0,
        p.y,
        330.0,
        3,
    );
    let spur_gate = smoothstep(0.54, 0.86, ridged(spur_noise.value)) * flank * 0.62;
    let spur = spur_gate * (18.0 + 16.0 * ridged(mid.value));

    (floor * corridor + rolling * (1.0 - corridor) + ridge + spur).max(-8.0)
}

pub fn slice01_rough_noise(seed: u64, p: Vec2) -> f32 {
    value_noise(seed ^ 0xd1b5_4a32, p.x + 37.0, p.y - 19.0, 72.0)
}

fn corridor_mask(recipe: &MapRecipe, p: Vec2) -> f32 {
    let width_noise = value_noise(recipe.seed ^ 0xce17_44a9, 0.0, p.y, 520.0) - 0.5;
    let half = CORRIDOR_HALF_W + width_noise * 70.0;
    1.0 - smoothstep(half, half + CORRIDOR_EDGE_W, p.x.abs())
}

fn deployment_apron_mask(recipe: &MapRecipe, y: f32) -> f32 {
    let apron_y = recipe.half_h * 0.75;
    let south = 1.0 - smootherstep(0.0, 390.0, (y + apron_y).abs());
    let north = 1.0 - smootherstep(0.0, 390.0, (y - apron_y).abs());
    south.max(north)
}

fn low_oval(x: f32, y: f32, rx: f32, ry: f32) -> f32 {
    let d2 = (x / rx) * (x / rx) + (y / ry) * (y / ry);
    1.0 - smoothstep(0.25, 1.0, d2)
}

#[derive(Clone, Copy)]
struct Sample {
    value: f32,
    dx: f32,
    dy: f32,
}

fn fbm(seed: u64, x: f32, y: f32, scale: f32, octaves: usize) -> Sample {
    let mut value = 0.0;
    let mut dx = 0.0;
    let mut dy = 0.0;
    let mut amp = 0.56;
    let mut freq = 1.0;
    let mut norm = 0.0;
    for o in 0..octaves {
        let s = value_noise_deriv(
            seed ^ ((o as u64).wrapping_mul(0x9e37_79b9)),
            x,
            y,
            scale / freq,
        );
        value += s.value * amp;
        dx += s.dx * amp;
        dy += s.dy * amp;
        norm += amp;
        amp *= 0.52;
        freq *= 2.03;
    }
    Sample {
        value: value / norm,
        dx: dx / norm,
        dy: dy / norm,
    }
}

fn value_noise_deriv(seed: u64, x: f32, y: f32, scale: f32) -> Sample {
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
    Sample {
        value: top + (bot - top) * sy,
        dx: ((b - a) * (1.0 - sy) + (d - c) * sy) * dsx,
        dy: (bot - top) * dsy,
    }
}

fn value_noise(seed: u64, x: f32, y: f32, scale: f32) -> f32 {
    value_noise_deriv(seed, x, y, scale).value
}

fn ridged(v: f32) -> f32 {
    let r = 1.0 - (v * 2.0 - 1.0).abs();
    r * r
}

fn mix(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t.clamp(0.0, 1.0)
}

fn smoothstep(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    smooth(t)
}

fn smooth(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

fn smootherstep(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

fn smooth_deriv(t: f32) -> f32 {
    6.0 * t * (1.0 - t)
}

fn hash_cell01(x: i32, y: i32, seed: u64) -> f32 {
    let mut h = (x as u64).wrapping_mul(0x9E3779B97F4A7C15)
        ^ (y as u64).wrapping_mul(0xBF58476D1CE4E5B9)
        ^ seed.wrapping_mul(0x94D049BB133111EB);
    h ^= h >> 31;
    h = h.wrapping_mul(0xD1B54A32D192ED03);
    h ^= h >> 27;
    (h >> 40) as f32 / 16_777_216.0
}
