//! Seeded procedural battle maps. This module owns generated terrain truth:
//! given a recipe, it deterministically writes the four `Terrain` channels.

pub mod certify;
pub mod landform;
pub mod passability;

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
    #[serde(default)]
    pub slope_bands: SlopeBands,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlopeBands {
    pub flat_max: f32,
    pub rolling_max: f32,
    pub slow_min: f32,
    pub cliff_min: f32,
    pub cliff_dilate_cells: u16,
    pub highland_cap_min_m: f32,
}

impl Default for SlopeBands {
    fn default() -> Self {
        Self {
            flat_max: 0.035,
            rolling_max: 0.115,
            slow_min: 0.135,
            cliff_min: 0.32,
            cliff_dilate_cells: 6,
            highland_cap_min_m: 35.0,
        }
    }
}

impl Default for MapRecipe {
    fn default() -> Self {
        Self {
            seed: 0,
            half_w: default_half_w(),
            half_h: default_half_h(),
            cell: default_cell(),
            vista_extent: default_vista_extent(),
            slope_bands: SlopeBands::default(),
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

/// Pure recipe -> terrain. The heightfield is the highland-corridor landform;
/// speed/rough/tint are derived from that same true-meter surface.
pub fn generate(recipe: &MapRecipe) -> Terrain {
    assert!(recipe.half_w > 0.0, "generated map half_w must be positive");
    assert!(recipe.half_h > 0.0, "generated map half_h must be positive");
    assert!(recipe.cell > 0.0, "generated map cell must be positive");
    let w = ((2.0 * recipe.half_w) / recipe.cell).round() as usize;
    let h = ((2.0 * recipe.half_h) / recipe.cell).round() as usize;
    let origin = crate::math::Vec2::new(-recipe.half_w, -recipe.half_h);
    let mut t = Terrain::flat(w, h, recipe.cell, origin);

    for cy in 0..h {
        for cx in 0..w {
            let p = crate::math::Vec2::new(
                origin.x + (cx as f32 + 0.5) * recipe.cell,
                origin.y + (cy as f32 + 0.5) * recipe.cell,
            );
            let i = cy * w + cx;
            t.height[i] = landform::height(recipe, p);
        }
    }
    passability::derive(recipe, &mut t);

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
