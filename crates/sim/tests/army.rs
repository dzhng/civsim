//! Big-army INTEGRATION — the heaviest Rust-side checks, and a category of their
//! own: not focused scenarios, but the end-to-end "does a whole battle resolve
//! sanely" tests on full multi-class deployments. Slow, so they live in their own
//! bucket and run on demand (`scripts/test-army`), NOT in the scenarios inner loop.
//!
//! The headline test sweeps the SAME AI battle across army SIZES to confirm the
//! outcome is ~scale-invariant: a real scale-dependence bug would show as the
//! winner flipping or a wildly different death fraction at a different scale.

pub mod common;

use common::run;
use sim::{ai_commander, setup_battle, MapId, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 7;

/// One full 5-class AI battle at `mult` × the base army; returns
/// (victor, dead fraction, total men).
fn fight(mult: usize) -> (Option<u32>, f32, usize) {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let n = |base: usize| base * mult;
    let lay = |sim: &mut Sim, team: u32, y: f32, facing: f32| {
        sim.spawn_class(Vec2::new(-60.0, y), facing, n(30), UnitClassId::HeavySword, team);
        sim.spawn_class(Vec2::new(0.0, y), facing, n(34), UnitClassId::Phalanx, team);
        sim.spawn_class(Vec2::new(60.0, y), facing, n(30), UnitClassId::LightSpear, team);
        sim.spawn_class(
            Vec2::new(0.0, y - facing.sin() * 30.0),
            facing,
            n(16),
            UnitClassId::Archers,
            team,
        );
        sim.spawn_class(Vec2::new(120.0, y), facing, n(10), UnitClassId::ShockCavalry, team);
    };
    lay(&mut sim, 0, -80.0, FRAC_PI_2);
    lay(&mut sim, 1, 80.0, -FRAC_PI_2);
    // Slight asymmetry so somebody wins (team 0 gets an extra block).
    sim.spawn_class(Vec2::new(-120.0, -80.0), FRAC_PI_2, n(20), UnitClassId::HeavySword, 0);

    let mut victor = None;
    for _ in 0..(900.0 / DT) as usize {
        sim.tick();
        ai_commander(&mut sim, 0);
        ai_commander(&mut sim, 1);
        victor = sim.victor();
        if victor.is_some() {
            break;
        }
    }
    let total: usize = sim.units.iter().map(|u| u.count).sum();
    let dead: usize = sim.units.iter().map(|u| u.count - u.alive_count).sum();
    (victor, dead as f32 / total as f32, total)
}

#[test]
fn ai_battle_resolves_the_same_at_every_scale() {
    // Sweep ~260 → ~1040 men. Each must reach a verdict and fight a real battle
    // (morale ends it before extermination — the design). Then the scale-invariance
    // checks: the same side wins at every size and the death fraction stays in a
    // band. A FLIP or a wild swing here is a finding (scale-dependent physics),
    // not test noise — surface it, don't paper it.
    let mut rows = Vec::new();
    for &mult in &[1usize, 2, 4] {
        let (victor, dead_frac, total) = fight(mult);
        eprintln!("scale x{mult} ({total} men): victor={victor:?}  dead_frac={dead_frac:.2}");
        assert!(victor.is_some(), "x{mult}: a full battle must reach a verdict ({total} men)");
        assert!(dead_frac > 0.02, "x{mult}: a real battle was fought, dead_frac {dead_frac:.2}");
        assert!(dead_frac < 0.9, "x{mult}: morale ends it before extermination, {dead_frac:.2}");
        rows.push((mult, victor, dead_frac));
    }
    let v0 = rows[0].1;
    assert!(
        rows.iter().all(|r| r.1 == v0),
        "the winner must not flip with army size (scale-dependence bug): {rows:?}"
    );
    let fracs: Vec<f32> = rows.iter().map(|r| r.2).collect();
    let spread = fracs.iter().cloned().fold(0.0f32, f32::max)
        - fracs.iter().cloned().fold(1.0f32, f32::min);
    assert!(
        spread < 0.4,
        "death fraction must not deviate majorly across scale: {fracs:?}"
    );
}

#[test]
fn full_battle_spawns_and_runs() {
    // The real-map full deployment (~thousands/side): boots, has all classes, runs
    // stable, nobody escapes the map. The big-army smoke (moved here from
    // class_scenarios so the scenarios bucket stays fast).
    let mut sim = Sim::new(Tunables::default(), 11);
    setup_battle(&mut sim, MapId::RiverAndCrags);
    assert_eq!(sim.units.len(), 40, "20 units per side");
    let per_side: usize = sim.units.iter().filter(|u| u.team == 0).map(|u| u.count).sum();
    assert!(
        (6_000..=20_000).contains(&per_side),
        "a full battle must spawn a large army per side, got {per_side}"
    );
    for class in [
        UnitClassId::HeavySword,
        UnitClassId::Phalanx,
        UnitClassId::LongSwords,
        UnitClassId::Archers,
        UnitClassId::Skirmishers,
        UnitClassId::ShockCavalry,
        UnitClassId::HorseArchers,
        UnitClassId::ArtilleryCrew,
    ] {
        assert!(
            sim.units.iter().any(|u| u.class == class && u.team == 0),
            "missing {class:?}"
        );
    }
    run(&mut sim, 10.0);
    for i in 0..sim.soldier_count() {
        let p = sim.soldier_pos(i);
        assert!(p.x.is_finite() && p.y.is_finite());
        assert!(
            p.x.abs() < 1300.0 && p.y.abs() < 900.0,
            "soldier escaped the map: {p:?}"
        );
    }
}
