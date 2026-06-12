//! Dynamic campaign state — everything that changes over ticks, and nothing
//! that doesn't (topology lives in WorldMap). All of it serializes for saves.
//! Determinism: BTree collections only; armies always processed in id order.

use crate::mapdata::{EdgeId, NodeId};
use contract::{Pcg32, UnitClassId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type ArmyId = u32;
pub type FactionId = u32;
pub type EncounterId = u32;

/// A position on the road network. Nodes are tiles of their own.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Loc {
    Node(NodeId),
    Edge { edge: EdgeId, tile: u16 },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RosterEntry {
    pub class: UnitClassId,
    pub count: u32,
    /// Establishment strength: passive replenishment refills toward this.
    pub max: u32,
    /// Rally-scar carryover into battles; recovers at friendly cities.
    pub morale_cap: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Stance {
    /// Following a path, or standing where the last one ended.
    March,
    /// Deliberately halted (garrison duty).
    Hold,
    Camp { build_ticks_left: u16 },
    Ambush { spot: u32, settle_ticks_left: u16 },
    /// Uncontrollable retreat; regroups at a friendly city or after the tiles run out.
    Routed { tiles_left: u16, daze_ticks_left: u32 },
    Occupying { city: NodeId, ticks_left: u16 },
    /// Embarked on a sea lane.
    AtSea,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Army {
    pub id: ArmyId,
    pub faction: FactionId,
    /// A city garrison fighting as a temporary field army; folds back into
    /// the city when its battle ends. Never takes movement orders.
    pub garrison_of: Option<NodeId>,
    pub roster: Vec<RosterEntry>,
    pub loc: Loc,
    /// Remaining route; `path[path_idx]` is the next tile to enter.
    pub path: Vec<Loc>,
    pub path_idx: usize,
    /// 0..1 progress toward the next tile.
    pub progress: f32,
    pub stance: Stance,
    pub encounter: Option<EncounterId>,
    /// Counts down while embarking/disembarking at a port.
    pub embark_ticks_left: u16,
}

impl Army {
    pub fn alive(&self) -> bool {
        self.roster.iter().any(|r| r.count > 0)
    }
    pub fn soldiers(&self) -> u32 {
        self.roster.iter().map(|r| r.count).sum()
    }
    pub fn marching(&self) -> bool {
        self.path_idx < self.path.len()
    }
    /// Exclusive tile claim: standing armies block; marchers are transient.
    pub fn halted(&self) -> bool {
        !self.marching()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum EncounterPhase {
    Preparing,
    /// Both sides prepped: campaign auto-pauses, player picks fight/auto.
    Pending,
    /// Handed off to the battle layer.
    Fighting,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Encounter {
    pub id: EncounterId,
    pub attacker: ArmyId,
    pub defender: ArmyId,
    pub prep_attacker: u16,
    pub prep_defender: u16,
    pub phase: EncounterPhase,
    /// Ambush-initiated: defender was the ambusher, attacker the victim.
    pub ambush: bool,
    /// Battle seed, drawn from the campaign RNG at creation.
    pub seed: u64,
    /// Filled at handoff: committed reinforcements (army, battle delay secs,
    /// battle-space approach bearing).
    pub reinforcements: Vec<(ArmyId, f32, f32)>,
    /// Retreat viability per side ([attacker, defender]), computed at
    /// Pending and shown on the initiation screen: true = no road out,
    /// defeat means annihilation.
    pub no_retreat: [bool; 2],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Faction {
    pub treasury: u32,
    pub ai: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecruitJob {
    pub class: UnitClassId,
    pub count: u32,
    pub ticks_left: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RoadJob {
    pub to_level: u8,
    pub ticks_left: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CityState {
    pub owner: FactionId,
    pub garrison: Vec<RosterEntry>,
    /// 0..2: income x1 / x1.5 / x2.
    pub market_lvl: u8,
    /// 0..2: recruit time x1 / x0.75 / x0.5.
    pub barracks_lvl: u8,
    /// Sequential; head is in production.
    pub recruit_queue: Vec<RecruitJob>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CampaignState {
    pub version: u32,
    pub player_faction: FactionId,
    pub tick: u64,
    pub rng: Pcg32,
    pub factions: Vec<Faction>,
    /// Index = ArmyId. Dead armies are tombstoned (empty roster), ids stable.
    pub armies: Vec<Army>,
    pub cities: BTreeMap<NodeId, CityState>,
    pub encounters: Vec<Encounter>,
    pub next_encounter_id: EncounterId,
    /// Set when an encounter reaches Pending; frontend auto-pauses on it.
    pub battle_ready: Option<EncounterId>,
    /// Pairs that just resolved an escape: no re-engagement until the tick
    /// expires (key is (lower id, higher id)).
    pub no_rematch: BTreeMap<(ArmyId, ArmyId), u64>,
    /// Per-faction sets of armies it can currently see (fog of war).
    #[serde(default)]
    pub visible: Vec<std::collections::BTreeSet<ArmyId>>,
    /// Per-edge road level (1..=3); speed/routing multipliers in tunables.
    /// Sized to the map at load — an old save's empty vec is re-initialized.
    #[serde(default)]
    pub road_levels: Vec<u8>,
    /// In-flight upgrades, keyed by edge. One job per edge.
    #[serde(default)]
    pub road_jobs: BTreeMap<EdgeId, RoadJob>,
}

impl CampaignState {
    pub fn road_level(&self, edge: EdgeId) -> u8 {
        self.road_levels.get(edge as usize).copied().unwrap_or(1)
    }
}
