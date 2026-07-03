//! Offline campaign-map pipeline: ORBIS + Natural Earth + overrides.json →
//! web/public/data/campaign-map.json (+ campaign-bg.png/.json). One command,
//! run from the repo root:
//!   cargo run -p mapgen --release
//! It writes the raw map, then runs the JS post-steps in order — leagues.mjs
//! (fold leftover independents into neutral leagues) then prune-cities.mjs
//! (drop towns too close to render cleanly) — so the committed map is always
//! the finished one and a re-bake can't silently skip a step. Needs `node` on
//! PATH. Source data: crates/mapgen/data/fetch.sh

mod build;
mod geo;
mod raster;
mod sources;

use geo::BBox;

fn main() {
    let dir = "crates/mapgen/data";
    let out_dir = "web/public/data";
    std::fs::create_dir_all(out_dir).unwrap();

    let sites = sources::load_sites(&format!("{dir}/orbis_sites.csv"));
    let routes = sources::load_routes(&format!("{dir}/orbis_routes.geojson"), &sites);
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

    eprintln!(
        "sources: {} sites, {} routes, {} land polys, {} mountain polys, {} river lines",
        sites.len(),
        routes.len(),
        land.len(),
        mountains.len(),
        rivers.len()
    );

    let bb = BBox::of(sites.values().map(|s| s.pos)).pad(150.0);

    let r = raster::paint(bb, 0.5, &land, &lakes, &mountains, &rivers);

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

    // Finish the map in JS, in order: fold the leftover independent cities into
    // regional neutral leagues (no ownerless grey on the political map), then
    // thin out towns that sit too close for their 3D models to read. Run here so
    // `cargo run -p mapgen` always emits the finished, committed map.
    post_step("crates/mapgen/leagues.mjs");
    post_step("crates/mapgen/prune-cities.mjs");
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
    use std::collections::BTreeMap;

    #[derive(Deserialize)]
    struct BgRect {
        min: [f64; 2],
        max: [f64; 2],
    }

    #[derive(Deserialize)]
    struct MapFixture {
        nodes: Vec<NodeFixture>,
        edges: Vec<EdgeFixture>,
    }

    #[derive(Deserialize)]
    struct NodeFixture {
        id: u32,
        name: String,
        pos: [f64; 2],
        kind: String,
        port: bool,
    }

    #[derive(Deserialize)]
    struct EdgeFixture {
        a: u32,
        b: u32,
        kind: String,
        via: Vec<[f64; 2]>,
    }

    #[test]
    fn baked_campaign_map_satisfies_mapgen_invariants() {
        let data_dir = format!("{}/../../web/public/data", env!("CARGO_MANIFEST_DIR"));
        let map: MapFixture = serde_json::from_str(
            &std::fs::read_to_string(format!("{data_dir}/campaign-map.json")).unwrap(),
        )
        .unwrap();
        let bg: BgRect = serde_json::from_str(
            &std::fs::read_to_string(format!("{data_dir}/campaign-bg.json")).unwrap(),
        )
        .unwrap();
        let (bg_w, bg_h, bg_px) = read_png(&format!("{data_dir}/campaign-bg.png"));

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
        let mut ports_without_sea = Vec::new();
        let mut stranded_cities = Vec::new();
        let mut stub_junctions = Vec::new();
        let mut dead_junctions = Vec::new();
        for n in &map.nodes {
            if n.kind == "city" {
                if !land_at(n.pos, &bg, bg_w, bg_h, &bg_px) {
                    water_cities.push(n.name.as_str());
                }
                if n.port && sea_degree.get(&n.id).copied().unwrap_or(0) == 0 {
                    ports_without_sea.push(n.name.as_str());
                }
                if total_degree.get(&n.id).copied().unwrap_or(0) == 0 {
                    stranded_cities.push(n.name.as_str());
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
            sea_edges, 468,
            "sea edge count changed from the pre-prune ORBIS lane set"
        );
        assert!(water_cities.is_empty(), "cities on water: {water_cities:?}");
        assert!(
            ports_without_sea.is_empty(),
            "port cities without sea edges: {ports_without_sea:?}"
        );
        assert!(
            stranded_cities.is_empty(),
            "cities with neither road nor sea connectivity: {stranded_cities:?}"
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

    fn land_at(p: [f64; 2], bg: &BgRect, w: usize, h: usize, px: &[u8]) -> bool {
        let x = ((p[0] - bg.min[0]) / (bg.max[0] - bg.min[0]) * w as f64).floor() as isize;
        let y = ((bg.max[1] - p[1]) / (bg.max[1] - bg.min[1]) * h as f64).floor() as isize;
        if x < 0 || y < 0 || x >= w as isize || y >= h as isize {
            return false;
        }
        let i = (y as usize * w + x as usize) * 4;
        raster::is_land_rgb([px[i], px[i + 1], px[i + 2]])
    }

    fn read_png(path: &str) -> (usize, usize, Vec<u8>) {
        let file = std::fs::File::open(path).unwrap();
        let decoder = png::Decoder::new(file);
        let mut reader = decoder.read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut buf).unwrap();
        assert_eq!(info.color_type, png::ColorType::Rgba);
        assert_eq!(info.bit_depth, png::BitDepth::Eight);
        (
            info.width as usize,
            info.height as usize,
            buf[..info.buffer_size()].to_vec(),
        )
    }
}
