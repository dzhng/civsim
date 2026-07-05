//! True-meter generated battle landforms.
//!
//! The field is authored over the full vista domain (`recipe.vista_extent`)
//! even though slice 02 samples only the playable center. East/west ridge masses
//! therefore have their feet inside the map and their bulk just beyond it.

use super::{MapRecipe, RecipeClass, FAR_FOG_EXTENT};
use crate::math::Vec2;

const CORRIDOR_HALF_W: f32 = 390.0;
const CORRIDOR_EDGE_W: f32 = 230.0;
const RIDGE_FOOT_X: f32 = 520.0;
const RIDGE_CREST_X: f32 = 1320.0;
const FLANK_DETAIL_MIN_M: f32 = 7.0;
const FLANK_DETAIL_MAX_M: f32 = 17.0;
const CORRIDOR_DETAIL_M: f32 = 5.0;
const APRON_FLATTEN: f32 = 0.36;
const RIDGE_BASE_M: f32 = 112.0;
const RIDGE_CORE_M: f32 = 92.0;
const RIDGE_STRATA_M: f32 = 54.0;
const RIDGE_SIDE_LIFT_M: f32 = 30.0;
const RIDGE_OUTER_SCALE: f32 = 0.78;
const FAR_RIDGE_BASE_M: f32 = 25.0;
const FAR_RIDGE_ROWS_M: f32 = 40.0;

pub fn height(recipe: &MapRecipe, p: Vec2) -> f32 {
    height_with_min_wavelength(recipe, p, 0.0)
}

/// Same landform, sampled with detail below the requested wavelength faded out.
/// Vista grids use this as a sampling-level budget so coarse meshes do not
/// alias high-frequency terrain that the playable 4 m grid can represent.
pub fn height_band_limited(recipe: &MapRecipe, p: Vec2, min_wavelength_m: f32) -> f32 {
    height_with_min_wavelength(recipe, p, min_wavelength_m.max(0.0))
}

fn height_with_min_wavelength(recipe: &MapRecipe, p: Vec2, min_wavelength_m: f32) -> f32 {
    let recipe_class = super::recipe_class(recipe);
    let vista_half_w = recipe.half_w * recipe.vista_extent.max(1.0);
    let vista_half_h = recipe.half_h * recipe.vista_extent.max(1.0);
    let corridor = corridor_mask(recipe, p);
    let flank = smoothstep(RIDGE_FOOT_X, recipe.half_w * 0.92, p.x.abs());
    let apron = deployment_apron_mask(recipe, p.y);

    let warp = Vec2::new(
        fbm_detail(
            recipe.seed ^ 0x6e43_9d21,
            p.x,
            p.y,
            620.0,
            3,
            min_wavelength_m,
        )
        .value
            - 0.5,
        fbm_detail(
            recipe.seed ^ 0x3a91_c2ef,
            p.x + 173.0,
            p.y - 97.0,
            580.0,
            3,
            min_wavelength_m,
        )
        .value
            - 0.5,
    );
    let warped = Vec2::new(p.x + warp.x * 95.0, p.y + warp.y * 115.0);

    let broad = fbm_detail(
        recipe.seed ^ 0x2081_9f4d,
        warped.x,
        warped.y,
        420.0,
        4,
        min_wavelength_m,
    );
    let mid = fbm_detail(
        recipe.seed ^ 0xa9ef_0713,
        warped.x - 81.0,
        warped.y + 43.0,
        205.0,
        3,
        min_wavelength_m,
    );
    let fine = fbm_detail(
        recipe.seed ^ 0x55d1_40af,
        warped.x + 29.0,
        warped.y - 151.0,
        92.0,
        2,
        min_wavelength_m,
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
    let mut hydro_basin = hydrology_basin(recipe, p, apron);
    if matches!(recipe_class, RecipeClass::OpenPlain) {
        hydro_basin *= 0.12;
    }
    let corridor_grade = (p.y / vista_half_h).clamp(-1.0, 1.0) * 2.2;
    let mut floor =
        (rolling + south_rise + north_swell + central_basin + hydro_basin + corridor_grade)
            * mix(1.0, 0.58, apron * corridor);
    let mut open_rolling = rolling;
    if matches!(recipe_class, RecipeClass::OpenPlain) {
        floor *= 0.48;
        open_rolling *= mix(0.42, 1.0, flank);
    }

    let side = if p.x < 0.0 { -1.0 } else { 1.0 };
    let side_seed = if side < 0.0 { 0xb48d_6129 } else { 0x7f23_a8cb };
    let crest_t = smoothstep(RIDGE_FOOT_X, RIDGE_CREST_X, p.x.abs());
    let vista_side_t = (p.x.abs() / vista_half_w).clamp(0.0, 1.0);
    let ridge_domain_x = side * (p.x.abs() - recipe.half_w * 0.72);
    let ridge_noise = fbm_detail(
        recipe.seed ^ side_seed,
        ridge_domain_x + warp.x * 160.0,
        p.y + warp.y * 180.0,
        250.0,
        4,
        min_wavelength_m,
    );
    let ridge_core = ridged(ridge_noise.value);
    let ridge_strata = ridged(value_noise(
        recipe.seed ^ side_seed ^ 0x9c2b_7f91,
        ridge_domain_x * 1.7,
        p.y + ridge_noise.value * 190.0,
        150.0,
    ));
    let edge_mass = RIDGE_BASE_M
        + RIDGE_CORE_M * ridge_core
        + RIDGE_STRATA_M * ridge_strata
        + RIDGE_SIDE_LIFT_M * vista_side_t;
    let ridge_sharpness = crest_t * crest_t * (0.62 + 0.38 * flank);
    let ridge_outer_t = smoothstep(recipe.half_w * 0.65, vista_half_w, p.x.abs());
    let ridge_outer_scale = mix(1.0, RIDGE_OUTER_SCALE, ridge_outer_t);
    let ridge = edge_mass * ridge_sharpness * ridge_outer_scale;

    let beyond_vista_t = smoothstep(
        recipe.half_w * recipe.vista_extent.max(1.0),
        recipe.half_w * FAR_FOG_EXTENT,
        p.x.abs(),
    );
    let far_row_noise = fbm_detail(
        recipe.seed ^ side_seed ^ 0xf067_6b21,
        p.x * 0.42 + side * 911.0,
        p.y * 0.78,
        720.0,
        3,
        min_wavelength_m,
    );
    let far_rows = beyond_vista_t
        * (FAR_RIDGE_BASE_M + FAR_RIDGE_ROWS_M * ridged(far_row_noise.value))
        * (0.72 + 0.28 * ridged(ridge_strata));

    let spur_noise = fbm_detail(
        recipe.seed ^ side_seed ^ 0xdb4f_0f35,
        p.x * 0.82 + side * 211.0,
        p.y,
        330.0,
        3,
        min_wavelength_m,
    );
    let spur_gate = smoothstep(0.54, 0.86, ridged(spur_noise.value)) * flank * 0.62;
    let spur = spur_gate * (18.0 + 16.0 * ridged(mid.value));

    (floor * corridor + open_rolling * (1.0 - corridor) + ridge + spur + far_rows).max(-8.0)
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

fn hydrology_basin(recipe: &MapRecipe, p: Vec2, apron: f32) -> f32 {
    let transition_band =
        smoothstep(230.0, 310.0, p.x.abs()) * (1.0 - smoothstep(560.0, 700.0, p.x.abs()));
    let apron_gate = 1.0 - apron;
    let mut basin = 0.0;
    for k in 0..3 {
        let side = if hash_cell01(k * 19 + 3, 0, recipe.seed ^ 0x42df_ba51) < 0.5 {
            -1.0
        } else {
            1.0
        };
        let cx_j = hash_cell01(k * 29 + 7, 1, recipe.seed ^ 0x42df_ba51) - 0.5;
        let cy_j = hash_cell01(k * 31 + 11, 2, recipe.seed ^ 0x42df_ba51) - 0.5;
        let depth_j = hash_cell01(k * 37 + 13, 3, recipe.seed ^ 0x42df_ba51);
        let center_x = side * (330.0 + cx_j * 130.0);
        let center_y = -330.0 + k as f32 * 330.0 + cy_j * 130.0;
        let rx = 150.0 + depth_j * 55.0;
        let ry = 185.0 + (1.0 - depth_j) * 65.0;
        let depth = 6.4 + depth_j * 3.2;
        basin -= low_oval(p.x - center_x, p.y - center_y, rx, ry) * depth;
    }
    basin * transition_band * apron_gate
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

fn fbm_detail(
    seed: u64,
    x: f32,
    y: f32,
    scale: f32,
    octaves: usize,
    min_wavelength_m: f32,
) -> Sample {
    let mut value = 0.0;
    let mut dx = 0.0;
    let mut dy = 0.0;
    let mut amp = 0.56;
    let mut freq = 1.0;
    let mut norm = 0.0;
    for o in 0..octaves {
        let wavelength = scale / freq;
        let detail_weight = if min_wavelength_m <= 0.0 {
            1.0
        } else {
            smoothstep(min_wavelength_m, min_wavelength_m * 2.0, wavelength)
        };
        if detail_weight <= 0.0 {
            amp *= 0.52;
            freq *= 2.03;
            continue;
        }
        let s = value_noise_deriv(
            seed ^ ((o as u64).wrapping_mul(0x9e37_79b9)),
            x,
            y,
            scale / freq,
        );
        let weighted_amp = amp * detail_weight;
        value += s.value * weighted_amp;
        dx += s.dx * weighted_amp;
        dy += s.dy * weighted_amp;
        norm += weighted_amp;
        amp *= 0.52;
        freq *= 2.03;
    }
    if norm <= 0.0 {
        return Sample {
            value: 0.5,
            dx: 0.0,
            dy: 0.0,
        };
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
