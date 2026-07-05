use crate::geo::{dist, BBox};
use crate::probe;
use crate::raster;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[allow(dead_code)]
pub const KEEP_SEA_LANES: &[(&str, &str)] = &[
    ("Gades", "Tingi"),
    ("Constantinopolis", "Nicomedia"),
    ("Rhegium", "Messana"),
];

/// Max per-hop straight-line gap (km) for the same-landmass iterative reconnect
/// merge (slice 03). Measured from the S0 `connectivity-report`: mainland-coastal
/// + Sicily's first hop (Syracusae→Messana 131 km) all sit ≤133 km, the Black-Sea
/// / Caucasus / Crimea rim starts at 158 km — a clean gap at 133↔158. Because the
/// merge is ITERATIVE, interior-cluster cities (Sicily's Lilybaeum, Cape Tainaron)
/// chain in via short hops after the first bridge, so no per-landmass rule is
/// needed. NOTE: `is_reconnectable` below is the per-hop helper; slice 03 wraps it
/// in the iterative merge so the classification is the merge OUTCOME, not a static
/// per-city gap.
#[allow(dead_code)]
pub const RECONNECT_MAX_GAP_KM: f64 = 140.0;

const WATER_LABEL: u32 = u32::MAX;
const LAND_FALLBACK_RADIUS_CELLS: isize = 4;

pub fn landmass_labels(raster: &raster::Raster) -> Vec<u32> {
    let mut labels = vec![WATER_LABEL; raster.w * raster.h];
    let mut next_label = 0u32;
    let mut stack = Vec::new();

    for y in 0..raster.h {
        for x in 0..raster.w {
            let i = y * raster.w + x;
            if labels[i] != WATER_LABEL || !raster.is_land_cell(x, y) {
                continue;
            }

            labels[i] = next_label;
            stack.push((x, y));
            while let Some((cx, cy)) = stack.pop() {
                for dy in -1isize..=1 {
                    for dx in -1isize..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let nx = cx as isize + dx;
                        let ny = cy as isize + dy;
                        if nx < 0 || ny < 0 || nx >= raster.w as isize || ny >= raster.h as isize {
                            continue;
                        }
                        let ni = ny as usize * raster.w + nx as usize;
                        if labels[ni] == WATER_LABEL
                            && raster.is_land_cell(nx as usize, ny as usize)
                        {
                            labels[ni] = next_label;
                            stack.push((nx as usize, ny as usize));
                        }
                    }
                }
            }

            next_label += 1;
        }
    }

    labels
}

pub fn main_component(map: &Value, capital_ids: &[u32]) -> BTreeSet<u32> {
    let mut adj: BTreeMap<u32, BTreeSet<u32>> = BTreeMap::new();
    if let Some(edges) = map.get("edges").and_then(Value::as_array) {
        for edge in edges {
            let Some(a) = edge.get("a").and_then(Value::as_u64).map(|id| id as u32) else {
                continue;
            };
            let Some(b) = edge.get("b").and_then(Value::as_u64).map(|id| id as u32) else {
                continue;
            };
            adj.entry(a).or_default().insert(b);
            adj.entry(b).or_default().insert(a);
        }
    }

    let mut seen = BTreeSet::new();
    let mut q = VecDeque::new();
    let mut seeds = capital_ids.to_vec();
    seeds.sort_unstable();
    seeds.dedup();
    for id in seeds {
        if seen.insert(id) {
            q.push_back(id);
        }
    }
    while let Some(id) = q.pop_front() {
        if let Some(next) = adj.get(&id) {
            for &n in next {
                if seen.insert(n) {
                    q.push_back(n);
                }
            }
        }
    }
    seen
}

pub fn nearest_main_node_on_landmass(
    city_pos: [f64; 2],
    main_nodes: &[(u32, [f64; 2])],
    labels: &[u32],
    raster: &raster::Raster,
) -> Option<(u32, f64)> {
    let city_label = label_at_pos(city_pos, labels, raster)?;
    main_nodes
        .iter()
        .filter_map(|&(id, pos)| {
            let label = label_at_pos(pos, labels, raster)?;
            (label == city_label).then_some((id, dist(city_pos, pos)))
        })
        .min_by(|a, b| a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0)))
}

#[allow(dead_code)]
pub fn is_reconnectable(
    city_pos: [f64; 2],
    in_main: bool,
    main_nodes: &[(u32, [f64; 2])],
    labels: &[u32],
    raster: &raster::Raster,
    max_gap_km: f64,
) -> bool {
    !in_main
        && nearest_main_node_on_landmass(city_pos, main_nodes, labels, raster)
            .map_or(false, |(_, gap)| gap <= max_gap_km)
}

pub fn print_report() {
    let data_dir = "web/public/data";
    let map: Value = serde_json::from_str(
        &std::fs::read_to_string(format!("{data_dir}/campaign-map.json")).unwrap(),
    )
    .unwrap();
    let bg: BgRect = serde_json::from_str(
        &std::fs::read_to_string(format!("{data_dir}/campaign-bg.json")).unwrap(),
    )
    .unwrap();
    let (bg_w, bg_h, bg_px) =
        probe::read_png(std::path::Path::new(&format!("{data_dir}/campaign-bg.png")));
    let raster = raster::Raster::from_rgba(
        BBox {
            min: bg.min,
            max: bg.max,
        },
        bg_w,
        bg_h,
        bg_px,
    );

    let nodes = parse_nodes(&map);
    let ids_by_name: BTreeMap<&str, u32> = nodes
        .values()
        .map(|node| (node.name.as_str(), node.id))
        .collect();
    let capital_ids: Vec<u32> = map
        .get("factions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|f| f.get("playable").and_then(Value::as_bool).unwrap_or(false))
        .filter_map(|f| f.get("capital").and_then(Value::as_str))
        .filter_map(|name| ids_by_name.get(name).copied())
        .collect();

    let main = main_component(&map, &capital_ids);
    let labels = landmass_labels(&raster);
    let city_count = nodes.values().filter(|n| n.kind == "city").count();
    let main_city_count = nodes
        .values()
        .filter(|n| n.kind == "city" && main.contains(&n.id))
        .count();
    let main_nodes: Vec<(u32, [f64; 2])> = nodes
        .values()
        .filter(|n| main.contains(&n.id))
        .map(|n| (n.id, n.pos))
        .collect();
    let off_main_component_sizes = off_main_city_component_sizes(&map, &nodes, &main);

    println!("total cities: {city_count}");
    println!("main component cities: {main_city_count}");
    println!("off-main component city sizes: {off_main_component_sizes:?}");
    println!(
        "playable capitals in main component: {}/{}",
        capital_ids.iter().filter(|id| main.contains(id)).count(),
        capital_ids.len()
    );

    let mut rows: Vec<ReportRow> = nodes
        .values()
        .filter(|node| node.kind == "city" && !main.contains(&node.id))
        .map(|node| {
            let nearest = nearest_main_node_on_landmass(node.pos, &main_nodes, &labels, &raster);
            let nearest_name = nearest.and_then(|(id, _)| nodes.get(&id).map(|n| n.name.clone()));
            ReportRow {
                name: node.name.clone(),
                landmass: label_at_pos(node.pos, &labels, &raster),
                nearest_name,
                gap_km: nearest.map(|(_, gap)| gap),
            }
        })
        .collect();
    rows.sort_by(|a, b| match (a.gap_km, b.gap_km) {
        (Some(ag), Some(bg)) => ag.total_cmp(&bg).then_with(|| a.name.cmp(&b.name)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.name.cmp(&b.name),
    });

    for row in rows {
        let landmass = row
            .landmass
            .map_or_else(|| "NONE".to_string(), |label| label.to_string());
        let nearest = row.nearest_name.unwrap_or_else(|| "NONE".to_string());
        let gap = row
            .gap_km
            .map_or_else(|| "—".to_string(), |gap| format!("{gap:.2}"));
        println!(
            "{} | landmass={} | nearest_main={} | gap_km={}",
            row.name, landmass, nearest, gap
        );
    }
}

#[derive(Deserialize)]
struct BgRect {
    min: [f64; 2],
    max: [f64; 2],
}

#[derive(Clone)]
struct Node {
    id: u32,
    name: String,
    kind: String,
    pos: [f64; 2],
}

struct ReportRow {
    name: String,
    landmass: Option<u32>,
    nearest_name: Option<String>,
    gap_km: Option<f64>,
}

fn parse_nodes(map: &Value) -> BTreeMap<u32, Node> {
    map.get("nodes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|node| {
            let id = node.get("id").and_then(Value::as_u64)? as u32;
            Some((
                id,
                Node {
                    id,
                    name: node.get("name").and_then(Value::as_str)?.to_string(),
                    kind: node.get("kind").and_then(Value::as_str)?.to_string(),
                    pos: pos_value(node.get("pos")?)?,
                },
            ))
        })
        .collect()
}

fn pos_value(v: &Value) -> Option<[f64; 2]> {
    let arr = v.as_array()?;
    Some([arr.first()?.as_f64()?, arr.get(1)?.as_f64()?])
}

fn off_main_city_component_sizes(
    map: &Value,
    nodes: &BTreeMap<u32, Node>,
    main: &BTreeSet<u32>,
) -> Vec<usize> {
    let mut adj: BTreeMap<u32, BTreeSet<u32>> = BTreeMap::new();
    if let Some(edges) = map.get("edges").and_then(Value::as_array) {
        for edge in edges {
            let Some(a) = edge.get("a").and_then(Value::as_u64).map(|id| id as u32) else {
                continue;
            };
            let Some(b) = edge.get("b").and_then(Value::as_u64).map(|id| id as u32) else {
                continue;
            };
            if main.contains(&a) || main.contains(&b) {
                continue;
            }
            adj.entry(a).or_default().insert(b);
            adj.entry(b).or_default().insert(a);
        }
    }

    let mut seen = BTreeSet::new();
    let mut sizes = Vec::new();
    for &id in nodes.keys() {
        if main.contains(&id) || !seen.insert(id) {
            continue;
        }
        let mut city_count = 0usize;
        let mut q = VecDeque::from([id]);
        while let Some(cur) = q.pop_front() {
            if nodes.get(&cur).is_some_and(|n| n.kind == "city") {
                city_count += 1;
            }
            if let Some(next) = adj.get(&cur) {
                for &n in next {
                    if seen.insert(n) {
                        q.push_back(n);
                    }
                }
            }
        }
        if city_count > 0 {
            sizes.push(city_count);
        }
    }
    sizes.sort_unstable_by(|a, b| b.cmp(a));
    sizes
}

fn label_at_pos(pos: [f64; 2], labels: &[u32], raster: &raster::Raster) -> Option<u32> {
    debug_assert_eq!(labels.len(), raster.w * raster.h);
    for (x, y) in nearby_cells(pos, raster, LAND_FALLBACK_RADIUS_CELLS) {
        let label = labels[y * raster.w + x];
        if label != WATER_LABEL {
            return Some(label);
        }
    }
    None
}

fn nearby_cells(
    pos: [f64; 2],
    raster: &raster::Raster,
    radius_cells: isize,
) -> Vec<(usize, usize)> {
    let [fx, fy] = fractional_cell(pos, raster);
    let cx = fx.floor() as isize;
    let cy = fy.floor() as isize;
    let mut cells = Vec::new();
    for dy in -radius_cells..=radius_cells {
        for dx in -radius_cells..=radius_cells {
            let x = cx + dx;
            let y = cy + dy;
            if x < 0 || y < 0 || x >= raster.w as isize || y >= raster.h as isize {
                continue;
            }
            let d2 = (fx - x as f64).powi(2) + (fy - y as f64).powi(2);
            cells.push((d2, x as usize, y as usize));
        }
    }
    cells.sort_by(|a, b| {
        a.0.total_cmp(&b.0)
            .then_with(|| a.2.cmp(&b.2))
            .then_with(|| a.1.cmp(&b.1))
    });
    cells.into_iter().map(|(_, x, y)| (x, y)).collect()
}

fn fractional_cell(pos: [f64; 2], raster: &raster::Raster) -> [f64; 2] {
    if let Some([x, y]) = raster.cell_of(pos) {
        return [x as f64, y as f64];
    }

    let c00 = raster.cell_center(0, 0);
    let cell_w = if raster.w > 1 {
        raster.cell_center(1, 0)[0] - c00[0]
    } else {
        1.0
    };
    let cell_h = if raster.h > 1 {
        c00[1] - raster.cell_center(0, 1)[1]
    } else {
        1.0
    };
    let min_x = c00[0] - cell_w / 2.0;
    let max_y = c00[1] + cell_h / 2.0;
    [(pos[0] - min_x) / cell_w, (max_y - pos[1]) / cell_h]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::raster::{Raster, RenderMaskClass};
    use serde_json::json;

    #[test]
    fn sea_edge_bridges_main_component_without_merging_landmasses() {
        let raster = test_raster(&[(1, 1, 3, 3), (5, 1, 7, 3), (9, 1, 10, 3)]);
        let labels = landmass_labels(&raster);
        let west = raster.cell_center(2, 2);
        let east = raster.cell_center(6, 2);
        let britain_a = raster.cell_center(9, 1);
        let britain_b = raster.cell_center(10, 2);
        let map = json!({
            "nodes": [
                {"id": 1, "name": "West", "kind": "city", "pos": west},
                {"id": 2, "name": "East", "kind": "city", "pos": east},
                {"id": 3, "name": "Britain A", "kind": "city", "pos": britain_a},
                {"id": 4, "name": "Britain B", "kind": "city", "pos": britain_b}
            ],
            "edges": [
                {"a": 1, "b": 2, "kind": "sea"},
                {"a": 3, "b": 4, "kind": "road"},
                {"a": 4, "b": 3, "kind": "road"}
            ]
        });

        let main = main_component(&map, &[1]);
        assert_eq!(main, BTreeSet::from([1, 2]));
        assert_eq!(label_at_pos(west, &labels, &raster), Some(0));
        assert_eq!(label_at_pos(east, &labels, &raster), Some(1));
        assert_eq!(label_at_pos(britain_a, &labels, &raster), Some(2));
        assert_eq!(label_at_pos(britain_b, &labels, &raster), Some(2));
        assert!(!main.contains(&3));
        assert!(!main.contains(&4));
        let main_nodes = vec![(1, west), (2, east)];
        assert!(!is_reconnectable(
            britain_a,
            main.contains(&3),
            &main_nodes,
            &labels,
            &raster,
            100.0
        ));
        assert!(!is_reconnectable(
            britain_b,
            main.contains(&4),
            &main_nodes,
            &labels,
            &raster,
            100.0
        ));
    }

    #[test]
    fn same_landmass_distance_cap_controls_reconnectability() {
        let raster = test_raster(&[(1, 1, 10, 3)]);
        let labels = landmass_labels(&raster);
        let main_pos = raster.cell_center(1, 2);
        let city_pos = raster.cell_center(8, 2);
        let gap = dist(main_pos, city_pos);
        let main_nodes = vec![(1, main_pos)];

        assert_eq!(
            nearest_main_node_on_landmass(city_pos, &main_nodes, &labels, &raster),
            Some((1, gap))
        );
        assert!(!is_reconnectable(
            city_pos,
            false,
            &main_nodes,
            &labels,
            &raster,
            gap - 0.01
        ));
        assert!(is_reconnectable(
            city_pos,
            false,
            &main_nodes,
            &labels,
            &raster,
            gap
        ));
        assert!(!is_reconnectable(
            city_pos,
            true,
            &main_nodes,
            &labels,
            &raster,
            gap
        ));
    }

    fn test_raster(rects: &[(usize, usize, usize, usize)]) -> Raster {
        let w = 12usize;
        let h = 6usize;
        let mut px = vec![0u8; w * h * 4];
        for i in 0..w * h {
            px[i * 4..i * 4 + 3].copy_from_slice(&RenderMaskClass::Sea.rgb());
            px[i * 4 + 3] = 255;
        }
        for &(x0, y0, x1, y1) in rects {
            for y in y0..=y1 {
                for x in x0..=x1 {
                    let i = (y * w + x) * 4;
                    px[i..i + 3].copy_from_slice(&RenderMaskClass::Land.rgb());
                }
            }
        }
        Raster::from_rgba(
            BBox {
                min: [0.0, 0.0],
                max: [12.0, 6.0],
            },
            w,
            h,
            px,
        )
    }
}
