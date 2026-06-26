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
    /// Seconds between swings, fresh and unobstructed. Deliberately long (a real
    /// blow is a wind-up, a committed cut, and a recover — not a flurry): slow
    /// cadence is what makes engagements last MINUTES while each landed hit stays
    /// lethal (glass cannons when actually struck), instead of a fast mutual delete.
    pub attack_interval: f32,
    /// Damage per landed hit.
    pub damage: f32,
    /// CLEAVE: one swing hits every enemy in the arc (up to MAX_VICTIMS). Reserved
    /// for a wide two-handed sweep (the long sword). Most weapons are OFF — a sword,
    /// spear, dagger, or cavalry sabre cuts down ONE man per stroke, not a rank.
    pub cleave: bool,
    /// What kind of weapon this is — drives how it's drawn and how it bears.
    pub kind: WeaponKind,
}

/// How a weapon is wielded. Most are STANDARD (a sword: aimed by the man, swung
/// wherever he faces). The two special cases each have their own selection rule:
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeaponKind {
    /// A sword/spear: aimed by the man, bears wherever he faces.
    Standard,
    /// Braced to the formation's frontage (the sarissa): a long shaft you can't
    /// slew sideways in a packed rank, so it aims along the UNIT's facing and
    /// bears ONLY on targets in its forward arc. Flanked or from the rear it
    /// can't engage — the man drops to his side-arm. (Also what keeps a pike
    /// hedge's anti-charge stop frontal.)
    Braced,
    /// The charge weapon of a two-weapon mount (the lance): held while the charge
    /// still carries momentum and plows through, then dropped for the sidearm
    /// once the charge is spent and it's a standing grind.
    Charge,
}

impl Weapon {
    /// Braced to the formation frontage (a pike). See `WeaponKind::Braced`.
    pub fn braced(&self) -> bool {
        matches!(self.kind, WeaponKind::Braced)
    }
    /// The mount's charge weapon (a lance). See `WeaponKind::Charge`.
    pub fn is_charge(&self) -> bool {
        matches!(self.kind, WeaponKind::Charge)
    }
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
    /// Scales the per-tick acceleration/braking ramp (base_accel). Foot is 1.0;
    /// mounted classes wind up harder so a gallop doesn't need a 60 m runway.
    /// A horse out-accelerates a man, but a FORMED charge still builds over
    /// ground to stay dressed — this is the knob for that wind-up, tuned per
    /// class, not derived from top speed ÷ a single constant.
    pub accel_mult: f32,
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
    /// Strict formation: this unit's weapons/body doctrine make lateral lane
    /// drift costly in contact. A pike block, for example, cannot freely crab
    /// sideways in a frontal press without tangling shafts; future phalanx-like
    /// classes opt in here instead of systems special-casing class ids.
    pub strict_formation: bool,
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
    /// How fast this body PIVOTS its own facing to meet a threat, as a fraction
    /// of the base soldier turn rate. A man spins on his heel (1.0); a horse is a
    /// half-tonne animal that must walk its turn (a fraction), so cavalry don't
    /// whip around to face every foe that jostles them in a grind. Pure geometry
    /// of the body, not its will.
    pub turn_mult: f32,
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
    attack_interval: 4.4,
    damage: 0.2375,
    cleave: false,
    kind: WeaponKind::Standard,
};

const SWORD: Weapon = Weapon {
    reach: 1.1,
    min_range: 0.0,
    arc: 1.4,
    attack_interval: 4.1,
    damage: 0.5,
    cleave: false,
    kind: WeaponKind::Standard,
};

const LONG_SWORD: Weapon = Weapon {
    reach: 1.8,
    // No dead zone: a two-hander half-swords and pommels in close, so a foe
    // crowding inside doesn't disarm him. Being pressed is ALREADY punished by
    // the swing choke (a wide arc can't sweep in a crush); a min_range on top
    // is double jeopardy — the same perverse coupling the lance had (see LANCE).
    min_range: 0.0,
    arc: 2.4,
    attack_interval: 4.7,
    damage: 0.75,
    cleave: true,
    kind: WeaponKind::Standard,
};

const PIKE: Weapon = Weapon {
    reach: 3.2,
    min_range: 1.1,
    arc: 0.08,
    // A thrust-and-recover cycle, not a sweep: the wall's stopping power is
    // cadence x hurl; lethality per poke stays modest.
    attack_interval: 3.8,
    damage: 0.4,
    cleave: false,
    kind: WeaponKind::Braced, // the sarissa: frontal only, drop to the side-sword off-axis
};

const SIDE_SWORD: Weapon = Weapon {
    reach: 1.2,
    min_range: 0.0,
    arc: 1.2,
    attack_interval: 4.1,
    damage: 0.35,
    cleave: false,
    kind: WeaponKind::Standard,
};

// Reach floored at 1.2 (≈ the sword line): a short blade is still SHORT, but every
// foot soldier can at least reach UP to a rider on the horse pressed against him —
// without a reach this long the daggermen chip only the animal and never the man.
const DAGGER: Weapon = Weapon {
    reach: 1.2,
    min_range: 0.0,
    arc: 1.0,
    attack_interval: 3.8,
    damage: 0.275,
    cleave: false,
    kind: WeaponKind::Standard,
};

const LANCE: Weapon = Weapon {
    reach: 2.4,
    // No dead zone: a horseman fights the lance couched OR shortened, so a foe
    // who crowds inside it doesn't disarm him. A min_range here was a perverse
    // stat coupling — surviving the contact better (more block/armour) pinned
    // the rider deeper, dropped him to his sidearm, and made MORE armour LOSE.
    // (See more_block_never_makes_cavalry_worse + the debug skill.)
    min_range: 0.0,
    // A touch wider than a pure point so the couched lance skewers the man it
    // rides onto even slightly off-line (still forward-only — no flank reach).
    arc: 0.4,
    attack_interval: 5.0,
    // The lance lands ONE couched strike — it SNAPS on the man it commits to (see
    // charge_wpn_spent) and the rider draws his sabre — so that one skewer must hit
    // hard: lethal to a light man. It is the charge's signature blow, though the
    // long sabre grind that follows now does the bulk of the killing.
    damage: 1.6,
    cleave: false,
    kind: WeaponKind::Charge,
};

const CAV_SWORD: Weapon = Weapon {
    // Wielded from the saddle: the rider sits at the horse's center, so his blade
    // must span his own mount (~1m of body) to reach the men crowding its head and
    // flanks. A foot-sword's 1.1m never clears the horse — the grind weapon needs
    // the reach of a cavalry sabre swung down from horseback, or the rider flails
    // over the enemy's heads and the dismounted-length blade lands nothing.
    reach: 1.5,
    min_range: 0.0,
    arc: 1.1,
    attack_interval: 4.2,
    // At parity with the infantry sword (0.5): once the charge has put the rider
    // INTO the line, his sabre cuts as well as a foot blade — cavalry's grind
    // weakness is the flank-blind arc and the numbers, NOT a feeble blade.
    damage: 0.5,
    cleave: false,
    kind: WeaponKind::Standard,
};

pub fn class_stats(id: UnitClassId) -> UnitClass {
    use UnitClassId::*;
    let foot = UnitClass {
        id,
        pace_mult: 1.0,
        accel_mult: 1.0,
        soldier_radius: 0.33,
        mass: 1.0,
        brace_mult: 1.3,
        mounted: false,
        spacing: Vec2::new(1.0, 1.2),
        default_depth: 6,
        health: 1.21,
        mount_health: 0.0,
        block: 0.15,
        evade: 0.2,
        training: 0.6,
        bravery: 1.0,
        morale_aura: 1.0,
        charge: true,
        tramples: false,
        strict_formation: false,
        knockback_mult: 0.35, // a charging mass of men hurts what it fells
        drain_mult: 1.0,
        turn_mult: 1.0,
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
            health: 2.0, // top of the [1,2] band (range rescaled from [1,2.4]); still the most body on the field
            block: 0.5, // a real shield wall sheds ~half the frontal arrows; the back is bare (back ~1.8x deaths)
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
            health: 1.39, // unarmored: the levy lives by numbers, not body
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
            health: 1.35,
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
            health: 1.86, // rescaled into the [1,2] band (was 2.2); the wall is bodies AND bronze
            block: 0.45, // a big shield, but NOT more than the heavy sword (0.5 is the cap): the
            // phalanx's frontal edge is its PIKE WALL, not the firmest shield (design rule: the
            // heavy infantry holds the highest block).
            evade: 0.08,
            training: 0.8,
            charge: false,
            strict_formation: true,
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
            health: 1.12,
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
            health: 1.12,
            block: 0.0,  // no shield: pure dodge, same from any face
            evade: 0.42, // the nimblest foot — slips both blows and arrows, any quarter
            training: 0.5,
            charge: false,
            weapons: one(DAGGER),
            ..foot
        },
        ShockCavalry => UnitClass {
            // ~+30% on the run/charge gaits (pace_mult scales the above-walk
            // range): run 6.1->7.6 m/s, charge 9.2->12.1 m/s at full stamina.
            pace_mult: 3.6,
            // Heavy horse winds up at ~2x foot: a 12 m/s charge now reaches full
            // gallop in ~30 m / ~5 s (was ~60 m / ~10 s on the shared foot accel),
            // a controlled-but-real charge build instead of a freight-train ramp.
            accel_mult: 2.0,
            soldier_radius: 0.55,
            mass: 4.5,
            brace_mult: 1.0,
            mounted: true,
            tramples: true,
            knockback_mult: 1.0,
            spacing: Vec2::new(1.8, 2.4),
            default_depth: 5,
            health: 1.36, // armoured rider: tougher than foot once a blow reaches him
            // The horse soaks ARROWS (most missiles hit the big animal, not the man);
            // in MELEE it no longer makes cav tanky, because every foot weapon now
            // reaches up to the 1.5-HP rider (the reach floor), so a bogged cav dies
            // by its rider like anything else. Cavalry is S-tier through shock, speed
            // and morale, not durability.
            mount_health: 5.0,
            block: 0.4, // an armoured horseman's shield: strong frontal cover. Safe to raise now that
            // the lance has no dead zone — more block monotonically helps (see the test).
            evade: 0.12,
            training: 0.75,
            bravery: 1.3,     // armoured shock riders hold their nerve
            morale_aura: 2.0, // and the sight of friendly heavy horse steadies a line
            turn_mult: 0.81,
            weapons: two(LANCE, CAV_SWORD),
            ..foot
        },
        HorseArchers => UnitClass {
            drain_mult: 0.8,
            // ~+30% on the run gait to match the shock arm: 6.5->8.3 m/s at full
            // stamina (no charge — light horse skirmishes and kites).
            pace_mult: 3.9,
            // Lighter horse winds up a touch harder than the shock arm (mirrors
            // its nimbler turn_mult) — quick to reach speed for a kiting dash.
            accel_mult: 2.2,
            soldier_radius: 0.55,
            mass: 3.8,
            brace_mult: 1.0,
            mounted: true,
            tramples: true,
            knockback_mult: 0.5,
            spacing: Vec2::new(2.2, 2.6),
            default_depth: 5,
            health: 1.21,
            mount_health: 6.5,
            block: 0.0, // no shield: speed and a dodge, same from any face
            evade: 0.32,
            training: 0.65,
            morale_aura: 1.6, // mounted, but lighter — a smaller steadying presence
            charge: false,
            turn_mult: 0.9, // lighter horse, a touch nimbler than the shock arm
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
            health: 1.12,
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
            health: 1.36,
            block: 0.3, // a light shield, a hair less than the spear line's
            evade: 0.18,
            training: 0.55,
            weapons: one(SWORD),
            ..foot
        },
        MediumInfantry => UnitClass {
            drain_mult: 1.1,
            pace_mult: 1.0,
            soldier_radius: 0.33,
            mass: 1.12,
            brace_mult: 1.6,
            spacing: Vec2::new(0.95, 1.15),
            default_depth: 7,
            health: 1.68,
            block: 0.4,
            evade: 0.13,
            training: 0.65,
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
            health: 2.0, // HeavySpear: top of the [1,2] band (range rescaled from [1,2.4])
            block: 0.45,
            evade: 0.08,
            training: 0.75,
            weapons: one(SPEAR),
            ..foot
        },
        MediumSpear => UnitClass {
            drain_mult: 1.1,
            pace_mult: 1.0,
            soldier_radius: 0.33,
            mass: 1.12,
            brace_mult: 2.0,
            spacing: Vec2::new(0.95, 1.15),
            default_depth: 7,
            health: 1.68,
            block: 0.4,
            evade: 0.12,
            training: 0.65,
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
