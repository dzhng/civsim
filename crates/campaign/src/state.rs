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

/// Serde for a `BTreeMap` with a `(u32, u32)` key: JSON objects can't have tuple
/// keys, so store it as an array of `[a, b, value]` entries. Without this,
/// `save()` throws the moment a map like `relations` is non-empty.
mod pair_key_map {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::collections::BTreeMap;

    pub fn serialize<S, V>(m: &BTreeMap<(u32, u32), V>, s: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
        V: Serialize,
    {
        let entries: Vec<(u32, u32, &V)> = m.iter().map(|(&(a, b), v)| (a, b, v)).collect();
        entries.serialize(s)
    }

    pub fn deserialize<'de, D, V>(d: D) -> Result<BTreeMap<(u32, u32), V>, D::Error>
    where
        D: Deserializer<'de>,
        V: Deserialize<'de>,
    {
        let entries: Vec<(u32, u32, V)> = Vec::deserialize(d)?;
        Ok(entries.into_iter().map(|(a, b, v)| ((a, b), v)).collect())
    }
}

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
    /// Chasing a moving enemy army: the path is re-pointed at the target's
    /// current tile every tick, indefinitely, so the army hounds it across the
    /// map — and keeps after it even once it routs. Ends when the target dies or
    /// a new order is given.
    Pursuing {
        target: ArmyId,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Army {
    pub id: ArmyId,
    pub faction: FactionId,
    /// A city garrison fighting as a field army; folds back into
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
    /// When this army takes a city, sack it (plunder + raze the populace) rather
    /// than hold it. Off by default — most conquests are meant to be kept; a
    /// commander flips it on to deny a city it can't hold.
    #[serde(default)]
    pub sack_intent: bool,
    /// Counts down while embarking/disembarking at a port.
    pub embark_ticks_left: u16,
}

fn default_auto_replenish() -> bool {
    true
}

impl Army {
    pub fn new(id: ArmyId, faction: FactionId, roster: Vec<RosterEntry>, loc: Loc) -> Self {
        Self {
            id,
            faction,
            garrison_of: None,
            roster,
            loc,
            path: Vec::new(),
            path_idx: 0,
            progress: 0.0,
            stance: Stance::Hold,
            encounter: None,
            auto_replenish: true,
            sack_intent: false,
            embark_ticks_left: 0,
        }
    }

    pub fn garrisoned(mut self, node: NodeId) -> Self {
        self.garrison_of = Some(node);
        self
    }

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

impl Encounter {
    pub fn new(
        st: &mut CampaignState,
        attacker: ArmyId,
        defender: ArmyId,
        prep: [u16; 2],
        ambush: bool,
    ) -> Self {
        let id = st.next_encounter_id;
        let seed = ((st.rng.next_u32() as u64) << 32) | st.rng.next_u32() as u64;
        st.next_encounter_id += 1;
        let [prep_attacker, prep_defender] = prep;
        Self {
            id,
            attacker,
            defender,
            prep_attacker,
            prep_defender,
            phase: EncounterPhase::Preparing,
            ambush,
            seed,
            reinforcements: Vec::new(),
            no_retreat: [false, false],
        }
    }
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
    /// The faction's nemesis — a persistent grudge that biases it toward
    /// fighting this rival above colder targets. Seeded from the map (historic
    /// rivalries) or formed in play when attacked; dissolves once the two are
    /// too far apart in power. `None` = no current rival.
    #[serde(default)]
    pub rival: Option<FactionId>,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CityState {
    pub owner: FactionId,
    pub garrison: Vec<RosterEntry>,
    /// People. The spine of the economy: source of both gold and the recruitment
    /// pool. Grows logistically toward its tier cap on the monthly pulse.
    pub population: u32,
    /// Policy dial — what the city develops toward. −1 = full Economy,
    /// +1 = full Military, 0 = Balanced. The player's only steering, alongside
    /// `throttle`; the city auto-develops from it (no build menu).
    pub focus: f32,
    /// Policy dial — Grow (0) ↔ Exploit (1). Grow invests population in more
    /// population; Exploit extracts immediate yield and can shrink the city.
    pub throttle: f32,
    /// Accumulated economic development (0..1), ramps toward the focus target and
    /// decays off-axis. Lifts income.
    pub econ_dev: f32,
    /// Accumulated military development (0..1). Deepens the garrison establishment
    /// and gates which class options the city can field.
    pub mil_dev: f32,
    /// Allegiance (0..1). Drifts monthly by the balance of friendly vs enemy
    /// connected territory; drags output and growth as it falls; revolts at 0.
    pub loyalty: f32,
    /// Sequential; head is in production.
    pub recruit_queue: Vec<RecruitJob>,
}

impl Default for CityState {
    fn default() -> Self {
        CityState {
            owner: 0,
            garrison: Vec::new(),
            population: 0,
            focus: 0.0,
            throttle: 0.0,
            econ_dev: 0.0,
            mil_dev: 0.0,
            loyalty: 1.0,
            recruit_queue: Vec::new(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CampaignState {
    pub version: u32,
    #[serde(default)]
    pub campaign_seed: u64,
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
    #[serde(default, with = "pair_key_map")]
    pub no_rematch: BTreeMap<(ArmyId, ArmyId), u64>,
    /// Per-faction sets of armies it can currently see (fog of war).
    #[serde(default)]
    pub visible: Vec<std::collections::BTreeSet<ArmyId>>,
    /// Set once the war is decided; `None` while it is still being fought.
    #[serde(default)]
    pub outcome: Option<Outcome>,
    /// Pairwise diplomacy, keyed `(lo, hi)`. Absent = War until a treaty is
    /// signed.
    #[serde(default, with = "pair_key_map")]
    pub relations: BTreeMap<(FactionId, FactionId), Relation>,
    /// Each AI power's current war objective: the rival it is concentrating its
    /// offensive against (set by the diplomacy pass; read by the commander to
    /// mass its armies on one front instead of spreading thin).
    #[serde(default)]
    pub diplo_target: BTreeMap<FactionId, FactionId>,
    /// True only while this state is a search sandbox being rolled forward by
    /// `rollout::forward`. Skips the per-tick work a lookahead doesn't need —
    /// fog recompute (the cost bottleneck) and the diplomacy pass — and is never
    /// serialized, so a real save or a fresh clone is always a live game.
    #[serde(skip)]
    pub in_rollout: bool,
}

impl CampaignState {
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
