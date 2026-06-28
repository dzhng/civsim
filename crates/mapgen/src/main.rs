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

    let mut r = raster::paint(bb, 0.5, &land, &lakes, &mountains, &rivers);
    let mut graph_land_px = 0usize;
    for e in map.edges.iter().filter(|e| e.kind == "road") {
        for segment in e.via.windows(2) {
            graph_land_px += r.stamp_land_capsule(segment[0], segment[1], 32.0);
        }
    }
    let flooded_cities: Vec<([f64; 2], u8)> = map
        .nodes
        .iter()
        .filter(|n| n.kind == "city" && r.is_water_world(n.pos))
        .map(|n| (n.pos, n.tier))
        .collect();
    for (pos, tier) in flooded_cities {
        let radius = match tier {
            3..=u8::MAX => 42.0,
            2 => 34.0,
            _ => 28.0,
        };
        graph_land_px += r.stamp_land_disc(pos, radius);
    }
    eprintln!("raster graph-land repair: {graph_land_px} water pixels promoted to land");
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
