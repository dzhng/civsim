use crate::build;
use crate::descope::descope_sea_lanes;
use crate::gazetteer::connect_black_sea_rim;
use crate::geo::{dist, BBox};
use crate::landmass::{label_at_pos, landmass_labels, main_component, snap_land};
use crate::map_io::{self, MapNode};
use crate::raster;
use crate::road_measure;
use crate::sources;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub const RECONNECT_MAX_GAP_KM: f64 = 140.0;
pub fn reconnect_plan(
    map: &Value,
    raster: &raster::Raster,
    capital_ids: &[u32],
    max_gap_km: f64,
) -> Vec<(u32, u32, Vec<[f64; 2]>)> {
    let nodes = map_io::nodes(map);
    let labels = landmass_labels(raster);
    let node_labels: BTreeMap<u32, Option<u32>> = nodes
        .values()
        .map(|node| (node.id, label_at_pos(node.pos, &labels, raster)))
        .collect();
    let mut grown = main_component(map, capital_ids);
    let mut out = Vec::new();

    loop {
        let mut best: Option<(f64, u32, u32, Vec<[f64; 2]>)> = None;
        for city in nodes
            .values()
            .filter(|node| node.kind == "city" && !grown.contains(&node.id))
        {
            let Some(city_label) = node_labels.get(&city.id).copied().flatten() else {
                continue;
            };
            let Some(city_start) = snap_land(city.pos, raster) else {
                continue;
            };
            let mut targets: Vec<(f64, u32, &MapNode)> = nodes
                .values()
                .filter(|node| grown.contains(&node.id))
                .filter(|target| node_labels.get(&target.id).copied().flatten() == Some(city_label))
                .filter_map(|target| {
                    let gap = dist(city.pos, target.pos);
                    (gap <= max_gap_km).then_some((gap, target.id, target))
                })
                .collect();
            targets.sort_by(|a, b| a.0.total_cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

            let mut city_candidate = None;
            for (gap, target_id, target) in targets {
                let Some(target_goal) = snap_land(target.pos, raster) else {
                    continue;
                };
                let Some(interior) =
                    road_measure::astar_land_path(raster, city_start, target_goal, gap, 0)
                else {
                    continue;
                };
                let mut via = Vec::with_capacity(interior.len() + 2);
                via.push(city.pos);
                via.extend(interior);
                via.push(target.pos);
                city_candidate = Some((gap, city.id, target_id, via));
                break;
            }

            if let Some(candidate) = city_candidate {
                if best
                    .as_ref()
                    .map_or(true, |cur| reconnect_plan_order(&candidate, cur).is_lt())
                {
                    best = Some(candidate);
                }
            }
        }

        let Some((_, city_id, target_id, via)) = best else {
            break;
        };
        out.push((city_id, target_id, via));
        grown.insert(city_id);
    }

    out
}

pub fn descope_and_reconnect(
    out_dir: &str,
    raster: &raster::Raster,
    rivers: &[Vec<[f64; 2]>],
    mountains: &[sources::Poly],
    bb: BBox,
) {
    let path = format!("{out_dir}/campaign-map.json");
    let mut map = crate::map_io::load_committed_map(out_dir);

    descope_sea_lanes(&mut map);

    let river_grid = build::build_river_grid(bb, rivers);
    connect_black_sea_rim(&mut map, raster, &river_grid, mountains);

    let nodes = map_io::nodes(&map);
    let capital_ids = playable_capital_ids(&map, &nodes);
    let plan = reconnect_plan(&map, raster, &capital_ids, RECONNECT_MAX_GAP_KM);
    let reconnected_city_ids: BTreeSet<u32> = plan.iter().map(|(city_id, _, _)| *city_id).collect();

    for node in map["nodes"].as_array_mut().expect("nodes array") {
        let id = node["id"].as_u64().expect("node id") as u32;
        if reconnected_city_ids.contains(&id) {
            assert_eq!(
                node["kind"].as_str(),
                Some("city"),
                "reconnect plan city id {id} is not a city"
            );
            node["reconnected"] = json!(true);
        }
    }

    for (city_id, target_id, via) in &plan {
        let eidx = map["edges"].as_array().expect("edges array").len();
        let (tiles, ambush) =
            build::classify_route_tiles(via, "road", eidx, &river_grid, mountains);

        map["edges"]
            .as_array_mut()
            .expect("edges array")
            .push(json!({
                "a": city_id,
                "b": target_id,
                "kind": "road",
                "reconnect": true,
                "via": via,
                "tiles": tiles,
            }));
        let ambush_spots = map["ambush_spots"]
            .as_array_mut()
            .expect("ambush_spots array");
        for spot in ambush {
            ambush_spots.push(serde_json::to_value(spot).expect("ambush spot json"));
        }
    }

    let main = main_component(&map, &capital_ids);
    let mut islands: Vec<String> = nodes
        .values()
        .filter(|node| node.kind == "city" && !main.contains(&node.id))
        .map(|node| node.name.clone())
        .collect();
    islands.sort();
    eprintln!(
        "connectivity: reconnected {} cities; islands: {:?}",
        plan.len(),
        islands
    );

    std::fs::write(&path, serde_json::to_string(&map).unwrap()).unwrap();
}

fn playable_capital_ids(map: &Value, nodes: &BTreeMap<u32, crate::map_io::MapNode>) -> Vec<u32> {
    let ids_by_name: BTreeMap<&str, u32> = nodes
        .values()
        .map(|node| (node.name.as_str(), node.id))
        .collect();
    map.get("factions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|f| f.get("playable").and_then(Value::as_bool).unwrap_or(false))
        .filter_map(|f| f.get("capital").and_then(Value::as_str))
        .filter_map(|name| ids_by_name.get(name).copied())
        .collect()
}

fn reconnect_plan_order(
    a: &(f64, u32, u32, Vec<[f64; 2]>),
    b: &(f64, u32, u32, Vec<[f64; 2]>),
) -> std::cmp::Ordering {
    a.0.total_cmp(&b.0)
        .then_with(|| a.1.cmp(&b.1))
        .then_with(|| a.2.cmp(&b.2))
}
