//! Secondary weapons: switching takes a moment (per soldier AND down the
//! unit line), the drawn order overrides judgment, slung bows go quiet.

use sim::{class_stats, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 808;

fn no_morale() -> Tunables {
    Tunables {
        morale_enabled: false,
        ..Tunables::default()
    }
}

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
    let _t = sim.spawn_class(Vec2::new(0.0, 100.0), -FRAC_PI_2, 300, UnitClassId::HeavyInfantry, 1);
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
    assert_eq!(sim.units[a].weapon_pref, 0, "the order is still propagating");
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
    let mut sim = Sim::new(no_morale(), SEED);
    let ph = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 300, UnitClassId::Phalanx, 0);
    let foe = sim.spawn_class(Vec2::new(0.0, 12.0), -FRAC_PI_2, 300, UnitClassId::HeavyInfantry, 1);
    sim.set_attack_order(foe, ph);
    for _ in 0..(25.0 / DT) as usize {
        sim.tick(); // pike work underway
    }
    let kills_before = sim.units[foe].count - sim.units[foe].alive_count;
    assert!(kills_before > 3, "setup: pikes must be landing");
    sim.set_weapon_pref(ph, true); // ground pikes, draw swords
    // Order travel (1s) + per-man fumble (1s): expect a quiet beat.
    let mut quiet_window_kills = 0;
    let before = sim.units[foe].count - sim.units[foe].alive_count;
    for _ in 0..(2.0 / DT) as usize {
        sim.tick();
    }
    quiet_window_kills = (sim.units[foe].count - sim.units[foe].alive_count) - before;
    // Then swords come out and the killing resumes.
    let resumed_from = sim.units[foe].count - sim.units[foe].alive_count;
    for _ in 0..(20.0 / DT) as usize {
        sim.tick();
    }
    let resumed_kills = (sim.units[foe].count - sim.units[foe].alive_count) - resumed_from;
    assert!(
        resumed_kills as f32 > quiet_window_kills as f32 * 1.8,
        "after the fumble the swords work: {resumed_kills} vs {quiet_window_kills} in the swap beat"
    );
}
