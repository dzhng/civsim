//! Seeded procedural battle maps. This module owns generated terrain truth:
//! given a recipe, it deterministically writes the four `Terrain` channels.

pub mod certify;
pub mod landform;

use crate::math::Vec2;
use crate::terrain::Terrain;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct MapRecipe {
    #[serde(default)]
    pub seed: u64,
    #[serde(default = "default_half_w")]
    pub half_w: f32,
    #[serde(default = "default_half_h")]
    pub half_h: f32,
    #[serde(default = "default_cell")]
    pub cell: f32,
    #[serde(default = "default_vista_extent")]
    pub vista_extent: f32,
}

impl Default for MapRecipe {
    fn default() -> Self {
        Self {
            seed: 0,
            half_w: default_half_w(),
            half_h: default_half_h(),
            cell: default_cell(),
            vista_extent: default_vista_extent(),
        }
    }
}

fn default_half_w() -> f32 {
    1200.0
}

fn default_half_h() -> f32 {
    800.0
}

fn default_cell() -> f32 {
    4.0
}

fn default_vista_extent() -> f32 {
    2.0
}

#[derive(Clone, Copy)]
struct CragCircle {
    center: Vec2,
    r2: f32,
    height: f32,
}

/// Pure recipe -> terrain. The heightfield is the highland-corridor landform;
/// speed/rough/tint are still the slice-01 writes, with crag-circle seals along
/// west/east until passability derives from slope in slice 03.
pub fn generate(recipe: &MapRecipe) -> Terrain {
    assert!(recipe.half_w > 0.0, "generated map half_w must be positive");
    assert!(recipe.half_h > 0.0, "generated map half_h must be positive");
    assert!(recipe.cell > 0.0, "generated map cell must be positive");
    let w = ((2.0 * recipe.half_w) / recipe.cell).round() as usize;
    let h = ((2.0 * recipe.half_h) / recipe.cell).round() as usize;
    let origin = Vec2::new(-recipe.half_w, -recipe.half_h);
    let mut t = Terrain::flat(w, h, recipe.cell, origin);
    let west = crag_wall(recipe, -1.0);
    let east = crag_wall(recipe, 1.0);

    for cy in 0..h {
        for cx in 0..w {
            let p = Vec2::new(
                origin.x + (cx as f32 + 0.5) * recipe.cell,
                origin.y + (cy as f32 + 0.5) * recipe.cell,
            );
            let i = cy * w + cx;
            let fine = landform::slice01_rough_noise(recipe.seed, p);
            t.height[i] = landform::height(recipe, p);
            t.rough[i] = 0.035 + fine * 0.08;
            t.speed[i] = 1.0;
            t.tint[i] = 0;

            let mut crag_height = 0.0;
            if crag_contains(&west, p, &mut crag_height)
                || crag_contains(&east, p, &mut crag_height)
            {
                t.speed[i] = 0.0;
                t.rough[i] = 0.0;
                t.tint[i] = 2;
                t.height[i] = t.height[i].max(crag_height);
            }
        }
    }

    debug_assert!(
        certify::has_deployment_corridor(&t),
        "generated map lacks south-north deployment corridor"
    );
    debug_assert!(
        certify::side_sealed_fraction(&t, certify::Side::West) > 0.9,
        "generated west edge is not sealed"
    );
    debug_assert!(
        certify::side_sealed_fraction(&t, certify::Side::East) > 0.9,
        "generated east edge is not sealed"
    );
    debug_assert!(
        certify::open_edge_fraction(&t, certify::Side::South) > 0.6,
        "generated south edge is not open"
    );
    debug_assert!(
        certify::open_edge_fraction(&t, certify::Side::North) > 0.6,
        "generated north edge is not open"
    );
    debug_assert!(
        certify::deployment_band_passable_fraction(&t, certify::Side::South) > 0.99,
        "generated south deployment band is not passable"
    );
    debug_assert!(
        certify::deployment_band_passable_fraction(&t, certify::Side::North) > 0.99,
        "generated north deployment band is not passable"
    );
    t
}

pub fn terrain_hash(t: &Terrain) -> u64 {
    let mut h = 0xcbf29ce484222325u64;
    fn mix(h: &mut u64, v: u32) {
        *h ^= v as u64;
        *h = h.wrapping_mul(0x100000001b3);
    }
    mix(&mut h, t.w as u32);
    mix(&mut h, t.h as u32);
    mix(&mut h, t.cell.to_bits());
    mix(&mut h, t.origin.x.to_bits());
    mix(&mut h, t.origin.y.to_bits());
    for &v in &t.height {
        mix(&mut h, v.to_bits());
    }
    for &v in &t.speed {
        mix(&mut h, v.to_bits());
    }
    for &v in &t.rough {
        mix(&mut h, v.to_bits());
    }
    for &v in &t.tint {
        mix(&mut h, v as u32);
    }
    h
}

fn crag_wall(recipe: &MapRecipe, side: f32) -> Vec<CragCircle> {
    let mut out = Vec::new();
    let start = (-(recipe.half_h / 30.0).ceil() as i32) - 2;
    let end = ((recipe.half_h / 30.0).ceil() as i32) + 2;
    let edge_x = side * (recipe.half_w + 5.0);
    for k in start..=end {
        let salt = if side < 0.0 { 0x11 } else { 0x33 };
        let y = k as f32 * 30.0;
        let j0 = hash01(k, recipe.seed ^ salt);
        let j1 = hash01(k, recipe.seed ^ salt ^ 0x9e37);
        let r = 42.0 + j0 * 34.0;
        out.push(CragCircle {
            center: Vec2::new(edge_x - side * j1 * 25.0, y),
            r2: r * r,
            height: 10.0 + hash01(k, recipe.seed ^ salt ^ 0xbeef) * 7.0,
        });
    }
    out
}

fn crag_contains(circles: &[CragCircle], p: Vec2, height: &mut f32) -> bool {
    let mut hit = false;
    for c in circles {
        let d = p - c.center;
        if d.x * d.x + d.y * d.y <= c.r2 {
            hit = true;
            *height = (*height).max(c.height);
        }
    }
    hit
}

fn hash01(i: i32, salt: u64) -> f32 {
    let mut x = (i as u64).wrapping_mul(0x9E3779B97F4A7C15) ^ salt.wrapping_mul(0xBF58476D1CE4E5B9);
    x ^= x >> 31;
    x = x.wrapping_mul(0x94D049BB133111EB);
    (x >> 40) as f32 / 16_777_216.0
}
