//! Campaign tuning constants. Data, not code — same doctrine as sim's class
//! tables. Campaign march speeds are deliberately separate from battle
//! speed_mult: they answer "km/day on a road", not "m/s on a field".

use contract::UnitClassId;

/// Campaign ticks per day; 1 tick = 1 campaign minute.
pub const TICKS_PER_DAY: u32 = 1440;
/// Maximum roster entries in one field army. The campaign marker scales its
/// compressed figures against this capacity.
pub const ARMY_STACK_UNIT_CAP: usize = 20;
/// Fixed administrative cost for changing one faction-wide class doctrine
/// (unit type and/or establishment size). Paid once per applied class change.
pub const CLASS_SWITCH_FEE: u32 = 75;
/// Cooldown before a faction can change the same class doctrine again.
pub const CLASS_SWITCH_COOLDOWN_TICKS: u64 = 7 * TICKS_PER_DAY as u64;
/// One road tile of march, in km (must match mapgen's TILE_KM).
pub const TILE_KM: f32 = 5.0;

/// Baseline infantry march: 30 km/day => one 5 km tile per 4 campaign hours.
pub const BASE_TILES_PER_TICK: f32 = (30.0 / TILE_KM) / TICKS_PER_DAY as f32;

/// March-speed multiplier per class (1.0 = baseline foot).
pub fn march_mult(class: UnitClassId) -> f32 {
    use UnitClassId::*;
    match class {
        HeavySword => 0.9,
        LightSpear => 1.1,
        LongSwords => 1.0,
        Phalanx => 0.85,
        Archers => 1.0,
        Skirmishers => 1.15,
        ShockCavalry => 2.2,
        HorseArchers => 2.4,
        ArtilleryCrew => 0.7,
        Peasant => 1.05,
        LightSword => 1.1,
        HeavySpear => 0.9,
        MediumInfantry => 1.0,
        MediumSpear => 1.0,
    }
}

/// Baseline establishment strength for one army slot of this class. The class
/// builder's 1x/2x/4x setting multiplies this cap; replenishment fills toward it.
pub fn unit_establishment(class: UnitClassId) -> u32 {
    use UnitClassId::*;
    match class {
        HeavySword => 1280,
        LightSpear => 880,
        LongSwords => 360,
        Phalanx => 1280,
        Archers => 480,
        Skirmishers => 360,
        ShockCavalry => 280,
        HorseArchers => 240,
        ArtilleryCrew => 80,
        Peasant => 1400,
        LightSword => 880,
        HeavySpear => 1280,
        MediumInfantry => 1040,
        MediumSpear => 1040,
    }
}

/// Sea lanes: fixed fleet speed regardless of composition (km/day / tile).
pub const SEA_TILES_PER_TICK: f32 = (120.0 / TILE_KM) / TICKS_PER_DAY as f32;
/// Embark/disembark at a port (ticks).
pub const EMBARK_TICKS: u16 = 120;

/// Tile-feature march multipliers (roads through passes/fords are slow).
pub fn feature_mult(feature: crate::mapdata::TileFeature) -> f32 {
    use crate::mapdata::TileFeature::*;
    match feature {
        Open | Forest => 1.0,
        Hill => 0.85,
        Pass => 0.7,
        Bridge => 0.9,
        Ford => 0.5,
        Sea => 1.0, // sea speed handled separately
    }
}

/// Encounter prep: 20 ticks reads as 2.0 s at 1x speed.
pub const PREP_TICKS: u16 = 20;
/// Ambush victim / surprised attacker prep.
pub const PREP_SURPRISED_TICKS: u16 = 40;
/// Armies preparing for battle move at half pace.
pub const PREP_SPEED_MULT: f32 = 0.5;
/// Digging a camp in takes an hour; the payoff is instant readiness when
/// attacked (defender prep 0, attacker surprised) and extra vision.
pub const CAMP_BUILD_TICKS: u16 = 60;
/// A dug-in camp sees further (palisade towers).
pub const CAMP_VISION_BONUS: u32 = 2;

/// March/route multiplier by road level (indexed by level; 0 unused).
pub const ROAD_SPEED_MULT: [f32; 4] = [1.0, 1.0, 1.3, 1.6];
pub const ROAD_MAX_LEVEL: u8 = 3;
pub fn road_mult(level: u8) -> f32 {
    ROAD_SPEED_MULT[level.min(ROAD_MAX_LEVEL) as usize]
}

/// City buildings: cost of the NEXT level (index = current level), 2 days
/// to raise either. Market multiplies income, barracks speeds recruiting and
/// deepens the garrison establishment.
pub const BUILD_MARKET_COST: [u32; 2] = [200, 300];
pub const BUILD_BARRACKS_COST: [u32; 2] = [250, 400];
pub const BUILD_TICKS: u32 = 2 * TICKS_PER_DAY;

/// Routed armies: tiles of hostile-free road needed to regroup (or a nearer
/// friendly city); no such path at battle end = captured and wiped.
pub const ROUT_TILES: u16 = 16;
/// After a routed army outruns the force that beat it, this is how long it
/// stays a vulnerable, run-downable rabble before regrouping. Short: a beaten
/// army that isn't pursued is back in play soon, but a pursuer who catches it
/// in this window destroys it — so a won battle can actually clear a front.
pub const ROUT_REGROUP_TICKS: u32 = 120;
pub const ROUT_SPEED_MULT: f32 = 1.15;

/// Reinforcements: armies within this road distance (tiles) join a battle.
pub const REINFORCE_RADIUS_TILES: u32 = 12;
/// One campaign hour of approach march = this many battle seconds of delay.
pub const REINFORCE_SECS_PER_HOUR: f32 = 90.0;
pub const REINFORCE_MAX_DELAY_SECS: f32 = 900.0;

/// After a successful escape, the same pair can't re-engage for this long —
/// the time it takes the gap to become physically real (~2.5 tiles of march).
pub const ESCAPE_COOLDOWN_TICKS: u64 = 720;

/// Ambush stance: ticks to settle into concealment beside the road.
pub const AMBUSH_SETTLE_TICKS: u16 = 15;

/// Unopposed occupation of an undefended city (ticks).
pub const OCCUPY_TICKS: u16 = 240;

/// Gold per day by city tier (index 0 unused).
pub const CITY_INCOME: [u32; 4] = [0, 80, 140, 220];
/// Market level multiplier x100 (level 0..2).
pub const MARKET_MULT_PCT: [u32; 3] = [100, 150, 200];

/// Per-soldier upkeep in gold x1000 per day, and per-unit base overhead.
pub fn upkeep_per_soldier_milligold(class: UnitClassId) -> u32 {
    use UnitClassId::*;
    match class {
        HeavySword => 20,
        LightSpear => 10,
        LongSwords => 25,
        Phalanx => 20,
        Archers => 18,
        Skirmishers => 12,
        ShockCavalry => 60,
        HorseArchers => 55,
        ArtilleryCrew => 40,
        Peasant => 4, // they feed themselves off the land
        LightSword => 12,
        HeavySpear => 20,
        MediumInfantry => 16,
        MediumSpear => 16,
    }
}
pub const UPKEEP_UNIT_BASE: u32 = 4; // gold/day per roster entry

/// Recruit cost (gold per soldier x1000) and time (ticks per soldier).
pub fn recruit_cost_milligold(class: UnitClassId) -> u32 {
    upkeep_per_soldier_milligold(class) * 50
}
pub fn recruit_ticks_per_soldier(class: UnitClassId) -> u32 {
    use UnitClassId::*;
    match class {
        ShockCavalry | HorseArchers => 6,
        ArtilleryCrew => 5,
        HeavySword | Phalanx | LongSwords | MediumInfantry | MediumSpear => 3,
        _ => 2,
    }
}

/// Daily desertion per roster entry while the treasury is empty.
pub const DESERTION_PER_DAY: f32 = 0.02;
/// Passive replenishment per day, as a fraction of missing strength:
/// halted at a friendly city / in friendly territory / elsewhere.
pub const REPLENISH_CITY: f32 = 0.05;
pub const REPLENISH_FRIENDLY: f32 = 0.02;
pub const REPLENISH_HOSTILE: f32 = 0.005;
/// Rally-scar recovery per day while halted at a friendly city.
pub const MORALE_CAP_REGEN: f32 = 0.05;

/// Garrison regeneration: fraction of the city's establishment per day.
/// (0.02 left sacked cities open for fifty days — a razed garrison now
/// stands again in under a month.)
pub const GARRISON_REGEN: f32 = 0.04;

// ---- AI fiscal discipline --------------------------------------------------
// The AI keeps a war chest and caps its field army by territory, so force size
// equilibrates to what the realm can sustain.
/// Days of income the AI keeps in reserve before spending on troops/works.
pub const AI_RESERVE_DAYS: u32 = 6;
/// Field-army ceiling per owned city. A realm only raises as many troops as
/// its territory can supply, so the road to a bigger army is conquest.
pub const AI_SOLDIERS_PER_CITY: u32 = 2000;
/// How many of the nearest enemy cities the AI weighs (with a defender probe)
/// before falling back to simply advancing on the nearest one.
pub const AI_TARGET_CANDIDATES: usize = 8;
/// How many of its strongest free armies a faction sends on the offensive each
/// cycle. More than one keeps a front pressed and lets a beaten enemy be run
/// down by the next army instead of one lone army winning then wandering off.
pub const AI_ATTACKERS: usize = 3;
/// How close (road tiles) a visible enemy army must be to a target city to
/// count among its defenders when the AI weighs an assault.
pub const AI_THREAT_RADIUS: u32 = 6;

// ---- AI lookahead ----------------------------------------------------------
// The commander imagines a few candidate commitments, rolls each forward this
// many campaign minutes with the cheap battle estimate, and scores the result.
/// How far (campaign minutes) a candidate plan is rolled forward before its
/// position is scored. Movement is slow — one 5 km tile is ~240 ticks of foot
/// march — so the horizon is measured in days, not hours: a committed march
/// must have time to cross the few tiles to contact and let the estimate
/// resolve the fight, or every plan scores the same. One day (1440) lets foot
/// cross ~6 tiles; tuned against cost + in-app feel in slice 4.
pub const AI_ROLLOUT_HORIZON: u32 = 1440;

// ---- diplomacy -------------------------------------------------------------
// Diplomacy is what breaks the six-power peer standoff: instead of every power
// fighting every neighbour at parity, each focuses war on its weakest reachable
// peer, makes peace elsewhere to mass its army on one front, and allies with
// anyone who shares its victim. The weakest get ganged and eaten, a new weakest
// emerges, and the map resolves instead of freezing.
/// How often (ticks) factions re-evaluate treaties. Weekly: sticky enough not
/// to thrash, responsive enough to follow the shifting balance of power.
pub const DIPLOMACY_EVERY: u32 = 7 * TICKS_PER_DAY;
/// A city's worth in the strength yardstick when ranking powers for diplomacy
/// (so a wide, lightly-garrisoned realm still reads as a real power).
pub const DIPLO_CITY_WEIGHT: u64 = 3000;
