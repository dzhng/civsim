use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Clone)]
pub(crate) struct MapNode {
    pub id: u32,
    pub name: String,
    pub kind: String,
    pub pos: [f64; 2],
}

pub fn load_committed_map<T: DeserializeOwned>(data_dir: impl AsRef<Path>) -> T {
    let path = data_dir.as_ref().join("campaign-map.json");
    serde_json::from_str(&std::fs::read_to_string(&path).expect("campaign-map.json"))
        .expect("campaign-map json")
}

pub(crate) fn nodes(map: &Value) -> BTreeMap<u32, MapNode> {
    map["nodes"]
        .as_array()
        .expect("nodes array")
        .iter()
        .map(|node| {
            let id = node["id"].as_u64().expect("node id") as u32;
            let pos = node["pos"].as_array().expect("node pos");
            (
                id,
                MapNode {
                    id,
                    name: node["name"].as_str().expect("node name").to_string(),
                    kind: node["kind"].as_str().expect("node kind").to_string(),
                    pos: [
                        pos[0].as_f64().expect("node x"),
                        pos[1].as_f64().expect("node y"),
                    ],
                },
            )
        })
        .collect()
}

pub(crate) fn road_degrees(map: &Value) -> BTreeMap<u32, usize> {
    let mut degree = BTreeMap::new();
    for edge in map["edges"].as_array().expect("edges array") {
        if edge["kind"].as_str() != Some("road") {
            continue;
        }
        *degree
            .entry(edge["a"].as_u64().expect("edge a") as u32)
            .or_default() += 1;
        *degree
            .entry(edge["b"].as_u64().expect("edge b") as u32)
            .or_default() += 1;
    }
    degree
}

pub(crate) fn point(v: &Value) -> [f64; 2] {
    let a = v.as_array().expect("point array");
    [
        a[0].as_f64().expect("point x"),
        a[1].as_f64().expect("point y"),
    ]
}

pub(crate) fn via(v: &Value) -> Vec<[f64; 2]> {
    v.as_array().expect("via array").iter().map(point).collect()
}

pub(crate) fn point_value(p: [f64; 2]) -> Value {
    serde_json::json!([p[0], p[1]])
}

pub(crate) fn via_value(via: &[[f64; 2]]) -> Value {
    Value::Array(via.iter().map(|&p| point_value(p)).collect())
}

pub fn ordered_pair<'a>(a: &'a str, b: &'a str) -> (&'a str, &'a str) {
    if a <= b {
        (a, b)
    } else {
        (b, a)
    }
}
