//! Graph construction: ORBIS sites/routes + Natural Earth features → campaign map JSON.

use crate::geo::{dist, point_along, point_in_poly, polyline_len, BBox, SegGrid};
use crate::sources::{OrbisRoute, OrbisSite, Poly, RouteKind};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

pub const TILE_KM: f64 = 5.0;
const SIMPLIFY_TOL_KM: f64 = 1.0;
/// Forest patches: deterministic hash over this cell size, below the threshold.
const FOREST_CELL_KM: f64 = 40.0;
const FOREST_FRAC: u64 = 22; // percent

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
fn simplify(pts: &[[f64; 2]], tol: f64) -> Vec<[f64; 2]> {
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

pub struct BuildInput {
    pub sites: BTreeMap<u32, OrbisSite>,
    pub routes: Vec<OrbisRoute>,
    pub mountains: Vec<Poly>,
    pub rivers: Vec<Vec<[f64; 2]>>,
    pub overrides: serde_json::Value,
}

pub fn build(input: BuildInput) -> MapJson {
    let BuildInput { sites, routes, mountains, rivers, overrides } = input;

    // World extent from sites.
    let bb = BBox::of(sites.values().map(|s| s.pos)).pad(150.0);
    let half_w = bb.max[0].abs().max(bb.min[0].abs());
    let half_h = bb.max[1].abs().max(bb.min[1].abs());

    // River segments into a query grid (for bridge detection).
    let mut river_grid = SegGrid::new(bb.pad(100.0), 50.0);
    for line in &rivers {
        for w in line.windows(2) {
            if bb.contains(w[0]) || bb.contains(w[1]) {
                river_grid.insert(w[0], w[1]);
            }
        }
    }

    // Dedupe routes: upstream/downstream are the same river twice; keep one per
    // (pair, kind). Parallel road+sea between the same pair both survive.
    let mut seen: BTreeSet<(u32, u32, u8)> = BTreeSet::new();
    let mut edges: Vec<EdgeJson> = Vec::new();
    let mut ambush_spots: Vec<AmbushJson> = Vec::new();
    let mut ports: BTreeSet<u32> = BTreeSet::new();

    for r in &routes {
        let key = (r.a.min(r.b), r.a.max(r.b), matches!(r.kind, RouteKind::Sea) as u8);
        if !seen.insert(key) {
            continue;
        }
        if r.kind == RouteKind::Sea {
            ports.insert(r.a);
            ports.insert(r.b);
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

        let len = polyline_len(&via);
        let ntiles = ((len / TILE_KM).round() as usize).max(1);
        let step = len / ntiles as f64;
        let eidx = edges.len();
        let mut tiles: Vec<&'static str> = Vec::with_capacity(ntiles);
        for k in 0..ntiles {
            let mid = point_along(&via, (k as f64 + 0.5) * step);
            let t = if matches!(r.kind, RouteKind::Sea) {
                "sea"
            } else if river_grid.crosses(point_along(&via, k as f64 * step), point_along(&via, (k + 1) as f64 * step)) {
                "bridge"
            } else if mountains.iter().any(|m| m.bbox.contains(mid) && point_in_poly(mid, &m.rings)) {
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
                    side: if hash(eidx as u64, k as u64 + 7) % 2 == 0 { -1 } else { 1 },
                });
            }
            tiles.push(t);
        }
        edges.push(EdgeJson {
            a: r.a,
            b: r.b,
            kind: if matches!(r.kind, RouteKind::Sea) { "sea" } else { "road" },
            via,
            tiles,
        });
    }

    // Drop sites with no surviving edges (isolated points render as noise).
    let connected: BTreeSet<u32> = edges.iter().flat_map(|e| [e.a, e.b]).collect();

    let mut tier_override: BTreeMap<String, u8> = BTreeMap::new();
    for (label, t) in overrides["tier_overrides"].as_object().expect("tier_overrides") {
        tier_override.insert(label.clone(), t.as_u64().unwrap() as u8);
    }
    let base_tier = |s: &OrbisSite| -> u8 {
        tier_override.get(&s.label).copied().unwrap_or(match s.rank {
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
        .filter(|s| connected.contains(&s.id))
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

    // Forced seeds: capital + named cities + every army-start city.
    let mut owner_site: BTreeMap<u32, usize> = BTreeMap::new();
    for (fi, f) in factions_arr.iter().enumerate() {
        if f["id"].as_str() == Some("independents") {
            continue;
        }
        let mut labels: Vec<&str> = Vec::new();
        if let Some(cap) = f["capital"].as_str() {
            labels.push(cap);
        }
        if let Some(cs) = f["cities"].as_array() {
            labels.extend(cs.iter().filter_map(|c| c.as_str()));
        }
        for l in labels {
            owner_site.insert(resolve(l), fi);
        }
    }
    for s in overrides["start_armies"].as_array().unwrap() {
        if let Some(&fi) = s["faction"].as_str().and_then(|id| fac_index.get(id)) {
            owner_site.insert(resolve(s["at"].as_str().unwrap()), fi);
        }
    }

    // Cities by ORBIS rank, plus every forced seed (a seed is always a city).
    let mut is_city: BTreeSet<u32> = sites
        .values()
        .filter(|s| connected.contains(&s.id) && base_tier(s) > 0)
        .map(|s| s.id)
        .collect();
    is_city.extend(owner_site.keys().copied());

    // Site adjacency over all surviving edges (junctions are transit, not claims).
    let mut adj: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
    for e in &edges {
        adj.entry(e.a).or_default().push(e.b);
        adj.entry(e.b).or_default().push(e.a);
    }
    for v in adj.values_mut() {
        v.sort_unstable();
        v.dedup();
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

    let id_to_label: BTreeMap<u32, &str> =
        sites.values().map(|s| (s.id, s.label.as_str())).collect();
    let mut owner_of: BTreeMap<String, String> = BTreeMap::new();
    for (&site, &fi) in &owner_site {
        let fid = factions_arr[fi]["id"].as_str().unwrap().to_string();
        owner_of.insert(id_to_label[&site].to_string(), fid);
    }

    let mut nodes: Vec<NodeJson> = Vec::new();
    let mut resolved: BTreeSet<&str> = BTreeSet::new();
    for s in sites.values().filter(|s| connected.contains(&s.id)) {
        let mut tier = tier_override.get(&s.label).copied().unwrap_or(match s.rank {
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
            owner_of.get(&s.label).cloned().unwrap_or_else(|| "independents".into())
        } else {
            String::new()
        };
        nodes.push(NodeJson {
            id: s.id,
            name: s.label.clone(),
            pos: s.pos,
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
