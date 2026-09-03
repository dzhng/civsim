// ---- Debraid: corridor-duplicate road removal ---------------------------
// The city prune rewires a pruned town's edges onto survivors keeping their
// old polylines, so a long bypass edge can shadow the surviving local legs
// through the same corridor — two roads a couple of km apart braiding across
// the map (Cosa–Pisae ran a mean 1.6 km beside Populonium–Pisae). A road
// pair is braided when most of the shorter edge runs within BRAID_NEAR_KM of
// the longer one; the longer (bypass) edge is dropped when the graph stays
// connected without it, so the debraid can never change which cities reach
// Rome.

/// Braided pairs the debraid may leave standing, pinned by the invariants
/// gate: both members are load-bearing. The Deultum pair is a genuine
/// Y-merge — Constantinopolis--Deultum is ferry-ledgered (undroppable) and
/// the shared approach is Apollonia Pontica's only route in.
pub const BRAID_LEDGER: &[((&str, &str), (&str, &str))] = &[(
    ("Constantinopolis", "Deultum"),
    ("Apollonia Pontica", "Deultum"),
)];

/// Two roads this close read as one braided road at map zooms.
const BRAID_NEAR_KM: f64 = 3.0;
/// Fraction of the shorter edge that must hug the longer one.
const BRAID_OVERLAP_FRAC: f64 = 0.6;
/// Ignore short shared approaches into a town: only corridors this long braid.
const BRAID_MIN_OVERLAP_KM: f64 = 24.0;
const BRAID_SAMPLE_KM: f64 = 2.0;

pub struct BraidedPair {
    /// Indices into map.edges; `longer` is the drop candidate.
    pub longer: usize,
    pub shorter: usize,
    pub overlap_km: f64,
}

/// All braided road-edge pairs in the map, most-overlapping first (ties broken
/// by edge indices — deterministic).
pub fn braided_road_pairs(map: &Value) -> Vec<BraidedPair> {
    struct Road {
        idx: usize,
        via: Vec<[f64; 2]>,
        samples: Vec<[f64; 2]>,
        len: f64,
        bbox: [f64; 4],
    }
    let roads: Vec<Road> = map["edges"]
        .as_array()
        .expect("edges array")
        .iter()
        .enumerate()
        .filter(|(_, edge)| edge["kind"].as_str() == Some("road"))
        .map(|(idx, edge)| {
            let via = crate::map_io::via(&edge["via"]);
            let samples = densify_polyline(&via, BRAID_SAMPLE_KM);
            let len = polyline_len(&via);
            let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
            for p in &via {
                x0 = x0.min(p[0]);
                y0 = y0.min(p[1]);
                x1 = x1.max(p[0]);
                y1 = y1.max(p[1]);
            }
            Road {
                idx,
                via,
                samples,
                len,
                bbox: [x0, y0, x1, y1],
            }
        })
        .collect();

    let mut pairs = Vec::new();
    for i in 0..roads.len() {
        for j in (i + 1)..roads.len() {
            let (short, long) = if roads[i].len <= roads[j].len {
                (&roads[i], &roads[j])
            } else {
                (&roads[j], &roads[i])
            };
            if short.len < BRAID_MIN_OVERLAP_KM {
                continue;
            }
            let (a, b) = (&short.bbox, &long.bbox);
            if a[0] > b[2] + BRAID_NEAR_KM
                || b[0] > a[2] + BRAID_NEAR_KM
                || a[1] > b[3] + BRAID_NEAR_KM
                || b[1] > a[3] + BRAID_NEAR_KM
            {
                continue;
            }
            let close = short
                .samples
                .iter()
                .filter(|&&p| point_polyline_dist(p, &long.via) < BRAID_NEAR_KM)
                .count();
            let frac = close as f64 / short.samples.len() as f64;
            let overlap_km = frac * short.len;
            if frac >= BRAID_OVERLAP_FRAC && overlap_km >= BRAID_MIN_OVERLAP_KM {
                pairs.push(BraidedPair {
                    longer: long.idx,
                    shorter: short.idx,
                    overlap_km,
                });
            }
        }
    }
    pairs.sort_by(|p, q| {
        q.overlap_km
            .total_cmp(&p.overlap_km)
            .then(p.longer.cmp(&q.longer))
            .then(p.shorter.cmp(&q.shorter))
    });
    pairs
}

fn point_polyline_dist(p: [f64; 2], via: &[[f64; 2]]) -> f64 {
    via.windows(2)
        .map(|w| point_segment_dist(p, w[0], w[1]))
        .fold(f64::MAX, f64::min)
}

/// True when dropping edge `skip` keeps every CITY pair as connected as it
/// was — stranding a junction is fine (the stub cascade removes it), splitting
/// cities apart is not.
fn drop_preserves_city_partition(map: &Value, skip: usize) -> bool {
    crate::landmass::city_partition(map, Some(skip)) == crate::landmass::city_partition(map, None)
}

pub struct DebraidReport {
    pub dropped: Vec<String>,
    pub kept_braids: Vec<String>,
}

/// Remove braided road edges from the committed map via `debraid_map` and
/// write it back, reporting what was dropped and what load-bearing braids
/// survive.
pub fn debraid_committed_roads(out_dir: &str) {
    let path = format!("{out_dir}/campaign-map.json");
    let mut map = crate::map_io::load_committed_map(out_dir);
    let report = debraid_map(&mut map);
    std::fs::write(&path, serde_json::to_string(&map).unwrap()).unwrap();
    eprintln!(
        "debraid: dropped {} corridor-duplicate roads{}{}",
        report.dropped.len(),
        if report.dropped.is_empty() {
            String::new()
        } else {
            format!(" -> {}", report.dropped.join("; "))
        },
        if report.kept_braids.is_empty() {
            String::new()
        } else {
            format!("; kept (load-bearing): {}", report.kept_braids.join("; "))
        },
    );
}

/// Remove braided road edges, keeping every city exactly as connected as it
/// was: a drop must preserve the city partition and spare the ferry ledger
/// (the invariants test requires each ROAD_FERRY_CROSSINGS pair to exist).
/// Pairs neither of whose members can go are reported as kept. Stub junctions
/// the drops strand are cascaded away and ambush spots remapped.
pub fn debraid_map(map: &mut Value) -> DebraidReport {
    let before = crate::landmass::city_partition(map, None);
    crate::descope::tag_edge_original_indices(map);

    // Node ids/names are stable until the post-search stub cascade.
    let nodes = crate::map_io::nodes(map);
    let edge_names = move |map: &Value, idx: usize| -> (String, String) {
        let edge = &map["edges"].as_array().expect("edges array")[idx];
        let a = edge["a"].as_u64().expect("edge a") as u32;
        let b = edge["b"].as_u64().expect("edge b") as u32;
        (nodes[&a].name.clone(), nodes[&b].name.clone())
    };
    let is_ferry = |map: &Value, idx: usize| -> bool {
        let (a, b) = edge_names(map, idx);
        let edge = &map["edges"].as_array().expect("edges array")[idx];
        let ids = (
            edge["a"].as_u64().expect("edge a") as u32,
            edge["b"].as_u64().expect("edge b") as u32,
        );
        ferry_pair_allowed(ids, crate::map_io::ordered_pair(&a, &b))
    };

    // Best-fixpoint search: drop until no braided pair has a droppable member
    // (drops must preserve the city partition and spare the ferry ledger),
    // exploring drop ORDERS because a bypass CHAIN (split across junctions)
    // braids leg-by-leg and the drops must all land on the same side of the
    // corridor — a greedy order can wedge, leaving every remaining member of
    // the cluster a bridge. Branch on the first pair with a droppable member
    // (bypass-longer first), restore on the way back, and keep the fixpoint
    // with the fewest surviving braids; ties break toward the first-found
    // (greedy-preferred) order, so the result is deterministic.
    struct Best {
        remaining: usize,
        dropped: Vec<(u64, String)>,
    }
    let edge_oi = |map: &Value, idx: usize| -> u64 {
        map["edges"].as_array().expect("edges array")[idx]["_oi"]
            .as_u64()
            .expect("edge original index")
    };
    fn search(
        map: &mut Value,
        is_ferry: &dyn Fn(&Value, usize) -> bool,
        edge_names: &dyn Fn(&Value, usize) -> (String, String),
        edge_oi: &dyn Fn(&Value, usize) -> u64,
        dropped: &mut Vec<(u64, String)>,
        best: &mut Best,
        budget: &mut u32,
    ) {
        if *budget == 0 {
            return;
        }
        *budget -= 1;
        let pairs = braided_road_pairs(map);
        let mut branched = false;
        for pair in &pairs {
            for &candidate in &[pair.longer, pair.shorter] {
                if is_ferry(map, candidate) || !drop_preserves_city_partition(map, candidate) {
                    continue;
                }
                branched = true;
                let (a, b) = edge_names(map, candidate);
                let oi = edge_oi(map, candidate);
                let removed_edge = map["edges"]
                    .as_array_mut()
                    .expect("edges array")
                    .remove(candidate);
                dropped.push((oi, format!("{a}--{b} ({:.0}km corridor)", pair.overlap_km)));
                search(map, is_ferry, edge_names, edge_oi, dropped, best, budget);
                dropped.pop();
                map["edges"]
                    .as_array_mut()
                    .expect("edges array")
                    .insert(candidate, removed_edge);
                if best.remaining == 0 {
                    return; // can't beat a braid-free fixpoint
                }
            }
            if branched {
                return;
            }
        }
        // Fixpoint: nothing droppable remains.
        if pairs.len() < best.remaining {
            *best = Best {
                remaining: pairs.len(),
                dropped: dropped.clone(),
            };
        }
    }

    let mut best = Best {
        remaining: usize::MAX,
        dropped: Vec::new(),
    };
    // Far above any real cluster's search tree (branching ≤ 2 per braid); a
    // blowup means the corridors are pathological and a human should look.
    let mut budget = 5_000u32;
    search(
        map,
        &is_ferry,
        &edge_names,
        &edge_oi,
        &mut Vec::new(),
        &mut best,
        &mut budget,
    );

    // Replay the winning drops on the real map, identified by the `_oi` tag
    // (endpoint names can repeat — the Mediolanum braid is two Mediolanum--x
    // edges).
    let drop_ois: BTreeSet<u64> = best.dropped.iter().map(|(oi, _)| *oi).collect();
    map["edges"]
        .as_array_mut()
        .expect("edges array")
        .retain(|edge| !drop_ois.contains(&edge["_oi"].as_u64().expect("edge original index")));
    let dropped: Vec<String> = best.dropped.into_iter().map(|(_, label)| label).collect();
    let mut kept_braids: Vec<String> = Vec::new();
    for pair in braided_road_pairs(map) {
        let (la, lb) = edge_names(map, pair.longer);
        let (sa, sb) = edge_names(map, pair.shorter);
        let ledgered = BRAID_LEDGER.iter().any(|&(p, q)| {
            let (p, q) = (
                crate::map_io::ordered_pair(p.0, p.1),
                crate::map_io::ordered_pair(q.0, q.1),
            );
            let (l, s) = (
                crate::map_io::ordered_pair(&la, &lb),
                crate::map_io::ordered_pair(&sa, &sb),
            );
            (l == p && s == q) || (l == q && s == p)
        });
        kept_braids.push(format!(
            "{la}--{lb} || {sa}--{sb} ({})",
            if ledgered {
                "load-bearing, ledgered"
            } else {
                "load-bearing, UNLEDGERED — the invariants gate will fail"
            }
        ));
    }

    crate::descope::prune_stub_junctions(map);
    crate::descope::remap_ambush_spots_by_original_index(map);

    let after = crate::landmass::city_partition(map, None);
    assert_eq!(
        before, after,
        "debraid must not change which cities connect to which"
    );
    DebraidReport {
        dropped,
        kept_braids,
    }
}
use crate::geo::{point_segment_dist, polyline_len};
use crate::road_measure::{densify_polyline, ferry_pair_allowed};
use serde_json::Value;
use std::collections::BTreeSet;
