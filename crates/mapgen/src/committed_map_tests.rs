use crate::geo::dist;
use crate::{build, debraid, gazetteer, landmass, probe, reconnect, road_measure};
use std::collections::{BTreeMap, BTreeSet};

struct CommittedMap {
    value: serde_json::Value,
    map: contract::mapjson::Map,
    raster: crate::raster::Raster,
}

fn committed_map() -> CommittedMap {
    let data_dir = format!("{}/../../web/public/data", env!("CARGO_MANIFEST_DIR"));
    let map_text = std::fs::read_to_string(format!("{data_dir}/campaign-map.json")).unwrap();
    CommittedMap {
        value: serde_json::from_str(&map_text).unwrap(),
        map: serde_json::from_str(&map_text).unwrap(),
        raster: probe::read_committed_raster(&data_dir),
    }
}

fn node_index(map: &contract::mapjson::Map) -> BTreeMap<u32, &contract::mapjson::Node> {
    map.nodes.iter().map(|node| (node.id, node)).collect()
}

fn road_degrees(map: &contract::mapjson::Map) -> BTreeMap<u32, usize> {
    let mut degrees = BTreeMap::new();
    for edge in map.edges.iter().filter(|edge| edge.kind == "road") {
        *degrees.entry(edge.a).or_default() += 1;
        *degrees.entry(edge.b).or_default() += 1;
    }
    degrees
}

fn playable_capital_ids(fixture: &CommittedMap) -> Vec<u32> {
    let ids_by_name: BTreeMap<&str, u32> = fixture
        .map
        .nodes
        .iter()
        .map(|node| (node.name.as_str(), node.id))
        .collect();
    fixture
        .value
        .get("factions")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter(|faction| {
            faction
                .get("playable")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false)
        })
        .filter_map(|faction| faction.get("capital").and_then(serde_json::Value::as_str))
        .filter_map(|name| ids_by_name.get(name).copied())
        .collect()
}

#[test]
fn display_names_are_unique_and_dequalified() {
    let fixture = committed_map();
    let mut city_display_names = BTreeSet::new();
    let mut duplicate_city_display_names = Vec::new();
    for city in fixture.map.nodes.iter().filter(|node| node.kind == "city") {
        assert!(
            !city.name.contains('(') && !city.name.contains(')'),
            "city display name still has parentheses: {}",
            city.name
        );
        if !city_display_names.insert(city.name.as_str()) {
            duplicate_city_display_names.push(city.name.as_str());
        }
    }
    assert!(
        duplicate_city_display_names.is_empty(),
        "duplicate city display names: {duplicate_city_display_names:?}"
    );
    for faction in &fixture.map.factions {
        assert!(
            !faction.name.contains('(') && !faction.name.contains(')'),
            "faction display name still has parentheses: {}",
            faction.name
        );
    }
}

#[test]
fn edges_reach_live_nodes_and_no_stub_junctions_survive() {
    let fixture = committed_map();
    let nodes = node_index(&fixture.map);
    let mut road_degree: BTreeMap<u32, usize> = BTreeMap::new();
    let mut sea_degree: BTreeMap<u32, usize> = BTreeMap::new();
    let mut total_degree: BTreeMap<u32, usize> = BTreeMap::new();
    let mut sea_edges = 0usize;

    for edge in &fixture.map.edges {
        let a = nodes
            .get(&edge.a)
            .unwrap_or_else(|| panic!("edge references missing node {}", edge.a));
        let b = nodes
            .get(&edge.b)
            .unwrap_or_else(|| panic!("edge references missing node {}", edge.b));
        assert!(
            !edge.via.is_empty(),
            "edge {}-{} has no via points",
            edge.a,
            edge.b
        );
        assert!(
            dist(edge.via[0], a.pos) < 1e-6,
            "edge {}-{} starts {:.3}km from {}",
            edge.a,
            edge.b,
            dist(edge.via[0], a.pos),
            a.name
        );
        let end = *edge.via.last().unwrap();
        assert!(
            dist(end, b.pos) < 1e-6,
            "edge {}-{} ends {:.3}km from {}",
            edge.a,
            edge.b,
            dist(end, b.pos),
            b.name
        );
        *total_degree.entry(edge.a).or_default() += 1;
        *total_degree.entry(edge.b).or_default() += 1;
        if edge.kind == "road" {
            *road_degree.entry(edge.a).or_default() += 1;
            *road_degree.entry(edge.b).or_default() += 1;
        } else if edge.kind == "sea" {
            sea_edges += 1;
            *sea_degree.entry(edge.a).or_default() += 1;
            *sea_degree.entry(edge.b).or_default() += 1;
        }
    }

    let mut stub_junctions = Vec::new();
    let mut dead_junctions = Vec::new();
    for node in fixture
        .map
        .nodes
        .iter()
        .filter(|node| node.kind == "junction")
    {
        let road = road_degree.get(&node.id).copied().unwrap_or(0);
        let sea = sea_degree.get(&node.id).copied().unwrap_or(0);
        if road <= 1 && sea == 0 {
            stub_junctions.push(node.id);
        }
        if total_degree.get(&node.id).copied().unwrap_or(0) == 0 {
            dead_junctions.push(node.id);
        }
    }

    assert_eq!(
        sea_edges,
        gazetteer::KEEP_SEA_LANES.len(),
        "sea routes are descoped: exactly the KEEP_SEA_LANES (Gibraltar, Sicilian channel, Hellespont, Messina, Bosporus) remain"
    );
    assert!(
        stub_junctions.is_empty(),
        "road stub junctions: {stub_junctions:?}"
    );
    assert!(
        dead_junctions.is_empty(),
        "degree-0 junctions: {dead_junctions:?}"
    );
}

#[test]
fn cities_and_road_nodes_stay_on_land() {
    let fixture = committed_map();
    let road_degree = road_degrees(&fixture.map);
    let city_snap_exemptions: BTreeSet<&str> = gazetteer::CITY_SNAP_EXEMPTIONS
        .iter()
        .map(|entry| entry.name)
        .collect();
    let mut seen_exemptions = BTreeSet::new();
    let mut water_cities = Vec::new();
    let mut margin_water_cities = Vec::new();
    let mut road_nodes_on_water = Vec::new();

    for node in &fixture.map.nodes {
        if node.kind == "city" {
            if !fixture.raster.is_land_at(node.pos) {
                water_cities.push(node.name.as_str());
            }
            if city_snap_exemptions.contains(node.name.as_str()) {
                seen_exemptions.insert(node.name.as_str());
            } else if !fixture.raster.cell_of(node.pos).is_some_and(|[x, y]| {
                fixture
                    .raster
                    .is_land_neighborhood(x, y, build::CITY_SNAP_MARGIN_CELLS)
            }) {
                margin_water_cities.push(node.name.as_str());
            }
        }
        if road_degree.get(&node.id).copied().unwrap_or(0) > 0
            && !fixture.raster.is_land_at(node.pos)
        {
            road_nodes_on_water.push(node.name.as_str());
        }
    }

    assert!(water_cities.is_empty(), "cities on water: {water_cities:?}");
    assert!(
        margin_water_cities.is_empty(),
        "non-exempt cities without a 3x3 all-land rendered-raster neighborhood: {margin_water_cities:?}"
    );
    assert_eq!(
        seen_exemptions, city_snap_exemptions,
        "city snap exemptions must name committed city nodes"
    );
    assert!(
        road_nodes_on_water.is_empty(),
        "road-bearing nodes on painted water: {road_nodes_on_water:?}"
    );
}

#[test]
fn reconnectable_mainland_cities_are_connected() {
    let fixture = committed_map();
    let nodes = node_index(&fixture.map);
    let leftover = reconnect::reconnect_plan(
        &fixture.value,
        &fixture.raster,
        &playable_capital_ids(&fixture),
        reconnect::RECONNECT_MAX_GAP_KM,
    );
    let mut leftover_names: Vec<&str> = leftover
        .iter()
        .filter_map(|(city_id, _, _)| nodes.get(city_id).map(|node| node.name.as_str()))
        .collect();
    leftover_names.sort_unstable();
    assert!(
        leftover_names.is_empty(),
        "reconnectable mainland cities left stranded: {leftover_names:?}"
    );
}

#[test]
fn road_water_crossings_are_ledgered() {
    let fixture = committed_map();
    let nodes = node_index(&fixture.map);
    let ferry_pairs: BTreeSet<(&str, &str)> = road_measure::ROAD_FERRY_CROSSINGS
        .iter()
        .map(|&(a, b)| crate::map_io::ordered_pair(a, b))
        .collect();
    let mut ferry_pairs_seen = BTreeSet::new();
    let mut ferry_ids_seen = BTreeSet::new();
    let mut road_water_violations = Vec::new();

    for edge in fixture.map.edges.iter().filter(|edge| edge.kind == "road") {
        let a = nodes[&edge.a].name.as_str();
        let b = nodes[&edge.b].name.as_str();
        let pair = crate::map_io::ordered_pair(a, b);
        let raw = road_measure::longest_water_run(&edge.via, &fixture.raster);
        let smoothed =
            road_measure::renderer_smoothed_longest_water_run(&edge.via, &fixture.raster);
        if raw > road_measure::ROAD_WATER_RUN_MAX_KM
            || smoothed > road_measure::ROAD_SMOOTHED_BRIDGE_KM
        {
            let ids = (edge.a.min(edge.b), edge.a.max(edge.b));
            if road_measure::ROAD_FERRY_EDGE_IDS.contains(&ids) {
                ferry_ids_seen.insert(ids);
            } else if ferry_pairs.contains(&pair) {
                ferry_pairs_seen.insert(pair);
            } else {
                road_water_violations.push(format!(
                    "{}({})--{}({}) raw {raw:.1}km smoothed {smoothed:.1}km",
                    a, edge.a, b, edge.b
                ));
            }
        }
    }

    assert!(
        road_water_violations.is_empty(),
        "road edges with unledgered painted-water runs > {:.1}km: {road_water_violations:?}",
        road_measure::ROAD_WATER_RUN_MAX_KM
    );
    assert_eq!(
        ferry_pairs_seen, ferry_pairs,
        "ROAD_FERRY_CROSSINGS entries must name existing road edges that still cross painted water"
    );
    assert_eq!(
        ferry_ids_seen,
        road_measure::ROAD_FERRY_EDGE_IDS.iter().copied().collect(),
        "ROAD_FERRY_EDGE_IDS entries must identify existing road edges that still cross painted water"
    );
}

#[test]
fn only_ledgered_braids_survive() {
    let fixture = committed_map();
    let nodes = node_index(&fixture.map);
    let ledgered = |pair: &debraid::BraidedPair| {
        let ends = |index: usize| {
            let edge = &fixture.map.edges[index];
            crate::map_io::ordered_pair(&nodes[&edge.a].name, &nodes[&edge.b].name)
        };
        debraid::BRAID_LEDGER.iter().any(|&(p, q)| {
            let (p, q) = (
                crate::map_io::ordered_pair(p.0, p.1),
                crate::map_io::ordered_pair(q.0, q.1),
            );
            (ends(pair.longer) == p && ends(pair.shorter) == q)
                || (ends(pair.longer) == q && ends(pair.shorter) == p)
        })
    };
    let braids: Vec<String> = debraid::braided_road_pairs(&fixture.value)
        .iter()
        .filter(|pair| !ledgered(pair))
        .map(|pair| {
            let edge_ends = |index: usize| {
                let edge = &fixture.map.edges[index];
                format!("{}--{}", nodes[&edge.a].name, nodes[&edge.b].name)
            };
            format!(
                "{} || {} ({:.0}km corridor)",
                edge_ends(pair.longer),
                edge_ends(pair.shorter),
                pair.overlap_km
            )
        })
        .collect();
    assert!(
        braids.is_empty(),
        "unledgered braided road corridors: {braids:?}"
    );
}

#[test]
fn only_ledgered_islands_stay_off_main() {
    let fixture = committed_map();
    let main = landmass::main_component(&fixture.value, &playable_capital_ids(&fixture));
    let expected_off_main: BTreeSet<&str> =
        gazetteer::OFF_MAIN_ISLAND_CITIES.iter().copied().collect();
    let off_main: BTreeSet<&str> = fixture
        .map
        .nodes
        .iter()
        .filter(|node| node.kind == "city" && !main.contains(&node.id))
        .map(|node| node.name.as_str())
        .collect();
    assert_eq!(
        off_main, expected_off_main,
        "cities without a route to Rome changed (left: actual, right: ledgered islands)"
    );
}

#[test]
fn committed_mask_probe_matches_regenerated_probe() {
    let expected: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(probe::committed_probe_path()).unwrap())
            .unwrap();
    let actual = serde_json::to_value(probe::build_committed_probe()).unwrap();
    assert_eq!(actual, expected, "committed mask probe is stale");
}
