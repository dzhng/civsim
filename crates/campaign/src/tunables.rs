//! Campaign tuning constants. Data, not code — same doctrine as sim's class
//! tables. Campaign march speeds are deliberately separate from battle
//! speed_mult: they answer "km/day on a road", not "m/s on a field".

use contract::UnitClassId;

/// Campaign ticks per day; 1 tick = 1 campaign minute.
pub const TICKS_PER_DAY: u32 = 1440;
/// One road tile of march, in km (must match mapgen's TILE_KM).
pub const TILE_KM: f32 = 5.0;

/// Baseline infantry march: 30 km/day => one 5 km tile per 4 campaign hours.
pub const BASE_TILES_PER_TICK: f32 = (30.0 / TILE_KM) / TICKS_PER_DAY as f32;

/// March-speed multiplier per class (1.0 = baseline foot).
pub fn march_mult(class: UnitClassId) -> f32 {
    use UnitClassId::*;
    match class {
        HeavyInfantry => 0.9,
        LightInfantry => 1.1,
        LongSwords => 1.0,
        Phalanx => 0.85,
        Archers => 1.0,
        Skirmishers => 1.15,
        ShockCavalry => 2.2,
        HorseArchers => 2.4,
        ArtilleryCrew => 0.7,
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

/// Routed armies: tiles of hostile-free road needed to regroup (or a nearer
/// friendly city); no such path at battle end = captured and wiped.
pub const ROUT_TILES: u16 = 16;
pub const ROUT_SPEED_MULT: f32 = 1.15;
/// After regrouping, uncontrollable for this long.
pub const ROUT_DAZE_TICKS: u32 = TICKS_PER_DAY;

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
