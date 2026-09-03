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
    /// IMPALES (orthogonal CAPABILITY, not a wielding mode): a charging body that
    /// feeds onto this presented point takes flesh damage for it (the spear/pike
    /// thrust the horse runs onto). A Standard spear impales without being a hedge;
    /// a Hedge pike impales too. Scales with reach via the impale term, so a short
    /// blade impales nothing.
    pub impales: bool,
    /// How the weapon is WIELDED — one mutually-exclusive mode (man-aimed / couched
    /// lance / braced hedge). Drives how it's drawn, aimed, and bears.
    pub kind: WeaponKind,
}

/// How a weapon is wielded — three mutually-exclusive modes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeaponKind {
    /// A sword/spear: aimed by the man, bears wherever he faces, drawn all fight.
    Standard,
    /// The charge weapon of a two-weapon mount (the lance): held while the charge
    /// still carries momentum and plows through, then dropped for the sidearm
    /// once the charge is spent and it's a standing grind.
    Charge,
    /// Braced rigidly to the formation's frontage (the sarissa): a long shaft you
    /// can't slew sideways in a packed rank, so it aims along the UNIT's facing,
    /// bears ONLY on its forward arc (flanked/rear it can't engage — the man drops
    /// to his side-arm), and its points overlap files into a continuous wall.
    Hedge,
}

impl Weapon {
    /// The mount's charge weapon (a lance). See `WeaponKind::Charge`.
    pub fn is_charge(&self) -> bool {
        matches!(self.kind, WeaponKind::Charge)
    }
    /// Braced to the formation frontage (a pike). See `WeaponKind::Hedge`.
    pub fn hedge(&self) -> bool {
        matches!(self.kind, WeaponKind::Hedge)
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
    /// Stamina drain multiplier for FIGHTING: the melee combat drain is scaled by
    /// this — armor is paid for in wind, so heavies blow out long before a screen
    /// does. Paired with `move_drain_mult` (the two are independent: one scales the
    /// fight, the other the move). Every foot class sets both equal.
    pub fight_drain_mult: f32,
    /// Stamina drain multiplier for MOVEMENT (run / bad-ground / charge gallop),
    /// independent of `fight_drain_mult`. Foot sets it EQUAL to its fight cost (you
    /// carry your kit when you move). Cavalry is the MOBILE arm — the horse carries
    /// the kit, so it sits below 1: a long ride to the charge doesn't arrive blown,
    /// while the rider still fights as hard as the heavy foot (fight mult unchanged).
    pub move_drain_mult: f32,
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

/// Standard front-cone blade: no dead zone, no cleave, no impale (override per
/// weapon).
const MELEE: Weapon = Weapon {
    reach: 0.0,
    min_range: 0.0,
    zones: crate::strike::front(0.0),
    attack_interval: 0.0,
    damage: 0.0,
    cleave: false,
    impales: false,
    kind: WeaponKind::Standard,
};

/// A spear point: IMPALES a charge (the horse runs onto it) but is NOT a hedge —
/// Standard-wielded, it slews to fight from any angle. Reach sets how hard it
/// impales and how far it grinds.
const SPEAR: Weapon = Weapon {
    impales: true,
    ..MELEE
};

/// A braced points-wall (pike/sarissa): impales AND is wielded as a rigid frontal
/// hedge, with a dead zone — set `min_range` so a foe crowded inside the shafts is safe.
const HEDGE: Weapon = Weapon {
    impales: true,
    kind: WeaponKind::Hedge,
    ..MELEE
};

/// A one-shot couched charge weapon (the lance): lands ONE skewer on commit, then
/// SNAPS and the rider drops to his sidearm. No dead zone — couched OR shortened.
const CHARGE: Weapon = Weapon {
    kind: WeaponKind::Charge,
    ..MELEE
};

fn heavy_and_specialist_stats(id: UnitClassId, foot: UnitClass) -> UnitClass {
    use UnitClassId::*;
    match id {
        HeavySword => UnitClass {
            fight_drain_mult: 1.35,
            move_drain_mult: 1.35,
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
            weapons: one(Weapon {
                reach: 1.1,
                zones: crate::strike::front(0.7),
                attack_interval: 4.1,
                damage: 0.6,
                ..MELEE
            }),
            ..foot
        },
        LightSpear => UnitClass {
            fight_drain_mult: 0.85,
            move_drain_mult: 0.85,
            pace_mult: 1.1,
            soldier_radius: 0.32,
            mass: 0.95,
            spacing: Vec2::new(1.0, 1.2),
            default_depth: 6,
            health: 1.39, // unarmored: the levy lives by numbers, not body
            block: 0.35,  // a light shield: real frontal cover, ~1.5x deaths from behind
            evade: 0.15,  // a shield, not a skirmisher's legs: modest dodge on top of the block
            training: 0.55,
            // A short spear (1.5): the LEVY tier sits at the BOTTOM of the anti-cav
            // gradient. The impale stop is quadratic in reach, so 1.5 is short enough
            // that a frontal shock charge runs the light spear over one-sided (cav
            // wins ~100% at the 2:1 duel, keeping ~60% — see the reach sweep), yet the
            // point still bites a horse caught in the FLANK/REAR (its 1.5 melee reaches
            // from any angle). The medium/heavy spears (1.7/1.85) out-reach it and turn
            // a charge head-on — that anti-cav verdict is the reach gradient's whole job
            // for the LIGHT tier; everything else in the ladder is damage and body.
            // (NB: the impale has a CLIFF near 1.65-1.7 — the matchup flips from cav
            // 88% to spear 75% across that step; keep this value below it.)
            weapons: one(Weapon {
                reach: 1.5,
                zones: crate::strike::front(0.3),
                attack_interval: 4.4,
                damage: 0.2375,
                ..SPEAR
            }),
            ..foot
        },
        LongSwords => UnitClass {
            fight_drain_mult: 1.25,
            move_drain_mult: 1.25,
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
            // close). CLEAVE (one swing rakes across an exposed edge) is its identity
            // — so the per-hit damage sits BELOW a normal sword's and the cadence is
            // SLOW. It is a flank/open-order killer, not a frontal pusher: with no
            // shield and modest mass it bleeds against armor (HSD), shock (CAV) and
            // reach (pikes) when asked to shove through a formed front.
            // Its per-hit damage stays low because the cleave's value is the number
            // of bodies a clean sweep reaches, not the punch of any one cut.
            weapons: one(Weapon {
                reach: 1.6,
                zones: crate::strike::front(1.2),
                attack_interval: 5.1,
                damage: 0.32,
                cleave: true,
                ..MELEE
            }),
            ..foot
        },
        HeavyPhalanx => UnitClass {
            fight_drain_mult: 1.3,
            move_drain_mult: 1.3,
            pace_mult: 0.85,
            mass: 1.2,
            brace_mult: 4.0,
            spacing: Vec2::new(0.8, 1.0),
            default_depth: 10,
            health: 1.86, // rescaled into the [1,2] band (was 2.2); the wall is bodies AND bronze
            block: 0.45,  // a big shield, but NOT more than the heavy sword (0.5 is the cap): the
            // phalanx's frontal edge is its PIKE WALL, not the firmest shield (design rule: the
            // heavy infantry holds the highest block).
            evade: 0.08,
            training: 0.8,
            charge: false,
            doctrine: Doctrine::Strict,
            // The sarissa wall (frontal-only, dead zone inside the shafts; cadence×hurl
            // stops a charge, modest per-poke), with a side-sword for off-axis foes.
            weapons: two(
                Weapon {
                    reach: 3.2,
                    min_range: 1.1,
                    zones: crate::strike::front(0.04),
                    attack_interval: 3.8,
                    damage: 0.4,
                    ..HEDGE
                },
                Weapon {
                    reach: 1.2,
                    zones: crate::strike::front(0.6),
                    attack_interval: 4.1,
                    damage: 0.35,
                    ..MELEE
                },
            ),
            ..foot
        },
        Archers => UnitClass {
            fight_drain_mult: 0.85,
            move_drain_mult: 0.85,
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
            weapons: one(Weapon {
                reach: 1.1,
                zones: crate::strike::front(0.7),
                attack_interval: 4.1,
                damage: 0.5,
                ..MELEE
            }),
            ..foot
        },
        Skirmishers => UnitClass {
            fight_drain_mult: 0.65,
            move_drain_mult: 0.65,
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
            weapons: one(Weapon {
                reach: 1.2,
                zones: crate::strike::front(0.5),
                attack_interval: 3.8,
                damage: 0.275,
                ..MELEE
            }),
            ..foot
        },
        _ => unreachable!("class routed to the wrong stat family"),
    }
}

fn mounted_and_support_stats(id: UnitClassId, foot: UnitClass) -> UnitClass {
    use UnitClassId::*;
    match id {
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
            // FIGHT drain equals the elite heavy foot (1.35): an armoured rider
            // fights as hard in his kit as a heavy swordsman, so a bogged cav tires
            // and (with cadence) slows its sabre in a long grind — its edge stays the
            // fresh CHARGE, not an endurance grind. But MOVEMENT is cheap (the horse
            // carries the kit): a 0.85 move discount means a long ride to the charge
            // doesn't arrive blown. Drain split: armour is paid in wind when YOU
            // fight in it, not when the horse does the work of carrying it.
            fight_drain_mult: 1.35,
            move_drain_mult: 0.85,
            spacing: Vec2::new(1.8, 2.4),
            default_depth: 5,
            health: 1.8, // elite armoured rider: once a blow reaches him he is a bit tougher than
            // medium infantry (1.68) but short of the heavy line (2.0) — well-armored, not a tank
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
            // cavalry sabre — long enough (1.5) to reach over the horse into the
            // press, at parity damage with a foot sword (it should pack a punch). A
            // walked-in cav (no charge) thus sits BETWEEN medium and heavy foot per
            // soldier: it beats medium head-on (parity sabre + the horse shields the
            // rider, so foot waste blows on the mount) but loses to heavy. Its real
            // edge is the CHARGE (lance + impact), not the standing grind.
            weapons: two(
                Weapon {
                    reach: 2.4,
                    zones: crate::strike::front(0.2),
                    attack_interval: 5.0,
                    damage: 1.6,
                    ..CHARGE
                },
                Weapon {
                    reach: 1.5,
                    zones: crate::strike::flanks(1.55, 0.85),
                    attack_interval: 4.2,
                    damage: 0.5,
                    ..MELEE
                },
            ),
            ..foot
        },
        HorseArchers => UnitClass {
            fight_drain_mult: 0.8,
            // The lightest, most mobile arm — it kites all day, so its movement is
            // cheaper still than the shock arm's (0.6 vs 0.85): the horse carries a
            // light rider, and skirmishing is the whole job.
            move_drain_mult: 0.6,
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
            health: 1.36, // light-cavalry rider ≈ light infantry's body (light sword 1.36) — lightly
            // armored, no shield; lives by speed and the horse soaking arrows, not the man's body
            mount_health: 6.5,
            block: 0.0, // no shield: speed and a dodge, same from any face
            evade: 0.32,
            training: 0.65,
            morale_aura: 1.6, // mounted, but lighter — a smaller steadying presence
            charge: false,
            turn_mult: 0.9, // lighter horse, a touch nimbler than the shock arm
            // The cavalry sabre (reach 1.5 to clear the horse); no lance — light horse kites.
            weapons: one(Weapon {
                reach: 1.5,
                zones: crate::strike::flanks(1.55, 0.85),
                attack_interval: 4.2,
                damage: 0.5,
                ..MELEE
            }),
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
            weapons: one(Weapon {
                reach: 1.2,
                zones: crate::strike::front(0.5),
                attack_interval: 3.8,
                damage: 0.275,
                ..MELEE
            }),
            ..foot
        },
        Peasant => UnitClass {
            fight_drain_mult: 1.5, // a levy's nerve is thin — first blood and they waver
            move_drain_mult: 1.5,  // moves at the same wind cost it fights (foot)
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
            weapons: one(Weapon {
                reach: 1.2,
                zones: crate::strike::front(0.5),
                attack_interval: 3.8,
                damage: 0.275,
                ..MELEE
            }),
            ..foot
        },
        _ => unreachable!("class routed to the wrong stat family"),
    }
}

fn line_extension_stats(id: UnitClassId, foot: UnitClass) -> UnitClass {
    use UnitClassId::*;
    match id {
        // The cheap sword line: light infantry's body, a sword instead of a
        // spear. More aggressive (sword arc, a touch more dodge) but the same
        // light shield — HeavySword is the armoured sword.
        LightSword => UnitClass {
            fight_drain_mult: 0.9,
            move_drain_mult: 0.9,
            pace_mult: 1.1,
            soldier_radius: 0.32,
            mass: 0.95,
            spacing: Vec2::new(1.0, 1.2),
            default_depth: 6,
            health: 1.36,
            block: 0.3, // a light shield, a hair less than the spear line's
            evade: 0.18,
            training: 0.55,
            weapons: one(Weapon {
                reach: 1.1,
                zones: crate::strike::front(0.7),
                attack_interval: 4.1,
                damage: 0.5,
                ..MELEE
            }),
            ..foot
        },
        MediumInfantry => UnitClass {
            fight_drain_mult: 1.1,
            move_drain_mult: 1.1,
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
            weapons: one(Weapon {
                reach: 1.1,
                zones: crate::strike::front(0.7),
                attack_interval: 4.1,
                damage: 0.5,
                ..MELEE
            }),
            ..foot
        },
        // The armoured spear wall: heavy infantry's body and shield, a spear
        // instead of a sword — braces hard, holds a line, anti-charge.
        // LightSpear is the light spear.
        HeavySpear => UnitClass {
            fight_drain_mult: 1.35,
            move_drain_mult: 1.35,
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
            // The top of the spear ladder: longest point (1.85, top of the reach
            // gradient LSP 1.5 < MSP 1.7 < HSP 1.85) and hardest punch of the three
            // (LSP 0.2375 < MSP 0.27 < HSP 0.31) on the heaviest body and brace, so the
            // heavy spear out-grinds the lighter spears and best blunts a charge. Its
            // work rate still sits below any sword (sword beats spear).
            weapons: one(Weapon {
                reach: 1.85,
                zones: crate::strike::front(0.3),
                attack_interval: 4.4,
                damage: 0.31,
                ..SPEAR
            }),
            ..foot
        },
        MediumSpear => UnitClass {
            fight_drain_mult: 1.1,
            move_drain_mult: 1.1,
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
            // Mid of the spear reach gradient (LSP 1.5 < MSP 1.7 < HSP 1.85). The
            // reach gradient sculpts the LIGHT spear's anti-cav verdict (1.5 loses);
            // medium's anti-cav dominance does NOT come from reach — it crushes a
            // frontal charge at any reach 1.6-1.85 (its damage/brace/body do that, not
            // the point length). Tier order otherwise is the punch (LSP 0.2375 < MSP
            // 0.27 < HSP 0.31) and body; every value stays below a sword's.
            weapons: one(Weapon {
                reach: 1.7,
                zones: crate::strike::front(0.3),
                attack_interval: 4.4,
                damage: 0.27,
                ..SPEAR
            }),
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
            fight_drain_mult: 1.15,
            move_drain_mult: 1.15,
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
                Weapon {
                    reach: 2.6,
                    min_range: 1.0,
                    zones: crate::strike::front(0.04),
                    attack_interval: 3.9,
                    damage: 0.35,
                    ..HEDGE
                },
                Weapon {
                    reach: 1.2,
                    zones: crate::strike::front(0.6),
                    attack_interval: 4.1,
                    damage: 0.3,
                    ..MELEE
                },
            ),
            ..foot
        },
        _ => unreachable!("class routed to the wrong stat family"),
    }
}

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
        fight_drain_mult: 1.0,
        // Foot moves at the same wind cost it fights (move == fight). Every class
        // below sets BOTH explicitly; only cavalry splits them (cheap to move).
        move_drain_mult: 1.0,
        turn_mult: 1.0,
        // Generic one-handed sword; every class below defines its own array.
        weapons: one(Weapon {
            reach: 1.1,
            zones: crate::strike::front(0.7),
            attack_interval: 4.1,
            damage: 0.5,
            ..MELEE
        }),
    };
    match id {
        HeavySword | LightSpear | LongSwords | HeavyPhalanx | Archers | Skirmishers => {
            heavy_and_specialist_stats(id, foot)
        }
        ShockCavalry | HorseArchers | ArtilleryCrew | Peasant => {
            mounted_and_support_stats(id, foot)
        }
        LightSword | MediumInfantry | HeavySpear | MediumSpear | MediumPhalanx => {
            line_extension_stats(id, foot)
        }
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
