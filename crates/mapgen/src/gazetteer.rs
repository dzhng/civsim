use crate::build;
use crate::geo::dist;
use crate::map_io;
use crate::raster;
use crate::road_measure;
use crate::sources;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub struct CitySnapExemption {
    pub name: &'static str,
    pub reason: &'static str,
}

pub const CITY_SNAP_EXEMPTIONS: &[CitySnapExemption] = &[
    CitySnapExemption {
        name: "Tainaron Pr.",
        reason: "small peninsula; nearest 3x3-safe cell would move the harbor over 14km",
    },
    CitySnapExemption {
        name: "Cnidus",
        reason: "small peninsula harbor; nearest 3x3-safe cell would move the city over 12km",
    },
    CitySnapExemption {
        name: "Apollonia Pontica",
        reason: "coastal harbor; nearest 3x3-safe cell would move the port over 8km",
    },
    CitySnapExemption {
        name: "Perinthus",
        reason: "strait harbor; nearest 3x3-safe cell would move the port over 7km",
    },
    CitySnapExemption {
        name: "Meninge",
        reason: "small-island city; nearest 3x3-safe cell would move it over 7km",
    },
    CitySnapExemption {
        name: "Constantinopolis",
        reason: "strait harbor; nearest 3x3-safe cell would move the port over 6km",
    },
    CitySnapExemption {
        name: "Gades",
        reason:
            "harbor on a narrow island/coast; nearest 3x3-safe cell would move the port over 6km",
    },
    CitySnapExemption {
        name: "Thaenae",
        reason: "coastal harbor; nearest 3x3-safe cell would move the port over 6km",
    },
    CitySnapExemption {
        name: "Messana",
        reason: "Messina-strait harbor; carve_straits opens water on its NE shore",
    },
];

pub struct StraitCarve {
    pub name: &'static str,
    pub centerline: &'static [[f64; 2]],
    pub half_w_km: f64,
}

pub const STRAIT_CARVES: &[StraitCarve] = &[
    StraitCarve {
        name: "Messina",
        centerline: &[
            [-205.0, 44.0],
            [-210.0, 28.0],
            [-213.0, 14.0],
            [-217.0, -4.0],
        ],
        half_w_km: 5.0,
    },
    StraitCarve {
        name: "Bosphorus",
        centerline: &[
            [926.0, 424.0],
            [925.0, 404.0],
            [924.0, 390.0],
            [923.0, 384.0],
            [921.0, 378.0],
        ],
        half_w_km: 4.5,
    },
    StraitCarve {
        name: "Gulf of Izmit",
        centerline: &[
            [935.0, 378.0],
            [945.0, 371.0],
            [970.0, 372.0],
            [990.0, 373.0],
        ],
        half_w_km: 5.0,
    },
];

pub const KEEP_SEA_LANES: &[(&str, &str)] = &[
    ("Gades", "Tingi"),
    ("Carthago", "Lilybaeum"),
    ("Constantinopolis", "Nicomedia"),
    ("Rhegium", "Messana"),
    // Bosporan strait (Kerch): joins the Crimea and Taman coast chains —
    // a proper lane (David 2026-07-14), not an implied road ferry. It runs
    // to Phanagoreia (the hand-authored Bosporan twin), not Gorgippia — the
    // direct Gorgippia line grazes the Taman headland.
    ("Pantikapaion", "Phanagoreia"),
];

/// Hand-authored city: Phanagoreia, the Bosporan twin colony across the
/// strait from Pantikapaion. Exists so the Kerch lane is a straight
/// open-water shot. Position picked against the committed raster: land with
/// a 2-cell margin whose straight line to Pantikapaion is 100% water
/// (45 km); the coast road continues to Gorgippia. Fixed id above the baked
/// range so reapplication is deterministic.
const PHANAGOREIA: HandAuthoredCity = HandAuthoredCity {
    id: 61000,
    name: "Phanagoreia",
    pos: [1471.0, 970.0],
    owner: "league_chersonesos",
    tier: 2,
};

struct HandAuthoredCity {
    id: u32,
    name: &'static str,
    pos: [f64; 2],
    owner: &'static str,
    tier: u32,
}

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
/// join across the Bosporan strait sea lane (KEEP_SEA_LANES). Paths are
/// A*-routed over the committed land raster.
pub const BLACK_SEA_COAST_ROUTES: &[(&str, &str)] = &[
    ("Salsovia", "Tyras"),
    ("Tyras", "Olbia Borysthenes"),
    ("Olbia Borysthenes", "Kalos Limen"),
    ("Kalos Limen", "Chersonesos"),
    ("Chersonesos", "Theodosia"),
    ("Theodosia", "Pantikapaion"),
    ("Phanagoreia", "Gorgippia"),
    ("Gorgippia", "Tanais"),
    ("Trapezus", "Phasis"),
    ("Phasis", "Dioscurias"),
    ("Dioscurias", "Gorgippia"),
];

/// Prefer this much all-land neighborhood (raster cells, 2 km each) around a
/// routed coastal road: a path that hugs the bake-resolution shoreline dips
/// into the renderer's coarser water and the drawn ribbon dashes. Tight
/// coasts (mountains to the waterline) may only pass at smaller margins, so
/// routing degrades margin -> 0 before giving up.
const COAST_ROAD_MARGIN_CELLS: usize = 2;

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
    // Hand-authored cities go in first so the route/lane ledgers below can
    // name them like any baked city (idempotent: existing names skip).
    for city in [&PHANAGOREIA] {
        let exists = map["nodes"]
            .as_array()
            .expect("nodes array")
            .iter()
            .any(|node| node["name"].as_str() == Some(city.name));
        if exists {
            continue;
        }
        assert!(
            raster
                .cell_of(city.pos)
                .is_some_and(|[x, y]| raster.is_land_neighborhood(x, y, 1)),
            "{} must sit on land with the city snap margin",
            city.name
        );
        map["nodes"]
            .as_array_mut()
            .expect("nodes array")
            .push(json!({
                "id": city.id,
                "kind": "city",
                "name": city.name,
                "owner": city.owner,
                "port": true,
                "pos": city.pos,
                "tier": city.tier,
            }));
        for faction in map["factions"].as_array_mut().expect("factions array") {
            if faction["id"].as_str() == Some(city.owner) {
                faction["cities"]
                    .as_array_mut()
                    .expect("faction cities")
                    .push(json!(city.id));
            }
        }
        eprintln!("black-sea-roads: added city {}", city.name);
    }

    let nodes = map_io::nodes(map);
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
    let mut push_edge =
        |map: &mut Value, a: u32, b: u32, kind: &str, via: Vec<[f64; 2]>, label: String| {
            let eidx = map["edges"].as_array().expect("edges array").len();
            let (tiles, ambush) =
                build::classify_route_tiles(&via, kind, eidx, river_grid, mountains);
            map["edges"]
                .as_array_mut()
                .expect("edges array")
                .push(json!({ "a": a, "b": b, "kind": kind, "via": via, "tiles": tiles }));
            let ambush_spots = map["ambush_spots"]
                .as_array_mut()
                .expect("ambush_spots array");
            for spot in ambush {
                ambush_spots.push(serde_json::to_value(spot).expect("ambush spot json"));
            }
            added.push(label);
        };

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
        let mut via = (0..=COAST_ROAD_MARGIN_CELLS)
            .rev()
            .find_map(|margin| road_measure::astar_land_path(raster, pa, pb, dist(pa, pb), margin))
            .unwrap_or_else(|| panic!("no land path {a_name}--{b_name} at any margin"));
        // A* runs cell-center to cell-center; the edge contract is exact node
        // endpoints (via[0] == a.pos, via[last] == b.pos).
        via[0] = pa;
        *via.last_mut().expect("non-empty via") = pb;
        push_edge(map, a, b, "road", via, format!("{a_name}--{b_name}"));
    }

    // Any KEEP_SEA_LANES pair absent from the committed map is laid as a
    // straight lane — the descope can only KEEP lanes the source data had,
    // and the Bosporan lane has no ORBIS route to survive from.
    for &(a_name, b_name) in KEEP_SEA_LANES {
        let (Some(&a), Some(&b)) = (ids_by_name.get(a_name), ids_by_name.get(b_name)) else {
            continue; // endpoint pruned or renamed: descope owns that failure
        };
        if existing.contains(&(a.min(b), a.max(b))) {
            continue;
        }
        push_edge(
            map,
            a,
            b,
            "sea",
            vec![nodes[&a].pos, nodes[&b].pos],
            format!("{a_name}<->{b_name} (sea)"),
        );
        for node in map["nodes"].as_array_mut().expect("nodes array") {
            let id = node["id"].as_u64().expect("node id") as u32;
            if id == a || id == b {
                node["port"] = json!(true);
            }
        }
    }
    eprintln!(
        "black-sea-roads: added {} edges{}",
        added.len(),
        if added.is_empty() {
            String::new()
        } else {
            format!(" -> {}", added.join("; "))
        }
    );
}
