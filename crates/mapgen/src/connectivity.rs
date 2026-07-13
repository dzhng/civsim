use crate::build;
use crate::geo::{dist, BBox};
use crate::landroute;
use crate::probe;
use crate::raster;
use crate::sources;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub const KEEP_SEA_LANES: &[(&str, &str)] = &[
    ("Gades", "Tingi"),
    ("Carthago", "Lilybaeum"),
    ("Constantinopolis", "Nicomedia"),
    ("Rhegium", "Messana"),
];

/// The connectivity contract (David, 2026-07-14): every city has a route back
/// to Rome EXCEPT the ones deliberately left off — island cities whose sea
/// lane was descoped away. These are the island cities (Britain plus the
/// Mediterranean islands without one of the four kept lanes).
pub const OFF_MAIN_ISLAND_CITIES: &[&str] = &[
    // Britain — no Channel lane.
    "Calleva",
    "Camulodunum",
    "Deva",
    "Durnonovaria",
    "Eburacum",
    "Glevum",
    "Isca",
    "Lindum",
    "Londinium",
    "Luguvalium",
    "Venta",
    "Venta Icenorum",
    "Verulamium",
    "Viroconium",
    // Mediterranean islands.
    "Aleria",
    "Amathous",
    "Caralis",
    "Chersonasos",
    "Chios",
    "Corcyra",
    "Ebusus",
    "Krane",
    "Lapethos",
    "Melita",
    "Meninge",
    "Mytilene",
    "Olbia",
    "Palma",
    "Paphos",
    "Rhodos",
    "Salamis",
    "Samos",
    "Thasos",
];

/// Hand-authored Black-Sea coast roads (David 2026-07-14): the rim cities are
/// mainland, so the routes-to-Rome contract covers them, but every hop sits
/// beyond RECONNECT_MAX_GAP_KM (first gap 158 km) and the measured reconnect
/// never reaches the rim. Two coastal chains anchor into the main component
/// (Salsovia up the west coast through Crimea; Trapezus along Colchis) and
/// meet at Gorgippia, with the Bosporan strait crossing ferry-ledgered
/// (ROAD_FERRY_CROSSINGS) like every other strait. Paths are A*-routed over
/// the committed land raster; the strait pair falls back to the straight
/// crossing the ferry ledger permits.
pub const BLACK_SEA_COAST_ROUTES: &[(&str, &str)] = &[
    ("Salsovia", "Tyras"),
    ("Tyras", "Olbia Borysthenes"),
    ("Olbia Borysthenes", "Kalos Limen"),
    ("Kalos Limen", "Chersonesos"),
    ("Chersonesos", "Theodosia"),
    ("Theodosia", "Pantikapaion"),
    ("Pantikapaion", "Gorgippia"),
    ("Gorgippia", "Tanais"),
    ("Trapezus", "Phasis"),
    ("Phasis", "Dioscurias"),
    ("Dioscurias", "Gorgippia"),
];

/// Materialize BLACK_SEA_COAST_ROUTES as road edges (idempotent: existing
/// pairs are skipped). Tiles/ambush spots classify through the same owner as
/// every other road; the standalone application passes an empty river grid
/// and no mountains (no source data), so those edges carry plain tiles until
/// the next full bake refines them.
pub fn connect_black_sea_rim(
    map: &mut Value,
    raster: &raster::Raster,
    river_grid: &crate::geo::SegGrid,
    mountains: &[sources::Poly],
) {
    let nodes = parse_nodes(map);
    let ids_by_name: BTreeMap<&str, u32> = nodes
        .values()
        .map(|node| (node.name.as_str(), node.id))
        .collect();
    let existing: BTreeSet<(u32, u32)> = map["edges"]
        .as_array()
        .expect("edges array")
        .iter()
        .map(|edge| {
            let a = edge["a"].as_u64().expect("edge a") as u32;
            let b = edge["b"].as_u64().expect("edge b") as u32;
            (a.min(b), a.max(b))
        })
        .collect();

    let mut added = Vec::new();
    for &(a_name, b_name) in BLACK_SEA_COAST_ROUTES {
        let a = *ids_by_name
            .get(a_name)
            .unwrap_or_else(|| panic!("Black-Sea route names missing city {a_name}"));
        let b = *ids_by_name
            .get(b_name)
            .unwrap_or_else(|| panic!("Black-Sea route names missing city {b_name}"));
        if existing.contains(&(a.min(b), a.max(b))) {
            continue;
        }
        let (pa, pb) = (nodes[&a].pos, nodes[&b].pos);
        let mut via = landroute::astar_land_path(raster, pa, pb, dist(pa, pb), 0)
            .unwrap_or_else(|| {
                assert!(
                    landroute::ferry_pair_allowed(landroute::ordered_pair(a_name, b_name)),
                    "no land path {a_name}--{b_name} and the pair is not ferry-ledgered"
                );
                vec![pa, pb]
            });
        // A* runs cell-center to cell-center; the edge contract is exact node
        // endpoints (via[0] == a.pos, via[last] == b.pos).
        via[0] = pa;
        *via.last_mut().expect("non-empty via") = pb;

        let eidx = map["edges"].as_array().expect("edges array").len();
        let (tiles, ambush) = build::classify_route_tiles(&via, "road", eidx, river_grid, mountains);
        map["edges"]
            .as_array_mut()
            .expect("edges array")
            .push(json!({ "a": a, "b": b, "kind": "road", "via": via, "tiles": tiles }));
        let ambush_spots = map["ambush_spots"]
            .as_array_mut()
            .expect("ambush_spots array");
        for spot in ambush {
            ambush_spots.push(serde_json::to_value(spot).expect("ambush spot json"));
        }
        added.push(format!("{a_name}--{b_name}"));
    }
    eprintln!(
        "black-sea-roads: added {} coastal roads{}",
        added.len(),
        if added.is_empty() {
            String::new()
        } else {
            format!(" -> {}", added.join("; "))
        }
    );
}

/// Standalone application of `connect_black_sea_rim` over the committed
/// artifacts (map json + bg raster) — no source data, so the river grid is
/// empty and no mountains classify; a full bake refines those tiles.
pub fn connect_black_sea_rim_committed(data_dir: &str) {
    let path = format!("{data_dir}/campaign-map.json");
    let mut map: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("campaign-map.json"))
            .expect("campaign-map json");
    let raster = probe::read_committed_raster(data_dir);
    let empty_river_grid = build::build_river_grid(raster.bbox(), &[]);
    connect_black_sea_rim(&mut map, &raster, &empty_river_grid, &[]);
    std::fs::write(&path, serde_json::to_string(&map).unwrap()).unwrap();
}

/// Max per-hop straight-line gap (km) for the same-landmass iterative reconnect
/// merge (slice 03). Measured from the S0 `connectivity-report`: mainland-coastal
/// + Sicily's first hop (Syracusae→Messana 131 km) all sit ≤133 km, the Black-Sea
/// / Caucasus / Crimea rim starts at 158 km — a clean gap at 133↔158. Because the
/// merge is ITERATIVE, interior-cluster cities (Sicily's Lilybaeum, Cape Tainaron)
/// chain in via short hops after the first bridge, so no per-landmass rule is
/// needed. The classification is the iterative merge OUTCOME, not a static
/// per-city gap.
pub const RECONNECT_MAX_GAP_KM: f64 = 140.0;

const WATER_LABEL: u32 = u32::MAX;
const LAND_FALLBACK_RADIUS_CELLS: isize = 4;

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
        .map(|&(a, b)| landroute::ordered_pair(a, b))
        .collect();
    let drop_road_keys: BTreeSet<(&str, &str)> =
        [landroute::ordered_pair("Constantinopolis", "Nicomedia")]
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
            let key = landroute::ordered_pair(a_name, b_name);

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
    loop {
        let mut degree: BTreeMap<u32, usize> = BTreeMap::new();
        for edge in map["edges"].as_array().expect("edges array") {
            let a = edge["a"].as_u64().expect("edge a") as u32;
            let b = edge["b"].as_u64().expect("edge b") as u32;
            *degree.entry(a).or_default() += 1;
            *degree.entry(b).or_default() += 1;
        }

        let drop: BTreeSet<u32> = map["nodes"]
            .as_array()
            .expect("nodes array")
            .iter()
            .filter(|node| node["kind"].as_str() == Some("junction"))
            .filter_map(|node| {
                let id = node["id"].as_u64()? as u32;
                (degree.get(&id).copied().unwrap_or(0) <= 1).then_some(id)
            })
            .collect();
        if drop.is_empty() {
            break;
        }

        map["nodes"]
            .as_array_mut()
            .expect("nodes array")
            .retain(|node| {
                let id = node["id"].as_u64().expect("node id") as u32;
                !drop.contains(&id)
            });
        map["edges"]
            .as_array_mut()
            .expect("edges array")
            .retain(|edge| {
                let a = edge["a"].as_u64().expect("edge a") as u32;
                let b = edge["b"].as_u64().expect("edge b") as u32;
                !drop.contains(&a) && !drop.contains(&b)
            });
    }
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

/// The partition of CITY node ids into connected components (roads + sea
/// lanes), optionally excluding one edge by index — the debraid safety
/// currency: a drop is legal only when the partition it leaves equals the
/// partition it found.
pub fn city_partition(map: &Value, skip_edge: Option<usize>) -> BTreeSet<BTreeSet<u32>> {
    let mut adj: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
    for (idx, edge) in map["edges"]
        .as_array()
        .expect("edges array")
        .iter()
        .enumerate()
    {
        if Some(idx) == skip_edge {
            continue;
        }
        let a = edge["a"].as_u64().expect("edge a") as u32;
        let b = edge["b"].as_u64().expect("edge b") as u32;
        adj.entry(a).or_default().push(b);
        adj.entry(b).or_default().push(a);
    }
    let cities: BTreeSet<u32> = map["nodes"]
        .as_array()
        .expect("nodes array")
        .iter()
        .filter(|node| node["kind"].as_str() == Some("city"))
        .map(|node| node["id"].as_u64().expect("node id") as u32)
        .collect();

    let mut seen: BTreeSet<u32> = BTreeSet::new();
    let mut partition = BTreeSet::new();
    for &start in &cities {
        if seen.contains(&start) {
            continue;
        }
        let mut component = BTreeSet::new();
        let mut q = VecDeque::from([start]);
        seen.insert(start);
        while let Some(id) = q.pop_front() {
            if cities.contains(&id) {
                component.insert(id);
            }
            for &next in adj.get(&id).into_iter().flatten() {
                if seen.insert(next) {
                    q.push_back(next);
                }
            }
        }
        partition.insert(component);
    }
    partition
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

pub fn reconnect_plan(
    map: &Value,
    raster: &raster::Raster,
    capital_ids: &[u32],
    max_gap_km: f64,
) -> Vec<(u32, u32, Vec<[f64; 2]>)> {
    let nodes = parse_nodes(map);
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
            let mut targets: Vec<(f64, u32, &Node)> = nodes
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
                    landroute::astar_land_path(raster, city_start, target_goal, gap, 0)
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
    let mut map: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("campaign-map.json"))
            .expect("campaign-map json");

    descope_sea_lanes(&mut map);

    let river_grid = build::build_river_grid(bb, rivers);
    connect_black_sea_rim(&mut map, raster, &river_grid, mountains);

    let nodes = parse_nodes(&map);
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

pub fn print_report() {
    let data_dir = "web/public/data";
    let map: Value = serde_json::from_str(
        &std::fs::read_to_string(format!("{data_dir}/campaign-map.json")).unwrap(),
    )
    .unwrap();
    let raster = probe::read_committed_raster(data_dir);

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
    let ledgered: BTreeSet<&str> = OFF_MAIN_ISLAND_CITIES.iter().copied().collect();
    let unledgered: Vec<&str> = nodes
        .values()
        .filter(|n| n.kind == "city" && !main.contains(&n.id) && !ledgered.contains(n.name.as_str()))
        .map(|n| n.name.as_str())
        .collect();
    println!("off-main cities not in the deliberate ledger: {unledgered:?}");

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

fn playable_capital_ids(map: &Value, nodes: &BTreeMap<u32, Node>) -> Vec<u32> {
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

fn snap_land(pos: [f64; 2], raster: &raster::Raster) -> Option<[f64; 2]> {
    if let Some([x, y]) = raster.cell_of(pos) {
        if raster.is_land_cell(x, y) {
            return Some(pos);
        }
    }
    raster
        .nearest_land_neighborhood_center(pos, 40.0, 0)
        .or_else(|| nearest_land_cell_center(pos, raster))
}

fn nearest_land_cell_center(pos: [f64; 2], raster: &raster::Raster) -> Option<[f64; 2]> {
    let radius = raster.w.max(raster.h) as isize;
    nearby_cells(pos, raster, radius)
        .into_iter()
        .find(|&(x, y)| raster.is_land_cell(x, y))
        .map(|(x, y)| raster.cell_center(x, y))
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
    fn descope_sea_lanes_remaps_ambush_spots_by_original_edge_index() {
        let mut map = json!({
            "nodes": [
                {"id": 1, "name": "Gades", "kind": "city", "pos": [0.0, 0.0]},
                {"id": 2, "name": "Tingi", "kind": "city", "pos": [1.0, 0.0]},
                {"id": 3, "name": "Dropped A", "kind": "city", "pos": [2.0, 0.0]},
                {"id": 4, "name": "Dropped B", "kind": "city", "pos": [3.0, 0.0]},
                {"id": 5, "name": "Constantinopolis", "kind": "city", "pos": [4.0, 0.0]},
                {"id": 6, "name": "Nicomedia", "kind": "city", "pos": [5.0, 0.0]}
            ],
            "edges": [
                {"a": 3, "b": 4, "kind": "sea", "via": []},
                {"a": 1, "b": 3, "kind": "road", "via": []},
                {"a": 1, "b": 2, "kind": "sea", "via": []},
                {"a": 5, "b": 6, "kind": "road", "via": []}
            ],
            "ambush_spots": [
                {"edge": 2, "tile": 7, "side": 1},
                {"edge": 0, "tile": 8, "side": -1},
                {"edge": 1, "tile": 9, "side": 1},
                {"edge": 3, "tile": 10, "side": -1}
            ]
        });

        descope_sea_lanes(&mut map);

        let edges = map["edges"].as_array().unwrap();
        assert_eq!(edges.len(), 2);
        assert_eq!(edges[0]["a"], json!(1));
        assert_eq!(edges[0]["b"], json!(3));
        assert_eq!(edges[0]["kind"], json!("road"));
        assert_eq!(edges[1]["a"], json!(1));
        assert_eq!(edges[1]["b"], json!(2));
        assert_eq!(edges[1]["kind"], json!("sea"));
        assert!(edges.iter().all(|edge| edge.get("_oi").is_none()));

        let ambush = map["ambush_spots"].as_array().unwrap();
        let remapped_edges: Vec<u64> = ambush
            .iter()
            .map(|spot| spot["edge"].as_u64().unwrap())
            .collect();
        assert_eq!(remapped_edges, vec![1, 0]);
        assert_eq!(ambush[0]["tile"], json!(7));
        assert_eq!(ambush[1]["tile"], json!(9));
    }

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
        assert!(reconnect_plan(&map, &raster, &[1], 100.0).is_empty());
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
        let map = json!({
            "nodes": [
                {"id": 1, "name": "Main", "kind": "city", "pos": main_pos},
                {"id": 2, "name": "Off", "kind": "city", "pos": city_pos}
            ],
            "edges": [],
            "factions": []
        });
        assert!(reconnect_plan(&map, &raster, &[1], gap - 0.01).is_empty());
        let plan = reconnect_plan(&map, &raster, &[1], gap);
        assert_eq!(plan.len(), 1);
        assert_eq!((plan[0].0, plan[0].1), (2, 1));
        assert_eq!(plan[0].2.first(), Some(&city_pos));
        assert_eq!(plan[0].2.last(), Some(&main_pos));

        let connected_map = json!({
            "nodes": [
                {"id": 1, "name": "Main", "kind": "city", "pos": main_pos},
                {"id": 2, "name": "Off", "kind": "city", "pos": city_pos}
            ],
            "edges": [{"a": 1, "b": 2, "kind": "road"}],
            "factions": []
        });
        assert!(reconnect_plan(&connected_map, &raster, &[1], gap).is_empty());
    }

    #[test]
    fn reconnect_plan_iteratively_chains_same_landmass_cities() {
        let raster = test_raster(&[(1, 1, 14, 3)]);
        let main = raster.cell_center(1, 2);
        let middle = raster.cell_center(5, 2);
        let far = raster.cell_center(9, 2);
        let too_far = raster.cell_center(14, 2);
        let map = json!({
            "nodes": [
                {"id": 1, "name": "Main", "kind": "city", "pos": main},
                {"id": 2, "name": "Middle", "kind": "city", "pos": middle},
                {"id": 3, "name": "Far", "kind": "city", "pos": far},
                {"id": 4, "name": "Too Far", "kind": "city", "pos": too_far}
            ],
            "edges": [],
            "factions": []
        });

        assert_eq!(dist(main, far), 8.0);
        let plan = reconnect_plan(&map, &raster, &[1], 4.5);
        let pairs: Vec<(u32, u32)> = plan
            .iter()
            .map(|(city_id, target_id, _)| (*city_id, *target_id))
            .collect();
        assert_eq!(pairs, vec![(2, 1), (3, 2)]);
    }

    #[test]
    fn reconnect_plan_uses_nearest_drawable_target_not_nearest_same_landmass_target() {
        let raster = test_raster_sized(100, 8, &[(5, 3, 95, 3), (5, 3, 5, 5), (5, 5, 95, 5)]);
        let near_undrawable = raster.cell_center(95, 3);
        let far_drawable = raster.cell_center(92, 5);
        let city = raster.cell_center(95, 5);
        let map = json!({
            "nodes": [
                {"id": 1, "name": "Near Across Gap", "kind": "city", "pos": near_undrawable},
                {"id": 2, "name": "Far Same Strip", "kind": "city", "pos": far_drawable},
                {"id": 3, "name": "Peninsula Tip", "kind": "city", "pos": city}
            ],
            "edges": [{"a": 1, "b": 2, "kind": "road"}],
            "factions": []
        });

        let labels = landmass_labels(&raster);
        assert_eq!(
            label_at_pos(city, &labels, &raster),
            label_at_pos(near_undrawable, &labels, &raster)
        );
        assert_eq!(
            label_at_pos(city, &labels, &raster),
            label_at_pos(far_drawable, &labels, &raster)
        );
        assert!(
            landroute::astar_land_path(
                &raster,
                snap_land(city, &raster).unwrap(),
                snap_land(near_undrawable, &raster).unwrap(),
                dist(city, near_undrawable),
                0,
            )
            .is_none(),
            "nearest same-label target should not be drawable across the water gap"
        );

        let plan = reconnect_plan(&map, &raster, &[1], 10.0);
        assert_eq!(plan.len(), 1);
        assert_eq!((plan[0].0, plan[0].1), (3, 2));
        assert_eq!(plan[0].2.first(), Some(&city));
        assert_eq!(plan[0].2.last(), Some(&far_drawable));
    }

    fn test_raster(rects: &[(usize, usize, usize, usize)]) -> Raster {
        test_raster_sized(16, 6, rects)
    }

    fn test_raster_sized(w: usize, h: usize, rects: &[(usize, usize, usize, usize)]) -> Raster {
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
                max: [w as f64, h as f64],
            },
            w,
            h,
            px,
        )
    }
}
