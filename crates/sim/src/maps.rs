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

/// World extents: the armies fight along Y (player south, enemy north);
/// the EAST and WEST edges are sealed by terrain. The open corridor is
/// ~2100m wide against a ~700m army frontage — room to maneuver, twice over.
pub const MAP_HALF_W: f32 = 1200.0;
pub const MAP_HALF_H: f32 = 800.0;
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
            // West flank: a crag wall with a ragged foot.
            for k in -54..=54 {
                let y = k as f32 * 30.0;
                let r = 38.0 + jitter(k, 11) * 36.0;
                t.paint_circle_tinted(Vec2::new(-1205.0 + jitter(k, 23) * 25.0, y), r, 0.0, 0.0, 2);
            }
            // Scree at the crag foot: slow, rough.
            t.paint_rect_tinted(
                Vec2::new(-1138.0, -800.0),
                Vec2::new(-1108.0, 800.0),
                0.6,
                0.45,
                6,
            );
            // East flank: the river, with marshy banks.
            t.paint_rect_tinted(
                Vec2::new(1118.0, -800.0),
                Vec2::new(1260.0, 800.0),
                0.0,
                0.0,
                1,
            );
            t.paint_rect_tinted(
                Vec2::new(1072.0, -800.0),
                Vec2::new(1118.0, 800.0),
                0.5,
                0.35,
                5,
            );
            // Mid-field features: a gentle hill rise, a mud patch, two woods —
            // sparse organic blobs, leaving most of the plain open.
            t.paint_blob(Vec2::new(30.0, 0.0), 120.0, 0.75, 0.15, 6, 0x51);
            t.paint_blob(Vec2::new(-540.0, -320.0), 130.0, 0.55, 0.35, 5, 0xA3);
            t.paint_blob(Vec2::new(640.0, 280.0), 150.0, 0.7, 0.6, 4, 0xC7);
            t.paint_blob(Vec2::new(-460.0, 520.0), 110.0, 0.7, 0.6, 4, 0x1D);
            // A pair of rocky outcrops to anchor a line on.
            t.paint_blob(Vec2::new(380.0, -180.0), 26.0, 0.0, 0.0, 2, 0x6B);
            t.paint_blob(Vec2::new(-260.0, 140.0), 30.0, 0.0, 0.0, 2, 0x92);
        }
        MapId::WalledPlain => {
            // West flank: the city wall — a hard line with towers.
            t.paint_rect_tinted(
                Vec2::new(-1260.0, -800.0),
                Vec2::new(-1125.0, 800.0),
                0.0,
                0.0,
                3,
            );
            for k in -8..=8 {
                t.paint_circle_tinted(Vec2::new(-1125.0, k as f32 * 190.0), 16.0, 0.0, 0.0, 3);
            }
            // East flank: cliffs with a deep forest at their foot.
            for k in -54..=54 {
                let y = k as f32 * 30.0;
                let r = 40.0 + jitter(k, 7) * 30.0;
                t.paint_circle_tinted(Vec2::new(1210.0 - jitter(k, 5) * 20.0, y), r, 0.0, 0.0, 2);
            }
            t.paint_rect(
                Vec2::new(1030.0, -800.0),
                Vec2::new(1130.0, 800.0),
                0.7,
                0.6,
            );
            // Farmland: mud strips and orchards across the plain.
            t.paint_rect_tinted(
                Vec2::new(-680.0, -260.0),
                Vec2::new(-180.0, -180.0),
                0.6,
                0.25,
                5,
            );
            t.paint_rect_tinted(
                Vec2::new(160.0, 300.0),
                Vec2::new(660.0, 390.0),
                0.6,
                0.25,
                5,
            );
            t.paint_blob(Vec2::new(330.0, 40.0), 110.0, 0.7, 0.6, 4, 0x33);
            t.paint_blob(Vec2::new(-560.0, -620.0), 120.0, 0.7, 0.6, 4, 0x88);
            t.paint_blob(Vec2::new(160.0, 720.0), 100.0, 0.7, 0.6, 4, 0xE1);
        }
    }
    t
}
