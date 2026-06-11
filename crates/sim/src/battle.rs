//! Predefined battle setup: terrain + both armies deployed. ~15,000 soldiers
//! in 20 units per side, mixed classes, mirrored rosters.

use crate::class::{class_stats, UnitClassId};
use crate::maps::{build, MapId};
use crate::math::{dir, Vec2};
use crate::sim::Sim;

use UnitClassId::*;

/// Soldiers per unit by class (data, freely tunable).
pub fn unit_size(class: UnitClassId) -> usize {
    match class {
        HeavyInfantry => 1280,
        LightInfantry => 880,
        LongSwords => 360,
        Phalanx => 1280,
        Archers => 480,
        Skirmishers => 360,
        ShockCavalry => 280,
        HorseArchers => 240,
        ArtilleryCrew => 80,
    }
}

fn unit_width(class: UnitClassId) -> f32 {
    let s = class_stats(class);
    let files = unit_size(class).div_ceil(s.default_depth.max(1));
    files as f32 * s.spacing.x
}

/// Lay one row of units centered on `center`, fronts on the row line,
/// left-to-right along the facing's right axis.
fn deploy_row(sim: &mut Sim, classes: &[UnitClassId], center: Vec2, facing: f32, team: u32) {
    const GAP: f32 = 14.0;
    let total: f32 =
        classes.iter().map(|&c| unit_width(c)).sum::<f32>() + GAP * (classes.len() - 1) as f32;
    let f = dir(facing);
    let right = Vec2::new(f.y, -f.x);
    let mut x = -0.5 * total;
    for &c in classes {
        let w = unit_width(c);
        let anchor = center + right * (x + 0.5 * w);
        sim.spawn_class(anchor, facing, unit_size(c), c, team);
        x += w + GAP;
    }
}

/// Deploy one army: skirmish screen, main line, second line, archers,
/// artillery, cavalry on the wings. `base` is the main-line center;
/// `facing` points at the enemy.
fn deploy_army(sim: &mut Sim, base: Vec2, facing: f32, team: u32) {
    let f = dir(facing);
    let right = Vec2::new(f.y, -f.x);
    let row = |fwd: f32| base + f * fwd;

    deploy_row(sim, &[Skirmishers, Skirmishers], row(45.0), facing, team);
    deploy_row(
        sim,
        &[HeavyInfantry, Phalanx, HeavyInfantry, Phalanx, HeavyInfantry],
        row(0.0),
        facing,
        team,
    );
    deploy_row(
        sim,
        &[LightInfantry, HeavyInfantry, LongSwords, HeavyInfantry, LightInfantry],
        row(-55.0),
        facing,
        team,
    );
    deploy_row(
        sim,
        &[Archers, LightInfantry, Archers, Archers],
        row(-110.0),
        facing,
        team,
    );
    deploy_row(sim, &[ArtilleryCrew], row(-150.0), facing, team);
    // Cavalry wings, slightly refused.
    // Wings must fit inside the sealed flanks (open corridor |y| < ~360).
    sim.spawn_class(row(-20.0) + right * -300.0, facing, unit_size(ShockCavalry), ShockCavalry, team);
    sim.spawn_class(row(-20.0) + right * 300.0, facing, unit_size(ShockCavalry), ShockCavalry, team);
    sim.spawn_class(row(-60.0) + right * 340.0, facing, unit_size(HorseArchers), HorseArchers, team);
}

/// Small open fields for quick vibe checks: 0 = 1v1 heavies,
/// 1 = 5v5 mixed line, 2 = cavalry charge vs a wide line FACE-ON,
/// 3 = the same charge into the line's FLANK (pure 1v1, nothing else).
pub fn setup_sandbox(sim: &mut Sim, kind: u32) {
    use crate::terrain::Terrain;
    use std::f32::consts::FRAC_PI_2;
    let mut t = Terrain::flat(200, 150, 4.0, Vec2::new(-400.0, -300.0));
    // A touch of scenery; the field stays open.
    t.paint_circle(Vec2::new(-220.0, 130.0), 60.0, 0.7, 0.6);
    t.paint_circle(Vec2::new(240.0, -90.0), 55.0, 0.55, 0.35);
    sim.terrain = t;

    if kind == 0 {
        sim.spawn_class(Vec2::new(0.0, -90.0), FRAC_PI_2, 240, UnitClassId::HeavyInfantry, 0);
        sim.spawn_class(Vec2::new(0.0, 90.0), -FRAC_PI_2, 240, UnitClassId::HeavyInfantry, 1);
        return;
    }
    if kind == 2 || kind == 3 {
        // A 100x4 line facing north; blue cavalry charges its face (kind 2)
        // or its eastern flank (kind 3).
        sim.spawn_unit(Vec2::new(0.0, 40.0), FRAC_PI_2, 400, 100, Vec2::new(1.0, 1.1), 1, 0.7);
        let (p, f) = if kind == 2 {
            (Vec2::new(0.0, 160.0), -FRAC_PI_2)
        } else {
            (Vec2::new(160.0, 38.0), std::f32::consts::PI)
        };
        sim.spawn_class(p, f, 160, UnitClassId::ShockCavalry, 0);
        return;
    }
    let side = |sim: &mut Sim, y: f32, facing: f32, team: u32| {
        let f = dir(facing);
        let right = Vec2::new(f.y, -f.x);
        let row = |o: f32, lat: f32| Vec2::new(0.0, y) + f * o + right * lat;
        sim.spawn_class(row(0.0, -95.0), facing, 320, UnitClassId::HeavyInfantry, team);
        sim.spawn_class(row(0.0, -10.0), facing, 320, UnitClassId::Phalanx, team);
        sim.spawn_class(row(0.0, 75.0), facing, 240, UnitClassId::LightInfantry, team);
        sim.spawn_class(row(-45.0, -10.0), facing, 120, UnitClassId::LongSwords, team);
        sim.spawn_class(row(-15.0, 170.0), facing, 100, UnitClassId::ShockCavalry, team);
    };
    side(sim, -130.0, FRAC_PI_2, 0);
    side(sim, 130.0, -FRAC_PI_2, 1);
}

/// Build terrain and deploy: player south facing north, enemy north facing
/// south, east/west flanks sealed by the map itself.
pub fn setup_battle(sim: &mut Sim, map: MapId) {
    sim.terrain = build(map);
    use std::f32::consts::FRAC_PI_2;
    deploy_army(sim, Vec2::new(0.0, -600.0), FRAC_PI_2, 0);
    deploy_army(sim, Vec2::new(0.0, 600.0), -FRAC_PI_2, 1);
}
