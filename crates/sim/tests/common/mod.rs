//! Shared helpers for integration tests.
//!
//! Keep this module small and behavior-neutral. If a helper starts encoding a
//! scenario's policy, leave it local to that scenario file so the assertion
//! remains readable at the call site.
//!
//! (Each test binary compiles this module and uses only a subset, so some
//! helpers read as dead in any single binary — expected for a shared module.)
#![allow(dead_code)]

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

// ───────────────────────── FAKE REFERENCE UNITS ─────────────────────────
// Scenario tests build on these, NOT real classes, so a balance retune of a
// real unit can never break a scenario — and the fixed stats here double as
// reference points when balancing (see tests/README.md). Base classes supply
// only STRUCTURE (foot/phalanx/mounted body, doctrine); every balance-relevant
// number — HP, block, evade, weapons, and the missile spec — is test-owned.

use sim::{
    class, class_stats, MissileKind, MissileSpec, UnitClass, UnitClassId, Weapon, WeaponKind,
};

/// Reference one-handed sword: a standard front-cone blade.
pub const REF_SWORD: Weapon = Weapon {
    reach: 1.1,
    min_range: 0.0,
    zones: sim::strike::front(0.7),
    attack_interval: 4.1,
    damage: 0.5,
    cleave: false,
    impales: false,
    kind: WeaponKind::Standard,
};
/// Reference sarissa: a long braced points-wall with a dead zone up close.
pub const REF_PIKE: Weapon = Weapon {
    reach: 3.2,
    min_range: 1.1,
    zones: sim::strike::front(0.04),
    attack_interval: 3.8,
    damage: 0.4,
    cleave: false,
    impales: true,
    kind: WeaponKind::Hedge,
};
/// Reference foot bow (apply with `sim.set_missile_spec`).
pub const REF_BOW: MissileSpec = MissileSpec {
    kind: MissileKind::Arrow,
    range: 150.0,
    launch_speed: 42.0,
    interval: 6.0,
    ammo: 30,
    damage: 0.62,
    scatter_at_max: 6.0,
    mobile_fire: false,
};
/// Reference horse bow: shorter, smaller quiver, fires on the move.
pub const REF_HORSE_BOW: MissileSpec = MissileSpec {
    kind: MissileKind::Arrow,
    range: 110.0,
    launch_speed: 38.0,
    interval: 7.0,
    ammo: 24,
    damage: 0.5,
    scatter_at_max: 7.0,
    mobile_fire: true,
};

/// A fake heavy melee line: 2 HP, a 0.5 shield, REF_SWORD. `charge` drives it in.
pub fn ref_melee(charge: bool) -> UnitClass {
    let mut s = class_stats(UnitClassId::Peasant);
    s.health = 2.0;
    s.block = 0.5;
    s.evade = 0.1;
    s.weapons = class::one(REF_SWORD);
    s.brace_mult = 1.5;
    s.mass = 1.5;
    s.soldier_radius = 0.34;
    s.spacing = Vec2::new(1.0, 1.0);
    s.training = 0.75;
    s.charge = charge;
    s
}

/// A fake pike wall: REF_PIKE + REF_SWORD sidearm, strict-file phalanx body, a
/// frontal shield. The braced hedge holds swords at sarissa's length.
pub fn ref_pike() -> UnitClass {
    let mut s = class_stats(UnitClassId::HeavyPhalanx);
    s.health = 1.8;
    s.block = 0.45;
    s.evade = 0.1;
    s.weapons = class::two(REF_PIKE, REF_SWORD);
    s.brace_mult = 2.0;
    s.mass = 1.5;
    s.soldier_radius = 0.34;
    s.spacing = Vec2::new(0.9, 0.9);
    s.training = 0.8;
    s
}

/// A fake foot archer: no shield, a weak sword in melee, REF_BOW. Soft once the
/// line reaches it.
pub fn ref_archer() -> UnitClass {
    let mut s = class_stats(UnitClassId::Archers);
    s.health = 1.1;
    s.block = 0.0;
    s.evade = 0.25;
    s.weapons = class::one(Weapon {
        damage: 0.3,
        ..REF_SWORD
    });
    s.training = 0.6;
    s
}

/// Reference couched lance: one lethal forward skewer on the charge.
pub const REF_LANCE: Weapon = Weapon {
    reach: 2.4,
    min_range: 0.0,
    zones: sim::strike::front(0.2),
    attack_interval: 5.0,
    damage: 1.6,
    cleave: false,
    impales: false,
    kind: WeaponKind::Charge,
};
/// Reference cavalry sabre: a flank-lobe blade for the grind, at parity damage
/// with a foot sword. With the horse shielding the rider, this makes a walked-in
/// cav beat medium foot head-on (foot waste blows on the mount) yet lose to heavy.
pub const REF_SABRE: Weapon = Weapon {
    reach: 1.5,
    min_range: 0.0,
    zones: sim::strike::flanks(1.55, 0.85),
    attack_interval: 4.2,
    damage: 0.5,
    cleave: false,
    impales: false,
    kind: WeaponKind::Standard,
};

/// A fake shock cavalry: mounted, a couched lance + a flank sabre, charges,
/// frontal shield, a horse to soak. The reference for charge/walk-in mechanics.
pub fn ref_shock_cav() -> UnitClass {
    let mut s = class_stats(UnitClassId::ShockCavalry);
    s.health = 1.4;
    s.mount_health = 5.0;
    s.block = 0.4;
    s.evade = 0.12;
    s.weapons = class::two(REF_LANCE, REF_SABRE);
    s.charge = true;
    s.training = 0.75;
    s.bravery = 1.3;
    s
}

/// A fake horse archer: mounted, no shield, a flank sabre, REF_HORSE_BOW.
pub fn ref_horse_archer() -> UnitClass {
    let mut s = class_stats(UnitClassId::HorseArchers);
    s.health = 1.2;
    s.block = 0.0;
    s.evade = 0.3;
    s.weapons = class::one(Weapon {
        reach: 1.5,
        zones: sim::strike::flanks(1.55, 0.85),
        ..REF_SWORD
    });
    s.training = 0.65;
    s
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

/// A fake SPEARMAN (not a phalanx): a Standard-doctrine foot with a reach spear
/// front-lobe + a sword sidearm for when the horse is inside the point. `impales`
/// gives the spear the pike's charge-impale (the planted-point upfront stop).
/// Shared by the rider-grind geometry tests (mechanics) and the anti-cav inf-weapon
/// sweeps (scenario_cavalry).
pub fn ref_spear(reach: f32, damage: f32, impales: bool) -> UnitClass {
    let mut s = ref_melee(false);
    s.brace_mult = 2.0;
    s.weapons = class::two(
        Weapon {
            reach,
            min_range: 0.0,
            zones: sim::strike::front(0.3),
            attack_interval: 4.4,
            damage,
            cleave: false,
            impales,
            kind: WeaponKind::Standard, // a SPEAR, not a hedge — slews to any angle
        },
        REF_SWORD,
    );
    s
}

/// Spawn a FAKE shock-cav unit (test-owned stats — balance-independent), 24 files.
pub fn spawn_cav(sim: &mut Sim, pos: Vec2, facing: f32, n: usize, team: u32) -> usize {
    sim.spawn_class_stats_with_files(
        pos,
        facing,
        n,
        24,
        UnitClassId::ShockCavalry,
        ref_shock_cav(),
        team,
    )
}
