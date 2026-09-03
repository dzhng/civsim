//! Offline campaign-map pipeline: ORBIS + Natural Earth + overrides.json →
//! web/public/data/campaign-map.json (+ campaign-bg.png/.json). One command,
//! run from the repo root:
//!   cargo run -p mapgen --release
//! It writes the raw map, runs the post-steps in order — leagues.mjs (fold
//! leftover independents into neutral leagues), prune-cities.mjs (drop towns too
//! close to render cleanly), dequalify-names.mjs (normalize display names), then
//! Rust descope/road cleanup — so the committed map is always the finished
//! one and a re-bake can't silently skip a step. Needs `node` on PATH. Source
//! data: crates/mapgen/data/fetch.sh

pub mod build;
pub mod debraid;
pub mod descope;
pub mod gazetteer;
pub mod geo;
pub mod graph;
pub mod landmass;
pub mod map_io;
pub mod probe;
pub mod raster;
pub mod reconnect;
pub mod road_measure;
pub mod sources;

#[cfg(test)]
mod committed_map_tests;
#[cfg(test)]
mod connectivity_tests;
#[cfg(test)]
mod landroute_tests;

use geo::BBox;

pub fn run() {
    if std::env::args().nth(1).as_deref() == Some("probe") {
        probe::write_committed_probe();
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
    r.carve_straits(gazetteer::STRAIT_CARVES);

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
        .filter(|t| t.as_str() == "bridge")
        .count();
    let passes: usize = map
        .edges
        .iter()
        .flat_map(|e| &e.tiles)
        .filter(|t| t.as_str() == "pass")
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
    reconnect::descope_and_reconnect(out_dir, &r, &rivers, &mountains, bb);
    post_step("crates/mapgen/claim-reconnected.mjs");

    road_measure::make_committed_roads_land_safe(out_dir, &r, &rivers, &mountains, bb);
    debraid::debraid_committed_roads(out_dir);

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
