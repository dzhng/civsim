//! Shared helpers for integration tests.
//!
//! Keep this module small and behavior-neutral. If a helper starts encoding a
//! scenario's policy, leave it local to that scenario file so the assertion
//! remains readable at the call site.

#![allow(dead_code)]

use sim::{Sim, Tunables, Vec2, DT};

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
