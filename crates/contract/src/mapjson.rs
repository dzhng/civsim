//! Serialized campaign-map contract shared by the offline baker and campaign loader.

use crate::UnitClassId;
use serde::{Deserialize, Serialize};

pub const TILE_KM: f64 = 5.0;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Map {
    pub half_w: f64,
    pub half_h: f64,
    #[serde(default)]
    pub attribution: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub ambush_spots: Vec<AmbushSpot>,
    pub factions: Vec<Faction>,
    pub start_armies: Vec<StartArmy>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Node {
    pub id: u32,
    pub name: String,
    pub pos: [f64; 2],
    #[serde(rename = "srcPos", default, skip_serializing_if = "Option::is_none")]
    pub src_pos: Option<[f64; 2]>,
    pub kind: String,
    pub tier: u8,
    pub port: bool,
    pub owner: String,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub reconnected: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Edge {
    pub a: u32,
    pub b: u32,
    pub kind: String,
    pub via: Vec<[f64; 2]>,
    pub tiles: Vec<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub reconnect: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct AmbushSpot {
    pub edge: usize,
    pub tile: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub side: Option<i8>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Faction {
    pub id: String,
    pub name: String,
    pub color: [u8; 3],
    pub playable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_persona: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rival: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capital: Option<NodeRef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cities: Vec<NodeRef>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(untagged)]
pub enum NodeRef {
    Id(u32),
    Name(String),
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct StartArmy {
    pub faction: String,
    pub at: String,
    pub roster: Vec<(UnitClassId, u32)>,
}

#[cfg(test)]
mod tests {
    use super::Map;

    #[test]
    fn committed_map_round_trips_through_the_wire_schema() {
        let json = include_str!("../../../web/public/data/campaign-map.json");
        let map: Map = serde_json::from_str(json).expect("committed campaign map");
        let encoded = serde_json::to_string(&map).expect("campaign map serialization");
        let decoded: Map = serde_json::from_str(&encoded).expect("campaign map round trip");
        assert_eq!(decoded, map);
    }
}
