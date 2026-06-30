//! MECHANICAL invariants: stamina saps a unit's RUN/CHARGE speed and its melee
//! COMBAT POWER (swing cadence). The drain itself — `combat_drain` while engaged,
//! `run_drain` while running — is the existing stamina ledger (fighting and
//! sprinting both tire a unit); these pin that a SPENT unit measurably moves and
//! fights weaker than a fresh one, so an over-committed attacker fades in a grind.
//! Fatigue is held fixed each tick to isolate the coupling from the drain.

use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// Metres a Running unit covers in 8 s, held at a fixed stamina.
fn run_distance(stamina: f32) -> f32 {
    let mut sim = Sim::new(
        Tunables {
            micro_rough: 0.0,
            ..Tunables::default()
        },
        1,
    );
    let u = sim.spawn_class(
        Vec2::new(0.0, 0.0),
        FRAC_PI_2,
        120,
        UnitClassId::HeavySword,
        0,
    );
    let y0 = sim.units[u].centroid.y;
    sim.set_pace(u, Pace::Run);
    sim.set_move_order(u, Vec2::new(0.0, 200.0));
    for _ in 0..(8.0 / DT) as usize {
        sim.units[u].stamina = stamina; // pin: isolate the speed coupling from drain
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

/// Kills a south attacker inflicts on a held north line in 40 s, at fixed stamina.
fn kills_in_40s(att_fatigue: f32, seed: u64) -> usize {
    let mut sim = Sim::new(
        Tunables {
            micro_rough: 0.0,
            ..Tunables::default()
        },
        seed,
    );
    let att = sim.spawn_class(
        Vec2::new(0.0, -10.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    // The held line is a NON-impaling sword line on purpose: this test measures
    // the attacker's SWING-RATE loss, and an impaling spear defender confounds
    // that with the impale-on-charge dynamic — a fresh attacker charging (Run)
    // onto presented points trades differently than a spent one creeping in, and
    // at short spear reach that confound can even INVERT the count (a fatigued
    // attacker "kills more" by not running onto the points). A sword line has no
    // such term, so kills read swing rate alone. (Mechanics tests measure the
    // mechanism, not a real-class matchup — that's balance_*.)
    let def = sim.spawn_class(
        Vec2::new(0.0, 10.0),
        -FRAC_PI_2,
        200,
        UnitClassId::LightSword,
        1,
    );
    let def_n0 = sim.units[def].alive_count;
    // Press IN (Run): a fresh line drives to solid reach and trades; a spent one
    // both closes slower AND swings slower, so it lands fewer killing blows. (A
    // Walk approach barely reaches past the standoff and trades almost nothing —
    // too gentle to read the stamina effect; Run gives a real fight to measure.)
    sim.set_pace(att, Pace::Run);
    sim.set_attack_order(att, def);
    for _ in 0..(40.0 / DT) as usize {
        sim.units[att].stamina = att_fatigue; // pin the attacker's wind
        sim.tick();
    }
    def_n0 - sim.units[def].alive_count
}

#[test]
fn fatigue_saps_melee_power() {
    // Fatigue saps melee OUTPUT two ways: each blow lands softer (damage toward
    // stamina_damage_floor) AND swings come slower (interval toward base /
    // stamina_cadence_floor). A fully-blown attacker therefore kills MEANINGFULLY
    // fewer over a grind. Summed over a seed set so the systematic effect is read,
    // not per-fight noise. The floors are deliberately GENTLE (both 0.75 — fatigue
    // is a real factor, not a guard-collapse-style cliff), so we lock "more than a
    // quarter fewer" with margin, NOT "halved" (halving the kill count would need
    // the aggressive cadence floor 0.6 and its broad grind-pacing ripple — David's
    // call was the gentle floor). Kills are a threshold function of per-hit output,
    // so this count is cliff-sensitive to the floors — sweep, don't nudge blindly.
    let seeds = [3u64, 11, 37, 73, 101, 146, 211, 449];
    let fresh: usize = seeds.iter().map(|&s| kills_in_40s(1.0, s)).sum();
    let spent: usize = seeds.iter().map(|&s| kills_in_40s(0.15, s)).sum();
    eprintln!(
        "kills over {} seeds: fresh attacker {fresh}  spent attacker {spent}",
        seeds.len()
    );
    assert!(
        spent * 4 < fresh * 3,
        "a spent attacker must kill clearly fewer (< 3/4 of fresh) — fatigue is a real drain: fresh {fresh} vs spent {spent}"
    );
}
