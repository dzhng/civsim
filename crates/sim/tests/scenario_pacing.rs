//! Battle pacing: mirror duels must be GRINDS decided by attrition, not
//! flash routs. High-tier infantry fights into deep casualties before
//! breaking; low-tier breaks around half strength; either way the fight
//! runs minutes, not seconds.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// A mirror duel is a BALANCE/fairness claim ("neither side is systematically
/// favored; the loser dies of attrition, not a flash rout"), so it is asserted as
/// a DISTRIBUTION over a seed set, never a single seed — a single decisive fight
/// is *expected* to be lopsided; fairness is the MEDIAN behaviour across seeds.
const SEEDS: [u64; 7] = [9001, 9002, 9003, 9004, 9005, 9006, 9007];

/// (seconds to first rout, loser dead-fraction, winner dead-fraction) on one seed.
fn mirror(class: UnitClassId, seed: u64) -> (f32, f32, f32) {
    // Parade ground: the pacing contract measures the COMBAT economy;
    // micro-terrain adds approach noise that belongs to other tests.
    let mut sim = Sim::new(
        Tunables {
            micro_rough: 0.0,
            ..Tunables::default()
        },
        seed,
    );
    let a = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, 200, class, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 40.0), -FRAC_PI_2, 200, class, 1);
    // Charge dynamics are tuned elsewhere; pacing measures the GRIND.
    sim.set_charge_enabled(a, false);
    sim.set_charge_enabled(b, false);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    // Cap kept generous at 1600s. The combat overhaul (3.8-5.0s attacks, fatigue =
    // -25% damage/hit + collapsing guard) makes fights resolve FAST and decisively:
    // first rout now ~248s (light) / ~476s (heavy), far inside the cap, so no seed
    // hits the (1600,1,1) fallback and pollutes the median.
    for step in 0..(1600.0 / DT) as usize {
        sim.tick();
        for &(lu, wu) in &[(a, b), (b, a)] {
            if sim.units[lu].routing {
                let dead =
                    |u: usize| 1.0 - sim.units[u].alive_count as f32 / sim.units[u].count as f32;
                return (step as f32 * DT, dead(lu), dead(wu));
            }
        }
    }
    (1600.0, 1.0, 1.0)
}

fn median(mut v: Vec<f32>) -> f32 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    v[v.len() / 2]
}

/// A mirror is decided by morale DIVERGENCE, not free kills, so over the seed set
/// the MEDIAN fight is a grind (minutes), the loser dies deep, and the winner pays
/// most of the butcher's bill too (the near-peer ratio is the no-snowball signal).
fn mirror_near_peer(
    name: &str,
    class: UnitClassId,
    t_lo: f32,
    t_hi: f32,
    dead_lo: f32,
    dead_hi: f32,
) {
    let runs: Vec<(f32, f32, f32)> = SEEDS.iter().map(|&s| mirror(class, s)).collect();
    let t = median(runs.iter().map(|r| r.0).collect());
    let dead = median(runs.iter().map(|r| r.1).collect());
    let ratio = median(
        runs.iter()
            .map(|r| (r.2 / r.1.max(1e-6)).min(2.0))
            .collect(),
    );
    println!(
        "{name} mirror (median of {} seeds): first rout {t:.0}s, loser {:.0}% dead, winner-paid {ratio:.2}x",
        SEEDS.len(), dead * 100.0
    );
    assert!(
        t > t_lo && t < t_hi,
        "{name} median grind {t:.0}s out of [{t_lo:.0},{t_hi:.0}]"
    );
    assert!(
        dead > dead_lo && dead < dead_hi,
        "{name} median loser {:.0}% dead, want [{:.0},{:.0}]",
        dead * 100.0,
        dead_lo * 100.0,
        dead_hi * 100.0
    );
    assert!(
        ratio > 0.55 && ratio <= 1.10,
        "{name} mirror must be near-peer (no snowball): winner paid {ratio:.2}x the loser's losses"
    );
}

#[test]
fn mirror_duels_light_is_a_near_peer_grind() {
    // Low-tier contract: a grind decided by attrition (sooner than a heavy),
    // near-peer (no snowball). Post-overhaul combat (3.8-5.0s attack intervals,
    // fatigue = -25% damage/hit + collapsing guard) resolves FAST: the median
    // first rout now lands ~248s with the loser ~64% dead.
    mirror_near_peer("light", UnitClassId::LightSpear, 180.0, 340.0, 0.50, 0.78);
}

#[test]
fn mirror_duels_heavy_should_be_a_near_peer_grind() {
    // High-tier contract: fights to deep casualties, near-peer. Disciplined
    // heavies hold longer than lights, but the faster post-overhaul combat
    // (3.8-5.0s attacks, fatigue = -25% damage/hit + collapsing guard) still
    // resolves decisively: the median first rout lands ~476s, loser ~84% dead.
    mirror_near_peer("heavy", UnitClassId::HeavySword, 350.0, 620.0, 0.72, 0.94);
}
