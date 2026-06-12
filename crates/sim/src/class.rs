//! Unit class stat tables. Data, not code: every class difference must be a
//! number here, never a special case in a system.

use crate::math::Vec2;

// The class id enum lives in the `contract` crate — it's the shared vocabulary
// between campaign rosters and battle deployments. The stat tables stay here.
pub use contract::UnitClassId;

/// A weapon is a set of physical capabilities — five numbers, nothing else.
/// A swing strikes every enemy inside the (reach × arc) envelope; bodies
/// crowding the envelope obstruct the swing (that IS crush sensitivity).
#[derive(Clone, Copy, Debug)]
pub struct Weapon {
    /// Max strike distance, surface to surface (m).
    pub reach: f32,
    /// Inside this distance the weapon is useless (m).
    pub min_range: f32,
    /// Swing width (radians). Pike ≈ a line; great sword sweeps wide.
    pub arc: f32,
    /// Seconds between swings, fresh and unobstructed.
    pub attack_interval: f32,
    /// Damage per landed hit.
    pub damage: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct UnitClass {
    pub id: UnitClassId,
    /// Multiplies the global walk/run/surge speeds.
    pub speed_mult: f32,
    pub soldier_radius: f32,
    /// Collision/push mass. Bracing multiplies effective mass on top.
    pub mass: f32,
    /// Effective-mass multiplier when halted and set (planted feet, shields
    /// locked, pikes grounded).
    pub brace_mult: f32,
    /// Mounted: body is two circles (front/rear) along facing; the rider sits
    /// at the center with his own health pool, reachable only by geometry.
    pub mounted: bool,
    /// (lateral, rank-depth) spacing at Normal density.
    pub spacing: Vec2,
    /// Ranks for the group-drag depth invariant.
    pub default_depth: usize,
    /// The MAN's health, every class (the rider, when mounted — he sits
    /// at the body's center, reachable only when the weapon spans to him).
    pub health: f32,
    /// The mount's body pool (mounted only; the horse is the big target).
    pub mount_health: f32,
    /// Chance to block (melee + missiles, front arc only; still pushed).
    pub block: f32,
    /// Chance to evade (melee only, no push; zero under crush pressure).
    pub evade: f32,
    pub training: f32,
    /// Default combat stance (player can toggle): Othismos = press the
    /// shove; Fence = fight at weapon's length.
    pub stance: crate::unit::Stance,
    /// Charge by default: burst to charge speed in the last ~2s of an
    /// explicit attack approach. (Player can toggle; pikes hold formation.)
    pub charge: bool,
    /// Keeps driving through contact while charging instead of planting at
    /// weapon's length: the trample is the charge. Horses today; the knob
    /// exists for chariots — or shock infantry, if the engine goes fancy.
    /// (Independent of `mounted`, which is body geometry: two circles and
    /// a rider pool.)
    pub tramples: bool,
    /// Knockdown-damage multiplier for what this body DEALS when it fells
    /// a man. Pure per-unit data: foot 0 (men bowling men bruise), heavy
    /// horse 1.0, light horse picks its way through at a fraction; a
    /// chariot would put nearly everything here and nothing in weapon dps.
    /// (`tramples` above is pure BEHAVIOR: keep riding through contact.)
    pub knockback_mult: f32,
    /// Stamina drain multiplier: the cost of the kit. Every draining second
    /// (running, fighting, charging, bad ground) is scaled by this — armor
    /// is paid for in wind, so heavies blow out long before a screen does.
    pub drain_mult: f32,
    pub weapons: &'static [Weapon],
}

/// Offset of a mounted body's two circles from its center, along facing (m).
pub const HORSE_HALF_LEN: f32 = 0.55;
/// Radius of each mounted body circle (m).
pub const HORSE_BODY_R: f32 = 0.5;

const SPEAR: Weapon = Weapon {
    reach: 1.6,
    min_range: 0.0,
    arc: 0.6,
    attack_interval: 2.2,
    damage: 0.13,
};

const SWORD: Weapon = Weapon {
    reach: 1.1,
    min_range: 0.0,
    arc: 1.4,
    attack_interval: 1.79,
    damage: 0.16,
};

const LONG_SWORD: Weapon = Weapon {
    reach: 1.8,
    min_range: 0.3,
    arc: 2.4,
    attack_interval: 2.61,
    damage: 0.3,
};

const PIKE: Weapon = Weapon {
    reach: 3.2,
    min_range: 1.1,
    arc: 0.08,
    // A thrust-and-recover cycle, not a sweep: the wall's stopping power is
    // cadence x hurl; lethality per poke stays modest.
    attack_interval: 1.38,
    damage: 0.12,
};

const SIDE_SWORD: Weapon = Weapon {
    reach: 1.0,
    min_range: 0.0,
    arc: 1.2,
    attack_interval: 1.79,
    damage: 0.14,
};

const DAGGER: Weapon = Weapon {
    reach: 0.8,
    min_range: 0.0,
    arc: 1.0,
    attack_interval: 1.38,
    damage: 0.11,
};

const LANCE: Weapon = Weapon {
    reach: 2.4,
    min_range: 0.7,
    arc: 0.25,
    attack_interval: 3.02,
    damage: 0.32,
};

const CAV_SWORD: Weapon = Weapon {
    reach: 1.3,
    min_range: 0.0,
    arc: 1.4,
    attack_interval: 1.93,
    damage: 0.2,
};

pub fn class_stats(id: UnitClassId) -> UnitClass {
    use crate::unit::Stance;
    use UnitClassId::*;
    let foot = UnitClass {
        id,
        speed_mult: 1.0,
        soldier_radius: 0.33,
        mass: 1.0,
        brace_mult: 1.3,
        mounted: false,
        spacing: Vec2::new(1.0, 1.2),
        default_depth: 6,
        health: 1.3,
        mount_health: 0.0,
        block: 0.15,
        evade: 0.2,
        training: 0.6,
        stance: Stance::Othismos,
        charge: true,
        tramples: false,
        knockback_mult: 0.35, // a charging mass of men hurts what it fells
        drain_mult: 1.0,
        weapons: &[SWORD],
    };
    match id {
        HeavyInfantry => UnitClass {
            drain_mult: 1.35,
            speed_mult: 0.9,
            soldier_radius: 0.34,
            mass: 1.3,
            brace_mult: 2.0,
            spacing: Vec2::new(0.9, 1.1),
            default_depth: 8,
            health: 1.69,
            block: 0.45,
            evade: 0.08,
            training: 0.75,
            weapons: &[SWORD],
            ..foot
        },
        LightInfantry => UnitClass {
            drain_mult: 0.85,
            speed_mult: 1.1,
            soldier_radius: 0.32,
            mass: 0.95,
            spacing: Vec2::new(1.0, 1.2),
            default_depth: 6,
            health: 2.3, // low tier breaks on MORALE (~half strength) — the bodies still take minutes to chew through
            block: 0.15,
            evade: 0.3,
            training: 0.55,
            weapons: &[SPEAR],
            ..foot
        },
        LongSwords => UnitClass {
            drain_mult: 1.25,
            soldier_radius: 0.33,
            mass: 1.1,
            spacing: Vec2::new(1.5, 1.4),
            default_depth: 4,
            health: 1.49,
            block: 0.2,
            evade: 0.22,
            training: 0.8,
            stance: crate::unit::Stance::Fence,
            weapons: &[LONG_SWORD],
            ..foot
        },
        Phalanx => UnitClass {
            drain_mult: 1.3,
            speed_mult: 0.85,
            mass: 1.2,
            brace_mult: 4.0,
            spacing: Vec2::new(0.8, 1.0),
            default_depth: 10,
            health: 1.43,
            block: 0.35,
            evade: 0.08,
            training: 0.8,
            charge: false,
            weapons: &[PIKE, SIDE_SWORD],
            ..foot
        },
        Archers => UnitClass {
            drain_mult: 0.85,
            brace_mult: 1.0, // missile foot don't fight as a planted wall
            speed_mult: 1.05,
            soldier_radius: 0.32,
            mass: 0.9,
            spacing: Vec2::new(1.2, 1.3),
            default_depth: 4,
            health: 1.17,
            block: 0.1,
            evade: 0.25,
            stance: crate::unit::Stance::Fence,
            charge: false,
            weapons: &[SWORD],
            ..foot
        },
        Skirmishers => UnitClass {
            drain_mult: 0.65,
            brace_mult: 1.0,
            speed_mult: 1.2,
            soldier_radius: 0.31,
            mass: 0.85,
            spacing: Vec2::new(1.6, 1.6),
            default_depth: 4,
            health: 1.17,
            block: 0.12,
            evade: 0.35,
            training: 0.5,
            stance: crate::unit::Stance::Fence,
            charge: false,
            weapons: &[DAGGER],
            ..foot
        },
        ShockCavalry => UnitClass {
            speed_mult: 2.6,
            soldier_radius: 0.55,
            mass: 4.5,
            brace_mult: 1.0,
            mounted: true,
            tramples: true,
            knockback_mult: 1.0,
            spacing: Vec2::new(1.8, 2.4),
            default_depth: 5,
            health: 1.43,
            mount_health: 8.45, // a horse is a LOT of animal: short blades
                               // chip at it while the rider stays safe
            block: 0.25,
            evade: 0.12,
            training: 0.75,
            stance: crate::unit::Stance::Fence,
            weapons: &[LANCE, CAV_SWORD],
            ..foot
        },
        HorseArchers => UnitClass {
            drain_mult: 0.8,
            speed_mult: 2.8,
            soldier_radius: 0.55,
            mass: 3.8,
            brace_mult: 1.0,
            mounted: true,
            tramples: true,
            knockback_mult: 0.5,
            spacing: Vec2::new(2.2, 2.6),
            default_depth: 5,
            health: 1.3,
            mount_health: 6.5,
            block: 0.1,
            evade: 0.25,
            training: 0.65,
            stance: crate::unit::Stance::Fence,
            charge: false,
            weapons: &[CAV_SWORD],
            ..foot
        },
        ArtilleryCrew => UnitClass {
            brace_mult: 1.0,
            speed_mult: 0.9,
            soldier_radius: 0.32,
            mass: 0.9,
            spacing: Vec2::new(2.0, 2.0),
            default_depth: 4,
            health: 1.17,
            block: 0.05,
            evade: 0.15,
            stance: crate::unit::Stance::Fence,
            charge: false,
            weapons: &[DAGGER],
            ..foot
        },
    }
}
