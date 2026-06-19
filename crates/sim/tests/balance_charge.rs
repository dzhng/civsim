//! BALANCE tests for cavalry/charge MATCHUPS — how the classes price out
//! against each other in a charge (a kill RATIO, a class-vs-class comparison).
//! These assert OUTCOMES that move as the economy and the trample physics are
//! retuned — distinct from the `mechanics_*` charge INVARIANTS (penetration
//! depth, the charge develops, the hedge holds at reach). Migrated out of
//! `class_scenarios.rs` so the physics emergence and the matchup pricing are
//! no longer interleaved in one file.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::PI;

const SEED: u64 = 11;

#[test]
fn light_horse_tramples_at_a_third_the_butchery() {
    // The same four-deep frontal charge through 200 light foot two deep:
    // heavy horse rides men DOWN; light horse (horse archers) picks its way
    // through at a FRACTION of the deaths — measured at ~a third, not half:
    // the bow-horse has neither the mass nor the lance to ride a line under.
    // The per-seed ratio is knife-edge (0.19-0.36 across seeds — a borderline
    // trample sits right on the chaos), so we AVERAGE over seeds and assert
    // the robust central tendency, not one lucky roll.
    let impact_dead = |class: UnitClassId, seed: u64| -> usize {
        let mut sim = Sim::new(
            Tunables { morale_enabled: false, ..Tunables::default() },
            seed,
        );
        let line = sim.spawn_unit(Vec2::new(0.0, 40.0), -PI / 2.0, 200, 100, Vec2::new(1.0, 1.1), 0, 0.7);
        let cav = sim.spawn_class(Vec2::new(0.0, -60.0), PI / 2.0, 400, class, 1);
        sim.set_files(cav, 100); // 4 deep
        sim.set_charge_enabled(cav, true); // equal posture: the variable is the HOOF
        sim.set_pace(cav, sim::Pace::Run);
        sim.set_attack_order(cav, line);
        let mut contact_at = None;
        for step in 0..(40.0 / DT) as usize {
            sim.tick();
            if contact_at.is_none() && sim.units[line].engaged > 10 {
                contact_at = Some(step);
            }
            if let Some(c) = contact_at {
                if step > c + (4.0 / DT) as usize {
                    break;
                }
            }
        }
        200 - sim.units[line].alive_count
    };
    let (mut heavy_sum, mut light_sum) = (0usize, 0usize);
    let seeds = [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4];
    for s in seeds {
        heavy_sum += impact_dead(UnitClassId::ShockCavalry, s);
        light_sum += impact_dead(UnitClassId::HorseArchers, s);
    }
    let ratio = light_sum as f32 / heavy_sum.max(1) as f32;
    println!("impact dead over {} seeds: heavy {heavy_sum}, light {light_sum} (ratio {ratio:.2})", seeds.len());
    // ~a third, and unambiguously LESS than heavy. Wide band: the claim is
    // the fraction's magnitude, not a knife-edge number.
    assert!(
        (0.18..=0.5).contains(&ratio),
        "light horse tramples at ~a third of heavy's butchery: ratio {ratio:.2}"
    );
}

#[test]
#[ignore = "blocked on POINTS-STOP-HORSE / impale rework (task #66): pikes unhorse 0 riders \
            (vs 0 for swords) — points don't kill horse at reach yet (specs/impale.md)"]
fn pikes_unhorse_cavalry_swords_chip_at_horseflesh() {
    // Target priority is GEOMETRY: a strike lands on the rider whenever the
    // weapon spans to his perch (to_center <= reach), and only soaks into
    // the mount otherwise. Pikes fight at 3.2m and span to the man; swords
    // at 1.1m almost never do — and a horse is several times the man's
    // health, so chipping at horseflesh is a losing proposition.
    let cav_dead = |attacker: UnitClassId, seed: u64| -> usize {
        let mut sim = Sim::new(
            Tunables { morale_enabled: false, ..Tunables::default() },
            seed,
        );
        let atk = sim.spawn_class(Vec2::new(0.0, -14.0), PI / 2.0, 240, attacker, 0);
        let cav = sim.spawn_class(Vec2::new(0.0, 14.0), -PI / 2.0, 120, UnitClassId::ShockCavalry, 1);
        sim.set_charge_enabled(atk, false); // isolate weapon geometry
        sim.set_pace(atk, sim::Pace::Run); // a committed assault
        sim.set_attack_order(atk, cav);
        // Early window: frontal geometry dominates before the scrum
        // interpenetrates and gives swords side access to the riders.
        for _ in 0..(20.0 / DT) as usize {
            sim.tick();
        }
        let u = &sim.units[cav];
        u.count - u.alive_count
    };
    // Per-seed the kill counts are tiny (0-4) and knife-edge — a single seed can
    // read 1-vs-1. The GEOMETRY (pikes span to the rider, swords almost never) is
    // the seed AVERAGE, so SUM over a seed set and compare the totals.
    let seeds = [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4];
    let by_pikes: usize = seeds.iter().map(|&s| cav_dead(UnitClassId::Phalanx, s)).sum();
    let by_swords: usize = seeds.iter().map(|&s| cav_dead(UnitClassId::HeavySword, s)).sum();
    println!("cav dead over {} seeds: pikes {by_pikes}, swords {by_swords}", seeds.len());
    assert!(
        by_pikes as f32 > by_swords as f32 * 2.0,
        "pikes unhorse riders, swords struggle: {by_pikes} vs {by_swords} over seeds"
    );
}
