//! Weapons are chosen AUTOMATICALLY — there is no manual "draw swords" order. A
//! two-weapon unit draws its charge weapon only while charging and its sidearm
//! otherwise; a missile unit shoots until a melee closes on it, then the bows go
//! quiet and it fights — all on its own judgment.

pub mod common;

use common::no_morale;
use sim::{class_stats, Sim, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

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
fn engaged_missile_troops_drop_their_bows_on_their_own() {
    // No order to give: while the enemy is at range the bows work; once a melee
    // closes and the front ranks are engaged, a missile unit stops volleying (it
    // can't shoot through its own fighting line) and falls to its sword — chosen
    // automatically from the engagement, not a player toggle.
    let mut sim = Sim::new(no_morale(), 808);
    let arch = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::Archers, 0);
    let foe = sim.spawn_class(Vec2::new(0.0, 18.0), -FRAC_PI_2, 200, UnitClassId::HeavySword, 1);
    sim.set_fire_at_will(arch, true);
    sim.set_attack_order(foe, arch); // the heavy line charges in

    // At range: the bows are working.
    for _ in 0..(5.0 / DT) as usize {
        sim.tick();
    }
    let fired_at_range = 200 * 30 - sim.units[arch].ammo;
    assert!(fired_at_range > 50, "bows must volley at range, fired {fired_at_range}");

    // Let the melee close, then measure: with the line engaged the volleys stop.
    for _ in 0..(9.0 / DT) as usize {
        sim.tick();
    }
    let ammo_at_contact = sim.units[arch].ammo;
    for _ in 0..(10.0 / DT) as usize {
        sim.tick();
    }
    let fired_while_engaged = ammo_at_contact - sim.units[arch].ammo;
    assert!(
        fired_while_engaged * 5 < fired_at_range,
        "an engaged missile unit drops its bows on its own: {fired_while_engaged} arrows \
         while fighting vs {fired_at_range} at range",
    );
}
