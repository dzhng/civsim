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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DoctrineSlot {
    pub class: UnitClassId,
    pub selected: contract::UnitTypeId,
    /// Establishment multiplier for every roster entry of this class.
    pub size_mult: u8,
    pub cooldown_until: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct FactionDoctrine {
    pub slots: Vec<DoctrineSlot>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Stance {
    /// Following a path, or standing where the last one ended.
    March,
    /// Deliberately halted (garrison duty).
    Hold,
    Camp {
        build_ticks_left: u16,
    },
    Ambush {
        spot: u32,
        settle_ticks_left: u16,
    },
    /// Uncontrollable retreat. Intangible to `by` (the army that beat it) while
    /// still fleeing — long enough to break away from that one force. Every
    /// other hostile can already cut it down mid-flight, and once its flee path
    /// is run a regroup window opens in which anyone in contact runs it down;
    /// survive the window and it regroups (Hold).
    Routed {
        tiles_left: u16,
        regroup_ticks_left: u32,
        by: ArmyId,
    },
    Occupying {
        city: NodeId,
        ticks_left: u16,
    },
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
    /// Paid automatic replenishment toward establishment strength. Defaults on.
    #[serde(default = "default_auto_replenish")]
    pub auto_replenish: bool,
    /// Counts down while embarking/disembarking at a port.
    pub embark_ticks_left: u16,
}

fn default_auto_replenish() -> bool {
    true
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
    /// Combat mood: a slowly-drifting scalar around 1.0 (level-headed), rising
    /// above 1 when the faction feels brave and dipping below when it turns
    /// cautious. Biases the commander toward or away from committing to a fight,
    /// so a faction runs hot or cold in streaks rather than re-rolling its nerve
    /// every decision. Persisted so the mood survives a save; defaulted so old
    /// saves load level-headed.
    #[serde(default = "default_bravado")]
    pub bravado: f32,
}

fn default_bravado() -> f32 {
    1.0
}

/// Diplomatic stance between two factions. War is the implicit default when a
/// pair is absent from the relation map. Peace stops the fighting; Alliance
/// marks co-belligerents who share a common enemy and won't turn on each other
/// while it lives.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Relation {
    War,
    Peace,
    Alliance,
}

/// The war's verdict. The contest is between the playable powers; independents
/// are neutral scenery, never a blocker. Decided when at most one playable
/// power still holds a city.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Outcome {
    /// One playable power outlasted all the others.
    Victory(FactionId),
    /// No playable power holds a city — mutual collapse.
    Draw,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecruitJob {
    pub class: UnitClassId,
    pub count: u32,
    pub ticks_left: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildKind {
    Market,
    Barracks,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BuildJob {
    pub kind: BuildKind,
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
    /// One construction site per city.
    #[serde(default)]
    pub build_job: Option<BuildJob>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CampaignState {
    pub version: u32,
    pub player_faction: FactionId,
    pub tick: u64,
    pub rng: Pcg32,
    pub factions: Vec<Faction>,
    /// Per-faction class builder choices. Normalized at new/load so old saves
    /// receive defaults and new classes get slots.
    #[serde(default)]
    pub doctrines: Vec<FactionDoctrine>,
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
    /// Normalized to the map's edge count at load.
    #[serde(default)]
    pub road_levels: Vec<u8>,
    /// Set once the war is decided; `None` while it is still being fought.
    #[serde(default)]
    pub outcome: Option<Outcome>,
    /// Pairwise diplomacy, keyed `(lo, hi)`. Absent = War until a treaty is
    /// signed.
    #[serde(default)]
    pub relations: BTreeMap<(FactionId, FactionId), Relation>,
    /// Each AI power's current war objective: the rival it is concentrating its
    /// offensive against (set by the diplomacy pass; read by the commander to
    /// mass its armies on one front instead of spreading thin).
    #[serde(default)]
    pub diplo_target: BTreeMap<FactionId, FactionId>,
    /// True only while this state is a search sandbox being rolled forward by
    /// `rollout::forward`. Suppresses the hourly AI pass (so a commander's
    /// lookahead can't recurse into itself) and is never serialized — a real
    /// save or a fresh clone is always a live game (`false`).
    #[serde(skip)]
    pub in_rollout: bool,
    /// Last tick each faction's commander ran, hourly or event-triggered — the
    /// debounce that stops a messy multi-army contact from firing a re-think
    /// storm in one tick. Transient scheduling state, never serialized.
    #[serde(skip)]
    pub last_think: BTreeMap<FactionId, u64>,
}

impl CampaignState {
    pub fn road_level(&self, edge: EdgeId) -> u8 {
        self.road_levels.get(edge as usize).copied().unwrap_or(1)
    }

    /// Diplomatic stance between two factions (own faction counts as Peace).
    pub fn relation(&self, a: FactionId, b: FactionId) -> Relation {
        if a == b {
            return Relation::Peace;
        }
        self.relations
            .get(&(a.min(b), a.max(b)))
            .copied()
            .unwrap_or(Relation::War)
    }

    /// Are these two factions shooting at each other? (False for self.)
    pub fn at_war(&self, a: FactionId, b: FactionId) -> bool {
        a != b && self.relation(a, b) == Relation::War
    }

    pub fn allied(&self, a: FactionId, b: FactionId) -> bool {
        self.relation(a, b) == Relation::Alliance
    }

    /// Set (and normalize) a treaty between two distinct factions.
    pub fn set_relation(&mut self, a: FactionId, b: FactionId, r: Relation) {
        if a != b {
            self.relations.insert((a.min(b), a.max(b)), r);
        }
    }
}

/// War test against the relations map alone — for call sites that already hold a
/// disjoint mutable borrow of another `CampaignState` field (e.g. `retain`).
pub fn rel_at_war(
    relations: &BTreeMap<(FactionId, FactionId), Relation>,
    a: FactionId,
    b: FactionId,
) -> bool {
    a != b
        && relations
            .get(&(a.min(b), a.max(b)))
            .copied()
            .unwrap_or(Relation::War)
            == Relation::War
}
