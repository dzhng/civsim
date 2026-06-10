//! Unit class stat tables. Data, not code: every class difference must be a
//! number here, never a special case in a system. Wired into spawning in
//! Phase 2; weapons consumed by combat in Phase 3.

use crate::math::Vec2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UnitClassId {
    HeavyInfantry,
    LightInfantry,
    LongSwords,
    Phalanx,
    Archers,
    Skirmishers,
    ShockCavalry,
    HorseArchers,
    ArtilleryCrew,
}

/// A weapon is a set of physical capabilities. Soldiers with several pick by
/// target distance (pike useless inside its min_range -> draw swords).
#[derive(Clone, Copy, Debug)]
pub struct Weapon {
    /// Max strike distance (m). Pike reach lets ranks 1-3 fight past rank 1.
    pub reach: f32,
    /// Inside this distance the weapon is useless (m).
    pub min_range: f32,
    /// Seconds between swings, fresh and unpressed.
    pub attack_interval: f32,
    /// Push impulse imparted on hit OR block, before mass ratio scaling.
    pub push: f32,
    /// Damage per landed hit.
    pub damage: f32,
    /// Fighting-space requirement: effectiveness falls as a soldier's crush
    /// pressure exceeds this. Daggers thrive in a press; great swords die.
    pub room_needed: f32,
    /// Cleave: a swing strikes up to this many enemies in the frontal arc.
    /// Crush degrades cleave first, then attack speed, then everything.
    pub max_targets: u32,
}

#[derive(Clone, Copy, Debug)]
pub struct UnitClass {
    pub id: UnitClassId,
    /// Multiplies the global walk/run/surge speeds.
    pub speed_mult: f32,
    pub soldier_radius: f32,
    /// Collision/push mass. Bracing multiplies effective mass on top.
    pub mass: f32,
    /// (lateral, rank-depth) spacing at Normal density.
    pub spacing: Vec2,
    /// Ranks for the group-drag depth invariant.
    pub default_depth: usize,
    pub health: f32,
    /// Chance to block (melee + missiles, front arc only; still pushed).
    pub block: f32,
    /// Chance to evade (melee only, no push; zero under crush).
    pub evade: f32,
    pub training: f32,
    pub weapons: &'static [Weapon],
}

const SPEAR: Weapon = Weapon {
    reach: 1.6,
    min_range: 0.0,
    attack_interval: 1.6,
    push: 0.5,
    damage: 0.34,
    room_needed: 0.5,
    max_targets: 1,
};

const SWORD: Weapon = Weapon {
    reach: 1.1,
    min_range: 0.0,
    attack_interval: 1.3,
    push: 0.4,
    damage: 0.4,
    room_needed: 0.8,
    max_targets: 1,
};

const LONG_SWORD: Weapon = Weapon {
    reach: 1.8,
    min_range: 0.4,
    attack_interval: 1.9,
    push: 0.7,
    damage: 0.55,
    room_needed: 2.2,
    max_targets: 3,
};

const PIKE: Weapon = Weapon {
    reach: 3.2,
    min_range: 1.2,
    attack_interval: 1.8,
    push: 0.9,
    damage: 0.4,
    room_needed: 0.35,
    max_targets: 1,
};

const SIDE_SWORD: Weapon = Weapon {
    reach: 1.0,
    min_range: 0.0,
    attack_interval: 1.3,
    push: 0.3,
    damage: 0.34,
    room_needed: 0.7,
    max_targets: 1,
};

const DAGGER: Weapon = Weapon {
    reach: 0.8,
    min_range: 0.0,
    attack_interval: 1.0,
    push: 0.2,
    damage: 0.28,
    room_needed: 0.25,
    max_targets: 1,
};

const LANCE: Weapon = Weapon {
    reach: 2.4,
    min_range: 0.8,
    attack_interval: 2.2,
    push: 1.2,
    damage: 0.6,
    room_needed: 0.9,
    max_targets: 1,
};

const CAV_SWORD: Weapon = Weapon {
    reach: 1.3,
    min_range: 0.0,
    attack_interval: 1.4,
    push: 0.5,
    damage: 0.45,
    room_needed: 0.9,
    max_targets: 1,
};

pub fn class_stats(id: UnitClassId) -> UnitClass {
    use UnitClassId::*;
    match id {
        HeavyInfantry => UnitClass {
            id,
            speed_mult: 0.9,
            soldier_radius: 0.34,
            mass: 1.3,
            spacing: Vec2::new(0.9, 1.1),
            default_depth: 8,
            health: 1.3,
            block: 0.45,
            evade: 0.08,
            training: 0.75,
            weapons: &[SWORD],
        },
        LightInfantry => UnitClass {
            id,
            speed_mult: 1.1,
            soldier_radius: 0.32,
            mass: 0.95,
            spacing: Vec2::new(1.0, 1.2),
            default_depth: 6,
            health: 1.0,
            block: 0.15,
            evade: 0.3,
            training: 0.55,
            weapons: &[SPEAR],
        },
        LongSwords => UnitClass {
            id,
            speed_mult: 1.0,
            soldier_radius: 0.33,
            mass: 1.1,
            spacing: Vec2::new(1.5, 1.4),
            default_depth: 4,
            health: 1.15,
            block: 0.2,
            evade: 0.22,
            training: 0.8,
            weapons: &[LONG_SWORD],
        },
        Phalanx => UnitClass {
            id,
            speed_mult: 0.85,
            soldier_radius: 0.33,
            mass: 1.2,
            spacing: Vec2::new(0.8, 1.0),
            default_depth: 10,
            health: 1.1,
            block: 0.35,
            evade: 0.08,
            training: 0.8,
            weapons: &[PIKE, SIDE_SWORD],
        },
        Archers => UnitClass {
            id,
            speed_mult: 1.05,
            soldier_radius: 0.32,
            mass: 0.9,
            spacing: Vec2::new(1.2, 1.3),
            default_depth: 4,
            health: 0.9,
            block: 0.1,
            evade: 0.25,
            training: 0.6,
            weapons: &[DAGGER],
        },
        Skirmishers => UnitClass {
            id,
            speed_mult: 1.2,
            soldier_radius: 0.31,
            mass: 0.85,
            spacing: Vec2::new(1.6, 1.6),
            default_depth: 3,
            health: 0.9,
            block: 0.12,
            evade: 0.35,
            training: 0.5,
            weapons: &[DAGGER],
        },
        ShockCavalry => UnitClass {
            id,
            speed_mult: 2.6,
            soldier_radius: 0.55,
            mass: 4.5,
            spacing: Vec2::new(1.8, 2.4),
            default_depth: 5,
            health: 1.6,
            block: 0.25,
            evade: 0.12,
            training: 0.75,
            weapons: &[LANCE, CAV_SWORD],
        },
        HorseArchers => UnitClass {
            id,
            speed_mult: 2.8,
            soldier_radius: 0.55,
            mass: 3.8,
            spacing: Vec2::new(2.2, 2.6),
            default_depth: 5,
            health: 1.2,
            block: 0.1,
            evade: 0.25,
            training: 0.65,
            weapons: &[CAV_SWORD],
        },
        ArtilleryCrew => UnitClass {
            id,
            speed_mult: 0.9,
            soldier_radius: 0.32,
            mass: 0.9,
            spacing: Vec2::new(2.0, 2.0),
            default_depth: 4,
            health: 0.9,
            block: 0.05,
            evade: 0.15,
            training: 0.6,
            weapons: &[DAGGER],
        },
    }
}
