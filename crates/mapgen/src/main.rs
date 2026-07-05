//! Offline campaign-map pipeline: ORBIS + Natural Earth + overrides.json →
//! web/public/data/campaign-map.json (+ campaign-bg.png/.json). One command,
//! run from the repo root:
//!   cargo run -p mapgen --release
//! It writes the raw map, runs the post-steps in order — leagues.mjs (fold
//! leftover independents into neutral leagues), prune-cities.mjs (drop towns too
//! close to render cleanly), dequalify-names.mjs (normalize display names), then
//! Rust descope/landroute cleanup — so the committed map is always the finished
//! one and a re-bake can't silently skip a step. Needs `node` on PATH. Source
//! data: crates/mapgen/data/fetch.sh

mod build;
mod connectivity;
mod geo;
mod landroute;
mod probe;
mod raster;
mod sources;

use geo::BBox;

fn main() {
    if std::env::args().nth(1).as_deref() == Some("probe") {
        probe::write_committed_probe();
        return;
    }
    if std::env::args().nth(1).as_deref() == Some("connectivity-report") {
        connectivity::print_report();
        return;
    }

    let dir = "crates/mapgen/data";
    let out_dir = "web/public/data";
    std::fs::create_dir_all(out_dir).unwrap();

    let mut sites = sources::load_sites(&format!("{dir}/orbis_sites.csv"));
    let mut routes = sources::load_routes(&format!("{dir}/orbis_routes.geojson"), &sites);
    let land = sources::load_polys(&format!("{dir}/ne_50m_land.geojson"), None);
    let lakes = sources::load_polys(&format!("{dir}/ne_50m_lakes.geojson"), None);
    let mountains = sources::load_polys(
        &format!("{dir}/ne_50m_geography_regions_polys.geojson"),
        Some("Range/mtn"),
    );
    let rivers = sources::load_lines(&format!("{dir}/ne_50m_rivers_lake_centerlines.geojson"));
    let overrides: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string("crates/mapgen/overrides.json").unwrap())
            .unwrap();

    // Merge hand-authored geography absent from ORBIS (Rhegium + the Sicily sea
    // lane / mainland road) before the graph is built.
    sources::apply_extra_geography(&mut sites, &mut routes, &overrides);

    eprintln!(
        "sources: {} sites, {} routes, {} land polys, {} mountain polys, {} river lines",
        sites.len(),
        routes.len(),
        land.len(),
        mountains.len(),
        rivers.len()
    );

    let bb = BBox::of(sites.values().map(|s| s.pos)).pad(150.0);

    let mut r = raster::paint(bb, 0.5, &land, &lakes, &mountains, &rivers);
    // Carve straits the 50m coastline (and the 8 km frontend grid) can't resolve
    // — the channel reads as water through the one land-truth owner.
    r.carve_straits(raster::STRAIT_CARVES);

    let map = build::build(build::BuildInput {
        sites,
        routes,
        mountains: mountains
            .iter()
            .map(|p| sources::Poly {
                rings: p.rings.clone(),
                bbox: p.bbox,
            })
            .collect(),
        rivers: rivers.clone(),
        overrides,
        land_raster: &r,
    });

    let cities = map.nodes.iter().filter(|n| n.kind == "city").count();
    let road_edges = map.edges.iter().filter(|e| e.kind == "road").count();
    let tiles: usize = map.edges.iter().map(|e| e.tiles.len()).sum();
    let bridges: usize = map
        .edges
        .iter()
        .flat_map(|e| &e.tiles)
        .filter(|t| **t == "bridge")
        .count();
    let passes: usize = map
        .edges
        .iter()
        .flat_map(|e| &e.tiles)
        .filter(|t| **t == "pass")
        .count();
    eprintln!(
        "map: {} nodes ({} cities), {} edges ({} road), {} tiles ({} bridge, {} pass), {} ambush spots",
        map.nodes.len(),
        cities,
        map.edges.len(),
        road_edges,
        tiles,
        bridges,
        passes,
        map.ambush_spots.len()
    );

    std::fs::write(
        format!("{out_dir}/campaign-map.json"),
        serde_json::to_string(&map).unwrap(),
    )
    .unwrap();

    eprintln!("raster: {}x{} px", r.w, r.h);
    r.write_png(&format!("{out_dir}/campaign-bg.png"));

    // The renderer needs the raster's world rectangle to drape it correctly.
    std::fs::write(
        format!("{out_dir}/campaign-bg.json"),
        serde_json::json!({ "min": bb.min, "max": bb.max }).to_string(),
    )
    .unwrap();
    eprintln!("wrote {out_dir}/campaign-map.json, campaign-bg.png, campaign-bg.json");

    // Finish the map in order: fold the leftover independent cities into regional
    // neutral leagues (no ownerless grey on the political map), thin out towns
    // that sit too close for their 3D models to read, then normalize names over
    // that final city set. Run here so `cargo run -p mapgen` always emits the
    // finished, committed map.
    post_step("crates/mapgen/leagues.mjs");
    post_step("crates/mapgen/prune-cities.mjs");
    post_step("crates/mapgen/dequalify-names.mjs");
    // Descope sea routes, then reconnect every same-landmass city that can
    // honestly chain back to the main component under the measured cap.
    connectivity::descope_and_reconnect(out_dir, &r, &rivers, &mountains, bb);
    post_step("crates/mapgen/claim-reconnected.mjs");

    landroute::make_committed_roads_land_safe(out_dir, &r, &rivers, &mountains, bb);

    probe::write_committed_probe();
}

/// Run a Node post-processing step against the just-written map, streaming its
/// output; abort the bake if it fails so a broken step can't pass unnoticed.
fn post_step(script: &str) {
    eprintln!("post-step: node {script}");
    let status = std::process::Command::new("node")
        .arg(script)
        .status()
        .unwrap_or_else(|e| panic!("could not launch `node {script}` (is node on PATH?): {e}"));
    assert!(status.success(), "post-step `{script}` failed");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geo::dist;
    use serde::Deserialize;
    use std::collections::{BTreeMap, BTreeSet};

    #[derive(Deserialize)]
    struct BgRect {
        min: [f64; 2],
        max: [f64; 2],
    }

    #[derive(Deserialize)]
    struct MapFixture {
        nodes: Vec<NodeFixture>,
        edges: Vec<EdgeFixture>,
        factions: Vec<FactionFixture>,
    }

    #[derive(Deserialize)]
    struct NodeFixture {
        id: u32,
        name: String,
        pos: [f64; 2],
        kind: String,
    }

    #[derive(Deserialize)]
    struct EdgeFixture {
        a: u32,
        b: u32,
        kind: String,
        via: Vec<[f64; 2]>,
    }

    #[derive(Deserialize)]
    struct FactionFixture {
        name: String,
    }

    #[test]
    fn baked_campaign_map_satisfies_mapgen_invariants() {
        let data_dir = format!("{}/../../web/public/data", env!("CARGO_MANIFEST_DIR"));
        let map_text = std::fs::read_to_string(format!("{data_dir}/campaign-map.json")).unwrap();
        let map_value: serde_json::Value = serde_json::from_str(&map_text).unwrap();
        let map: MapFixture = serde_json::from_str(&map_text).unwrap();
        let bg: BgRect = serde_json::from_str(
            &std::fs::read_to_string(format!("{data_dir}/campaign-bg.json")).unwrap(),
        )
        .unwrap();
        let (bg_w, bg_h, bg_px) = read_png(&format!("{data_dir}/campaign-bg.png"));
        let committed_raster = raster::Raster::from_rgba(
            BBox {
                min: bg.min,
                max: bg.max,
            },
            bg_w,
            bg_h,
            bg_px.clone(),
        );

        let mut city_display_names = BTreeSet::new();
        let mut duplicate_city_display_names = Vec::new();
        for city in map.nodes.iter().filter(|n| n.kind == "city") {
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
        for faction in &map.factions {
            assert!(
                !faction.name.contains('(') && !faction.name.contains(')'),
                "faction display name still has parentheses: {}",
                faction.name
            );
        }

        let nodes: BTreeMap<u32, &NodeFixture> = map.nodes.iter().map(|n| (n.id, n)).collect();
        let mut road_degree: BTreeMap<u32, usize> = BTreeMap::new();
        let mut sea_degree: BTreeMap<u32, usize> = BTreeMap::new();
        let mut total_degree: BTreeMap<u32, usize> = BTreeMap::new();
        let mut sea_edges = 0usize;

        for edge in &map.edges {
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

        let mut water_cities = Vec::new();
        let mut margin_water_cities = Vec::new();
        let city_snap_exemptions: std::collections::BTreeSet<&str> =
            build::CITY_SNAP_EXEMPTIONS.iter().map(|e| e.name).collect();
        let mut seen_exemptions = std::collections::BTreeSet::new();
        let mut stub_junctions = Vec::new();
        let mut dead_junctions = Vec::new();
        for n in &map.nodes {
            if n.kind == "city" {
                if !land_at(n.pos, &bg, bg_w, bg_h, &bg_px) {
                    water_cities.push(n.name.as_str());
                }
                let exempt = city_snap_exemptions.contains(n.name.as_str());
                if exempt {
                    seen_exemptions.insert(n.name.as_str());
                } else if !land_neighborhood_at(
                    n.pos,
                    &bg,
                    bg_w,
                    bg_h,
                    &bg_px,
                    build::CITY_SNAP_MARGIN_CELLS,
                ) {
                    margin_water_cities.push(n.name.as_str());
                }
            } else if n.kind == "junction" {
                let rd = road_degree.get(&n.id).copied().unwrap_or(0);
                let sd = sea_degree.get(&n.id).copied().unwrap_or(0);
                if rd <= 1 && sd == 0 {
                    stub_junctions.push(n.id);
                }
                if total_degree.get(&n.id).copied().unwrap_or(0) == 0 {
                    dead_junctions.push(n.id);
                }
                assert!(
                    total_degree.get(&n.id).copied().unwrap_or(0) > 0,
                    "junction {} has no edges",
                    n.id
                );
            }
        }

        assert_eq!(
            sea_edges, 4,
            "sea routes are descoped: exactly the Gibraltar + Sicilian-channel + Hellespont + Messina lanes remain"
        );
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
            stub_junctions.is_empty(),
            "road stub junctions: {stub_junctions:?}"
        );
        assert!(
            dead_junctions.is_empty(),
            "degree-0 junctions: {dead_junctions:?}"
        );

        let mut road_nodes_on_water = Vec::new();
        for n in &map.nodes {
            let rd = road_degree.get(&n.id).copied().unwrap_or(0);
            if rd > 0 && !land_at(n.pos, &bg, bg_w, bg_h, &bg_px) {
                road_nodes_on_water.push(n.name.as_str());
            }
        }
        assert!(
            road_nodes_on_water.is_empty(),
            "road-bearing nodes on painted water: {road_nodes_on_water:?}"
        );

        let ids_by_name: BTreeMap<&str, u32> = map
            .nodes
            .iter()
            .map(|node| (node.name.as_str(), node.id))
            .collect();
        let capital_ids: Vec<u32> = map_value
            .get("factions")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
            .filter(|f| {
                f.get("playable")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false)
            })
            .filter_map(|f| f.get("capital").and_then(serde_json::Value::as_str))
            .filter_map(|name| ids_by_name.get(name).copied())
            .collect();
        let leftover = connectivity::reconnect_plan(
            &map_value,
            &committed_raster,
            &capital_ids,
            connectivity::RECONNECT_MAX_GAP_KM,
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

        // Query the committed bg through the SAME owners the bake used: the
        // raster classifier plus landroute's raw/smoothed run measures.
        let ferry_pairs: std::collections::BTreeSet<(&str, &str)> = landroute::ROAD_FERRY_CROSSINGS
            .iter()
            .map(|&(a, b)| landroute::ordered_pair(a, b))
            .collect();
        let mut ferry_pairs_seen = std::collections::BTreeSet::new();
        let mut road_water_violations = Vec::new();
        for edge in &map.edges {
            if edge.kind != "road" {
                continue;
            }
            let a = nodes[&edge.a].name.as_str();
            let b = nodes[&edge.b].name.as_str();
            let pair = landroute::ordered_pair(a, b);
            let raw = landroute::longest_water_run(&edge.via, &committed_raster);
            let smoothed =
                landroute::renderer_smoothed_longest_water_run(&edge.via, &committed_raster);
            if raw > landroute::ROAD_WATER_RUN_MAX_KM
                || smoothed > landroute::ROAD_SMOOTHED_BRIDGE_KM
            {
                if ferry_pairs.contains(&pair) {
                    ferry_pairs_seen.insert(pair);
                } else {
                    road_water_violations
                        .push(format!("{a}--{b} raw {raw:.1}km smoothed {smoothed:.1}km"));
                }
            }
        }
        assert!(
            road_water_violations.is_empty(),
            "road edges with unledgered painted-water runs > {:.1}km: {road_water_violations:?}",
            landroute::ROAD_WATER_RUN_MAX_KM
        );
        assert_eq!(
            ferry_pairs_seen, ferry_pairs,
            "ROAD_FERRY_CROSSINGS entries must name existing road edges that still cross painted water"
        );
    }

    fn cell_of(p: [f64; 2], bg: &BgRect, w: usize, h: usize) -> Option<[usize; 2]> {
        let x = ((p[0] - bg.min[0]) / (bg.max[0] - bg.min[0]) * w as f64).floor() as isize;
        let y = ((bg.max[1] - p[1]) / (bg.max[1] - bg.min[1]) * h as f64).floor() as isize;
        if x < 0 || y < 0 || x >= w as isize || y >= h as isize {
            return None;
        }
        Some([x as usize, y as usize])
    }

    fn land_at(p: [f64; 2], bg: &BgRect, w: usize, h: usize, px: &[u8]) -> bool {
        let Some([x, y]) = cell_of(p, bg, w, h) else {
            return false;
        };
        land_cell(x, y, w, px)
    }

    fn land_neighborhood_at(
        p: [f64; 2],
        bg: &BgRect,
        w: usize,
        h: usize,
        px: &[u8],
        margin_cells: usize,
    ) -> bool {
        let Some([cx, cy]) = cell_of(p, bg, w, h) else {
            return false;
        };
        let margin = margin_cells as isize;
        for dy in -margin..=margin {
            let y = cy as isize + dy;
            if y < 0 || y >= h as isize {
                return false;
            }
            for dx in -margin..=margin {
                let x = cx as isize + dx;
                if x < 0 || x >= w as isize {
                    return false;
                }
                if !land_cell(x as usize, y as usize, w, px) {
                    return false;
                }
            }
        }
        true
    }

    fn land_cell(x: usize, y: usize, w: usize, px: &[u8]) -> bool {
        let i = (y * w + x) * 4;
        raster::Raster::rgb_is_land([px[i], px[i + 1], px[i + 2]])
    }

    fn read_png(path: &str) -> (usize, usize, Vec<u8>) {
        probe::read_png(std::path::Path::new(path))
    }

    #[test]
    fn committed_mask_probe_matches_regenerated_probe() {
        let expected: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(probe::committed_probe_path()).unwrap())
                .unwrap();
        let actual = serde_json::to_value(probe::build_committed_probe()).unwrap();
        assert_eq!(actual, expected, "committed mask probe is stale");
    }
}
