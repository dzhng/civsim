//! Battle pacing: mirror duels must be GRINDS decided by attrition, not
//! flash routs. High-tier infantry fights into deep casualties before
//! breaking; low-tier breaks around half strength; either way the fight
//! runs minutes, not seconds.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 9001;

/// (seconds to first rout, loser dead-fraction, winner dead-fraction)
fn mirror(class: UnitClassId) -> (f32, f32, f32) {
    // Parade ground: the pacing contract measures the COMBAT economy;
    // micro-terrain adds approach noise that belongs to other tests.
    let mut sim = Sim::new(Tunables { micro_rough: 0.0, ..Tunables::default() }, SEED);
    let a = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, 200, class, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 40.0), -FRAC_PI_2, 200, class, 1);
    // Charge dynamics are tuned elsewhere; pacing measures the GRIND.
    sim.set_charge_enabled(a, false);
    sim.set_charge_enabled(b, false);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    for step in 0..(600.0 / DT) as usize {
        sim.tick();
        for &(lu, wu) in &[(a, b), (b, a)] {
            if sim.units[lu].routing {
                let dead = |u: usize| 1.0 - sim.units[u].alive_count as f32 / sim.units[u].count as f32;
                return (step as f32 * DT, dead(lu), dead(wu));
            }
        }
    }
    (600.0, 0.0, 0.0)
}

#[test]
fn mirror_duels_are_attrition_grinds() {
    let (t_heavy, dead_heavy, w_heavy) = mirror(UnitClassId::HeavyInfantry);
    println!(
        "HEAVY mirror: first rout at {t_heavy:.0}s, loser {:.0}% dead, winner {:.0}%",
        dead_heavy * 100.0,
        w_heavy * 100.0
    );
    let (t_light, dead_light, w_light) = mirror(UnitClassId::LightInfantry);
    println!(
        "LIGHT mirror: first rout at {t_light:.0}s, loser {:.0}% dead, winner {:.0}%",
        dead_light * 100.0,
        w_light * 100.0
    );
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
    // A mirror match is decided by morale DIVERGENCE, not free kills: the
    // winner pays most of the butcher's bill too.
    for (name, w, l) in [("heavy", w_heavy, dead_heavy), ("light", w_light, dead_light)] {
        let ratio = w / l.max(1e-6);
        assert!(
            ratio > 0.55 && ratio <= 1.05,
            "{name} mirror is near-peer: winner paid {:.2}x the loser's losses",
            ratio
        );
    }
}
