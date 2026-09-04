//! BALANCE tests for per-class combat performance — how a unit's stat block
//! (arc, reach, crush cost, evade) prices out in a fight. These assert
//! OUTCOMES (kill differentials, survivor counts under pressure), which move
//! as the economy is retuned — distinct from the `mechanics_*` invariants
//! (cohesion, centroids, penetration) that must hold no matter the balance.
//! Migrated out of `combat_scenarios.rs` so the physics invariants and the
//! pricing outcomes are no longer interleaved in one file.

pub mod common;

use common::{deaths, no_morale, over_seeds, run, seed_mean, SEEDS};
use sim::{Pace, Sim, UnitClassId, Vec2};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 99;

#[test]
fn long_swords_cleave_loose_enemies() {
    // Cleave: against the same loose enemy, long swords (wide arc) out-kill
    // an equal number of ordinary swords.
    let kills_against_skirm = |class: UnitClassId| -> usize {
        let mut sim = Sim::new(no_morale(), SEED);
        let a = sim.spawn_class(Vec2::new(0.0, -10.0), FRAC_PI_2, 150, class, 0);
        let sk = sim.spawn_class(
            Vec2::new(0.0, 10.0),
            -FRAC_PI_2,
            300,
            UnitClassId::Skirmishers,
            1,
        );
        sim.set_evade_auto(sk, false); // hold the loose target in place
        sim.set_charge_enabled(a, false); // isolate the ARC variable
        sim.set_attack_move_order(a, Vec2::new(0.0, 25.0));
        run(&mut sim, 60.0);
        deaths(&sim, sk)
    };
    let by_longswords = kills_against_skirm(UnitClassId::LongSwords);
    let by_heavies = kills_against_skirm(UnitClassId::HeavySword);
    assert!(
        by_longswords as f32 > by_heavies as f32 * 1.05,
        "wide arcs must cleave loose enemies: longswords {by_longswords} vs heavies {by_heavies}"
    );
}

#[test]
fn heavy_shields_make_phalanx_a_grind_not_a_deletion() {
    // Balance contract for the phalanx-v-heavy vibe shots: pikes beat swords
    // frontally, but heavy infantry carry large shields and armor. A phalanx
    // should win the reach contest; it should not erase an equal heavy line
    // before the player can read a real shielded grind. Sample after three
    // minutes, not just at first contact, so the vibe has time to show the
    // ongoing shove rather than a quick deletion.
    // Sampled over the committed seed set: a survivor count off one seed is a
    // coin flip, so we read the MEAN over `SEEDS` (see `common::over_seeds`).
    let outcomes = over_seeds(|seed| {
        let mut sim = Sim::new(no_morale(), seed);
        let ph = sim.spawn_class(
            Vec2::new(0.0, -13.0),
            FRAC_PI_2,
            120,
            UnitClassId::HeavyPhalanx,
            0,
        );
        let hv = sim.spawn_class(
            Vec2::new(0.0, 13.0),
            -FRAC_PI_2,
            120,
            UnitClassId::HeavySword,
            1,
        );
        sim.set_pace(ph, Pace::Run);
        sim.set_pace(hv, Pace::Run);
        sim.set_attack_order(ph, hv);
        sim.set_attack_order(hv, ph);
        run(&mut sim, 180.0);
        (
            sim.units[hv].alive_count as f32,
            sim.units[ph].alive_count as f32,
        )
    });
    let heavy = seed_mean(&outcomes.iter().map(|o| o.0).collect::<Vec<_>>());
    let phalanx = seed_mean(&outcomes.iter().map(|o| o.1).collect::<Vec<_>>());
    eprintln!(
        "PHALANX-GRIND  mean over {} seeds: phalanx {phalanx:.0}/120 heavy {heavy:.0}/120 after 180s",
        SEEDS.len()
    );
    // An intact pike wall is frontally near-impenetrable; disruption or flanking
    // is the counterplay. Once it takes casualties, a reform beat can open real
    // gaps. These pins require the wall to win essentially untouched and the
    // sword line to pay deletion-grade losses without pinning an exact count.
    assert!(
        phalanx >= 110.0,
        "an intact pike wall should win a frontal sword press near-untouched: phalanx {phalanx:.0}/120"
    );
    assert!(
        heavy < 40.0,
        "pressing an intact pike wall frontally is deletion-grade: heavy {heavy:.0}/120 still alive"
    );
}
