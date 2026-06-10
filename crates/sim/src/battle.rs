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
    sim.spawn_class(row(-20.0) + right * -420.0, facing, unit_size(ShockCavalry), ShockCavalry, team);
    sim.spawn_class(row(-20.0) + right * 420.0, facing, unit_size(ShockCavalry), ShockCavalry, team);
    sim.spawn_class(row(-30.0) + right * 500.0, facing, unit_size(HorseArchers), HorseArchers, team);
}

/// Build terrain and deploy both armies. Team 0 is the player.
pub fn setup_battle(sim: &mut Sim, map: MapId) {
    sim.terrain = build(map);
    use std::f32::consts::FRAC_PI_2;
    match map {
        MapId::RidgeDefense => {
            // Player holds the ridge (north), facing south; attacker advances.
            deploy_army(sim, Vec2::new(0.0, 215.0), -FRAC_PI_2, 0);
            deploy_army(sim, Vec2::new(0.0, -250.0), FRAC_PI_2, 1);
        }
        MapId::MeetingField => {
            deploy_army(sim, Vec2::new(0.0, -250.0), FRAC_PI_2, 0);
            deploy_army(sim, Vec2::new(0.0, 250.0), -FRAC_PI_2, 1);
        }
    }
}
