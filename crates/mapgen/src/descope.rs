use crate::gazetteer::KEEP_SEA_LANES;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub fn descope_sea_lanes(map: &mut Value) {
    let id_to_name: BTreeMap<u32, String> = map["nodes"]
        .as_array()
        .expect("nodes array")
        .iter()
        .filter_map(|node| {
            Some((
                node["id"].as_u64()? as u32,
                node["name"].as_str()?.to_string(),
            ))
        })
        .collect();
    let keep_keys: BTreeSet<(&str, &str)> = KEEP_SEA_LANES
        .iter()
        .map(|&(a, b)| crate::map_io::ordered_pair(a, b))
        .collect();
    let drop_road_keys: BTreeSet<(&str, &str)> =
        [crate::map_io::ordered_pair("Constantinopolis", "Nicomedia")]
            .into_iter()
            .collect();

    tag_edge_original_indices(map);
    {
        let edges = map["edges"].as_array_mut().expect("edges array");
        let mut kept_sea = Vec::new();
        edges.retain(|edge| {
            let a = edge["a"].as_u64().expect("edge a") as u32;
            let b = edge["b"].as_u64().expect("edge b") as u32;
            let a_name = id_to_name
                .get(&a)
                .unwrap_or_else(|| panic!("edge references missing node {a}"));
            let b_name = id_to_name
                .get(&b)
                .unwrap_or_else(|| panic!("edge references missing node {b}"));
            let key = crate::map_io::ordered_pair(a_name, b_name);

            if edge["kind"].as_str() == Some("sea") {
                if keep_keys.contains(&key) {
                    kept_sea.push(format!("{a_name} <-> {b_name}"));
                    return true;
                }
                return false;
            }
            !drop_road_keys.contains(&key)
        });

        eprintln!(
            "descope-sea-lanes: kept {} sea lanes -> {}",
            kept_sea.len(),
            kept_sea.join("; ")
        );
    }

    prune_stub_junctions(map);
    remap_ambush_spots_by_original_index(map);

    eprintln!(
        "descope-sea-lanes: {} junctions, {} edges remain",
        map["nodes"]
            .as_array()
            .expect("nodes array")
            .iter()
            .filter(|node| node["kind"].as_str() == Some("junction"))
            .count(),
        map["edges"].as_array().expect("edges array").len()
    );
}

/// Stamp every edge with its current array index (`_oi`) so a later
/// `remap_ambush_spots_by_original_index` can survive edge removals.
pub fn tag_edge_original_indices(map: &mut Value) {
    let edges = map["edges"].as_array_mut().expect("edges array");
    for (i, edge) in edges.iter_mut().enumerate() {
        edge["_oi"] = json!(i);
    }
}

/// Cascade away junctions an edge removal left dangling: a junction at total
/// degree <= 1 is a dead end, so it goes, its last edge goes with it, and the
/// loop reruns until stable.
pub fn prune_stub_junctions(map: &mut Value) {
    let fixed_nodes: BTreeSet<u32> = map["nodes"]
        .as_array()
        .expect("nodes array")
        .iter()
        .filter(|node| node["kind"].as_str() != Some("junction"))
        .map(|node| node["id"].as_u64().expect("node id") as u32)
        .collect();
    let removed = crate::graph::stub_junctions(
        map["nodes"]
            .as_array()
            .expect("nodes array")
            .iter()
            .map(|node| node["id"].as_u64().expect("node id") as u32),
        &fixed_nodes,
        map["edges"]
            .as_array()
            .expect("edges array")
            .iter()
            .map(|edge| {
                (
                    edge["a"].as_u64().expect("edge a") as u32,
                    edge["b"].as_u64().expect("edge b") as u32,
                    false,
                )
            }),
    );
    map["nodes"]
        .as_array_mut()
        .expect("nodes array")
        .retain(|node| !removed.contains(&(node["id"].as_u64().expect("node id") as u32)));
    map["edges"]
        .as_array_mut()
        .expect("edges array")
        .retain(|edge| {
            let a = edge["a"].as_u64().expect("edge a") as u32;
            let b = edge["b"].as_u64().expect("edge b") as u32;
            !removed.contains(&a) && !removed.contains(&b)
        });
}

/// Rewrite ambush-spot edge indices against the surviving edge array (keyed by
/// the `_oi` tags `tag_edge_original_indices` stamped), dropping spots whose
/// edge is gone, then strip the tags.
pub fn remap_ambush_spots_by_original_index(map: &mut Value) {
    let mut old_to_new = BTreeMap::new();
    for (new_idx, edge) in map["edges"]
        .as_array()
        .expect("edges array")
        .iter()
        .enumerate()
    {
        let old_idx = edge["_oi"].as_u64().expect("edge original index") as usize;
        old_to_new.insert(old_idx, new_idx);
    }

    if map.get("ambush_spots").is_none() {
        map["ambush_spots"] = Value::Array(Vec::new());
    }
    map["ambush_spots"]
        .as_array_mut()
        .expect("ambush_spots array")
        .retain_mut(|spot| {
            let Some(old_idx) = spot["edge"].as_u64().map(|idx| idx as usize) else {
                return false;
            };
            let Some(new_idx) = old_to_new.get(&old_idx).copied() else {
                return false;
            };
            spot["edge"] = json!(new_idx);
            true
        });

    for edge in map["edges"].as_array_mut().expect("edges array") {
        edge.as_object_mut().expect("edge object").remove("_oi");
    }
}
