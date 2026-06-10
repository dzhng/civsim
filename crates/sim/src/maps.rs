//! The two predefined battlefields. Maps are data: terrain paint plus
//! deployment zones (used by battle setup in Phase 2).

use crate::math::Vec2;
use crate::terrain::Terrain;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MapId {
    /// Player defends a ridge; approaches flanked by mud, woods on one wing.
    RidgeDefense,
    /// Symmetric meeting engagement: central mud belt with fords, two woods.
    MeetingField,
}

/// World extents for both maps: x in [-600, 600], y in [-400, 400].
pub const MAP_HALF_W: f32 = 600.0;
pub const MAP_HALF_H: f32 = 400.0;
const CELL: f32 = 4.0;

pub fn build(map: MapId) -> Terrain {
    let w = (2.0 * MAP_HALF_W / CELL) as usize;
    let h = (2.0 * MAP_HALF_H / CELL) as usize;
    let origin = Vec2::new(-MAP_HALF_W, -MAP_HALF_H);
    let mut t = Terrain::flat(w, h, CELL, origin);

    match map {
        MapId::RidgeDefense => {
            // Ridge slopes: a slow climbing band across the defender's third.
            // (No heightfield yet — the slope IS the slow band.)
            t.paint_rect(Vec2::new(-450.0, 120.0), Vec2::new(450.0, 190.0), 0.7, 0.25);
            // Ridge top: normal ground the defender stands on.
            t.paint_rect(Vec2::new(-450.0, 190.0), Vec2::new(450.0, 280.0), 1.0, 0.0);
            // Mud lowlands flanking the main approach.
            t.paint_circle(Vec2::new(-330.0, -40.0), 150.0, 0.55, 0.35);
            t.paint_circle(Vec2::new(380.0, 20.0), 120.0, 0.55, 0.35);
            // Woods on the west wing.
            t.paint_circle(Vec2::new(-470.0, 200.0), 110.0, 0.7, 0.6);
            // Rock outcrops: impassable anchors for a flank.
            t.paint_circle(Vec2::new(150.0, 60.0), 28.0, 0.0, 0.0);
            t.paint_circle(Vec2::new(-90.0, 40.0), 22.0, 0.0, 0.0);
        }
        MapId::MeetingField => {
            // Central mud belt with two firm fords.
            t.paint_rect(Vec2::new(-600.0, -45.0), Vec2::new(600.0, 45.0), 0.5, 0.3);
            t.paint_rect(Vec2::new(-260.0, -45.0), Vec2::new(-140.0, 45.0), 1.0, 0.0);
            t.paint_rect(Vec2::new(140.0, -45.0), Vec2::new(260.0, 45.0), 1.0, 0.0);
            // A wood on each side's east flank.
            t.paint_circle(Vec2::new(420.0, 210.0), 120.0, 0.7, 0.6);
            t.paint_circle(Vec2::new(-420.0, -210.0), 120.0, 0.7, 0.6);
        }
    }
    t
}
