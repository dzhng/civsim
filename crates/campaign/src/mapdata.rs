//! Static world topology, loaded from campaign-map.json (mapgen's output).
//! Never serialized into saves — only dynamic state is. JSON node ids (ORBIS
//! site ids) are remapped to dense indices at load.

use serde::Deserialize;
use std::collections::BTreeMap;

pub type NodeId = u32;
pub type EdgeId = u32;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, Deserialize)]
pub enum TileFeature {
    Open,
    Forest,
    Hill,
    Pass,
    Bridge,
    Ford,
    Sea,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    City,
    Junction,
}

pub struct Node {
    pub name: String,
    pub pos: [f32; 2],
    pub kind: NodeKind,
    pub tier: u8,
    pub port: bool,
    /// Initial owner (faction index; factions.len()-1 = independents). Dynamic
    /// ownership lives in CampaignState.
    pub initial_owner: u32,
    /// Incident edges, sorted (determinism).
    pub edges: Vec<EdgeId>,
}

pub struct Edge {
    pub a: NodeId,
    pub b: NodeId,
    pub sea: bool,
    pub via: Vec<[f32; 2]>,
    /// Cumulative arc length per via point (km); last = total length.
    pub cum: Vec<f32>,
    pub tiles: Vec<TileFeature>,
}

pub struct AmbushSpot {
    pub edge: EdgeId,
    pub tile: u16,
    pub side: i8,
}

/// How a faction's AI commander behaves. The dispatch in `ai.rs` is a single
/// match on this, so adding a persona (e.g. Defensive, Mercantile) is a new
/// variant plus its branch — nothing else hardcodes a faction by id.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AiPersona {
    /// Raises armies and wages war for the map — the relentless baseline power.
    Expansionist,
    /// Garrisons its cities and otherwise sits still: minor leagues, neutrals.
    Neutral,
    /// Holds what it has: fortifies, retakes lost cities, rarely marches out.
    Defensive,
    /// Economy first — out-earns its rivals, then buys a war late.
    Mercantile,
    /// Preys on the weak and wounded, dodges fair fights (a jackal).
    Opportunist,
    /// A cold optimizer: attacks only with a clear edge, little randomness.
    Calculating,
    /// Brave to a fault — throws itself at near-parity fights.
    Warmonger,
}

impl AiPersona {
    /// Parse the optional map field; absent → derived from `playable`
    /// (a power expands, everyone else stays neutral).
    pub fn parse(s: Option<&str>, playable: bool) -> AiPersona {
        match s {
            Some("expansionist") => AiPersona::Expansionist,
            Some("neutral") => AiPersona::Neutral,
            Some("defensive") => AiPersona::Defensive,
            Some("mercantile") => AiPersona::Mercantile,
            Some("opportunist") => AiPersona::Opportunist,
            Some("calculating") => AiPersona::Calculating,
            Some("warmonger") => AiPersona::Warmonger,
            _ => {
                if playable {
                    AiPersona::Expansionist
                } else {
                    AiPersona::Neutral
                }
            }
        }
    }
    /// Whether this persona ever marches out to campaign (vs. only garrisoning).
    /// Only `Neutral` sits still; every characterful persona wages war.
    pub fn campaigns(self) -> bool {
        !matches!(self, AiPersona::Neutral)
    }
}

pub struct FactionDef {
    pub id: String,
    pub name: String,
    pub color: [u8; 3],
    pub playable: bool,
    pub ai_persona: AiPersona,
    /// Seeded historic rival, resolved to a faction index at load. `None` = no
    /// pre-set nemesis (one may still form in play).
    pub seed_rival: Option<u32>,
}

pub struct StartArmy {
    pub faction: u32,
    pub at: NodeId,
    /// `(class, units)` — a count of full-strength units, not soldiers. The
    /// soldier count is derived from `unit_size` at load (see `sim::new_state`),
    /// so it can never drift when unit sizes change.
    pub roster: Vec<(contract::UnitClassId, u32)>,
}

pub struct WorldMap {
    pub half_w: f32,
    pub half_h: f32,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub ambush_spots: Vec<AmbushSpot>,
    pub factions: Vec<FactionDef>,
    pub start_armies: Vec<StartArmy>,
    /// Dense `Loc` enumeration for O(1) BFS visited-buffers: nodes occupy
    /// `0..nodes.len()`, then edge `e`'s tiles start at `nodes.len() + tile_base[e]`.
    tile_base: Vec<u32>,
    n_locs: usize,
    /// City-to-city adjacency: the road graph collapsed onto cities. A is a
    /// neighbour of B if a land road links them through only junction nodes (no
    /// intervening city). Static — used by the monthly loyalty gradient.
    city_neighbors: BTreeMap<NodeId, Vec<NodeId>>,
    /// Index of the independents faction (revolted cities flip here).
    independents: u32,
}

// ---- raw JSON shapes -------------------------------------------------------

#[derive(Deserialize)]
struct RawMap {
    half_w: f64,
    half_h: f64,
    nodes: Vec<RawNode>,
    edges: Vec<RawEdge>,
    ambush_spots: Vec<RawAmbush>,
    factions: Vec<RawFaction>,
    start_armies: Vec<RawStartArmy>,
}

#[derive(Deserialize)]
struct RawNode {
    id: u32,
    name: String,
    pos: [f64; 2],
    kind: String,
    tier: u8,
    port: bool,
    owner: String,
}

#[derive(Deserialize)]
struct RawEdge {
    a: u32,
    b: u32,
    kind: String,
    via: Vec<[f64; 2]>,
    tiles: Vec<String>,
}

#[derive(Deserialize)]
struct RawAmbush {
    edge: u32,
    tile: u16,
    side: i8,
}

#[derive(Deserialize)]
struct RawFaction {
    id: String,
    name: String,
    color: [u8; 3],
    playable: bool,
    #[serde(default)]
    ai_persona: Option<String>,
    /// Historic nemesis (another faction's id), e.g. Rome ↔ Carthage. Optional;
    /// rivalries also form in play when a faction is attacked.
    #[serde(default)]
    rival: Option<String>,
}

#[derive(Deserialize)]
struct RawStartArmy {
    faction: String,
    at: String,
    roster: Vec<(String, u32)>,
}

fn parse_feature(s: &str) -> TileFeature {
    match s {
        "open" => TileFeature::Open,
        "forest" => TileFeature::Forest,
        "hill" => TileFeature::Hill,
        "pass" => TileFeature::Pass,
        "bridge" => TileFeature::Bridge,
        "ford" => TileFeature::Ford,
        "sea" => TileFeature::Sea,
        other => panic!("unknown tile feature {other}"),
    }
}

fn parse_class(s: &str) -> contract::UnitClassId {
    serde_json::from_value(serde_json::Value::String(s.to_string())).expect("unit class name")
}

impl WorldMap {
    pub fn from_json(json: &str) -> WorldMap {
        let raw: RawMap = serde_json::from_str(json).expect("campaign map json");

        let faction_idx: BTreeMap<&str, u32> = raw
            .factions
            .iter()
            .enumerate()
            .map(|(i, f)| (f.id.as_str(), i as u32))
            .collect();
        // Default owner for ownerless nodes (junctions). Prefer an explicit
        // "independents" sentinel; otherwise the first non-playable faction.
        let independents = faction_idx
            .get("independents")
            .copied()
            .unwrap_or_else(|| raw.factions.iter().position(|f| !f.playable).unwrap_or(0) as u32);

        let id_to_idx: BTreeMap<u32, NodeId> = raw
            .nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (n.id, i as NodeId))
            .collect();
        let name_to_idx: BTreeMap<&str, NodeId> = raw
            .nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (n.name.as_str(), i as NodeId))
            .collect();

        let mut nodes: Vec<Node> = raw
            .nodes
            .iter()
            .map(|n| Node {
                name: n.name.clone(),
                pos: [n.pos[0] as f32, n.pos[1] as f32],
                kind: if n.kind == "city" {
                    NodeKind::City
                } else {
                    NodeKind::Junction
                },
                tier: n.tier,
                port: n.port,
                initial_owner: if n.owner.is_empty() {
                    independents
                } else {
                    faction_idx[n.owner.as_str()]
                },
                edges: Vec::new(),
            })
            .collect();

        let edges: Vec<Edge> = raw
            .edges
            .iter()
            .map(|e| {
                let via: Vec<[f32; 2]> = e.via.iter().map(|p| [p[0] as f32, p[1] as f32]).collect();
                let mut cum = Vec::with_capacity(via.len());
                let mut acc = 0.0f32;
                cum.push(0.0);
                for w in via.windows(2) {
                    acc += ((w[1][0] - w[0][0]).powi(2) + (w[1][1] - w[0][1]).powi(2)).sqrt();
                    cum.push(acc);
                }
                Edge {
                    a: id_to_idx[&e.a],
                    b: id_to_idx[&e.b],
                    sea: e.kind == "sea",
                    via,
                    cum,
                    tiles: e.tiles.iter().map(|t| parse_feature(t)).collect(),
                }
            })
            .collect();

        for (i, e) in edges.iter().enumerate() {
            nodes[e.a as usize].edges.push(i as EdgeId);
            nodes[e.b as usize].edges.push(i as EdgeId);
        }
        for n in &mut nodes {
            n.edges.sort_unstable();
        }

        // Prefix sums of edge tile counts, for the dense Loc index.
        let mut tile_base = Vec::with_capacity(edges.len());
        let mut acc = 0u32;
        for e in &edges {
            tile_base.push(acc);
            acc += e.tiles.len() as u32;
        }
        let n_locs = nodes.len() + acc as usize;

        // City-to-city adjacency: from each city, walk land edges through junction
        // nodes until another city is reached; that city is a neighbour. Cities
        // stop the walk (they don't relay), so this is the road graph collapsed
        // onto cities — the substrate the loyalty gradient diffuses over.
        let is_city = |n: NodeId| nodes[n as usize].kind == NodeKind::City;
        let mut city_neighbors: BTreeMap<NodeId, Vec<NodeId>> = BTreeMap::new();
        for c in (0..nodes.len() as NodeId).filter(|&n| is_city(n)) {
            let mut seen: std::collections::BTreeSet<NodeId> = std::collections::BTreeSet::new();
            seen.insert(c);
            let mut frontier = vec![c];
            let mut out: std::collections::BTreeSet<NodeId> = std::collections::BTreeSet::new();
            while let Some(n) = frontier.pop() {
                for &e in &nodes[n as usize].edges {
                    if edges[e as usize].sea {
                        continue; // loyalty diffuses over land, not sea lanes
                    }
                    let m = if edges[e as usize].a == n {
                        edges[e as usize].b
                    } else {
                        edges[e as usize].a
                    };
                    if !seen.insert(m) {
                        continue;
                    }
                    if is_city(m) {
                        out.insert(m); // a city: a neighbour, and the walk stops here
                    } else {
                        frontier.push(m); // a junction: keep relaying
                    }
                }
            }
            city_neighbors.insert(c, out.into_iter().collect());
        }

        WorldMap {
            half_w: raw.half_w as f32,
            half_h: raw.half_h as f32,
            nodes,
            edges,
            ambush_spots: raw
                .ambush_spots
                .iter()
                .map(|a| AmbushSpot {
                    edge: a.edge,
                    tile: a.tile,
                    side: a.side,
                })
                .collect(),
            factions: raw
                .factions
                .iter()
                .map(|f| FactionDef {
                    id: f.id.clone(),
                    name: f.name.clone(),
                    color: f.color,
                    playable: f.playable,
                    ai_persona: AiPersona::parse(f.ai_persona.as_deref(), f.playable),
                    seed_rival: f.rival.as_deref().and_then(|r| faction_idx.get(r).copied()),
                })
                .collect(),
            start_armies: raw
                .start_armies
                .iter()
                .map(|s| StartArmy {
                    faction: faction_idx[s.faction.as_str()],
                    at: name_to_idx[s.at.as_str()],
                    roster: s.roster.iter().map(|(c, n)| (parse_class(c), *n)).collect(),
                })
                .collect(),
            tile_base,
            n_locs,
            city_neighbors,
            independents,
        }
    }

    /// Number of distinct `Loc`s — size a BFS visited-buffer to this.
    pub fn loc_count(&self) -> usize {
        self.n_locs
    }

    /// Cities directly connected to `city` over the collapsed road graph
    /// (empty slice for a junction or an isolated city).
    pub fn city_neighbors(&self, city: NodeId) -> &[NodeId] {
        self.city_neighbors.get(&city).map_or(&[], |v| v.as_slice())
    }

    /// The independents faction — where revolted cities flip.
    pub fn independents(&self) -> u32 {
        self.independents
    }

    /// Dense index of a `Loc` in `0..loc_count()`.
    pub fn loc_index(&self, loc: crate::state::Loc) -> usize {
        use crate::state::Loc;
        match loc {
            Loc::Node(n) => n as usize,
            Loc::Edge { edge, tile } => {
                self.nodes.len() + self.tile_base[edge as usize] as usize + tile as usize
            }
        }
    }

    /// World position of a tile midpoint (for rendering and battle siting).
    pub fn tile_pos(&self, edge: EdgeId, tile: u16) -> [f32; 2] {
        let e = &self.edges[edge as usize];
        let total = *e.cum.last().unwrap();
        let d = total * (tile as f32 + 0.5) / e.tiles.len() as f32;
        let i = e
            .cum
            .partition_point(|&c| c < d)
            .max(1)
            .min(e.via.len() - 1);
        let (c0, c1) = (e.cum[i - 1], e.cum[i]);
        let t = if c1 > c0 { (d - c0) / (c1 - c0) } else { 0.0 };
        let (p0, p1) = (e.via[i - 1], e.via[i]);
        [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]
    }
}
