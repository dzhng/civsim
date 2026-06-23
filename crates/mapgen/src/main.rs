//! Offline campaign-map pipeline: ORBIS + Natural Earth + overrides.json →
//! web/public/data/campaign-map.json + campaign-bg.png. Run from the repo root:
//!   cargo run -p mapgen --release
//! Source data: crates/mapgen/data/fetch.sh

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

    let r = raster::paint(bb, 0.5, &land, &lakes, &mountains, &rivers);
    eprintln!("raster: {}x{} px", r.w, r.h);
    r.write_png(&format!("{out_dir}/campaign-bg.png"));

    // The renderer needs the raster's world rectangle to drape it correctly.
    std::fs::write(
        format!("{out_dir}/campaign-bg.json"),
        serde_json::json!({ "min": bb.min, "max": bb.max }).to_string(),
    )
    .unwrap();
    eprintln!("wrote {out_dir}/campaign-map.json, campaign-bg.png, campaign-bg.json");
    // Post-step: group the leftover independent cities into regional neutral
    // leagues so the political map is all factions, no ownerless grey. Run:
    //   node crates/mapgen/leagues.mjs
    eprintln!("next: run `node crates/mapgen/leagues.mjs` to fold independents into leagues");
}
