//! Seeded procedural battle maps. This module owns generated terrain truth:
//! given a recipe, it deterministically writes the four `Terrain` channels.

pub mod certify;
pub mod edges;
pub mod field_texture;
pub mod hydrology;
pub mod landform;
pub mod passability;

use crate::math::Vec2;
use crate::terrain::Terrain;
pub use contract::{MapRecipe, SlopeBands};

const RECIPE_CLASS_SALT: u64 = 0xb45a9;
const FULL_FEATURED_WEIGHT: u16 = 50;
const DRY_WEIGHT: u16 = 25;
const OPEN_PLAIN_WEIGHT: u16 = 25;

pub const VISTA_CELL_M: f32 = 16.0;
pub const FAR_FOG_CELL_M: f32 = 64.0;
pub const FAR_FOG_EXTENT: f32 = 3.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum RecipeClass {
    FullFeatured,
    Dry,
    OpenPlain,
}

impl RecipeClass {
    pub fn as_str(self) -> &'static str {
        match self {
            RecipeClass::FullFeatured => "full",
            RecipeClass::Dry => "dry",
            RecipeClass::OpenPlain => "plain",
        }
    }
}

pub fn recipe_class(recipe: &MapRecipe) -> RecipeClass {
    let total = FULL_FEATURED_WEIGHT
        .saturating_add(DRY_WEIGHT)
        .saturating_add(OPEN_PLAIN_WEIGHT);
    if total == 0 {
        return RecipeClass::FullFeatured;
    }
    // Salt 0xb45a9 keeps seed 7 in the full-featured bucket (roll 29/100),
    // preserving the curated Highland Vale golden while spreading 64 seeds
    // exactly 32 full / 16 dry / 16 plain under the default 50/25/25 weights.
    let roll = ((mix64(recipe.seed ^ RECIPE_CLASS_SALT) >> 32) % total as u64) as u16;
    if roll < FULL_FEATURED_WEIGHT {
        RecipeClass::FullFeatured
    } else if roll < FULL_FEATURED_WEIGHT.saturating_add(DRY_WEIGHT) {
        RecipeClass::Dry
    } else {
        RecipeClass::OpenPlain
    }
}

fn mix64(mut h: u64) -> u64 {
    h ^= h >> 30;
    h = h.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    h ^= h >> 27;
    h = h.wrapping_mul(0x94d0_49bb_1331_11eb);
    h ^ (h >> 31)
}

#[derive(Clone, Debug)]
pub struct VistaGrid {
    pub bands: Vec<VistaBand>,
}

#[derive(Clone, Debug)]
pub struct VistaBand {
    pub name: &'static str,
    pub w: usize,
    pub h: usize,
    /// Vertex-sample spacing in meters. Unlike `Terrain`, these are render
    /// vertex samples, so `origin` is the first sample position, not a cell
    /// corner. The grid is aligned so playable edge cell centers land exactly
    /// on vista samples.
    pub cell: f32,
    pub origin: Vec2,
    pub inner_half_w: f32,
    pub inner_half_h: f32,
    pub outer_half_w: f32,
    pub outer_half_h: f32,
    pub heights: Vec<f32>,
}

#[derive(Clone, Debug)]
pub struct VistaBandSpec {
    pub name: &'static str,
    pub w: usize,
    pub h: usize,
    pub cell: f32,
    pub origin: Vec2,
    pub inner_half_w: f32,
    pub inner_half_h: f32,
    pub outer_half_w: f32,
    pub outer_half_h: f32,
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
    let dry_corridor_path = certify::deployment_corridor_path(&t).unwrap_or_default();
    let drainage = hydrology::apply(recipe, &mut t, &dry_corridor_path);
    passability::derive(recipe, &mut t);
    passability::seal_isolated_passable_pockets(&mut t);
    hydrology::paint(&drainage, &mut t);
    field_texture::apply(recipe, &mut t);
    edges::apply(recipe, &mut t);
    if edges::needs_pocket_cleanup(recipe) {
        passability::seal_isolated_passable_pockets(&mut t);
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
    debug_assert!(
        certify::deployment_band_certificate(&t, certify::Side::South).meets_contract(),
        "generated south deployment band violates the battle deployment contract"
    );
    debug_assert!(
        certify::deployment_band_certificate(&t, certify::Side::North).meets_contract(),
        "generated north deployment band violates the battle deployment contract"
    );
    t
}

/// Render-only generated-map vista data: two aligned vertex-sample grids.
/// `vista` covers the 2x tile at 16 m; `farFog` covers the ~3.5x fog runway at
/// 64 m and cuts out the 2x tile in the renderer. Both are heights only and
/// stay out of `terrain_hash`.
pub fn generate_vista_grid(recipe: &MapRecipe) -> VistaGrid {
    assert!(recipe.half_w > 0.0, "generated map half_w must be positive");
    assert!(recipe.half_h > 0.0, "generated map half_h must be positive");
    assert!(recipe.cell > 0.0, "generated map cell must be positive");
    VistaGrid {
        bands: vista_band_specs(recipe)
            .into_iter()
            .enumerate()
            .map(|(index, spec)| generate_vista_band(recipe, spec, index > 0))
            .collect(),
    }
}

pub fn vista_band_specs(recipe: &MapRecipe) -> Vec<VistaBandSpec> {
    let vista_extent = recipe.vista_extent.max(1.0);
    vec![
        vista_band_spec(
            recipe,
            "vista",
            VISTA_CELL_M,
            recipe.half_w,
            recipe.half_h,
            recipe.half_w * vista_extent,
            recipe.half_h * vista_extent,
        ),
        vista_band_spec(
            recipe,
            "farFog",
            FAR_FOG_CELL_M,
            recipe.half_w * vista_extent,
            recipe.half_h * vista_extent,
            recipe.half_w * FAR_FOG_EXTENT,
            recipe.half_h * FAR_FOG_EXTENT,
        ),
    ]
}

fn vista_band_spec(
    recipe: &MapRecipe,
    name: &'static str,
    cell: f32,
    inner_half_w: f32,
    inner_half_h: f32,
    outer_half_w: f32,
    outer_half_h: f32,
) -> VistaBandSpec {
    let playable_min_x = -recipe.half_w;
    let playable_min_y = -recipe.half_h;
    let nx_before = ((playable_min_x - -outer_half_w) / cell).ceil().max(0.0) as usize;
    let ny_before = ((playable_min_y - -outer_half_h) / cell).ceil().max(0.0) as usize;
    let origin = Vec2::new(
        playable_min_x - nx_before as f32 * cell,
        playable_min_y - ny_before as f32 * cell,
    );
    let w = ((outer_half_w - origin.x) / cell).ceil().max(0.0) as usize + 1;
    let h = ((outer_half_h - origin.y) / cell).ceil().max(0.0) as usize + 1;
    VistaBandSpec {
        name,
        w,
        h,
        cell,
        origin,
        inner_half_w,
        inner_half_h,
        outer_half_w,
        outer_half_h,
    }
}

fn generate_vista_band(
    recipe: &MapRecipe,
    spec: VistaBandSpec,
    fully_band_limited: bool,
) -> VistaBand {
    let mut heights = vec![0.0; spec.w * spec.h];
    for cy in 0..spec.h {
        for cx in 0..spec.w {
            let p = Vec2::new(
                spec.origin.x + cx as f32 * spec.cell,
                spec.origin.y + cy as f32 * spec.cell,
            );
            let fine = landform::height(recipe, p);
            let limited = landform::height_band_limited(recipe, p, spec.cell * 2.0);
            let blend = if fully_band_limited {
                1.0
            } else {
                let outward = distance_outside_rect(p, recipe.half_w, recipe.half_h);
                smoothstep(0.0, spec.cell * 10.0, outward)
            };
            heights[cy * spec.w + cx] = fine + (limited - fine) * blend;
        }
    }
    VistaBand {
        name: spec.name,
        w: spec.w,
        h: spec.h,
        cell: spec.cell,
        origin: spec.origin,
        inner_half_w: spec.inner_half_w,
        inner_half_h: spec.inner_half_h,
        outer_half_w: spec.outer_half_w,
        outer_half_h: spec.outer_half_h,
        heights,
    }
}

fn distance_outside_rect(p: Vec2, half_w: f32, half_h: f32) -> f32 {
    let dx = (p.x.abs() - half_w).max(0.0);
    let dy = (p.y.abs() - half_h).max(0.0);
    dx.max(dy)
}

fn smoothstep(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

pub fn drainage_report(recipe: &MapRecipe) -> hydrology::DrainageReport {
    let mut t = Terrain::flat(
        ((2.0 * recipe.half_w) / recipe.cell).round() as usize,
        ((2.0 * recipe.half_h) / recipe.cell).round() as usize,
        recipe.cell,
        crate::math::Vec2::new(-recipe.half_w, -recipe.half_h),
    );
    for cy in 0..t.h {
        for cx in 0..t.w {
            let p = crate::math::Vec2::new(
                t.origin.x + (cx as f32 + 0.5) * recipe.cell,
                t.origin.y + (cy as f32 + 0.5) * recipe.cell,
            );
            t.height[cy * t.w + cx] = landform::height(recipe, p);
        }
    }
    passability::derive(recipe, &mut t);
    let dry_corridor_path = certify::deployment_corridor_path(&t).unwrap_or_default();
    let drainage = hydrology::apply(recipe, &mut t, &dry_corridor_path);
    passability::derive(recipe, &mut t);
    passability::seal_isolated_passable_pockets(&mut t);
    hydrology::paint(&drainage, &mut t);
    drainage.report(&t)
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
