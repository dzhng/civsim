//! Seeded generated-map flank seal vocabulary.
//!
//! The landform still owns the broad E/W ridge mass. This module composes a
//! seeded seal vocabulary over that truth after hydrology has settled:
//! `CliffRun` continues the rock ridge, `ForestBelt` blocks the ridge foot
//! with forest tint, and `WaterReach` cuts a water-tinted bay in from the map
//! edge. Every speed-0 cell this module writes carries the visual tint that
//! explains the block.

use super::{
    noise::{hash01, mix64, smoothstep},
    MapRecipe,
};
use crate::{math::Vec2, terrain::Terrain};
pub use contract::{EdgeSealRecipe, EdgeSealWeights};
use serde::{Deserialize, Serialize};

const TINT_WATER: u8 = 1;
const TINT_FOREST: u8 = 4;

const FOREST_FOOT_INNER_X: f32 = 520.0;
const FOREST_FOOT_OUTER_X: f32 = 760.0;
const WATER_REACH_MIN_M: f32 = 220.0;
const WATER_REACH_EXTRA_M: f32 = 88.0;
const WATER_LEVEL_M: f32 = -5.5;
const COAST_SLOPE_M: f32 = 250.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EdgeSealKind {
    CliffRun,
    ForestBelt,
    WaterReach,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeSealComposition {
    pub west: EdgeSealKind,
    pub east: EdgeSealKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EdgeSide {
    West,
    East,
}

#[derive(Clone, Copy)]
struct SealSegment {
    y0: f32,
    y1: f32,
}

impl SealSegment {
    /// 1.0 in the segment interior, easing to 0.0 at the ends over `span` m -
    /// soft caps so seals never stamp rectangle ends.
    fn end_taper(&self, y: f32, span: f32) -> f32 {
        let from_start = (y - self.y0).max(0.0);
        let from_end = (self.y1 - y).max(0.0);
        let d = from_start.min(from_end);
        (d / span).clamp(0.0, 1.0)
    }
}

impl EdgeSealKind {
    pub fn expected_edge_role(self) -> &'static str {
        match self {
            // The renderer role vocabulary has no forest edge role. A forest
            // belt blocks the ridge foot, backed by the cliff seal at the edge.
            EdgeSealKind::CliffRun | EdgeSealKind::ForestBelt => "cliff",
            EdgeSealKind::WaterReach => "ocean",
        }
    }
}

pub fn composition(recipe: &MapRecipe) -> EdgeSealComposition {
    EdgeSealComposition {
        west: choose_kind(recipe, 0x57e57),
        east: choose_kind(recipe, 0xea57),
    }
}

pub fn apply(recipe: &MapRecipe, t: &mut Terrain) {
    let composition = composition(recipe);
    apply_side(recipe, t, EdgeSide::West, composition.west);
    apply_side(recipe, t, EdgeSide::East, composition.east);
}

pub fn needs_pocket_cleanup(recipe: &MapRecipe) -> bool {
    let composition = composition(recipe);
    composition.west != EdgeSealKind::CliffRun || composition.east != EdgeSealKind::CliffRun
}

fn choose_kind(recipe: &MapRecipe, salt: u64) -> EdgeSealKind {
    let weights = recipe.edge_seals.weights;
    let total = weights
        .cliff_run
        .saturating_add(weights.forest_belt)
        .saturating_add(weights.water_reach);
    if total == 0 {
        return EdgeSealKind::CliffRun;
    }
    let roll = ((mix64(recipe.seed ^ salt) >> 32) % total as u64) as u16;
    if roll < weights.cliff_run {
        EdgeSealKind::CliffRun
    } else if roll < weights.cliff_run.saturating_add(weights.forest_belt) {
        EdgeSealKind::ForestBelt
    } else {
        EdgeSealKind::WaterReach
    }
}

fn apply_side(recipe: &MapRecipe, t: &mut Terrain, side: EdgeSide, kind: EdgeSealKind) {
    match kind {
        EdgeSealKind::CliffRun => {}
        EdgeSealKind::ForestBelt => paint_forest_belt(recipe, t, side),
        EdgeSealKind::WaterReach => paint_water_reach(recipe, t, side),
    }
}

fn paint_forest_belt(recipe: &MapRecipe, t: &mut Terrain, side: EdgeSide) {
    let segment = segment(recipe, side, EdgeSealKind::ForestBelt, 0.76);
    for cy in 0..t.h {
        let y = cell_y(t, cy);
        if !segment.contains(y) {
            continue;
        }
        // Organic treeline: jitter both belt edges per row and taper the belt
        // to nothing near the segment ends - stamped axis-aligned rectangles
        // read as slabs on the mask and at the vista.
        let end_taper = segment.end_taper(y, 140.0);
        let inner_jitter = (value_noise_1d(recipe.seed ^ 0x51ee_7001, side, cy) - 0.5) * 90.0;
        let outer_jitter = (value_noise_1d(recipe.seed ^ 0x51ee_7002, side, cy) - 0.5) * 70.0;
        let inner = FOREST_FOOT_INNER_X + inner_jitter + (1.0 - end_taper) * 160.0;
        let outer = FOREST_FOOT_OUTER_X + outer_jitter - (1.0 - end_taper) * 40.0;
        if inner >= outer {
            continue;
        }
        for cx in 0..t.w {
            let x = cell_x(t, cx);
            let ax = x.abs();
            if !(inner..=outer).contains(&ax) || !on_side(side, x) {
                continue;
            }
            let i = cy * t.w + cx;
            t.speed[i] = 0.0;
            t.rough[i] = 0.75;
            t.tint[i] = TINT_FOREST;
        }
    }
}

/// One coast surface for the playable tile and every surrounding vista band.
/// The bay widens offshore; its landward slope reaches sea level continuously.
struct WaterReach {
    recipe: MapRecipe,
    side: EdgeSide,
    segment: SealSegment,
}

impl WaterReach {
    fn new(recipe: &MapRecipe, side: EdgeSide) -> Self {
        Self {
            recipe: *recipe,
            side,
            segment: segment(recipe, side, EdgeSealKind::WaterReach, 0.72),
        }
    }

    fn sample(&self, p: Vec2, height: f32) -> (f32, bool) {
        if !on_side(self.side, p.x) {
            return (height, false);
        }
        let offshore = (p.x.abs() - self.recipe.half_w).max(0.0);
        let segment = SealSegment {
            y0: self.segment.y0 - offshore * 0.25,
            y1: self.segment.y1 + offshore * 0.25,
        };
        let cy = ((p.y + self.recipe.half_h) / self.recipe.cell - 0.5)
            .round()
            .max(0.0) as usize;
        let reach = (WATER_REACH_MIN_M
            + WATER_REACH_EXTRA_M * value_noise_1d(self.recipe.seed, self.side, cy))
            * segment.end_taper(p.y, 180.0);
        let edge_distance = self.recipe.half_w - p.x.abs();
        let coast_distance = (reach - edge_distance)
            .min(p.y - segment.y0)
            .min(segment.y1 - p.y);
        let water = coast_distance >= 0.0 && reach >= self.recipe.cell;
        let blend = smoothstep(-COAST_SLOPE_M, 0.0, coast_distance);
        (height + (height.min(WATER_LEVEL_M) - height) * blend, water)
    }
}

pub struct EdgeSurface {
    west: Option<WaterReach>,
    east: Option<WaterReach>,
}

impl EdgeSurface {
    pub fn new(recipe: &MapRecipe) -> Self {
        let kinds = composition(recipe);
        Self {
            west: (kinds.west == EdgeSealKind::WaterReach)
                .then(|| WaterReach::new(recipe, EdgeSide::West)),
            east: (kinds.east == EdgeSealKind::WaterReach)
                .then(|| WaterReach::new(recipe, EdgeSide::East)),
        }
    }

    pub fn height_and_water(&self, p: Vec2, height: f32) -> (f32, bool) {
        let coast = if p.x < 0.0 { &self.west } else { &self.east };
        coast
            .as_ref()
            .map_or((height, false), |coast| coast.sample(p, height))
    }
}

fn paint_water_reach(recipe: &MapRecipe, t: &mut Terrain, side: EdgeSide) {
    let coast = WaterReach::new(recipe, side);
    for cy in 0..t.h {
        let y = cell_y(t, cy);
        for cx in 0..t.w {
            let x = cell_x(t, cx);
            let i = cy * t.w + cx;
            let (height, water) = coast.sample(Vec2::new(x, y), t.height[i]);
            t.height[i] = height;
            if water {
                t.speed[i] = 0.0;
                t.rough[i] = 0.0;
                t.tint[i] = TINT_WATER;
            }
        }
    }
}

fn segment(recipe: &MapRecipe, side: EdgeSide, kind: EdgeSealKind, coverage: f32) -> SealSegment {
    let salt = match (side, kind) {
        (EdgeSide::West, EdgeSealKind::ForestBelt) => 0xf045_7e11,
        (EdgeSide::East, EdgeSealKind::ForestBelt) => 0xe045_7e11,
        (EdgeSide::West, EdgeSealKind::WaterReach) => 0xf0aa_2e11,
        (EdgeSide::East, EdgeSealKind::WaterReach) => 0xe0aa_2e11,
        _ => 0xced1_5eed,
    };
    let height = recipe.half_h * 2.0;
    let len = height * coverage.clamp(0.35, 0.95);
    let room = (height - len).max(0.0);
    let offset = room * hash01(recipe.seed ^ salt);
    SealSegment {
        y0: -recipe.half_h + offset,
        y1: -recipe.half_h + offset + len,
    }
}

impl SealSegment {
    fn contains(self, y: f32) -> bool {
        y >= self.y0 && y <= self.y1
    }
}

fn on_side(side: EdgeSide, x: f32) -> bool {
    match side {
        EdgeSide::West => x < 0.0,
        EdgeSide::East => x > 0.0,
    }
}

fn cell_x(t: &Terrain, cx: usize) -> f32 {
    t.origin.x + (cx as f32 + 0.5) * t.cell
}

fn cell_y(t: &Terrain, cy: usize) -> f32 {
    t.origin.y + (cy as f32 + 0.5) * t.cell
}

fn value_noise_1d(seed: u64, side: EdgeSide, cy: usize) -> f32 {
    let salt = match side {
        EdgeSide::West => 0x7717_5151,
        EdgeSide::East => 0xe817_5151,
    };
    let bucket = (cy / 9) as u64;
    let a = hash01(seed ^ salt ^ bucket.wrapping_mul(0x9e37_79b9));
    let b = hash01(seed ^ salt ^ (bucket + 1).wrapping_mul(0x9e37_79b9));
    let f = ((cy % 9) as f32) / 9.0;
    let s = f * f * (3.0 - 2.0 * f);
    a + (b - a) * s
}
