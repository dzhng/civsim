//! Unit class stat tables. Data, not code: every class difference must be a
//! number here, never a special case in a system.

use crate::math::Vec2;

// The class id enum lives in the `contract` crate — it's the shared vocabulary
// between campaign rosters and battle deployments. The stat tables stay here.
pub use contract::UnitClassId;

/// A weapon is a set of physical capabilities — a few numbers, nothing else.
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
    /// Braced to the formation's frontage: a long shaft (the sarissa) you can't
    /// slew sideways in a packed rank, so it aims along the UNIT's facing, not
    /// the man's, and bears ONLY on targets in its forward arc. Flanked or from
    /// the rear it can't engage — the man drops to his side-arm. (This is also
    /// what keeps a pike hedge's anti-charge stop frontal.)
    pub braced: bool,
}

/// A class's weapons, owned inline so a `UnitClass` can be built at runtime (a
/// tunable `BalanceConfig`) without a `'static` lifetime — yet stays `Copy`.
/// No class carries more than two (a pole-arm plus its side-arm). Derefs to a
/// slice, so every reader (`.iter()`, `w[0]`) is unchanged.
#[derive(Clone, Copy, Debug)]
pub struct WeaponSet {
    arr: [Weapon; 2],
    len: u8,
}

/// One weapon. The second slot is filled with a copy and never read (`len` 1).
pub const fn one(w: Weapon) -> WeaponSet {
    WeaponSet {
        arr: [w, w],
        len: 1,
    }
}
/// A primary plus a side-arm.
pub const fn two(a: Weapon, b: Weapon) -> WeaponSet {
    WeaponSet {
        arr: [a, b],
        len: 2,
    }
}

impl core::ops::Deref for WeaponSet {
    type Target = [Weapon];
    fn deref(&self) -> &[Weapon] {
        &self.arr[..self.len as usize]
    }
}

#[derive(Clone, Copy, Debug)]
pub struct UnitClass {
    pub id: UnitClassId,
    /// Scales the above-walk speed range (run/surge/charge), not the walk floor.
    pub pace_mult: f32,
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
    /// Chance to block (melee + missiles, front arc only; still pushed). The
    /// shield: a fortress to the front, nothing to the flank or back — this is
    /// what makes a shielded unit take ~2x the deaths from behind.
    pub block: f32,
    /// Chance to evade — dodge/parry (melee AND missiles; no push). Melee evade
    /// degrades by arc (you can't slip a blow you can't see) and dies under
    /// crush pressure; missile evade has NO arc (an arrow is seen from any
    /// quarter), so a shieldless unit's evade shaves the same off front and
    /// back — it eats arrows about equally from either face.
    pub evade: f32,
    pub training: f32,
    /// Morale RESILIENCE: divides the casualty/fear drain on this unit's own
    /// will. 1.0 = baseline; >1 a steadfast class that eats losses a levy would
    /// run from, <1 a flighty one. Independent of `training` (drill, which also
    /// sets cohesion recovery) — a class can be well-drilled yet brittle, or a
    /// raw fanatic. This is THE per-class own-morale knob.
    pub bravery: f32,
    /// Morale AURA: steadiness this class radiates to nearby allies, per living
    /// man. 1.0 = ordinary foot; elites (heavy horse, a general's retinue) inspire
    /// more, skirmishers less. A unit ringed by high-aura friends holds far past
    /// where it would break alone — the "fights on with support" effect.
    pub morale_aura: f32,
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
    pub weapons: WeaponSet,
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
    damage: 0.095,
    braced: false,
};

const SWORD: Weapon = Weapon {
    reach: 1.1,
    min_range: 0.0,
    arc: 1.4,
    attack_interval: 1.79,
    damage: 0.2,
    braced: false,
};

const LONG_SWORD: Weapon = Weapon {
    reach: 1.8,
    // No dead zone: a two-hander half-swords and pommels in close, so a foe
    // crowding inside doesn't disarm him. Being pressed is ALREADY punished by
    // the swing choke (a wide arc can't sweep in a crush); a min_range on top
    // is double jeopardy — the same perverse coupling the lance had (see LANCE).
    min_range: 0.0,
    arc: 2.4,
    attack_interval: 2.61,
    damage: 0.3,
    braced: false,
};

const PIKE: Weapon = Weapon {
    reach: 3.2,
    min_range: 1.1,
    arc: 0.08,
    // A thrust-and-recover cycle, not a sweep: the wall's stopping power is
    // cadence x hurl; lethality per poke stays modest.
    attack_interval: 1.38,
    damage: 0.16,
    braced: true, // the sarissa: frontal only, drop to the side-sword off-axis
};

const SIDE_SWORD: Weapon = Weapon {
    reach: 1.0,
    min_range: 0.0,
    arc: 1.2,
    attack_interval: 1.79,
    damage: 0.14,
    braced: false,
};

const DAGGER: Weapon = Weapon {
    reach: 0.8,
    min_range: 0.0,
    arc: 1.0,
    attack_interval: 1.38,
    damage: 0.11,
    braced: false,
};

const LANCE: Weapon = Weapon {
    reach: 2.4,
    // No dead zone: a horseman fights the lance couched OR shortened, so a foe
    // who crowds inside it doesn't disarm him. A min_range here was a perverse
    // stat coupling — surviving the contact better (more block/armour) pinned
    // the rider deeper, dropped him to his sidearm, and made MORE armour LOSE.
    // (See more_block_never_makes_cavalry_worse + debug-battle-behavior.)
    min_range: 0.0,
    arc: 0.25,
    attack_interval: 3.02,
    damage: 0.32,
    braced: false,
};

const CAV_SWORD: Weapon = Weapon {
    reach: 1.3,
    min_range: 0.0,
    arc: 1.4,
    attack_interval: 1.93,
    damage: 0.2,
    braced: false,
};

pub fn class_stats(id: UnitClassId) -> UnitClass {
    use UnitClassId::*;
    let foot = UnitClass {
        id,
        pace_mult: 1.0,
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
        bravery: 1.0,
        morale_aura: 1.0,
        charge: true,
        tramples: false,
        knockback_mult: 0.35, // a charging mass of men hurts what it fells
        drain_mult: 1.0,
        weapons: one(SWORD),
    };
    match id {
        HeavySword => UnitClass {
            drain_mult: 1.35,
            pace_mult: 0.9,
            soldier_radius: 0.34,
            mass: 1.3,
            brace_mult: 2.0,
            spacing: Vec2::new(0.9, 1.1),
            default_depth: 8,
            health: 2.4, // the armor IS the class: a third more body than the levy, plus the shield
            block: 0.45, // a real shield wall sheds ~half the frontal arrows; the back is bare (back ~1.8x deaths)
            evade: 0.08,
            training: 0.75,
            weapons: one(SWORD),
            ..foot
        },
        LightSpear => UnitClass {
            drain_mult: 0.85,
            pace_mult: 1.1,
            soldier_radius: 0.32,
            mass: 0.95,
            spacing: Vec2::new(1.0, 1.2),
            default_depth: 6,
            health: 1.55, // unarmored: the levy lives by numbers, not body
            block: 0.35,  // a light shield: real frontal cover, ~1.5x deaths from behind
            evade: 0.15,  // a shield, not a skirmisher's legs: modest dodge on top of the block
            training: 0.55,
            weapons: one(SPEAR),
            ..foot
        },
        LongSwords => UnitClass {
            drain_mult: 1.25,
            soldier_radius: 0.33,
            mass: 1.1,
            spacing: Vec2::new(1.5, 1.4),
            default_depth: 4,
            health: 1.49,
            block: 0.1, // no shield, but a drilled two-hander parries some frontal blows
            // with the blade — a thin front-arc edge, far below any shield wall
            evade: 0.35,
            training: 0.8,
            weapons: one(LONG_SWORD),
            ..foot
        },
        Phalanx => UnitClass {
            drain_mult: 1.3,
            pace_mult: 0.85,
            mass: 1.2,
            brace_mult: 4.0,
            spacing: Vec2::new(0.8, 1.0),
            default_depth: 10,
            health: 2.2, // phalangites wore armor too — the wall is bodies AND bronze
            block: 0.55, // the great shield: the firmest front-arc wall, ~2.2x deaths from behind
            evade: 0.08,
            training: 0.8,
            charge: false,
            weapons: two(PIKE, SIDE_SWORD),
            ..foot
        },
        Archers => UnitClass {
            drain_mult: 0.85,
            brace_mult: 1.0, // missile foot don't fight as a planted wall
            pace_mult: 1.05,
            soldier_radius: 0.32,
            mass: 0.9,
            spacing: Vec2::new(1.2, 1.3),
            default_depth: 4,
            health: 1.17,
            block: 0.0, // no shield: a dodge, not a wall — same from any face
            evade: 0.28,
            charge: false,
            weapons: one(SWORD),
            ..foot
        },
        Skirmishers => UnitClass {
            drain_mult: 0.65,
            brace_mult: 1.0,
            pace_mult: 1.2,
            soldier_radius: 0.31,
            mass: 0.85,
            spacing: Vec2::new(1.6, 1.6),
            default_depth: 4,
            health: 1.17,
            block: 0.0,  // no shield: pure dodge, same from any face
            evade: 0.42, // the nimblest foot — slips both blows and arrows, any quarter
            training: 0.5,
            charge: false,
            weapons: one(DAGGER),
            ..foot
        },
        ShockCavalry => UnitClass {
            pace_mult: 2.6,
            soldier_radius: 0.55,
            mass: 4.5,
            brace_mult: 1.0,
            mounted: true,
            tramples: true,
            knockback_mult: 1.0,
            spacing: Vec2::new(1.8, 2.4),
            default_depth: 5,
            health: 2.2, // phalangites wore armor too — the wall is bodies AND bronze
            mount_health: 8.45, // a horse is a LOT of animal: short blades
            // chip at it while the rider stays safe
            block: 0.4, // an armoured horseman's shield: strong frontal cover. Safe to raise now that
            // the lance has no dead zone — more block monotonically helps (see the test).
            evade: 0.12,
            training: 0.75,
            bravery: 1.3,     // armoured shock riders hold their nerve
            morale_aura: 2.0, // and the sight of friendly heavy horse steadies a line
            weapons: two(LANCE, CAV_SWORD),
            ..foot
        },
        HorseArchers => UnitClass {
            drain_mult: 0.8,
            pace_mult: 2.8,
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
            block: 0.0, // no shield: speed and a dodge, same from any face
            evade: 0.32,
            training: 0.65,
            morale_aura: 1.6, // mounted, but lighter — a smaller steadying presence
            charge: false,
            weapons: one(CAV_SWORD),
            ..foot
        },
        ArtilleryCrew => UnitClass {
            brace_mult: 1.0,
            pace_mult: 0.9,
            soldier_radius: 0.32,
            mass: 0.9,
            spacing: Vec2::new(2.0, 2.0),
            default_depth: 4,
            health: 1.17,
            block: 0.0, // no shield wall; same from any face
            evade: 0.18,
            charge: false,
            weapons: one(DAGGER),
            ..foot
        },
        Peasant => UnitClass {
            drain_mult: 1.5, // a levy's nerve is thin — first blood and they waver
            pace_mult: 1.05,
            soldier_radius: 0.32,
            mass: 0.9,
            brace_mult: 1.0, // no drill, no brace: a mob, not a wall
            spacing: Vec2::new(1.1, 1.3),
            default_depth: 6,
            health: 1.0, // a smock, no armor: the frailest body on the field
            block: 0.0,  // no shield at all — arrows and blows land the same from any face
            evade: 0.12, // untrained: a clumsy flinch, not a skirmisher's slip
            training: 0.3,
            bravery: 0.6,     // a levy's nerve is thin — breaks early
            morale_aura: 0.7, // a wavering mob steadies no one
            weapons: one(DAGGER),
            ..foot
        },
        // The cheap sword line: light infantry's body, a sword instead of a
        // spear. More aggressive (sword arc, a touch more dodge) but the same
        // light shield — HeavySword is the armoured sword.
        LightSword => UnitClass {
            drain_mult: 0.9,
            pace_mult: 1.1,
            soldier_radius: 0.32,
            mass: 0.95,
            spacing: Vec2::new(1.0, 1.2),
            default_depth: 6,
            health: 1.5,
            block: 0.3, // a light shield, a hair less than the spear line's
            evade: 0.18,
            training: 0.55,
            weapons: one(SWORD),
            ..foot
        },
        // The armoured spear wall: heavy infantry's body and shield, a spear
        // instead of a sword — braces hard, holds a line, anti-charge.
        // LightSpear is the light spear.
        HeavySpear => UnitClass {
            drain_mult: 1.35,
            pace_mult: 0.9,
            soldier_radius: 0.34,
            mass: 1.3,
            brace_mult: 2.5, // a set spear line braces harder than a sword wall
            spacing: Vec2::new(0.9, 1.1),
            default_depth: 8,
            health: 2.4,
            block: 0.45,
            evade: 0.08,
            training: 0.75,
            weapons: one(SPEAR),
            ..foot
        },
    }
}

/// The full per-class balance surface, resolved once and injected into a `Sim`.
/// Lifting the stat tables out of the `class_stats` consts into runtime data is
/// what lets a tuner sweep configs without recompiling. `Default` reproduces
/// `class_stats` exactly — so the default config is behaviour-neutral and the
/// golden hash is untouched.
#[derive(Clone, Debug)]
pub struct BalanceConfig {
    /// Indexed by `UnitClassId as usize`; covers every variant in `ALL_CLASSES`.
    stats: [UnitClass; contract::ALL_CLASSES.len()],
}

impl BalanceConfig {
    /// The class's stats under this config.
    #[inline]
    pub fn get(&self, class: UnitClassId) -> UnitClass {
        self.stats[class as usize]
    }
    /// Override one class's stats (the tuner's single mutation).
    pub fn set(&mut self, class: UnitClassId, stats: UnitClass) {
        self.stats[class as usize] = stats;
    }
}

impl Default for BalanceConfig {
    fn default() -> Self {
        // Fill, then overwrite every variant from the canonical table. The
        // filler is immediately replaced for all 10 ids; it just seeds the
        // array (UnitClass is not Default).
        let mut stats = [class_stats(UnitClassId::HeavySword); contract::ALL_CLASSES.len()];
        for &c in &contract::ALL_CLASSES {
            stats[c as usize] = class_stats(c);
        }
        Self { stats }
    }
}
