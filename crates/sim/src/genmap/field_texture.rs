//! Seeded passable field texture inside the generated battle corridor.
//!
//! Edge seals explain impassable borders; this pass only adds passable
//! mid-field ground cover. It skips the deployment frontage and never writes
//! speed 0, so the certificate owner remains `certify`.

use super::{
    noise::{hash01, hash_cell01, value_noise_nearest},
    MapRecipe, RecipeClass,
};
use crate::terrain::Terrain;
pub use contract::FieldTextureRecipe;
use serde::{Deserialize, Serialize};

const TINT_GRASS: u8 = 0;
const TINT_WATER: u8 = 1;
const TINT_ROCK: u8 = 2;
const TINT_FOREST: u8 = 4;
const TINT_MUD: u8 = 5;
const TINT_SCREE: u8 = 6;

const CORRIDOR_TEXTURE_HALF_W: f32 = 430.0;
const DEPLOYMENT_CLEAN_HALF_W: f32 = 390.0;
const DEPLOYMENT_CLEAN_HALF_H: f32 = 78.0;
const PATCH_EDGE_JITTER_D2: f32 = 0.14;
const PATCH_EDGE_DITHER_BAND_D2: f32 = 0.10;

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldTextureSummary {
    pub passable_forest_cells: usize,
    pub scree_cells: usize,
    pub mud_cells: usize,
    pub rough_field_cells: usize,
}

pub fn apply(recipe: &MapRecipe, t: &mut Terrain) {
    let texture = field_texture_recipe(recipe);
    paint_family(recipe, t, FieldKind::Rough, texture.rough_fields);
    paint_family(recipe, t, FieldKind::Mud, texture.mud_lowlands);
    paint_family(recipe, t, FieldKind::Scree, texture.scree_patches);
    paint_family(recipe, t, FieldKind::Forest, texture.forest_clumps);
}

fn field_texture_recipe(recipe: &MapRecipe) -> FieldTextureRecipe {
    let mut texture = recipe.field_texture;
    if matches!(super::recipe_class(recipe), RecipeClass::OpenPlain) {
        texture.forest_clumps = 0;
        texture.scree_patches = 0;
        texture.mud_lowlands = 0;
        texture.rough_fields = texture.rough_fields.min(4);
    }
    texture
}

pub fn summary(t: &Terrain) -> FieldTextureSummary {
    let mut out = FieldTextureSummary::default();
    for i in 0..t.w * t.h {
        if t.speed[i] <= 0.0 {
            continue;
        }
        match t.tint[i] {
            TINT_FOREST => out.passable_forest_cells += 1,
            TINT_MUD => out.mud_cells += 1,
            TINT_SCREE => out.scree_cells += 1,
            TINT_GRASS if t.rough[i] >= 0.18 => out.rough_field_cells += 1,
            _ => {}
        }
    }
    out
}

#[derive(Clone, Copy)]
enum FieldKind {
    Forest,
    Scree,
    Mud,
    Rough,
}

impl FieldKind {
    fn salt(self) -> u64 {
        match self {
            FieldKind::Forest => 0xf071_57ed,
            FieldKind::Scree => 0x5c7e_e123,
            FieldKind::Mud => 0x0d10_1aad,
            FieldKind::Rough => 0x70f1_133d,
        }
    }

    fn radius(self, seed: u64, index: u8) -> (f32, f32) {
        let a = hash01(seed ^ self.salt() ^ (index as u64).wrapping_mul(0xa511_e9b3));
        let b = hash01(seed ^ self.salt() ^ (index as u64).wrapping_mul(0xc2b2_ae35));
        match self {
            FieldKind::Forest => (42.0 + a * 42.0, 34.0 + b * 34.0),
            FieldKind::Scree => (38.0 + a * 58.0, 24.0 + b * 38.0),
            FieldKind::Mud => (48.0 + a * 55.0, 34.0 + b * 44.0),
            FieldKind::Rough => (62.0 + a * 72.0, 42.0 + b * 56.0),
        }
    }

    fn paint_cell(self, t: &mut Terrain, i: usize, strength: f32) {
        match self {
            FieldKind::Forest => {
                t.speed[i] = t.speed[i].min(0.84 + 0.06 * (1.0 - strength));
                t.rough[i] = t.rough[i].max(0.20 + 0.10 * strength);
                t.tint[i] = TINT_FOREST;
            }
            FieldKind::Scree => {
                t.speed[i] = t.speed[i].min(0.72 + 0.10 * (1.0 - strength));
                t.rough[i] = t.rough[i].max(0.22 + 0.14 * strength);
                t.tint[i] = TINT_SCREE;
            }
            FieldKind::Mud => {
                t.speed[i] = t.speed[i].min(0.62 + 0.12 * (1.0 - strength));
                t.rough[i] = t.rough[i].max(0.18 + 0.14 * strength);
                t.tint[i] = TINT_MUD;
            }
            FieldKind::Rough => {
                t.speed[i] = t.speed[i].min(0.90 + 0.06 * (1.0 - strength));
                t.rough[i] = t.rough[i].max(0.18 + 0.10 * strength);
            }
        }
    }
}

fn paint_family(recipe: &MapRecipe, t: &mut Terrain, kind: FieldKind, count: u8) {
    for n in 0..count {
        let center = center_for(recipe, kind, n, count);
        let (rx, ry) = kind.radius(recipe.seed, n);
        let jitter_seed = recipe.seed ^ kind.salt() ^ (n as u64).wrapping_mul(0x9e37_79b9);
        paint_patch(recipe, t, kind, center.0, center.1, rx, ry, jitter_seed);
    }
}

fn center_for(recipe: &MapRecipe, kind: FieldKind, index: u8, count: u8) -> (f32, f32) {
    let s = recipe.seed ^ kind.salt() ^ (index as u64).wrapping_mul(0xd1b5_4a32);
    let lane = match kind {
        FieldKind::Forest => 0.72,
        FieldKind::Scree => 0.86,
        FieldKind::Mud => 0.58,
        FieldKind::Rough => 0.42,
    };
    let side = if hash01(s ^ 0x5151) < 0.5 { -1.0 } else { 1.0 };
    let x_jitter = hash01(s ^ 0x6129) - 0.5;
    let y_jitter = hash01(s ^ 0xa8cb) - 0.5;
    let x = side * (CORRIDOR_TEXTURE_HALF_W * lane * (0.58 + 0.34 * hash01(s ^ 0x44a9)))
        + x_jitter * 80.0;
    let y_band = recipe.half_h * 0.56;
    let y = -y_band + (index as f32 + 0.5 + y_jitter * 0.58) * (2.0 * y_band / count.max(1) as f32);
    (
        x.clamp(-CORRIDOR_TEXTURE_HALF_W, CORRIDOR_TEXTURE_HALF_W),
        y,
    )
}

fn paint_patch(
    recipe: &MapRecipe,
    t: &mut Terrain,
    kind: FieldKind,
    cx_m: f32,
    cy_m: f32,
    rx_m: f32,
    ry_m: f32,
    seed: u64,
) {
    for cy in 0..t.h {
        let y = cell_y(t, cy);
        if (y - cy_m).abs() > ry_m * 1.28 {
            continue;
        }
        for cx in 0..t.w {
            let x = cell_x(t, cx);
            if !can_texture_cell(recipe, t, cx, cy, x, y) {
                continue;
            }
            let dx = (x - cx_m) / rx_m;
            let dy = (y - cy_m) / ry_m;
            let d2 = dx * dx + dy * dy;
            if d2 > 1.25 {
                continue;
            }
            let wobble = value_noise_nearest(seed, x, y, 54.0) * 0.34
                + value_noise_nearest(seed ^ 0x7717, x, y, 112.0) * 0.22;
            let threshold = 1.0 + wobble - 0.22;
            let mut signed_edge = threshold - d2;
            if signed_edge < -PATCH_EDGE_JITTER_D2 {
                continue;
            }
            if signed_edge < PATCH_EDGE_DITHER_BAND_D2 {
                let edge_noise = hash_cell01(cx as i32, cy as i32, seed ^ 0xb04d_e6e5);
                signed_edge += (edge_noise - 0.5) * PATCH_EDGE_JITTER_D2;
                if signed_edge <= 0.0 {
                    continue;
                }
            }
            let i = cy * t.w + cx;
            if matches!(kind, FieldKind::Mud) && t.height[i] > lowland_ceiling(recipe, cy_m) {
                continue;
            }
            let strength = (signed_edge / threshold.max(0.001)).clamp(0.0, 1.0);
            kind.paint_cell(t, i, strength);
        }
    }
}

fn can_texture_cell(recipe: &MapRecipe, t: &Terrain, cx: usize, cy: usize, x: f32, y: f32) -> bool {
    let i = cy * t.w + cx;
    if t.speed[i] <= 0.0 || matches!(t.tint[i], TINT_WATER | TINT_ROCK) {
        return false;
    }
    if x.abs() > CORRIDOR_TEXTURE_HALF_W {
        return false;
    }
    let deploy_y = if y < 0.0 {
        -super::certify::DEPLOYMENT_CENTER_Y_M
    } else {
        super::certify::DEPLOYMENT_CENTER_Y_M
    };
    if x.abs() <= DEPLOYMENT_CLEAN_HALF_W && (y - deploy_y).abs() <= DEPLOYMENT_CLEAN_HALF_H {
        return false;
    }
    y.abs() <= recipe.half_h * 0.68
}

fn lowland_ceiling(recipe: &MapRecipe, center_y: f32) -> f32 {
    let north_bias = (center_y / recipe.half_h).clamp(-1.0, 1.0) * 1.5;
    2.8 + north_bias
}

fn cell_x(t: &Terrain, cx: usize) -> f32 {
    t.origin.x + (cx as f32 + 0.5) * t.cell
}

fn cell_y(t: &Terrain, cy: usize) -> f32 {
    t.origin.y + (cy as f32 + 0.5) * t.cell
}
