//! The campaign↔battle contract: the only vocabulary the two games share.
//! `campaign` and `sim` both depend on this crate and never on each other;
//! the wasm composition root is the single place they meet.

mod rng;
pub use rng::Pcg32;

use serde::{Deserialize, Serialize};

/// Unit classes. Battle physics for each live in sim's stat tables; campaign
/// march speeds and costs live in campaign's tunables — both keyed by this.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
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
    /// Levy with a dagger and no shield — cheap cannon fodder. Added last so the
    /// existing class indices (shared with the wasm/web class id table) hold.
    Peasant,
}

/// Gold cost of a full unit at duel strength. Anchors per David: light
/// infantry 300, heavy 1000 (one heavy unit beats two light units head-on
/// — the premium prices concentration of force). The rest follow the
/// measured matchup matrix: pikes own the ground war frontally, cavalry
/// owns everything pikes don't, horse archers tax all foot.
pub fn unit_cost(c: UnitClassId) -> u32 {
    match c {
        UnitClassId::HeavyInfantry => 1000,
        UnitClassId::LightInfantry => 300,
        UnitClassId::LongSwords => 450,
        UnitClassId::Phalanx => 1300,
        UnitClassId::Archers => 500,
        UnitClassId::Skirmishers => 250,
        UnitClassId::ShockCavalry => 1400,
        UnitClassId::HorseArchers => 1100,
        UnitClassId::ArtilleryCrew => 700,
        UnitClassId::Peasant => 175, // a sack of grain and a knife — cannon fodder
    }
}

pub const ALL_CLASSES: [UnitClassId; 10] = [
    UnitClassId::HeavyInfantry,
    UnitClassId::LightInfantry,
    UnitClassId::LongSwords,
    UnitClassId::Phalanx,
    UnitClassId::Archers,
    UnitClassId::Skirmishers,
    UnitClassId::ShockCavalry,
    UnitClassId::HorseArchers,
    UnitClassId::ArtilleryCrew,
    UnitClassId::Peasant,
];

/// A battle map as a data-only paint program over a flat terrain grid.
/// Ops apply in order — later ops overwrite (a bridge paints over its river).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TerrainSpec {
    pub half_w: f32,
    pub half_h: f32,
    pub cell: f32,
    pub ops: Vec<PaintOp>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum PaintOp {
    Rect { min: [f32; 2], max: [f32; 2], speed: f32, rough: f32, tint: u8 },
    Circle { center: [f32; 2], radius: f32, speed: f32, rough: f32, tint: u8 },
    /// Thick segment: roads, river reaches, wall runs at any bearing.
    Capsule { a: [f32; 2], b: [f32; 2], radius: f32, speed: f32, rough: f32, tint: u8 },
}

/// One campaign unit entering a battle. `id` is campaign-side identity,
/// echoed back in `UnitResult` so casualties land on the right roster entry.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RosterUnit {
    pub id: u64,
    pub class: UnitClassId,
    pub count: u32,
    pub training: f32,
    /// Rally-scar carryover; seeds the battle morale ceiling (1.0 = fresh).
    pub morale_cap: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Deployment {
    pub team: u32,
    pub units: Vec<RosterUnit>,
    /// Main-line center in battle coords.
    pub center: [f32; 2],
    /// Radians, pointing at the enemy.
    pub facing: f32,
    /// Strung out along the march axis (was moving, or ambushed) instead of formed.
    pub column: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Reinforcement {
    pub team: u32,
    pub units: Vec<RosterUnit>,
    /// Map-edge entry point where their road enters the battle window.
    pub entry: [f32; 2],
    pub facing: f32,
    pub delay_secs: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BattleSetup {
    /// Drawn from the campaign RNG; saved so replays stay deterministic.
    pub seed: u64,
    pub terrain: TerrainSpec,
    pub deployments: Vec<Deployment>,
    pub reinforcements: Vec<Reinforcement>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnitResult {
    pub id: u64,
    pub team: u32,
    pub survivors: u32,
    pub routed: bool,
    /// Ending morale ceiling, carried back to the campaign roster entry.
    pub morale_cap: f32,
    /// False = scheduled reinforcement that never arrived (still full strength).
    pub deployed: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BattleResult {
    pub victor: u32,
    pub units: Vec<UnitResult>,
}
