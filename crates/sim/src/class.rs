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
    /// Where the weapon can land, as DATA: its strike zones (angular lobes in the
    /// wielder's frame). A sword/spear/pike/lance is one front lobe; a mounted
    /// sabre is two flank lobes. Replaces the old single `arc` width + the
    /// mounted-flank heuristic — target/face/strike all read these.
    pub zones: crate::strike::Zones,
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

/// A unit's operating procedure in contact — its body/weapon doctrine. One axis,
/// three mutually-exclusive modes; the systems that used to branch on the separate
/// `tramples` / `strict_formation` flags read this instead.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Doctrine {
    /// A normal line: closes, holds at weapon's length, fights, may crab sideways
    /// to dress its lane.
    Standard,
    /// A strict-file block (the phalanx): lateral drift in a frontal press tangles
    /// shafts, so it will not freely crab sideways.
    Strict,
    /// Drives THROUGH contact instead of planting at weapon's length — the trample
    /// is the charge. Horses today; the knob exists for chariots / shock infantry.
    Trample,
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
    /// Operating procedure in contact — how this unit's body/weapon doctrine
    /// behaves when it meets the enemy. One axis, three mutually-exclusive modes
    /// (see `Doctrine`): a line holds, a phalanx keeps strict files, horse drives
    /// through. (Independent of `mounted`, which is body geometry, and `charge`,
    /// which is the approach gait.)
    pub doctrine: Doctrine,
    /// Knockdown-damage multiplier for what this body DEALS when it fells
    /// a man. Pure per-unit data: foot 0 (men bowling men bruise), heavy
    /// horse 1.0, light horse picks its way through at a fraction; a
    /// chariot would put nearly everything here and nothing in weapon dps.
    /// (`doctrine` above is pure BEHAVIOR: keep riding through contact.)
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

// Weapon FIELD DEFAULTS, one per family. Each class spells out only the fields
// that matter and inherits the rest via struct-update, so the call sites read as
// NAMED FIELDS instead of a row of bare numbers:
//
//     weapons: one(Weapon { reach: 1.1, zones: crate::strike::front(0.7), attack_interval: 4.1, damage: 0.5, ..MELEE }),
//
// Two classes that both carry "a sword" can diverge freely — there is no shared
// global weapon assigned to many units.

/// Standard front-cone blade: no dead zone, no cleave (override per weapon).
const MELEE: Weapon = Weapon {
    reach: 0.0,
    min_range: 0.0,
    zones: crate::strike::front(0.0),
    attack_interval: 0.0,
    damage: 0.0,
    cleave: false,
    kind: WeaponKind::Standard,
};

/// A braced points-wall (pike/sarissa): frontal-only, with a dead zone — set
/// `min_range` so a foe crowded inside the shafts is safe.
const BRACED: Weapon = Weapon {
    kind: WeaponKind::Braced,
    ..MELEE
};

/// A one-shot couched charge weapon (the lance): lands ONE skewer on commit, then
/// SNAPS and the rider drops to his sidearm. No dead zone — couched OR shortened.
const CHARGE: Weapon = Weapon {
    kind: WeaponKind::Charge,
    ..MELEE
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
        doctrine: Doctrine::Standard,
        knockback_mult: 0.35, // a charging mass of men hurts what it fells
        drain_mult: 1.0,
        turn_mult: 1.0,
        // Generic one-handed sword; every class below defines its own array.
        weapons: one(Weapon { reach: 1.1, zones: crate::strike::front(0.7), attack_interval: 4.1, damage: 0.5, ..MELEE }),
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
            // The heavy's blade hits a touch harder than a line sword (0.6 vs 0.5):
            // an elite that is tanky AND a little more lethal — enough to take the
            // edge off the heavy-vs-heavy slog, but a heavy mirror is STILL the
            // longest grind of the roster. Per-class weapon; no other sword affected.
            weapons: one(Weapon { reach: 1.1, zones: crate::strike::front(0.7), attack_interval: 4.1, damage: 0.6, ..MELEE }),
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
            weapons: one(Weapon { reach: 1.6, zones: crate::strike::front(0.3), attack_interval: 4.4, damage: 0.2375, ..MELEE }),
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
            evade: 0.2, // nimble for shieldless foot, but no shield means it bleeds in a grind
            training: 0.8,
            // A two-hander: reach, a wide cleaving arc, no dead zone (half-swords in
            // close). CLEAVE (one swing rakes the packed front) is its identity — so
            // the per-hit damage sits BELOW a normal sword's and the cadence is SLOW;
            // the WIDTH, not the punch, is what shreds massed light infantry. With no
            // shield and modest dodge it bleeds against armor (HSD), shock (CAV) and
            // reach (pikes) — a budget anti-light-infantry blender, not a line-breaker.
            weapons: one(Weapon { reach: 1.6, zones: crate::strike::front(1.2), attack_interval: 5.1, damage: 0.4, cleave: true, ..MELEE }),
            ..foot
        },
        HeavyPhalanx => UnitClass {
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
            doctrine: Doctrine::Strict,
            // The sarissa wall (frontal-only, dead zone inside the shafts; cadence×hurl
            // stops a charge, modest per-poke), with a side-sword for off-axis foes.
            weapons: two(
                Weapon { reach: 3.2, min_range: 1.1, zones: crate::strike::front(0.04), attack_interval: 3.8, damage: 0.4, ..BRACED },
                Weapon { reach: 1.2, zones: crate::strike::front(0.6), attack_interval: 4.1, damage: 0.35, ..MELEE },
            ),
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
            weapons: one(Weapon { reach: 1.1, zones: crate::strike::front(0.7), attack_interval: 4.1, damage: 0.5, ..MELEE }),
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
            // A short blade — reach floored at 1.2 so foot can still reach UP to a
            // pressed-in rider, not just chip the horse.
            weapons: one(Weapon { reach: 1.2, zones: crate::strike::front(0.5), attack_interval: 3.8, damage: 0.275, ..MELEE }),
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
            doctrine: Doctrine::Trample,
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
            // A couched lance (one lethal skewer on the charge, then it snaps) and a
            // cavalry sabre — long enough (1.5) to reach over the horse into the press,
            // at parity damage with a foot sword once the rider is in.
            weapons: two(
                Weapon { reach: 2.4, zones: crate::strike::front(0.2), attack_interval: 5.0, damage: 1.6, ..CHARGE },
                Weapon { reach: 1.5, zones: crate::strike::flanks(1.55, 0.85), attack_interval: 4.2, damage: 0.5, ..MELEE },
            ),
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
            doctrine: Doctrine::Trample,
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
            // The cavalry sabre (reach 1.5 to clear the horse); no lance — light horse kites.
            weapons: one(Weapon { reach: 1.5, zones: crate::strike::flanks(1.55, 0.85), attack_interval: 4.2, damage: 0.5, ..MELEE }),
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
            weapons: one(Weapon { reach: 1.2, zones: crate::strike::front(0.5), attack_interval: 3.8, damage: 0.275, ..MELEE }),
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
            weapons: one(Weapon { reach: 1.2, zones: crate::strike::front(0.5), attack_interval: 3.8, damage: 0.275, ..MELEE }),
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
            weapons: one(Weapon { reach: 1.1, zones: crate::strike::front(0.7), attack_interval: 4.1, damage: 0.5, ..MELEE }),
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
            weapons: one(Weapon { reach: 1.1, zones: crate::strike::front(0.7), attack_interval: 4.1, damage: 0.5, ..MELEE }),
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
            // The top of the spear ladder: longest reach and hardest point of the
            // three (LSP 1.6/0.2375 < MSP 1.7/0.27 < HSP 1.85/0.31), so the heavy
            // spear out-blunts a charge and out-grinds the lighter spears — yet its
            // work rate still sits below any sword (sword beats spear holds).
            weapons: one(Weapon { reach: 1.85, zones: crate::strike::front(0.3), attack_interval: 4.4, damage: 0.31, ..MELEE }),
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
            // A longer, harder-hitting spear than the light line — enough point to
            // win the spear mirror (the light spear's 0.2375 stalemates every
            // armoured foe) and blunt a charge the light line can't. Spear reach and
            // punch are ORDERED by tier (LSP 1.6/0.2375 < MSP 1.7/0.27 < HSP
            // 1.85/0.31) so the hierarchy holds in outcomes, not just on paper —
            // every value stays well below a sword's, so sword still beats spear.
            weapons: one(Weapon { reach: 1.7, zones: crate::strike::front(0.3), attack_interval: 4.4, damage: 0.27, ..MELEE }),
            ..foot
        },
        // The workhorse pike: a shorter sarissa than the elite HeavyPhalanx. It
        // sits a notch UNDER its sword counterpart (MediumInfantry) in body and
        // grind — slightly thinner health, packed strict files that can't dodge —
        // and earns its keep on REACH: a 2.6 m hedge that blunts a charge the
        // medium sword line cannot. Braces hard (3.0), but below the elite
        // sarissa wall (4.0); block 0.4 stays under HeavyPhalanx's 0.45 (the heavy
        // infantry holds the highest shield).
        MediumPhalanx => UnitClass {
            drain_mult: 1.15,
            pace_mult: 0.9,
            soldier_radius: 0.33,
            mass: 1.05,
            brace_mult: 3.0,
            spacing: Vec2::new(0.85, 1.05),
            default_depth: 8,
            health: 1.56,
            block: 0.4,
            evade: 0.1,
            training: 0.65,
            charge: false,
            doctrine: Doctrine::Strict,
            // A short sarissa (frontal-only, dead zone inside the shafts), with a
            // side-sword for off-axis foes — the same two-weapon doctrine as the
            // heavy phalanx, scaled down: less reach (2.6 vs 3.2), less per-poke.
            weapons: two(
                Weapon { reach: 2.6, min_range: 1.0, zones: crate::strike::front(0.04), attack_interval: 3.9, damage: 0.35, ..BRACED },
                Weapon { reach: 1.2, zones: crate::strike::front(0.6), attack_interval: 4.1, damage: 0.3, ..MELEE },
            ),
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
