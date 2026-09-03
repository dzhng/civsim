//! Parsers for the source datasets: ORBIS (sites + routes) and Natural Earth layers.
//! GeoJSON is read with bare serde_json — we only need coordinates + a property or two.

use crate::geo::project;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub struct OrbisSite {
    pub id: u32,
    pub label: String,
    pub rank: u32,
    pub pos: [f64; 2], // projected km
}

#[derive(PartialEq, Clone, Copy)]
pub enum RouteKind {
    Road,
    River, // upstream/downstream — becomes a valley road
    Sea,   // coastal/overseas/ferry
}

pub struct OrbisRoute {
    pub a: u32, // normalized site ids
    pub b: u32,
    pub kind: RouteKind,
    pub pts: Vec<[f64; 2]>, // projected km
}

pub fn load_sites(path: &str) -> BTreeMap<u32, OrbisSite> {
    let mut out = BTreeMap::new();
    let mut rdr = csv::Reader::from_path(path).expect("sites csv");
    for rec in rdr.records() {
        let r = rec.unwrap();
        let id: u32 = r[0].parse().unwrap();
        let lon: f64 = r[3].parse().unwrap();
        let lat: f64 = r[4].parse().unwrap();
        out.insert(
            id,
            OrbisSite {
                id,
                label: r[1].to_string(),
                rank: r[2].parse().unwrap_or(0),
                pos: project(lon, lat),
            },
        );
    }
    out
}

/// ORBIS route endpoints use per-transport-layer id offsets (1/2/3/4 × 100000);
/// normalize back to base site ids. Routes with unknown endpoints are dropped.
pub fn load_routes(path: &str, sites: &BTreeMap<u32, OrbisSite>) -> Vec<OrbisRoute> {
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut out = Vec::new();
    let mut dropped = 0;
    for f in v["features"].as_array().unwrap() {
        let p = &f["properties"];
        let kind = match p["t"].as_str().unwrap() {
            "road" => RouteKind::Road,
            "upstream" | "downstream" => RouteKind::River,
            "coastal" | "overseas" | "ferry" => RouteKind::Sea,
            other => panic!("unknown route type {other}"),
        };
        let a = (p["sid"].as_u64().unwrap() % 100000) as u32;
        let b = (p["tid"].as_u64().unwrap() % 100000) as u32;
        if !sites.contains_key(&a) || !sites.contains_key(&b) {
            dropped += 1;
            continue;
        }
        let g = &f["geometry"];
        let coord = |c: &Value| project(c[0].as_f64().unwrap(), c[1].as_f64().unwrap());
        let pts: Vec<[f64; 2]> = match g["type"].as_str().unwrap() {
            "LineString" => g["coordinates"]
                .as_array()
                .unwrap()
                .iter()
                .map(coord)
                .collect(),
            // A few routes ship as ordered MultiLineString parts; concatenate.
            "MultiLineString" => g["coordinates"]
                .as_array()
                .unwrap()
                .iter()
                .flat_map(|line| line.as_array().unwrap().iter().map(coord))
                .collect(),
            other => panic!("unexpected route geometry {other}"),
        };
        out.push(OrbisRoute { a, b, kind, pts });
    }
    eprintln!(
        "routes: {} loaded, {} dropped (unknown endpoints)",
        out.len(),
        dropped
    );
    out
}

/// Merge hand-authored geography from overrides.json into the ORBIS sites/routes
/// before the graph is built — for cities absent from ORBIS (e.g. Rhegium, the
/// Messina-strait mainland port) and the sea lanes / roads that connect them.
/// Synthetic site ids sit above the ORBIS id range. Runs before `build::build`,
/// so ownership flood, pruning, and road routing treat them like any other site.
///   overrides.extra_sites:  [{ label, lon, lat, rank }]
///   overrides.drop_routes:  [{ a, b }]        — ORBIS routes a hand-route replaces
///   overrides.extra_routes: [{ a, b, kind }]  — kind "road" | "sea", straight a→b
pub fn apply_extra_geography(
    sites: &mut BTreeMap<u32, OrbisSite>,
    routes: &mut Vec<OrbisRoute>,
    overrides: &Value,
) {
    let mut next_id = sites.keys().max().copied().unwrap_or(0) + 10000;
    let mut label_to_id: BTreeMap<String, u32> =
        sites.values().map(|s| (s.label.clone(), s.id)).collect();

    if let Some(arr) = overrides["extra_sites"].as_array() {
        for e in arr {
            let label = e["label"].as_str().expect("extra_site.label").to_string();
            let lon = e["lon"].as_f64().expect("extra_site.lon");
            let lat = e["lat"].as_f64().expect("extra_site.lat");
            let rank = e["rank"].as_u64().unwrap_or(90) as u32;
            let id = next_id;
            next_id += 1;
            sites.insert(
                id,
                OrbisSite {
                    id,
                    label: label.clone(),
                    rank,
                    pos: project(lon, lat),
                },
            );
            label_to_id.insert(label, id);
        }
    }

    let resolve = |label: &str| -> u32 {
        *label_to_id
            .get(label)
            .unwrap_or_else(|| panic!("extra route references unknown site: {label}"))
    };

    if let Some(arr) = overrides["drop_routes"].as_array() {
        let drop: BTreeSet<(u32, u32)> = arr
            .iter()
            .map(|d| {
                let a = resolve(d["a"].as_str().expect("drop_route.a"));
                let b = resolve(d["b"].as_str().expect("drop_route.b"));
                (a.min(b), a.max(b))
            })
            .collect();
        routes.retain(|r| !drop.contains(&(r.a.min(r.b), r.a.max(r.b))));
    }

    if let Some(arr) = overrides["extra_routes"].as_array() {
        for e in arr {
            let a = resolve(e["a"].as_str().expect("extra_route.a"));
            let b = resolve(e["b"].as_str().expect("extra_route.b"));
            let kind = match e["kind"].as_str().expect("extra_route.kind") {
                "road" => RouteKind::Road,
                "sea" => RouteKind::Sea,
                other => panic!("extra_route.kind must be road|sea, got {other}"),
            };
            let pts = vec![sites[&a].pos, sites[&b].pos];
            routes.push(OrbisRoute { a, b, kind, pts });
        }
    }
}

/// A polygon as rings of projected points (outer + holes, even-odd).
pub struct Poly {
    pub rings: Vec<Vec<[f64; 2]>>,
    pub bbox: crate::geo::BBox,
}

fn ring_pts(ring: &Value) -> Vec<[f64; 2]> {
    ring.as_array()
        .unwrap()
        .iter()
        .map(|c| project(c[0].as_f64().unwrap(), c[1].as_f64().unwrap()))
        .collect()
}

/// Load (Multi)Polygon features, optionally filtered on FEATURECLA.
pub fn load_polys(path: &str, featurecla: Option<&str>) -> Vec<Poly> {
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut out = Vec::new();
    for f in v["features"].as_array().unwrap() {
        if let Some(want) = featurecla {
            if f["properties"]["FEATURECLA"].as_str() != Some(want)
                && f["properties"]["featurecla"].as_str() != Some(want)
            {
                continue;
            }
        }
        let g = &f["geometry"];
        let mut polys: Vec<Vec<Vec<[f64; 2]>>> = Vec::new();
        match g["type"].as_str().unwrap() {
            "Polygon" => polys.push(
                g["coordinates"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(ring_pts)
                    .collect(),
            ),
            "MultiPolygon" => {
                for poly in g["coordinates"].as_array().unwrap() {
                    polys.push(poly.as_array().unwrap().iter().map(ring_pts).collect());
                }
            }
            _ => continue,
        }
        for rings in polys {
            let bbox = crate::geo::BBox::of(rings.iter().flatten().copied());
            out.push(Poly { rings, bbox });
        }
    }
    out
}

/// Load (Multi)LineString features as flat polylines.
pub fn load_lines(path: &str) -> Vec<Vec<[f64; 2]>> {
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut out = Vec::new();
    for f in v["features"].as_array().unwrap() {
        let g = &f["geometry"];
        match g["type"].as_str().unwrap() {
            "LineString" => out.push(ring_pts(&g["coordinates"])),
            "MultiLineString" => {
                for line in g["coordinates"].as_array().unwrap() {
                    out.push(ring_pts(line));
                }
            }
            _ => {}
        }
    }
    out
}
