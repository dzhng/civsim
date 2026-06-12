//! Battle pacing: mirror duels must be GRINDS decided by attrition, not
//! flash routs. High-tier infantry fights into deep casualties before
//! breaking; low-tier breaks around half strength; either way the fight
//! runs minutes, not seconds.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 9001;

/// (seconds to first rout, loser dead-fraction at that moment)
fn mirror(class: UnitClassId) -> (f32, f32) {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let a = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, 200, class, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 40.0), -FRAC_PI_2, 200, class, 1);
    // Charge dynamics are tuned elsewhere; pacing measures the GRIND.
    sim.set_charge_enabled(a, false);
    sim.set_charge_enabled(b, false);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    for step in 0..(600.0 / DT) as usize {
        sim.tick();
        for &u in &[a, b] {
            if sim.units[u].routing {
                let lu = &sim.units[u];
                let dead_frac = 1.0 - lu.alive_count as f32 / lu.count as f32;
                return (step as f32 * DT, dead_frac);
            }
        }
    }
    (600.0, 0.0)
}

#[test]
fn mirror_duels_are_attrition_grinds() {
    let (t_heavy, dead_heavy) = mirror(UnitClassId::HeavyInfantry);
    println!("HEAVY mirror: first rout at {t_heavy:.0}s, loser {:.0}% dead", dead_heavy * 100.0);
    let (t_light, dead_light) = mirror(UnitClassId::LightInfantry);
    println!("LIGHT mirror: first rout at {t_light:.0}s, loser {:.0}% dead", dead_light * 100.0);
    // High-tier: fights to ~20% strength (>=65% dead) over 3+ minutes.
    assert!(
        t_heavy > 180.0 && t_heavy < 540.0,
        "heavies grind for minutes: routed at {t_heavy:.0}s"
    );
    assert!(
        dead_heavy > 0.65,
        "heavies fight near to the death: {:.0}% dead at the break",
        dead_heavy * 100.0
    );
    // Low-tier: breaks around half strength, sooner.
    assert!(
        t_light > 120.0 && t_light < t_heavy,
        "lights break sooner: {t_light:.0}s vs {t_heavy:.0}s"
    );
    assert!(
        dead_light > 0.30 && dead_light < 0.65,
        "lights break around half strength: {:.0}% dead",
        dead_light * 100.0
    );
}
