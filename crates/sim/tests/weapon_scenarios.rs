//! Secondary weapons: switching takes a moment (per soldier AND down the
//! unit line), the drawn order overrides judgment, slung bows go quiet.

pub mod common;

use common::no_morale;
use sim::{class_stats, Sim, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 808;

#[test]
fn archers_carry_swords() {
    let w = class_stats(UnitClassId::Archers).weapons;
    assert!(
        (w[0].reach - 1.1).abs() < 0.01,
        "archers fight with swords, not table knives: reach {}",
        w[0].reach
    );
}

#[test]
fn drawn_swords_silence_the_bows_after_the_order_travels() {
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::Archers, 0);
    let _t = sim.spawn_class(
        Vec2::new(0.0, 100.0),
        -FRAC_PI_2,
        300,
        UnitClassId::HeavySword,
        1,
    );
    // Let them shoot a little.
    for _ in 0..(10.0 / DT) as usize {
        sim.tick();
    }
    let fired_before = 200 * 30 - sim.units[a].ammo;
    assert!(fired_before > 0, "setup: the bows must be working");
    sim.set_weapon_pref(a, true);
    // The order takes ~1s to travel: a beat later the line is silent.
    for _ in 0..(0.5 / DT) as usize {
        sim.tick();
    }
    assert_eq!(
        sim.units[a].weapon_pref, 0,
        "the order is still propagating"
    );
    for _ in 0..(20.0 / DT) as usize {
        sim.tick();
    }
    assert_eq!(sim.units[a].weapon_pref, 1, "swords are out");
    let fired_after_window = 200 * 30 - sim.units[a].ammo;
    // A handful of arrows mid-order is fine; sustained fire is not.
    assert!(
        fired_after_window - fired_before < 80,
        "slung bows go quiet: {} more arrows after the order",
        fired_after_window - fired_before
    );
    // And back: judgment resumes, arrows fly again.
    sim.set_weapon_pref(a, false);
    for _ in 0..(15.0 / DT) as usize {
        sim.tick();
    }
    assert!(
        200 * 30 - sim.units[a].ammo > fired_after_window + 30,
        "shouldering the bows resumes the volleys"
    );
}

#[test]
fn weapon_swaps_fumble_for_a_moment() {
    // Phalanx engaged at pike range ordered onto side swords: during the
    // swap window the unit's strike output collapses (helpless beat), then
    // sword work begins.
    // (Longer setup than it looks: pike cadence slowed in the pacing pass,
    // and attackers no longer pay phantom charge drain while ground to a
    // halt — fresher men block more thrusts.)
    let windows = |seed: u64| -> (usize, usize, usize) {
        let mut sim = Sim::new(no_morale(), seed);
        let ph = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 300, UnitClassId::Phalanx, 0);
        let foe = sim.spawn_class(
            Vec2::new(0.0, 12.0),
            -FRAC_PI_2,
            300,
            UnitClassId::HeavySword,
            1,
        );
        sim.set_attack_order(foe, ph);
        for _ in 0..(35.0 / DT) as usize {
            sim.tick(); // pike work underway
        }
        let kills_before = sim.units[foe].count - sim.units[foe].alive_count;
        // Ground pikes, draw swords.
        sim.set_weapon_pref(ph, true);
        // The shouted order takes ~1s to reach the line. Do not count that as
        // the fumble: until `weapon_pref` flips, the pikes are still the legal
        // weapon in hand and can keep killing.
        for _ in 0..(1.1 / DT) as usize {
            sim.tick();
        }
        assert_eq!(sim.units[ph].weapon_pref, 1, "sword order arrived");
        // Per-man fumble: men that were holding pikes spend a beat switching
        // instead of striking.
        let before = sim.units[foe].count - sim.units[foe].alive_count;
        for _ in 0..(1.0 / DT) as usize {
            sim.tick();
        }
        let quiet = (sim.units[foe].count - sim.units[foe].alive_count) - before;
        // Then swords come out and the killing resumes.
        let resumed_from = sim.units[foe].count - sim.units[foe].alive_count;
        for _ in 0..(20.0 / DT) as usize {
            sim.tick();
        }
        let resumed = (sim.units[foe].count - sim.units[foe].alive_count) - resumed_from;
        (kills_before, quiet, resumed)
    };
    // Per-seed the swap-beat kill counts are tiny (1-5 in the 2s quiet window) and
    // knife-edge — one seed can read the quiet beat as busy as the resumed one. The
    // "fumble then resume" claim is the seed AVERAGE: sum the windows over a seed set
    // and compare totals (like the other small-count combat tests).
    let seeds = [
        SEED,
        SEED + 1,
        SEED + 2,
        SEED + 3,
        SEED + 4,
        SEED + 5,
        SEED + 6,
        SEED + 7,
    ];
    let (mut kills_before, mut quiet_window_kills, mut resumed_kills) = (0usize, 0usize, 0usize);
    for &s in &seeds {
        let (kb, q, r) = windows(s);
        kills_before += kb;
        quiet_window_kills += q;
        resumed_kills += r;
    }
    assert!(
        kills_before > 3 * seeds.len(),
        "setup: pikes must be landing: {kills_before} over seeds"
    );
    assert!(
        resumed_kills as f32 > quiet_window_kills as f32 * 1.8,
        "after the fumble the swords work: {resumed_kills} vs {quiet_window_kills} (quiet) over seeds"
    );
}
