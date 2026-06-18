//! MECHANICAL invariants: fatigue saps a unit's RUN/CHARGE speed and its melee
//! COMBAT POWER (swing cadence). The drain itself — `combat_drain` while engaged,
//! `run_drain` while running — is the existing fatigue ledger (fighting and
//! sprinting both tire a unit); these pin that a SPENT unit measurably moves and
//! fights weaker than a fresh one, so an over-committed attacker fades in a grind.
//! Fatigue is held fixed each tick to isolate the coupling from the drain.

use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// Metres a Running unit covers in 8 s, held at a fixed fatigue.
fn run_distance(fatigue: f32) -> f32 {
    let mut sim = Sim::new(Tunables { micro_rough: 0.0, ..Tunables::default() }, 1);
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 120, UnitClassId::HeavySword, 0);
    let y0 = sim.units[u].centroid.y;
    sim.set_pace(u, Pace::Run);
    sim.set_move_order(u, Vec2::new(0.0, 200.0));
    for _ in 0..(8.0 / DT) as usize {
        sim.units[u].fatigue = fatigue; // pin: isolate the speed coupling from drain
        sim.tick();
    }
    sim.units[u].centroid.y - y0
}

#[test]
fn fatigue_saps_run_speed() {
    let fresh = run_distance(1.0);
    let spent = run_distance(0.2);
    eprintln!("run 8s: fresh {fresh:.1}m  spent {spent:.1}m");
    assert!(
        spent < fresh * 0.85,
        "a spent unit must run measurably slower than a fresh one: fresh {fresh:.1} vs spent {spent:.1}"
    );
}

/// Kills a south attacker inflicts on a held north line in 30 s, at fixed fatigue.
fn kills_in_30s(att_fatigue: f32) -> usize {
    let mut sim = Sim::new(Tunables { micro_rough: 0.0, ..Tunables::default() }, 3);
    let att = sim.spawn_class(Vec2::new(0.0, -10.0), FRAC_PI_2, 200, UnitClassId::HeavySword, 0);
    let def = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 200, UnitClassId::HeavySword, 1);
    let def_n0 = sim.units[def].alive_count;
    sim.set_pace(att, Pace::Walk);
    sim.set_attack_order(att, def);
    for _ in 0..(30.0 / DT) as usize {
        sim.units[att].fatigue = att_fatigue; // pin the attacker's wind
        sim.tick();
    }
    def_n0 - sim.units[def].alive_count
}

#[test]
fn fatigue_saps_melee_power() {
    let fresh = kills_in_30s(1.0);
    let spent = kills_in_30s(0.15);
    eprintln!("kills in 30s: fresh attacker {fresh}  spent attacker {spent}");
    assert!(
        spent < fresh,
        "a spent attacker (slower swings) must kill fewer than a fresh one: fresh {fresh} vs spent {spent}"
    );
}
