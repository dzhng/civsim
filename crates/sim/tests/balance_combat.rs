//! BALANCE tests for per-class combat performance — how a unit's stat block
//! (arc, reach, crush cost, evade) prices out in a fight. These assert
//! OUTCOMES (kill differentials, survivor counts under pressure), which move
//! as the economy is retuned — distinct from the `mechanics_*` invariants
//! (cohesion, centroids, penetration) that must hold no matter the balance.
//! Migrated out of `combat_scenarios.rs` so the physics invariants and the
//! pricing outcomes are no longer interleaved in one file.

pub mod common;

use common::{deaths, no_morale, run};
use sim::{Pace, Sim, UnitClassId, Vec2, DT};
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
    let mut sim = Sim::new(no_morale(), 4242);
    let ph = sim.spawn_class(
        Vec2::new(0.0, -13.0),
        FRAC_PI_2,
        120,
        UnitClassId::Phalanx,
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
    for _ in 0..(180.0 / DT) as usize {
        sim.tick();
    }
    let heavy_alive = sim.units[hv].alive_count;
    let phalanx_alive = sim.units[ph].alive_count;
    eprintln!("PHALANX-GRIND  phalanx {phalanx_alive}/120 heavy {heavy_alive}/120 after 180s");
    assert!(
        heavy_alive >= 55,
        "heavy shields/armor should make this a grind, not a deletion: {heavy_alive}/120 alive after 180s"
    );
    assert!(
        phalanx_alive > heavy_alive,
        "the phalanx should still be winning the frontal reach contest: phalanx {phalanx_alive}, heavy {heavy_alive}"
    );
}
