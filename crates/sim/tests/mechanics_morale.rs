//! MECHANICAL invariants of MORALE: per-class bravery, the allied-steadiness
//! aura (size × class aura of nearby friends), and the ≤9-man guaranteed break.
//! Each test changes ONE knob against an otherwise identical losing fight, so the
//! direction it moves the break point is the invariant — never the exact percent.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const N: usize = 240;

/// Casualty fraction (0..1) of the SOUTH unit when it ROUTS — its break point.
/// North is 1.6× AND wider, so it overlaps south's frontage and wraps both
/// flanks: south fights on three sides (the `directions` amplifier) and is the
/// clear loser that actually breaks. `support` friendly `aura_class` units stand
/// ~32 m behind south, in steadiness range but out of the fight.
fn break_pct(support: usize, south_class: UnitClassId, aura_class: UnitClassId) -> f32 {
    let mut sim = Sim::new(Tunables { micro_rough: 0.0, ..Tunables::default() }, 7);
    let south = sim.spawn_class(Vec2::new(0.0, -13.0), FRAC_PI_2, N, south_class, 0);
    let north = sim.spawn_class(Vec2::new(0.0, 13.0), -FRAC_PI_2, 384, UnitClassId::HeavySword, 1);
    sim.set_files(north, (sim.units[south].files_eff * 3) / 2);
    for k in 0..support {
        let x = (k as f32 - support as f32 / 2.0) * 20.0;
        sim.spawn_class(Vec2::new(x, -45.0), FRAC_PI_2, 200, aura_class, 0);
    }
    sim.set_pace(south, sim::Pace::Run);
    sim.set_pace(north, sim::Pace::Run);
    sim.set_attack_order(south, north);
    sim.set_attack_order(north, south);
    for _ in 0..(260.0 / DT) as usize {
        sim.tick();
        if sim.units[south].routing {
            return (N - sim.units[south].alive_count) as f32 / N as f32;
        }
    }
    (N - sim.units[south].alive_count) as f32 / N as f32 // never broke: report final
}

/// Steady friends nearby let a unit endure more blood before its will breaks.
#[test]
fn allied_support_lets_a_unit_hold_past_where_it_breaks_alone() {
    let alone = break_pct(0, UnitClassId::HeavySword, UnitClassId::HeavySword);
    let backed = break_pct(3, UnitClassId::HeavySword, UnitClassId::HeavySword);
    eprintln!("break: alone {:.0}%  +3 friends {:.0}%", alone * 100.0, backed * 100.0);
    assert!(
        backed > alone + 0.08,
        "steady friends must let a unit hold longer: alone {:.0}% vs backed {:.0}%",
        alone * 100.0,
        backed * 100.0
    );
}

/// The support scales with the NUMBER of friends: one unit behind helps, three
/// help more — same fight, only the count of steady friends changes.
#[test]
fn support_scales_with_the_number_of_friends() {
    let alone = break_pct(0, UnitClassId::HeavySword, UnitClassId::HeavySword);
    let one = break_pct(1, UnitClassId::HeavySword, UnitClassId::HeavySword);
    let three = break_pct(3, UnitClassId::HeavySword, UnitClassId::HeavySword);
    eprintln!(
        "break: alone {:.0}%  +1 friend {:.0}%  +3 friends {:.0}%",
        alone * 100.0,
        one * 100.0,
        three * 100.0
    );
    assert!(
        one > alone + 0.03,
        "even one steady friend must help: alone {:.0}% vs +1 {:.0}%",
        alone * 100.0,
        one * 100.0
    );
    assert!(
        three >= one,
        "three friends must steady at least as much as one: +1 {:.0}% vs +3 {:.0}%",
        one * 100.0,
        three * 100.0
    );
}

/// A high-AURA class (heavy horse) steadies a wavering line more than the same
/// number and size of ordinary infantry — the aura is a per-class knob.
#[test]
fn a_high_aura_ally_steadies_more_than_ordinary_foot() {
    let inf = break_pct(3, UnitClassId::HeavySword, UnitClassId::HeavySword);
    let cav = break_pct(3, UnitClassId::HeavySword, UnitClassId::ShockCavalry);
    eprintln!("break: +3 infantry {:.0}%  +3 cavalry {:.0}%", inf * 100.0, cav * 100.0);
    assert!(
        cav >= inf,
        "high-aura cavalry must steady at least as much as equal infantry: inf {:.0}% vs cav {:.0}%",
        inf * 100.0,
        cav * 100.0
    );
}

/// A timid class (a levy) breaks earlier than a steadfast one (armoured heavies)
/// in the SAME losing fight — bravery is a per-class knob, independent of drill.
#[test]
fn a_brave_class_holds_longer_than_a_timid_one() {
    let heavy = break_pct(0, UnitClassId::HeavySword, UnitClassId::HeavySword);
    let levy = break_pct(0, UnitClassId::Peasant, UnitClassId::HeavySword);
    eprintln!("break: HeavySword {:.0}%  Peasant {:.0}%", heavy * 100.0, levy * 100.0);
    assert!(
        levy < heavy - 0.10,
        "a timid levy must break earlier than steadfast heavies: levy {:.0}% vs heavy {:.0}%",
        levy * 100.0,
        heavy * 100.0
    );
}

/// The ONE guaranteed break: a unit ground to ≤9 men routs no matter how much
/// allied support rings it — no square, no line, no fight left.
#[test]
fn nine_or_fewer_men_always_break_even_under_massive_support() {
    let mut sim = Sim::new(Tunables { micro_rough: 0.0, ..Tunables::default() }, 7);
    let tiny = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 9, UnitClassId::HeavySword, 0);
    // Ring it with massive high-aura support and an enemy in sight (not at ease).
    for k in 0..4 {
        let x = (k as f32 - 2.0) * 15.0;
        sim.spawn_class(Vec2::new(x, -20.0), FRAC_PI_2, 240, UnitClassId::ShockCavalry, 0);
    }
    sim.spawn_class(Vec2::new(0.0, 20.0), -FRAC_PI_2, 100, UnitClassId::HeavySword, 1);
    for _ in 0..(3.0 / DT) as usize {
        sim.tick();
    }
    assert!(
        sim.units[tiny].routing,
        "a ≤9-man unit must rout regardless of support (the only guaranteed break)"
    );
}
