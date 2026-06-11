//! The battlefields: long rectangles fought along their length, with both
//! flanks sealed by terrain — river, mountains, cliffs, city walls, forest.
//! Maps are data: terrain paint plus deployment in `battle.rs`.

use crate::math::Vec2;
use crate::terrain::Terrain;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MapId {
    /// Mountains seal the north flank, a broad river the south.
    RiverAndCrags,
    /// A city wall runs the north edge; cliffs and deep forest the south.
    WalledPlain,
}

/// World extents: x in [-1200, 1200] (the fighting axis), y in [-500, 500].
pub const MAP_HALF_W: f32 = 1200.0;
pub const MAP_HALF_H: f32 = 500.0;
const CELL: f32 = 4.0;

/// Deterministic jitter for natural-looking edges.
fn jitter(i: i32, salt: u64) -> f32 {
    let mut x = (i as u64).wrapping_mul(0x9E3779B97F4A7C15) ^ salt.wrapping_mul(0xBF58476D1CE4E5B9);
    x ^= x >> 31;
    x = x.wrapping_mul(0x94D049BB133111EB);
    (x >> 40) as f32 / 16_777_216.0
}

pub fn build(map: MapId) -> Terrain {
    let w = (2.0 * MAP_HALF_W / CELL) as usize;
    let h = (2.0 * MAP_HALF_H / CELL) as usize;
    let origin = Vec2::new(-MAP_HALF_W, -MAP_HALF_H);
    let mut t = Terrain::flat(w, h, CELL, origin);

    match map {
        MapId::RiverAndCrags => {
            // North: a crag wall with a ragged foot.
            for k in -40..=40 {
                let x = k as f32 * 30.0;
                let r = 38.0 + jitter(k, 11) * 36.0;
                t.paint_circle_tinted(Vec2::new(x, 505.0 - jitter(k, 23) * 25.0), r, 0.0, 0.0, 2);
            }
            // Scree at the crag foot: slow, rough.
            t.paint_rect_tinted(Vec2::new(-1200.0, 408.0), Vec2::new(1200.0, 438.0), 0.6, 0.45, 6);
            // South: the river, with marshy banks.
            t.paint_rect_tinted(Vec2::new(-1200.0, -560.0), Vec2::new(1200.0, -418.0), 0.0, 0.0, 1);
            t.paint_rect_tinted(Vec2::new(-1200.0, -418.0), Vec2::new(1200.0, -372.0), 0.5, 0.35, 5);
            // Mid-field features: a gentle hill band, mud, two woods.
            t.paint_rect_tinted(Vec2::new(-120.0, -80.0), Vec2::new(120.0, 140.0), 0.75, 0.15, 6);
            t.paint_circle(Vec2::new(-420.0, -240.0), 130.0, 0.55, 0.35);
            t.paint_circle(Vec2::new(380.0, 240.0), 150.0, 0.7, 0.6);
            t.paint_circle(Vec2::new(620.0, -160.0), 110.0, 0.7, 0.6);
            // A pair of outcrops to anchor a line on.
            t.paint_circle(Vec2::new(-180.0, 180.0), 26.0, 0.0, 0.0);
            t.paint_circle(Vec2::new(240.0, -110.0), 30.0, 0.0, 0.0);
        }
        MapId::WalledPlain => {
            // North: the city wall — a hard line with towers.
            t.paint_rect_tinted(Vec2::new(-1200.0, 425.0), Vec2::new(1200.0, 560.0), 0.0, 0.0, 3);
            for k in -6..=6 {
                t.paint_circle_tinted(Vec2::new(k as f32 * 190.0, 425.0), 16.0, 0.0, 0.0, 3);
            }
            // South: cliffs with a deep forest at their foot.
            for k in -40..=40 {
                let x = k as f32 * 30.0;
                let r = 40.0 + jitter(k, 7) * 30.0;
                t.paint_circle_tinted(Vec2::new(x, -510.0 + jitter(k, 5) * 20.0), r, 0.0, 0.0, 2);
            }
            t.paint_rect(Vec2::new(-1200.0, -430.0), Vec2::new(1200.0, -330.0), 0.7, 0.6);
            // Farmland: mud strips and orchards across the plain.
            t.paint_rect_tinted(Vec2::new(-260.0, -180.0), Vec2::new(-180.0, 320.0), 0.6, 0.25, 5);
            t.paint_rect_tinted(Vec2::new(300.0, -300.0), Vec2::new(390.0, 160.0), 0.6, 0.25, 5);
            t.paint_circle(Vec2::new(40.0, 230.0), 110.0, 0.7, 0.6);
            t.paint_circle(Vec2::new(-620.0, -60.0), 120.0, 0.7, 0.6);
            t.paint_circle(Vec2::new(720.0, 60.0), 100.0, 0.7, 0.6);
        }
    }
    t
}
