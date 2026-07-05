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
    HeavySword,
    LightSpear,
    LongSwords,
    HeavyPhalanx,
    Archers,
    Skirmishers,
    ShockCavalry,
    HorseArchers,
    ArtilleryCrew,
    /// Levy with a dagger and no shield — cheap cannon fodder. Added last so the
    /// existing class indices (shared with the wasm/web class id table) hold.
    Peasant,
    /// Light armour, sword + small shield — the cheap sword line (HeavySword
    /// is the heavy sword). Added after Peasant so existing indices hold.
    LightSword,
    /// Heavy armour, spear + big shield — the armoured spear wall (LightSpear
    /// is the light spear). Added last so existing indices hold.
    HeavySpear,
    /// Workhorse sword infantry: stronger than light swords, below elite heavy
    /// swords. Added last so existing indices hold.
    MediumInfantry,
    /// Workhorse spear infantry: stronger than light spears, below elite heavy
    /// spears. Added last so existing indices hold.
    MediumSpear,
    /// Workhorse pike block: a shorter sarissa than the heavy phalanx — slightly
    /// worse body than its medium-sword counterpart, but the reach blunts a
    /// charge. Added last so existing indices hold.
    MediumPhalanx,
}

/// Campaign-side concrete unit choice within a tactical class. The numeric
/// encoding is owned by the campaign unit catalog; the battle sim treats it as
/// an opaque key unless the composition root resolves it to stats.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct UnitTypeId(pub u32);

/// Gold cost of a full unit at duel strength. Anchors per David: light
/// infantry 300, heavy 1000 (one heavy unit beats two light units head-on
/// — the premium prices concentration of force). The rest follow the
/// measured matchup matrix: pikes own the ground war frontally, cavalry
/// owns everything pikes don't, horse archers tax all foot.
pub fn unit_cost(c: UnitClassId) -> u32 {
    match c {
        UnitClassId::HeavySword => 1000,
        UnitClassId::LightSpear => 300,
        UnitClassId::LongSwords => 450,
        UnitClassId::HeavyPhalanx => 1300,
        UnitClassId::Archers => 500,
        UnitClassId::Skirmishers => 250,
        UnitClassId::ShockCavalry => 1400,
        UnitClassId::HorseArchers => 1100,
        UnitClassId::ArtilleryCrew => 700,
        UnitClassId::Peasant => 175, // a sack of grain and a knife — cannon fodder
        UnitClassId::LightSword => 400, // cheap sword line: shield + blade, light armour
        UnitClassId::HeavySpear => 1100, // armoured spear wall: anti-charge line
        UnitClassId::MediumInfantry => 650, // workhorse sword line between light and elite
        UnitClassId::MediumSpear => 700, // workhorse spear line with a better brace
        UnitClassId::MediumPhalanx => 800, // workhorse pike: medium body, a charge-blunting reach
    }
}

/// Soldiers in ONE unit at 1x establishment — the SINGLE source of truth shared by
/// the battle layer (how big a deployed unit is) and the campaign (how big one army
/// slot is). A campaign unit and a battle unit are the same thing; the 1x/2x/3x
/// class builder multiplies this. Close-order foot 500, LOOSE-order foot
/// (archers/skirmishers/longswords) 350, horse 200, gun crew 80.
pub fn unit_size(c: UnitClassId) -> u32 {
    match c {
        UnitClassId::ShockCavalry | UnitClassId::HorseArchers => 200,
        UnitClassId::ArtilleryCrew => 80,
        // Loose/open-order infantry — a thinner, more dispersed body.
        UnitClassId::Archers | UnitClassId::Skirmishers | UnitClassId::LongSwords => 350,
        _ => 500,
    }
}

pub const ALL_CLASSES: [UnitClassId; 15] = [
    UnitClassId::HeavySword,
    UnitClassId::LightSpear,
    UnitClassId::LongSwords,
    UnitClassId::HeavyPhalanx,
    UnitClassId::Archers,
    UnitClassId::Skirmishers,
    UnitClassId::ShockCavalry,
    UnitClassId::HorseArchers,
    UnitClassId::ArtilleryCrew,
    UnitClassId::Peasant,
    UnitClassId::LightSword,
    UnitClassId::HeavySpear,
    UnitClassId::MediumInfantry,
    UnitClassId::MediumSpear,
    UnitClassId::MediumPhalanx,
];

pub fn unit_class_key(c: UnitClassId) -> &'static str {
    match c {
        UnitClassId::HeavySword => "heavy_sword",
        UnitClassId::LightSpear => "light_spear",
        UnitClassId::LongSwords => "long_swords",
        UnitClassId::HeavyPhalanx => "heavy_phalanx",
        UnitClassId::Archers => "archers",
        UnitClassId::Skirmishers => "skirmishers",
        UnitClassId::ShockCavalry => "shock_cavalry",
        UnitClassId::HorseArchers => "horse_archers",
        UnitClassId::ArtilleryCrew => "artillery_crew",
        UnitClassId::Peasant => "peasant",
        UnitClassId::LightSword => "light_sword",
        UnitClassId::HeavySpear => "heavy_spear",
        UnitClassId::MediumInfantry => "medium_infantry",
        UnitClassId::MediumSpear => "medium_spear",
        UnitClassId::MediumPhalanx => "medium_phalanx",
    }
}

pub fn unit_class_name(c: UnitClassId) -> &'static str {
    match c {
        UnitClassId::HeavySword => "Heavy Sword",
        UnitClassId::LightSpear => "Light Spear",
        UnitClassId::LongSwords => "Long Swords",
        UnitClassId::HeavyPhalanx => "Heavy Phalanx",
        UnitClassId::Archers => "Archers",
        UnitClassId::Skirmishers => "Skirmishers",
        UnitClassId::ShockCavalry => "Shock Cavalry",
        UnitClassId::HorseArchers => "Horse Archers",
        UnitClassId::ArtilleryCrew => "Artillery Crew",
        UnitClassId::Peasant => "Peasants",
        UnitClassId::LightSword => "Light Sword",
        UnitClassId::HeavySpear => "Heavy Spear",
        UnitClassId::MediumInfantry => "Medium Infantry",
        UnitClassId::MediumSpear => "Medium Spear",
        UnitClassId::MediumPhalanx => "Medium Phalanx",
    }
}

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
    Rect {
        min: [f32; 2],
        max: [f32; 2],
        speed: f32,
        rough: f32,
        tint: u8,
    },
    Circle {
        center: [f32; 2],
        radius: f32,
        speed: f32,
        rough: f32,
        tint: u8,
    },
    /// Thick segment: roads, river reaches, wall runs at any bearing.
    Capsule {
        a: [f32; 2],
        b: [f32; 2],
        radius: f32,
        speed: f32,
        rough: f32,
        tint: u8,
    },
    /// Gentle elevation: a smooth dome (or dip, negative amplitude) of relief in
    /// meters, easing to zero by `radius`. Additive and height-only — it never
    /// changes speed/rough/tint, so relief and passability stay independent.
    Rise {
        center: [f32; 2],
        radius: f32,
        amplitude: f32,
    },
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct MapRecipe {
    #[serde(default)]
    pub seed: u64,
    #[serde(default = "default_map_half_w")]
    pub half_w: f32,
    #[serde(default = "default_map_half_h")]
    pub half_h: f32,
    #[serde(default = "default_map_cell")]
    pub cell: f32,
    #[serde(default = "default_vista_extent")]
    pub vista_extent: f32,
    #[serde(default)]
    pub slope_bands: SlopeBands,
    #[serde(default)]
    pub hydrology: HydrologyRecipe,
    #[serde(default)]
    pub edge_seals: EdgeSealRecipe,
    #[serde(default)]
    pub field_texture: FieldTextureRecipe,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlopeBands {
    pub flat_max: f32,
    pub rolling_max: f32,
    pub slow_min: f32,
    pub cliff_min: f32,
    pub cliff_dilate_cells: u16,
    pub highland_cap_min_m: f32,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrologyRecipe {
    pub lake_area_budget: f32,
    pub stream_count: u8,
    pub stream_accum_threshold: u32,
    pub marsh_width_cells: u8,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeSealRecipe {
    #[serde(default)]
    pub weights: EdgeSealWeights,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeSealWeights {
    #[serde(default = "default_cliff_run_weight")]
    pub cliff_run: u16,
    #[serde(default = "default_forest_belt_weight")]
    pub forest_belt: u16,
    #[serde(default = "default_water_reach_weight")]
    pub water_reach: u16,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldTextureRecipe {
    pub forest_clumps: u8,
    pub scree_patches: u8,
    pub mud_lowlands: u8,
    pub rough_fields: u8,
}

impl Default for MapRecipe {
    fn default() -> Self {
        Self {
            seed: 0,
            half_w: default_map_half_w(),
            half_h: default_map_half_h(),
            cell: default_map_cell(),
            vista_extent: default_vista_extent(),
            slope_bands: SlopeBands::default(),
            hydrology: HydrologyRecipe::default(),
            edge_seals: EdgeSealRecipe::default(),
            field_texture: FieldTextureRecipe::default(),
        }
    }
}

impl Default for SlopeBands {
    fn default() -> Self {
        Self {
            flat_max: 0.035,
            rolling_max: 0.115,
            slow_min: 0.135,
            cliff_min: 0.32,
            cliff_dilate_cells: 6,
            highland_cap_min_m: 35.0,
        }
    }
}

impl Default for HydrologyRecipe {
    fn default() -> Self {
        Self {
            lake_area_budget: 0.018,
            stream_count: 3,
            stream_accum_threshold: 850,
            marsh_width_cells: 4,
        }
    }
}

impl Default for EdgeSealRecipe {
    fn default() -> Self {
        Self {
            weights: EdgeSealWeights::default(),
        }
    }
}

impl Default for EdgeSealWeights {
    fn default() -> Self {
        Self {
            cliff_run: default_cliff_run_weight(),
            forest_belt: default_forest_belt_weight(),
            water_reach: default_water_reach_weight(),
        }
    }
}

impl Default for FieldTextureRecipe {
    fn default() -> Self {
        Self {
            forest_clumps: 5,
            scree_patches: 7,
            mud_lowlands: 5,
            rough_fields: 8,
        }
    }
}

fn default_map_half_w() -> f32 {
    1200.0
}

fn default_map_half_h() -> f32 {
    800.0
}

fn default_map_cell() -> f32 {
    4.0
}

fn default_vista_extent() -> f32 {
    2.0
}

fn default_cliff_run_weight() -> u16 {
    6
}

fn default_forest_belt_weight() -> u16 {
    2
}

fn default_water_reach_weight() -> u16 {
    2
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TerrainSource {
    Ops(TerrainSpec),
    Recipe(MapRecipe),
}

/// One campaign unit entering a battle. `id` is campaign-side identity,
/// echoed back in `UnitResult` so casualties land on the right roster entry.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RosterUnit {
    pub id: u64,
    pub class: UnitClassId,
    #[serde(default)]
    pub unit_type: Option<UnitTypeId>,
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
    pub terrain: TerrainSource,
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
