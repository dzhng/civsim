//! MECHANICAL: the gang cap bounds how many attackers can WOUND one man at once.
//! A foe crowded by `gang_cap` comrades takes no further blades — the (cap+1)th
//! attacker presses and shoves but lands no hit. This bounds the local
//! outnumbering that amplifies the attrition runaway (a thinning line wrapped and
//! ground far past even). Measured as the DAMAGE a small immortal defender bleeds
//! when mobbed: it scales with the cap, not with the size of the mob.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// Health a small immortal defender loses while mobbed by a big block for 25 s,
/// at a given gang_cap (large = effectively uncapped).
fn defender_damage(gang_cap: u16) -> f32 {
    // Morale off so the small defender STANDS and is mobbed (it would otherwise
    // rout from the odds and flee out of reach before taking any blows).
    let tun = Tunables {
        micro_rough: 0.0,
        gang_cap,
        morale_enabled: false,
        ..Tunables::default()
    };
    let mut sim = Sim::new(tun, 5);
    let def = sim.spawn_class(
        Vec2::new(0.0, 0.0),
        -FRAC_PI_2,
        30,
        UnitClassId::HeavySword,
        1,
    );
    let atk = sim.spawn_class(
        Vec2::new(0.0, -8.0),
        FRAC_PI_2,
        240,
        UnitClassId::HeavySword,
        0,
    );
    let (s, e) = (
        sim.units[def].start,
        sim.units[def].start + sim.units[def].count,
    );
    for k in s..e {
        sim.health[k] = 1.0e4; // high but f32-precise: survives 25s, damage registers
    }
    let h0: f32 = (s..e).map(|k| sim.health[k]).sum();
    sim.set_pace(atk, sim::Pace::Run);
    sim.set_attack_order(atk, def);
    for _ in 0..(25.0 / DT) as usize {
        sim.tick();
    }
    h0 - (s..e).map(|k| sim.health[k]).sum::<f32>()
}

#[test]
fn the_gang_cap_throttles_a_mobs_damage() {
    let capped = defender_damage(2);
    let uncapped = defender_damage(99);
    eprintln!("defender damage in 25s: gang_cap=2 {capped:.0}  uncapped {uncapped:.0}");
    assert!(
        capped < uncapped * 0.85,
        "the gang cap must throttle a mob's damage on one man: capped {capped:.0} vs uncapped {uncapped:.0}"
    );
}
