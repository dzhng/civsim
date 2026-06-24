//! Shared helpers for integration tests.
//!
//! Keep this module small and behavior-neutral. If a helper starts encoding a
//! scenario's policy, leave it local to that scenario file so the assertion
//! remains readable at the call site.

use sim::{Sim, Tunables, Vec2, DT};

/// The committed seed set, re-exported so every outcome test samples the SAME
/// fixed seeds. A single duel is RNG-dependent — one seed chases noise — so any
/// assertion on a noisy OUTCOME (who wins, survivor fractions, kill/death
/// counts, penetration metres, shove distance) must read the AGGREGATE over
/// this set, never one lucky draw. (Deterministic mechanics invariants —
/// symmetry, a force's sign, immortal-unit geometry — may stay single-seed.)
pub use sim::SEEDS;

/// Sample `measure` once per committed seed and collect the per-seed values.
/// The outcome test then asserts on the aggregate (`seed_mean`, a win count,
/// `Spread`) instead of a single seed. This is THE standard for a priced/noisy
/// outcome — see `tests/README.md`.
///
/// ```ignore
/// let surv = over_seeds(|seed| {
///     let mut sim = Sim::new(no_morale(), seed);
///     // … set up, run, measure …
///     sim.units[hv].alive_count as f32
/// });
/// assert!(seed_mean(&surv) > 55.0, "heavy holds: mean {:.0}", seed_mean(&surv));
/// ```
pub fn over_seeds<T>(measure: impl FnMut(u64) -> T) -> Vec<T> {
    SEEDS.iter().copied().map(measure).collect()
}

/// Mean of a metric sampled over the seed set — the robust summary a balance
/// assertion should read instead of one seed's value.
pub fn seed_mean(vals: &[f32]) -> f32 {
    if vals.is_empty() {
        return 0.0;
    }
    vals.iter().sum::<f32>() / vals.len() as f32
}

/// Min/mean/max of a metric over the seed set. Use when an assertion cares that
/// EVERY seed clears a bar (`.min`), not just the average — e.g. "the charge is
/// never repulsed", "no seed deletes the line".
#[derive(Clone, Copy, Debug)]
pub struct Spread {
    pub mean: f32,
    pub min: f32,
    pub max: f32,
}

impl Spread {
    pub fn of(vals: &[f32]) -> Spread {
        let mean = seed_mean(vals);
        let min = vals.iter().copied().fold(f32::INFINITY, f32::min);
        let max = vals.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        Spread { mean, min, max }
    }
}

/// Mechanics isolation: disable morale so geometry/pressure/combat mechanics
/// are not hidden by rout timing.
pub fn no_morale() -> Tunables {
    Tunables {
        morale_enabled: false,
        ..Tunables::default()
    }
}

/// Mechanics isolation on a parade-ground field: no morale, no terrain jitter.
pub fn no_morale_parade() -> Tunables {
    Tunables {
        micro_rough: 0.0,
        ..no_morale()
    }
}

pub fn run(sim: &mut Sim, seconds: f32) {
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
    }
}

pub fn deaths(sim: &Sim, unit: usize) -> usize {
    sim.units[unit].count - sim.units[unit].alive_count
}

/// Mean position of a unit's living soldiers.
pub fn living_mean(sim: &Sim, unit: usize) -> Vec2 {
    let u = &sim.units[unit];
    let mut sum = Vec2::ZERO;
    let mut n = 0usize;
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 1 {
            sum = sum + sim.soldier_pos(i);
            n += 1;
        }
    }
    sum * (1.0 / n.max(1) as f32)
}
