//! Graph construction: ORBIS sites/routes + Natural Earth features → campaign map JSON.

use crate::geo::{dist, point_along, point_in_poly, polyline_len, BBox, SegGrid};
use crate::raster::Raster;
use crate::sources::{OrbisRoute, OrbisSite, Poly, RouteKind};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

pub const TILE_KM: f64 = 5.0;
pub const SIMPLIFY_TOL_KM: f64 = 1.0;
/// Forest patches: deterministic hash over this cell size, below the threshold.
const FOREST_CELL_KM: f64 = 40.0;
const FOREST_FRAC: u64 = 22; // percent
pub const CITY_SNAP_MARGIN_CELLS: usize = 1;
pub const MAX_CITY_SNAP_MOVE_KM: f64 = 6.0;
const CITY_SNAP_SEARCH_KM: f64 = 80.0;

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
        reason: "harbor on a narrow island/coast; nearest 3x3-safe cell would move it over 6km",
    },
    CitySnapExemption {
        name: "Thaenae",
        reason: "coastal harbor; nearest 3x3-safe cell would move the port over 6km",
    },
];

#[derive(Serialize)]
pub struct MapJson {
    pub half_w: f64,
    pub half_h: f64,
    pub attribution: String,
    pub nodes: Vec<NodeJson>,
    pub edges: Vec<EdgeJson>,
    pub ambush_spots: Vec<AmbushJson>,
    pub factions: Vec<serde_json::Value>,
    pub start_armies: Vec<serde_json::Value>,
}

#[derive(Serialize)]
pub struct NodeJson {
    pub id: u32,
    pub name: String,
    pub pos: [f64; 2],
    #[serde(rename = "srcPos")]
    pub src_pos: [f64; 2],
    pub kind: &'static str, // "city" | "junction"
    pub tier: u8,           // 0 for junctions
    pub port: bool,
    pub owner: String, // faction id, "independents" for unassigned cities, "" for junctions
}

#[derive(Serialize)]
pub struct EdgeJson {
    pub a: u32,
    pub b: u32,
    pub kind: &'static str, // "road" | "sea"
    pub via: Vec<[f64; 2]>,
    pub tiles: Vec<&'static str>,
}

#[derive(Serialize)]
pub struct AmbushJson {
    pub edge: usize,
    pub tile: usize,
    pub side: i8,
}

fn hash(a: u64, b: u64) -> u64 {
    let mut x = a.wrapping_mul(0x9E3779B97F4A7C15) ^ b.wrapping_mul(0xBF58476D1CE4E5B9);
    x ^= x >> 31;
    x.wrapping_mul(0x94D049BB133111EB) >> 16
}

/// Douglas-Peucker simplification.
pub fn simplify(pts: &[[f64; 2]], tol: f64) -> Vec<[f64; 2]> {
    if pts.len() < 3 {
        return pts.to_vec();
    }
    fn seg_dist(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
        let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
        let len2 = dx * dx + dy * dy;
        if len2 == 0.0 {
            return dist(p, a);
        }
        let t = (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2).clamp(0.0, 1.0);
        dist(p, [a[0] + dx * t, a[1] + dy * t])
    }
    let (mut imax, mut dmax) = (0, 0.0);
    for i in 1..pts.len() - 1 {
        let d = seg_dist(pts[i], pts[0], pts[pts.len() - 1]);
        if d > dmax {
            dmax = d;
            imax = i;
        }
    }
    if dmax > tol {
        let mut left = simplify(&pts[..=imax], tol);
        let right = simplify(&pts[imax..], tol);
        left.pop();
        left.extend(right);
        left
    } else {
        vec![pts[0], *pts.last().unwrap()]
    }
}

pub fn build_river_grid(bb: BBox, rivers: &[Vec<[f64; 2]>]) -> SegGrid {
    let mut river_grid = SegGrid::new(bb.pad(100.0), 50.0);
    for line in rivers {
        for w in line.windows(2) {
            if bb.contains(w[0]) || bb.contains(w[1]) {
                river_grid.insert(w[0], w[1]);
            }
        }
    }
    river_grid
}

pub fn classify_route_tiles(
    via: &[[f64; 2]],
    kind: &str,
    eidx: usize,
    river_grid: &SegGrid,
    mountains: &[Poly],
) -> (Vec<&'static str>, Vec<AmbushJson>) {
    let len = polyline_len(via);
    let ntiles = ((len / TILE_KM).round() as usize).max(1);
    let step = len / ntiles as f64;
    let mut tiles: Vec<&'static str> = Vec::with_capacity(ntiles);
    let mut ambush_spots = Vec::new();
    for k in 0..ntiles {
        let mid = point_along(via, (k as f64 + 0.5) * step);
        let t = if kind == "sea" {
            "sea"
        } else if river_grid.crosses(
            point_along(via, k as f64 * step),
            point_along(via, (k + 1) as f64 * step),
        ) {
            "bridge"
        } else if mountains
            .iter()
            .any(|m| m.bbox.contains(mid) && point_in_poly(mid, &m.rings))
        {
            if hash(eidx as u64, k as u64) % 3 == 0 {
                "pass"
            } else {
                "hill"
            }
        } else if hash(
            (mid[0].div_euclid(FOREST_CELL_KM) + 4000.0) as u64,
            (mid[1].div_euclid(FOREST_CELL_KM) + 4000.0) as u64,
        ) % 100
            < FOREST_FRAC
        {
            "forest"
        } else {
            "open"
        };
        if matches!(t, "forest" | "hill" | "pass") {
            ambush_spots.push(AmbushJson {
                edge: eidx,
                tile: k,
                side: if hash(eidx as u64, k as u64 + 7) % 2 == 0 {
                    -1
                } else {
                    1
                },
            });
        }
        tiles.push(t);
    }
    (tiles, ambush_spots)
}

pub struct BuildInput<'a> {
    pub sites: BTreeMap<u32, OrbisSite>,
    pub routes: Vec<OrbisRoute>,
    pub mountains: Vec<Poly>,
    pub rivers: Vec<Vec<[f64; 2]>>,
    pub overrides: serde_json::Value,
    pub land_raster: &'a Raster,
}

pub fn build(input: BuildInput<'_>) -> MapJson {
    let BuildInput {
        sites,
        routes,
        mountains,
        rivers,
        overrides,
        land_raster,
    } = input;

    // World extent from sites.
    let bb = BBox::of(sites.values().map(|s| s.pos)).pad(150.0);
    let half_w = bb.max[0].abs().max(bb.min[0].abs());
    let half_h = bb.max[1].abs().max(bb.min[1].abs());

    // River segments into a query grid (for bridge detection).
    let river_grid = build_river_grid(bb, &rivers);

    // Dedupe routes: upstream/downstream are the same river twice; keep one per
    // (pair, kind). Parallel road+sea between the same pair both survive.
    let mut seen: BTreeSet<(u32, u32, u8)> = BTreeSet::new();
    let mut edges: Vec<EdgeJson> = Vec::new();
    let mut ambush_spots: Vec<AmbushJson> = Vec::new();

    for r in &routes {
        let key = (
            r.a.min(r.b),
            r.a.max(r.b),
            matches!(r.kind, RouteKind::Sea) as u8,
        );
        if !seen.insert(key) {
            continue;
        }
        // Orient geometry a→b and snap endpoints onto the site positions.
        let (pa, pb) = (sites[&r.a].pos, sites[&r.b].pos);
        let mut pts = r.pts.clone();
        if pts.is_empty() {
            pts = vec![pa, pb];
        }
        if dist(pts[0], pa) > dist(*pts.last().unwrap(), pa) {
            pts.reverse();
        }
        pts[0] = pa;
        *pts.last_mut().unwrap() = pb;
        let via = simplify(&pts, SIMPLIFY_TOL_KM);

        let eidx = edges.len();
        let kind = if matches!(r.kind, RouteKind::Sea) {
            "sea"
        } else {
            "road"
        };
        let (tiles, spots) = classify_route_tiles(&via, kind, eidx, &river_grid, &mountains);
        ambush_spots.extend(spots);
        edges.push(EdgeJson {
            a: r.a,
            b: r.b,
            kind,
            via,
            tiles,
        });
    }

    let connected_before_prune: BTreeSet<u32> = edges.iter().flat_map(|e| [e.a, e.b]).collect();

    let mut tier_override: BTreeMap<String, u8> = BTreeMap::new();
    for (label, t) in overrides["tier_overrides"]
        .as_object()
        .expect("tier_overrides")
    {
        tier_override.insert(label.clone(), t.as_u64().unwrap() as u8);
    }
    let base_tier = |s: &OrbisSite| -> u8 {
        tier_override
            .get(&s.label)
            .copied()
            .unwrap_or(match s.rank {
                100 => 3,
                90 => 2,
                80 => 1,
                _ => 0,
            })
    };

    // City ownership: instead of a hand-picked scatter of named cities, grow each
    // faction a CONTIGUOUS home region. The capital, its named cities, and its
    // army-start cities are forced seeds; a capped multi-source flood over the
    // road/sea graph then claims the nearest cities to each — a Voronoi split
    // where the first faction to reach a city by hops takes it, up to a budget.
    // Cities beyond every faction's budget stay independent (room to conquer).
    let factions_arr = overrides["factions"].as_array().expect("factions");
    let label_to_id: BTreeMap<&str, u32> = sites
        .values()
        .filter(|s| connected_before_prune.contains(&s.id))
        .map(|s| (s.label.as_str(), s.id))
        .collect();
    let resolve = |label: &str| -> u32 {
        *label_to_id
            .get(label)
            .unwrap_or_else(|| panic!("override city not found in ORBIS sites: {label}"))
    };
    let fac_index: BTreeMap<&str, usize> = factions_arr
        .iter()
        .enumerate()
        .filter_map(|(i, f)| f["id"].as_str().map(|id| (id, i)))
        .collect();

    // Forced seeds: the capital and the army-start cities — the cities that MUST
    // belong to the faction for a valid opening. The hand-authored `cities` list
    // is NOT forced (a distant entry like Carthage's Panormus in Sicily would be
    // a disconnected exclave); the flood below decides the rest.
    let mut owner_site: BTreeMap<u32, usize> = BTreeMap::new();
    let mut seeds_of: Vec<Vec<u32>> = vec![Vec::new(); factions_arr.len()];
    for (fi, f) in factions_arr.iter().enumerate() {
        if f["id"].as_str() == Some("independents") {
            continue;
        }
        if let Some(cap) = f["capital"].as_str() {
            let id = resolve(cap);
            owner_site.insert(id, fi);
            seeds_of[fi].push(id);
        }
    }
    for s in overrides["start_armies"].as_array().unwrap() {
        if let Some(&fi) = s["faction"].as_str().and_then(|id| fac_index.get(id)) {
            let id = resolve(s["at"].as_str().unwrap());
            owner_site.insert(id, fi);
            seeds_of[fi].push(id);
        }
    }

    // Cities by ORBIS rank, plus every forced seed (a seed is always a city).
    let mut is_city: BTreeSet<u32> = sites
        .values()
        .filter(|s| connected_before_prune.contains(&s.id) && base_tier(s) > 0)
        .map(|s| s.id)
        .collect();
    is_city.extend(owner_site.keys().copied());

    let removed_junctions = prune_road_stub_junctions(&mut edges, &mut ambush_spots, &is_city);
    let ports = port_sites(&edges);
    // Drop sites with no surviving edges (isolated points render as noise), but
    // keep cities protected from road-stub pruning.
    let connected: BTreeSet<u32> = edges.iter().flat_map(|e| [e.a, e.b]).collect();
    let retained_sites: BTreeSet<u32> = connected.union(&is_city).copied().collect();

    // LAND adjacency: sea lanes carry armies but don't make a realm look
    // contiguous, so territory is grown over roads only. Junctions transit.
    let mut adj: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
    for e in &edges {
        if e.kind == "sea" {
            continue;
        }
        adj.entry(e.a).or_default().push(e.b);
        adj.entry(e.b).or_default().push(e.a);
    }
    for v in adj.values_mut() {
        v.sort_unstable();
        v.dedup();
    }

    // Connect each faction's seeds before flooding: claim the cities along the
    // shortest land path from the capital to each army-start city, so a realm
    // whose two armies sit far apart (Rome at Roma + Capua) is one bloc, not two.
    let shortest_path = |from: u32, to: u32| -> Vec<u32> {
        let mut parent: BTreeMap<u32, u32> = BTreeMap::new();
        let mut seen: BTreeSet<u32> = BTreeSet::from([from]);
        let mut q: std::collections::VecDeque<u32> = std::collections::VecDeque::from([from]);
        while let Some(u) = q.pop_front() {
            if u == to {
                let mut path = vec![to];
                let mut c = to;
                while let Some(&p) = parent.get(&c) {
                    path.push(p);
                    c = p;
                }
                return path;
            }
            for &nb in adj.get(&u).map(|v| v.as_slice()).unwrap_or(&[]) {
                if seen.insert(nb) {
                    parent.insert(nb, u);
                    q.push_back(nb);
                }
            }
        }
        Vec::new() // no land route (island start) — leave it as a lone seed
    };
    for fi in 0..factions_arr.len() {
        if seeds_of[fi].len() < 2 {
            continue;
        }
        let cap = seeds_of[fi][0];
        for &s in &seeds_of[fi][1..] {
            for site in shortest_path(cap, s) {
                if is_city.contains(&site) {
                    owner_site.entry(site).or_insert(fi);
                }
            }
        }
    }

    let budget = overrides
        .get("region_cities")
        .and_then(|v| v.as_u64())
        .unwrap_or(14) as usize;
    let mut count = vec![0usize; factions_arr.len()];
    for &fi in owner_site.values() {
        count[fi] += 1;
    }

    // Layered multi-source BFS from the seeds. Sorted each round for determinism.
    let mut visited: BTreeSet<u32> = owner_site.keys().copied().collect();
    let mut frontier: Vec<(u32, usize)> = owner_site.iter().map(|(&s, &f)| (s, f)).collect();
    while !frontier.is_empty() {
        frontier.sort_unstable();
        let mut next: Vec<(u32, usize)> = Vec::new();
        for &(site, fac) in &frontier {
            if count[fac] >= budget {
                continue; // this realm is full — let others reach past it
            }
            for &nb in adj.get(&site).map(|v| v.as_slice()).unwrap_or(&[]) {
                if !visited.insert(nb) {
                    continue;
                }
                if is_city.contains(&nb) {
                    owner_site.insert(nb, fac);
                    count[fac] += 1;
                    next.push((nb, fac));
                } else {
                    next.push((nb, fac)); // junction: keep flowing through it
                }
            }
        }
        frontier = next;
    }

    // Fill notches: a neutral city ringed by a single power (and not outnumbered
    // there by other neutrals) is absorbed, so a realm reads as one solid block
    // rather than being pocked by stray neutral Voronoi cells along its coast
    // (e.g. Lepcis Magna sitting amid Carthage's Tripolitanian shore). A SINGLE
    // pass — one ring of notches/termini — not a fixpoint, so realms don't
    // cascade outward and stay near their budget. A city touching two powers, or
    // out on the open neutral frontier, is left alone.
    let city_neighbours = |start: u32| -> Vec<u32> {
        // Cities reachable through junctions only (nearest road neighbours).
        let mut out = Vec::new();
        let mut seen: BTreeSet<u32> = BTreeSet::from([start]);
        let mut q: std::collections::VecDeque<u32> = std::collections::VecDeque::new();
        for &v in adj.get(&start).map(|v| v.as_slice()).unwrap_or(&[]) {
            if seen.insert(v) {
                q.push_back(v);
            }
        }
        while let Some(u) = q.pop_front() {
            if is_city.contains(&u) {
                out.push(u);
                continue; // a city ends this spoke
            }
            for &v in adj.get(&u).map(|v| v.as_slice()).unwrap_or(&[]) {
                if seen.insert(v) {
                    q.push_back(v);
                }
            }
        }
        out
    };
    let mut additions: Vec<(u32, usize)> = Vec::new();
    for &cid in &is_city {
        if owner_site.contains_key(&cid) {
            continue;
        }
        let mut powers: BTreeSet<usize> = BTreeSet::new();
        let (mut owned, mut neutral) = (0u32, 0u32);
        for n in city_neighbours(cid) {
            match owner_site.get(&n) {
                Some(&f) => {
                    powers.insert(f);
                    owned += 1;
                }
                None => neutral += 1,
            }
        }
        if powers.len() == 1 && owned >= neutral {
            additions.push((cid, *powers.iter().next().unwrap()));
        }
    }
    for (cid, f) in additions {
        owner_site.insert(cid, f);
    }

    let id_to_label: BTreeMap<u32, &str> =
        sites.values().map(|s| (s.id, s.label.as_str())).collect();
    let mut owner_of: BTreeMap<String, String> = BTreeMap::new();
    for (&site, &fi) in &owner_site {
        let fid = factions_arr[fi]["id"].as_str().unwrap().to_string();
        owner_of.insert(id_to_label[&site].to_string(), fid);
    }

    let mut nodes: Vec<NodeJson> = Vec::new();
    let mut resolved: BTreeSet<&str> = BTreeSet::new();
    let city_positions = snapped_city_positions(&sites, &is_city, &land_raster);
    snap_edge_endpoints(&mut edges, &city_positions);

    for s in sites
        .values()
        .filter(|s| retained_sites.contains(&s.id) && !removed_junctions.contains(&s.id))
    {
        let mut tier = tier_override
            .get(&s.label)
            .copied()
            .unwrap_or(match s.rank {
                100 => 3,
                90 => 2,
                80 => 1,
                _ => 0,
            });
        // Faction-assigned sites are always cities, whatever their ORBIS rank.
        if owner_of.contains_key(&s.label) {
            tier = tier.max(1);
            resolved.insert(&s.label);
        }
        let is_city = tier > 0;
        let owner = if is_city {
            owner_of
                .get(&s.label)
                .cloned()
                .unwrap_or_else(|| "independents".into())
        } else {
            String::new()
        };
        nodes.push(NodeJson {
            id: s.id,
            name: s.label.clone(),
            pos: city_positions.get(&s.id).copied().unwrap_or(s.pos),
            src_pos: s.pos,
            kind: if is_city { "city" } else { "junction" },
            tier,
            port: ports.contains(&s.id),
            owner,
        });
    }
    for label in owner_of.keys() {
        if !resolved.contains(label.as_str()) {
            panic!("override city not found in ORBIS sites: {label}");
        }
    }

    MapJson {
        half_w,
        half_h,
        attribution: "Road/sea network: ORBIS (Stanford, via github.com/emeeks/orbis_v2, MIT). \
                      Coastlines/rivers/terrain: Natural Earth (public domain)."
            .into(),
        nodes,
        edges,
        ambush_spots,
        factions: overrides["factions"].as_array().unwrap().clone(),
        start_armies: overrides["start_armies"].as_array().unwrap().clone(),
    }
}

fn port_sites(edges: &[EdgeJson]) -> BTreeSet<u32> {
    edges
        .iter()
        .filter(|e| e.kind == "sea")
        .flat_map(|e| [e.a, e.b])
        .collect()
}

fn prune_road_stub_junctions(
    edges: &mut Vec<EdgeJson>,
    ambush_spots: &mut Vec<AmbushJson>,
    city_sites: &BTreeSet<u32>,
) -> BTreeSet<u32> {
    let mut alive = vec![true; edges.len()];
    let mut removed = BTreeSet::new();
    loop {
        let mut endpoints = BTreeSet::new();
        let mut road_degree: BTreeMap<u32, usize> = BTreeMap::new();
        let mut sea_degree: BTreeMap<u32, usize> = BTreeMap::new();
        for (i, e) in edges.iter().enumerate() {
            if !alive[i] {
                continue;
            }
            endpoints.insert(e.a);
            endpoints.insert(e.b);
            if e.kind == "road" {
                *road_degree.entry(e.a).or_default() += 1;
                *road_degree.entry(e.b).or_default() += 1;
            } else if e.kind == "sea" {
                *sea_degree.entry(e.a).or_default() += 1;
                *sea_degree.entry(e.b).or_default() += 1;
            }
        }

        let doomed: BTreeSet<u32> = endpoints
            .into_iter()
            .filter(|id| {
                !city_sites.contains(id)
                    && road_degree.get(id).copied().unwrap_or(0) <= 1
                    && sea_degree.get(id).copied().unwrap_or(0) == 0
            })
            .collect();
        if doomed.is_empty() {
            break;
        }
        removed.extend(doomed.iter().copied());
        for (i, e) in edges.iter().enumerate() {
            if alive[i] && (doomed.contains(&e.a) || doomed.contains(&e.b)) {
                alive[i] = false;
            }
        }
    }

    let mut edge_remap = vec![usize::MAX; edges.len()];
    let mut retained = Vec::new();
    for (i, e) in edges.drain(..).enumerate() {
        if alive[i] && !removed.contains(&e.a) && !removed.contains(&e.b) {
            edge_remap[i] = retained.len();
            retained.push(e);
        }
    }
    *edges = retained;

    ambush_spots.retain_mut(|spot| {
        let mapped = edge_remap.get(spot.edge).copied().unwrap_or(usize::MAX);
        if mapped == usize::MAX {
            false
        } else {
            spot.edge = mapped;
            true
        }
    });

    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn road_stub_prune_preserves_sea_lane_junctions() {
        let mut edges = vec![
            EdgeJson {
                a: 1,
                b: 2,
                kind: "road",
                via: vec![[0.0, 0.0], [1.0, 0.0]],
                tiles: vec!["open"],
            },
            EdgeJson {
                a: 2,
                b: 3,
                kind: "sea",
                via: vec![[1.0, 0.0], [2.0, 0.0]],
                tiles: vec!["sea"],
            },
        ];
        let mut ambush_spots = vec![AmbushJson {
            edge: 0,
            tile: 0,
            side: 1,
        }];
        let city_sites = BTreeSet::from([1, 3]);

        let removed = prune_road_stub_junctions(&mut edges, &mut ambush_spots, &city_sites);

        assert!(
            removed.is_empty(),
            "sea-lane junctions must not be pruned: {removed:?}"
        );
        assert_eq!(edges.len(), 2);
        assert!(edges
            .iter()
            .any(|e| e.kind == "sea" && e.a == 2 && e.b == 3));
        assert_eq!(ambush_spots.len(), 1);
    }
}

fn snapped_city_positions(
    sites: &BTreeMap<u32, OrbisSite>,
    city_sites: &BTreeSet<u32>,
    land_raster: &Raster,
) -> BTreeMap<u32, [f64; 2]> {
    let mut out = BTreeMap::new();
    let mut moved = Vec::new();
    let mut exempted = Vec::new();
    for &id in city_sites {
        let pos = sites[&id].pos;
        let Some([x, y]) = land_raster.cell_of(pos) else {
            continue;
        };
        if land_raster.is_land_neighborhood(x, y, CITY_SNAP_MARGIN_CELLS) {
            continue;
        }
        let snapped = land_raster
            .nearest_land_neighborhood_center(pos, CITY_SNAP_SEARCH_KM, CITY_SNAP_MARGIN_CELLS)
            .unwrap_or_else(|| {
                panic!(
                    "no city-snap margin-safe land cell within {CITY_SNAP_SEARCH_KM}km of {}",
                    sites[&id].label
                )
            });
        let move_km = dist(pos, snapped);
        if move_km > MAX_CITY_SNAP_MOVE_KM {
            if !land_raster.is_land_cell(x, y) {
                let center_land = land_raster
                    .nearest_land_neighborhood_center(pos, CITY_SNAP_SEARCH_KM, 0)
                    .unwrap_or_else(|| {
                        panic!(
                            "no center-land cell within {CITY_SNAP_SEARCH_KM}km of {}",
                            sites[&id].label
                        )
                    });
                out.insert(id, center_land);
            }
            exempted.push((sites[&id].label.as_str(), pos, snapped, move_km));
            continue;
        }
        out.insert(id, snapped);
        moved.push((sites[&id].label.as_str(), pos, snapped, move_km));
    }
    moved.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap());
    exempted.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap());
    eprintln!(
        "city-snap: {} moved within {MAX_CITY_SNAP_MOVE_KM:.1}km, {} exempted beyond {MAX_CITY_SNAP_MOVE_KM:.1}km",
        moved.len(),
        exempted.len()
    );
    for (name, from, to, km) in &moved {
        eprintln!(
            "city-snap moved: {name}: [{:.3},{:.3}] -> [{:.3},{:.3}] ({:.3}km)",
            from[0], from[1], to[0], to[1], km
        );
    }
    for (name, from, to, km) in &exempted {
        if let Some(exemption) = CITY_SNAP_EXEMPTIONS.iter().find(|e| e.name == *name) {
            eprintln!(
                "city-snap exempted: {name}: nearest margin-safe [{:.3},{:.3}] is {:.3}km from [{:.3},{:.3}] ({})",
                to[0], to[1], km, from[0], from[1], exemption.reason
            );
        } else {
            eprintln!(
                "city-snap exempted pre-prune: {name}: nearest margin-safe [{:.3},{:.3}] is {:.3}km from [{:.3},{:.3}]",
                to[0], to[1], km, from[0], from[1]
            );
        }
    }
    out
}

fn snap_edge_endpoints(edges: &mut [EdgeJson], city_positions: &BTreeMap<u32, [f64; 2]>) {
    for e in edges {
        if let Some(&p) = city_positions.get(&e.a) {
            e.via[0] = p;
        }
        if let Some(&p) = city_positions.get(&e.b) {
            *e.via.last_mut().unwrap() = p;
        }
    }
}
