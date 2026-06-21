//! BALANCE tests for cavalry/charge MATCHUPS — how the classes price out
//! against each other in a charge (a kill RATIO, a class-vs-class comparison).
//! These assert OUTCOMES that move as the economy and the trample physics are
//! retuned — distinct from the `mechanics_*` charge INVARIANTS (penetration
//! depth, the charge develops, the hedge holds at reach). Migrated out of
//! `class_scenarios.rs` so the physics emergence and the matchup pricing are
//! no longer interleaved in one file.

use sim::balance::{run_over_seeds, Scenario};
use sim::{class_stats, BalanceConfig, Sim, Tunables, UnitClassId, Vec2, DT};
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
            Tunables {
                morale_enabled: false,
                ..Tunables::default()
            },
            seed,
        );
        let line = sim.spawn_unit(
            Vec2::new(0.0, 40.0),
            -PI / 2.0,
            200,
            100,
            Vec2::new(1.0, 1.1),
            0,
            0.7,
        );
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
    println!(
        "impact dead over {} seeds: heavy {heavy_sum}, light {light_sum} (ratio {ratio:.2})",
        seeds.len()
    );
    // ~a third, and unambiguously LESS than heavy. Wide band: the claim is
    // the fraction's magnitude, not a knife-edge number.
    assert!(
        (0.18..=0.5).contains(&ratio),
        "light horse tramples at ~a third of heavy's butchery: ratio {ratio:.2}"
    );
}

#[test]
fn pikes_reach_riders_swords_chip_at_horseflesh() {
    // Target priority is GEOMETRY: a strike lands on the rider whenever the
    // weapon spans to his perch (to_center <= reach), and only soaks into
    // the mount otherwise. Pikes fight at 3.2m and span to the man; swords
    // at 1.1m almost never do — and a horse is several times the man's
    // health, so chipping at horseflesh is a losing proposition.
    let cav_damage = |attacker: UnitClassId, seed: u64| -> (f32, f32) {
        let mut sim = Sim::new(
            Tunables {
                morale_enabled: false,
                ..Tunables::default()
            },
            seed,
        );
        let atk = sim.spawn_class(Vec2::new(0.0, -14.0), PI / 2.0, 240, attacker, 0);
        let cav = sim.spawn_class(
            Vec2::new(0.0, 14.0),
            -PI / 2.0,
            120,
            UnitClassId::ShockCavalry,
            1,
        );
        sim.set_charge_enabled(atk, false); // isolate weapon geometry
        sim.set_pace(atk, sim::Pace::Run); // a committed assault
        sim.set_attack_order(atk, cav);
        // Early window: frontal geometry dominates before the scrum
        // interpenetrates and gives swords side access to the riders.
        for _ in 0..(20.0 / DT) as usize {
            sim.tick();
        }
        let cav_stats = class_stats(UnitClassId::ShockCavalry);
        let mut rider = 0.0f32;
        let mut mount = 0.0f32;
        let u = &sim.units[cav];
        for i in u.start..u.start + u.count {
            rider += (cav_stats.health - sim.health[i].max(0.0)).clamp(0.0, cav_stats.health);
            mount += (cav_stats.mount_health - sim.mount_health[i].max(0.0))
                .clamp(0.0, cav_stats.mount_health);
        }
        (rider, mount)
    };
    // Kill counts in this early geometry window are tiny and knife-edge; the
    // stable contract is where the damage lands. Sum over a seed set: pikes put
    // proportionally more harm into riders, while swords mostly hack horseflesh.
    let seeds = [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4];
    let mut pike_rider = 0.0f32;
    let mut pike_mount = 0.0f32;
    let mut sword_rider = 0.0f32;
    let mut sword_mount = 0.0f32;
    for s in seeds {
        let (r, m) = cav_damage(UnitClassId::Phalanx, s);
        pike_rider += r;
        pike_mount += m;
        let (r, m) = cav_damage(UnitClassId::HeavySword, s);
        sword_rider += r;
        sword_mount += m;
    }
    let pike_ratio = pike_rider / pike_mount.max(1.0);
    let sword_ratio = sword_rider / sword_mount.max(1.0);
    println!(
        "cav damage over {} seeds: pike rider {pike_rider:.1} mount {pike_mount:.1} (ratio {pike_ratio:.2}); sword rider {sword_rider:.1} mount {sword_mount:.1} (ratio {sword_ratio:.2})",
        seeds.len()
    );
    assert!(
        pike_rider > sword_rider * 1.25,
        "pikes should reach riders more often than swords: {pike_rider:.1} vs {sword_rider:.1}"
    );
    assert!(
        pike_ratio > sword_ratio + 0.25,
        "pikes should concentrate damage higher on the rider than swords do: {pike_ratio:.2} vs {sword_ratio:.2}"
    );
}

#[test]
fn frontal_phalanx_denies_shock_cavalry_a_majority_verdict() {
    // The slow golden matrix catches this across the full class board, but the
    // pike/cavalry contract is important enough to live in the fast suite too:
    // a frontal horse charge can bog, scatter, or draw out, but it must not
    // majority-flip into cavalry beating a presented sarissa hedge.
    let seeds = [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4];
    let base = BalanceConfig::default();
    let tun = Tunables::default();
    for (scn, cav_side) in [
        (
            Scenario::duel(UnitClassId::Phalanx, UnitClassId::ShockCavalry),
            1,
        ),
        (
            Scenario::duel(UnitClassId::ShockCavalry, UnitClassId::Phalanx),
            0,
        ),
    ] {
        let name = scn.name.clone();
        let agg = run_over_seeds(&scn, &base, &tun, &seeds);
        assert_ne!(
            agg.winner(),
            Some(cav_side),
            "{name}: frontal cavalry must not majority-beat a presented phalanx \
             (win-rates {:.0}%/{:.0}%, draw {:.0}%, median {:.0}s)",
            agg.win_rate[0] * 100.0,
            agg.win_rate[1] * 100.0,
            agg.draw_rate * 100.0,
            agg.secs_median
        );
    }
}
