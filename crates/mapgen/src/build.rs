//! Graph construction: ORBIS sites/routes + Natural Earth features → campaign map JSON.

use crate::gazetteer::CITY_SNAP_EXEMPTIONS;
use crate::geo::{
    dist, point_along, point_in_poly, point_segment_dist, polyline_len, BBox, SegGrid,
};
use crate::raster::Raster;
use crate::sources::{OrbisRoute, OrbisSite, Poly, RouteKind};
use contract::mapjson::{AmbushSpot, Edge, Map, Node, TILE_KM};
use std::collections::{BTreeMap, BTreeSet};

pub const SIMPLIFY_TOL_KM: f64 = 1.0;
/// Forest patches: deterministic hash over this cell size, below the threshold.
const FOREST_CELL_KM: f64 = 40.0;
const FOREST_FRAC: u64 = 22; // percent
pub const CITY_SNAP_MARGIN_CELLS: usize = 1;
pub const MAX_CITY_SNAP_MOVE_KM: f64 = 6.0;
const CITY_SNAP_SEARCH_KM: f64 = 80.0;

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
    let (mut imax, mut dmax) = (0, 0.0);
    for i in 1..pts.len() - 1 {
        let d = point_segment_dist(pts[i], pts[0], pts[pts.len() - 1]);
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
) -> (Vec<String>, Vec<AmbushSpot>) {
    let len = polyline_len(via);
    let ntiles = ((len / TILE_KM).round() as usize).max(1);
    let step = len / ntiles as f64;
    let mut tiles = Vec::with_capacity(ntiles);
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
            ambush_spots.push(AmbushSpot {
                edge: eidx,
                tile: k as u16,
                side: None,
            });
        }
        tiles.push(t.to_string());
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

pub fn build(input: BuildInput<'_>) -> Map {
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
    let mut edges: Vec<Edge> = Vec::new();
    let mut ambush_spots: Vec<AmbushSpot> = Vec::new();

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
        edges.push(Edge {
            a: r.a,
            b: r.b,
            kind: kind.to_string(),
            via,
            tiles,
            reconnect: false,
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

    let removed_junctions = crate::graph::stub_junctions(
        edges.iter().flat_map(|edge| [edge.a, edge.b]),
        &is_city,
        edges
            .iter()
            .map(|edge| (edge.a, edge.b, edge.kind == "sea")),
    );
    remove_nodes_and_remap_ambush(&mut edges, &mut ambush_spots, &removed_junctions);
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

    let mut nodes: Vec<Node> = Vec::new();
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
        nodes.push(Node {
            id: s.id,
            name: s.label.clone(),
            pos: city_positions.get(&s.id).copied().unwrap_or(s.pos),
            src_pos: Some(s.pos),
            kind: if is_city { "city" } else { "junction" }.to_string(),
            tier,
            port: ports.contains(&s.id),
            owner,
            reconnected: false,
        });
    }
    for label in owner_of.keys() {
        if !resolved.contains(label.as_str()) {
            panic!("override city not found in ORBIS sites: {label}");
        }
    }

    Map {
        half_w,
        half_h,
        attribution: "Road/sea network: ORBIS (Stanford, via github.com/emeeks/orbis_v2, MIT). \
                      Coastlines/rivers/terrain: Natural Earth (public domain)."
            .into(),
        nodes,
        edges,
        ambush_spots,
        factions: serde_json::from_value(overrides["factions"].clone()).unwrap(),
        start_armies: serde_json::from_value(overrides["start_armies"].clone()).unwrap(),
    }
}

fn port_sites(edges: &[Edge]) -> BTreeSet<u32> {
    edges
        .iter()
        .filter(|e| e.kind == "sea")
        .flat_map(|e| [e.a, e.b])
        .collect()
}

fn remove_nodes_and_remap_ambush(
    edges: &mut Vec<Edge>,
    ambush_spots: &mut Vec<AmbushSpot>,
    removed: &BTreeSet<u32>,
) {
    let mut edge_remap = vec![usize::MAX; edges.len()];
    let mut retained = Vec::new();
    for (i, e) in edges.drain(..).enumerate() {
        if !removed.contains(&e.a) && !removed.contains(&e.b) {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn road_stub_prune_preserves_sea_lane_junctions() {
        let mut edges = vec![
            Edge {
                a: 1,
                b: 2,
                kind: "road".to_string(),
                via: vec![[0.0, 0.0], [1.0, 0.0]],
                tiles: vec!["open".to_string()],
                reconnect: false,
            },
            Edge {
                a: 2,
                b: 3,
                kind: "sea".to_string(),
                via: vec![[1.0, 0.0], [2.0, 0.0]],
                tiles: vec!["sea".to_string()],
                reconnect: false,
            },
        ];
        let mut ambush_spots = vec![AmbushSpot {
            edge: 0,
            tile: 0,
            side: None,
        }];
        let city_sites = BTreeSet::from([1, 3]);

        let removed = crate::graph::stub_junctions(
            edges.iter().flat_map(|edge| [edge.a, edge.b]),
            &city_sites,
            edges
                .iter()
                .map(|edge| (edge.a, edge.b, edge.kind == "sea")),
        );
        remove_nodes_and_remap_ambush(&mut edges, &mut ambush_spots, &removed);

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

fn snap_edge_endpoints(edges: &mut [Edge], city_positions: &BTreeMap<u32, [f64; 2]>) {
    for e in edges {
        if let Some(&p) = city_positions.get(&e.a) {
            e.via[0] = p;
        }
        if let Some(&p) = city_positions.get(&e.b) {
            *e.via.last_mut().unwrap() = p;
        }
    }
}
