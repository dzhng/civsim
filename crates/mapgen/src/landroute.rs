use crate::build;
use crate::geo::{dist, point_along, polyline_len, BBox};
use crate::raster::Raster;
use crate::sources;
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, BinaryHeap};

/// Raw road polylines may dip into painted water for at most this long; the
/// bake reroutes anything longer around the coast (or demands a ferry entry).
pub const ROAD_WATER_RUN_MAX_KM: f64 = 3.0;
/// The renderer draws roads through its smoothed, 0.9 km-resampled centerline
/// and bridges water dips up to this length; only dips beyond it split the
/// drawn ribbon. TWIN: ROAD_WATER_BRIDGE_KM in
/// packages/game-renderer/src/campaign/mapPass.ts — change both together.
pub const ROAD_SMOOTHED_BRIDGE_KM: f64 = 4.5;
const SAMPLE_KM: f64 = 1.0;
const MAX_EXPANDED_CELLS: usize = 300_000;

/// Genuine strait/gulf crossings: road edges allowed to keep a painted-water
/// run the reroute cannot fix (no land path at raster resolution). The drawn
/// ribbon stops at each shore; the crossing itself is implied.
pub const ROAD_FERRY_CROSSINGS: &[(&str, &str)] = &[
    ("Constantinopolis", "Deultum"),
    ("Constantinopolis", "Perinthus"),
    ("Delphi", "Patrae"),
    ("Forum Iulii", "Genua"),
    ("Nicopolis", "Patrae"),
    // Tagus estuary at Olisipo: the south-bank land path exceeds the detour
    // cap, so both roads keep their short (~4.5 km) mouth crossing.
    ("Olisipo", "Pax Iulia"),
    ("Olisipo", "x"),
];

#[derive(Clone)]
struct NodeInfo {
    name: String,
    pos: [f64; 2],
}

#[derive(Clone)]
struct Sample {
    d: f64,
    p: [f64; 2],
    land: bool,
}

#[derive(Clone, Debug)]
pub struct WaterRun {
    start: usize,
    end: usize,
    pub km: f64,
}

#[derive(Debug)]
struct RerouteResult {
    via: Vec<[f64; 2]>,
    changed: bool,
    added_km: f64,
}

pub fn make_committed_roads_land_safe(
    out_dir: &str,
    raster: &Raster,
    rivers: &[Vec<[f64; 2]>],
    mountains: &[sources::Poly],
    bb: BBox,
) {
    let path = format!("{out_dir}/campaign-map.json");
    let mut map: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("campaign-map.json"))
            .expect("campaign-map json");

    let mut nodes = read_nodes(&map);
    let road_degree = road_degrees(&map);
    let mut junction_snaps = Vec::new();

    {
        let node_values = map["nodes"].as_array_mut().expect("nodes array");
        for node in node_values {
            let id = node["id"].as_u64().expect("node id") as u32;
            if node["kind"].as_str() != Some("junction")
                || road_degree.get(&id).copied().unwrap_or(0) == 0
            {
                continue;
            }
            let pos = point_from_value(&node["pos"]);
            if land_at(raster, pos) {
                continue;
            }
            let snapped = raster
                .nearest_land_neighborhood_center(pos, 40.0, 0)
                .unwrap_or_else(|| panic!("road junction {id} has no land cell within 40km"));
            node["pos"] = point_value(snapped);
            if let Some(info) = nodes.get_mut(&id) {
                info.pos = snapped;
            }
            junction_snaps.push((id, dist(pos, snapped)));
        }
    }

    if !junction_snaps.is_empty() {
        let edges = map["edges"].as_array_mut().expect("edges array");
        for edge in edges {
            let a = edge["a"].as_u64().expect("edge a") as u32;
            let b = edge["b"].as_u64().expect("edge b") as u32;
            let via = edge["via"].as_array_mut().expect("edge via");
            if let Some((_, pos)) = junction_snaps
                .iter()
                .find(|(id, _)| *id == a)
                .and_then(|(id, _)| nodes.get(id).map(|n| (*id, n.pos)))
            {
                via[0] = point_value(pos);
            }
            if let Some((_, pos)) = junction_snaps
                .iter()
                .find(|(id, _)| *id == b)
                .and_then(|(id, _)| nodes.get(id).map(|n| (*id, n.pos)))
            {
                let last = via.len() - 1;
                via[last] = point_value(pos);
            }
        }
    }

    let river_grid = build::build_river_grid(bb, rivers);
    let mut changed_road_edges = BTreeSet::new();
    let mut rerouted = 0usize;
    let mut total_added_km = 0.0;
    let mut ferry_kept = Vec::new();
    let mut violations = Vec::new();

    {
        let edges = map["edges"].as_array_mut().expect("edges array");
        for (eidx, edge) in edges.iter_mut().enumerate() {
            if edge["kind"].as_str() != Some("road") {
                continue;
            }
            let original = via_from_value(&edge["via"]);
            let a = edge["a"].as_u64().expect("edge a") as u32;
            let b = edge["b"].as_u64().expect("edge b") as u32;
            let pair = ordered_pair(&nodes[&a].name, &nodes[&b].name);
            let result = reroute_road_via(&original, raster);
            if result.changed {
                edge["via"] = via_value(&result.via);
                changed_road_edges.insert(eidx);
                rerouted += 1;
                total_added_km += result.added_km;
            }
            let current = if result.changed {
                result.via.as_slice()
            } else {
                original.as_slice()
            };
            let raw = longest_water_run(current, raster);
            let smoothed = renderer_smoothed_longest_water_run(current, raster);
            if raw > ROAD_WATER_RUN_MAX_KM || smoothed > ROAD_SMOOTHED_BRIDGE_KM {
                let longest = f64::max(raw, smoothed);
                if ferry_pair_allowed(pair) {
                    ferry_kept.push((pair.0.to_string(), pair.1.to_string(), longest));
                } else {
                    violations.push((pair.0.to_string(), pair.1.to_string(), longest));
                }
            }
        }
    }

    if !violations.is_empty() {
        let detail = violations
            .iter()
            .map(|(a, b, km)| format!("{a}--{b} {km:.1}km"))
            .collect::<Vec<_>>()
            .join(", ");
        panic!("road water runs need ferry ledger entries or routing fixes: {detail}");
    }

    if !changed_road_edges.is_empty() {
        let edges = map["edges"].as_array_mut().expect("edges array");
        for &eidx in &changed_road_edges {
            let via = via_from_value(&edges[eidx]["via"]);
            let (tiles, _) =
                build::classify_route_tiles(&via, "road", eidx, &river_grid, mountains);
            edges[eidx]["tiles"] = Value::Array(
                tiles
                    .iter()
                    .map(|t| Value::String((*t).to_string()))
                    .collect(),
            );
        }

        let mut new_spots = Vec::new();
        for &eidx in &changed_road_edges {
            let via = via_from_value(&map["edges"][eidx]["via"]);
            let (_, spots) =
                build::classify_route_tiles(&via, "road", eidx, &river_grid, mountains);
            for spot in spots {
                new_spots.push(serde_json::json!({
                    "edge": spot.edge,
                    "tile": spot.tile
                }));
            }
        }

        let changed = changed_road_edges.clone();
        let ambush = map["ambush_spots"]
            .as_array_mut()
            .expect("ambush_spots array");
        ambush.retain(|spot| {
            let edge = spot["edge"].as_u64().expect("ambush edge") as usize;
            !changed.contains(&edge)
        });
        ambush.extend(new_spots);
    }

    std::fs::write(&path, serde_json::to_string(&map).unwrap()).unwrap();

    eprintln!(
        "landroute: junctions snapped {}{}",
        junction_snaps.len(),
        format_junction_snaps(&junction_snaps)
    );
    eprintln!("landroute: road edges rerouted {rerouted}, total added {total_added_km:.1}km");
    eprintln!(
        "landroute: ferry edges kept {}{}",
        ferry_kept.len(),
        format_ferries(&ferry_kept)
    );
}

pub fn water_runs(via: &[[f64; 2]], raster: &Raster) -> Vec<WaterRun> {
    let samples = sample_polyline(via, raster);
    water_runs_from_samples(&samples)
}

fn reroute_road_via(via: &[[f64; 2]], raster: &Raster) -> RerouteResult {
    let original_len = polyline_len(via);
    let samples = sample_polyline(via, raster);
    let mut runs = water_runs_from_samples(&samples)
        .into_iter()
        .filter(|run| run.km > ROAD_WATER_RUN_MAX_KM && run.start > 0 && run.end < samples.len())
        .collect::<Vec<_>>();
    if runs.is_empty() {
        if renderer_smoothed_longest_water_run(via, raster) > ROAD_SMOOTHED_BRIDGE_KM {
            // The raw polyline is within tolerance, but the renderer's smoothing
            // would swing it into water past the bridgeable dip. Densifying pins
            // the smoothed centerline to the raw geometry; failing that, reroute.
            let dense = densify_polyline(via, SAMPLE_KM);
            if renderer_smoothed_longest_water_run(&dense, raster) <= ROAD_SMOOTHED_BRIDGE_KM {
                return RerouteResult {
                    via: dense,
                    changed: true,
                    added_km: 0.0,
                };
            }
            runs = water_runs_from_samples(&samples)
                .into_iter()
                .filter(|run| {
                    run.km >= ROAD_WATER_RUN_MAX_KM && run.start > 0 && run.end < samples.len()
                })
                .collect();
            if !runs.is_empty() {
                // Continue into A*: this edge is within the raw tolerance, but
                // renderer smoothing would turn the tolerated dip into a split.
            } else {
                return RerouteResult {
                    via: via.to_vec(),
                    changed: false,
                    added_km: 0.0,
                };
            }
        } else {
            return RerouteResult {
                via: via.to_vec(),
                changed: false,
                added_km: 0.0,
            };
        }
    }

    let mut out = Vec::new();
    let mut cursor_d = 0.0;
    let mut changed = false;
    for run in runs {
        let anchor_a = &samples[run.start - 1];
        let anchor_b = &samples[run.end];
        let gap = dist(anchor_a.p, anchor_b.p);
        let path = if run.km > ROAD_WATER_RUN_MAX_KM {
            astar_land_path(raster, anchor_a.p, anchor_b.p, gap, 0)
        } else {
            astar_land_path(raster, anchor_a.p, anchor_b.p, gap, 1)
                .or_else(|| astar_land_path(raster, anchor_a.p, anchor_b.p, gap, 0))
        };
        let Some(path) = path else {
            continue;
        };
        append_original_span(&mut out, via, cursor_d, anchor_a.d);
        push_unique(&mut out, anchor_a.p);
        for p in path {
            push_unique(&mut out, p);
        }
        push_unique(&mut out, anchor_b.p);
        cursor_d = anchor_b.d;
        changed = true;
    }
    if !changed {
        return RerouteResult {
            via: via.to_vec(),
            changed: false,
            added_km: 0.0,
        };
    }
    append_original_span(&mut out, via, cursor_d, original_len);
    if let Some(first) = out.first_mut() {
        *first = via[0];
    }
    if let Some(last) = out.last_mut() {
        *last = *via.last().unwrap();
    }

    let mut simplified = build::simplify(&out, build::SIMPLIFY_TOL_KM);
    if let Some(first) = simplified.first_mut() {
        *first = via[0];
    }
    if let Some(last) = simplified.last_mut() {
        *last = *via.last().unwrap();
    }
    let final_via = if longest_water_run(&simplified, raster) > ROAD_WATER_RUN_MAX_KM
        || renderer_smoothed_longest_water_run(&simplified, raster) > ROAD_SMOOTHED_BRIDGE_KM
    {
        out
    } else {
        simplified
    };
    let new_len = polyline_len(&final_via);
    RerouteResult {
        via: final_via,
        changed: true,
        added_km: new_len - original_len,
    }
}

pub fn astar_land_path(
    raster: &Raster,
    start: [f64; 2],
    goal: [f64; 2],
    straight_gap: f64,
    margin_cells: usize,
) -> Option<Vec<[f64; 2]>> {
    let [sx, sy] = raster.cell_of(start)?;
    let [gx, gy] = raster.cell_of(goal)?;
    if !raster.is_land_cell(sx, sy) || !raster.is_land_cell(gx, gy) {
        return None;
    }
    let allowed = BBox::of([start, goal].into_iter()).pad(50.0_f64.max(straight_gap * 1.5));
    let start_idx = cell_index(raster, sx, sy);
    let goal_idx = cell_index(raster, gx, gy);
    let mut g_score = vec![f64::INFINITY; raster.w * raster.h];
    let mut parent = vec![usize::MAX; raster.w * raster.h];
    let mut closed = vec![false; raster.w * raster.h];
    let mut heap = BinaryHeap::new();

    g_score[start_idx] = 0.0;
    heap.push(QueueEntry {
        cost_key: cost_key(dist(start, goal)),
        cell: start_idx,
    });
    let mut expanded = 0usize;

    while let Some(entry) = heap.pop() {
        if closed[entry.cell] {
            continue;
        }
        if entry.cell == goal_idx {
            let mut cells = Vec::new();
            let mut cur = goal_idx;
            while cur != start_idx {
                cells.push(cur);
                cur = parent[cur];
            }
            cells.push(start_idx);
            cells.reverse();
            let points = cells
                .into_iter()
                .skip(1)
                .take_while(|&idx| idx != goal_idx)
                .map(|idx| {
                    let (x, y) = index_cell(raster, idx);
                    raster.cell_center(x, y)
                })
                .collect::<Vec<_>>();
            let mut candidate = Vec::with_capacity(points.len() + 2);
            candidate.push(start);
            candidate.extend(points.iter().copied());
            candidate.push(goal);
            if polyline_len(&candidate) > straight_gap * 5.0 + 60.0 {
                return None;
            }
            return Some(points);
        }
        closed[entry.cell] = true;
        expanded += 1;
        if expanded > MAX_EXPANDED_CELLS {
            return None;
        }
        let (x, y) = index_cell(raster, entry.cell);
        let mut neighbours = Vec::with_capacity(8);
        for dy in -1isize..=1 {
            for dx in -1isize..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x as isize + dx;
                let ny = y as isize + dy;
                if nx < 0 || ny < 0 || nx >= raster.w as isize || ny >= raster.h as isize {
                    continue;
                }
                let nx = nx as usize;
                let ny = ny as usize;
                let np = raster.cell_center(nx, ny);
                let nb = cell_index(raster, nx, ny);
                let land_safe = if margin_cells == 0 || nb == goal_idx {
                    raster.is_land_cell(nx, ny)
                } else {
                    raster.is_land_neighborhood(nx, ny, margin_cells)
                };
                if !allowed.contains(np) || !land_safe {
                    continue;
                }
                let from_p = if entry.cell == start_idx {
                    start
                } else {
                    raster.cell_center(x, y)
                };
                let to_p = if nb == goal_idx {
                    goal
                } else {
                    raster.cell_center(nx, ny)
                };
                if !segment_samples_land(raster, from_p, to_p) {
                    continue;
                }
                neighbours.push(nb);
            }
        }
        neighbours.sort_unstable();
        for nb in neighbours {
            if closed[nb] {
                continue;
            }
            let (nx, ny) = index_cell(raster, nb);
            let p = raster.cell_center(x, y);
            let q = raster.cell_center(nx, ny);
            let tentative = g_score[entry.cell] + dist(p, q);
            if tentative < g_score[nb] {
                parent[nb] = entry.cell;
                g_score[nb] = tentative;
                let h = dist(q, goal);
                heap.push(QueueEntry {
                    cost_key: cost_key(tentative + h),
                    cell: nb,
                });
            }
        }
    }
    None
}

#[derive(Clone, Copy, Eq, PartialEq)]
struct QueueEntry {
    cost_key: u64,
    cell: usize,
}

impl Ord for QueueEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .cost_key
            .cmp(&self.cost_key)
            .then_with(|| other.cell.cmp(&self.cell))
    }
}

impl PartialOrd for QueueEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn cost_key(cost: f64) -> u64 {
    (cost * 1_000_000.0).round() as u64
}

fn cell_index(raster: &Raster, x: usize, y: usize) -> usize {
    y * raster.w + x
}

fn index_cell(raster: &Raster, idx: usize) -> (usize, usize) {
    (idx % raster.w, idx / raster.w)
}

fn sample_polyline(via: &[[f64; 2]], raster: &Raster) -> Vec<Sample> {
    let len = polyline_len(via);
    let mut samples = Vec::new();
    let mut d = 0.0;
    while d < len {
        let p = point_along(via, d);
        samples.push(Sample {
            d,
            p,
            land: land_at(raster, p),
        });
        d += SAMPLE_KM;
    }
    let p = *via.last().unwrap();
    if samples.last().map(|s| dist(s.p, p) > 1e-9).unwrap_or(true) {
        samples.push(Sample {
            d: len,
            p,
            land: land_at(raster, p),
        });
    }
    samples
}

fn segment_samples_land(raster: &Raster, a: [f64; 2], b: [f64; 2]) -> bool {
    let len = dist(a, b);
    let steps = (len / 0.5).ceil().max(1.0) as usize;
    for s in 0..=steps {
        let t = s as f64 / steps as f64;
        let p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if !land_at(raster, p) {
            return false;
        }
    }
    true
}

fn water_runs_from_samples(samples: &[Sample]) -> Vec<WaterRun> {
    let mut runs = Vec::new();
    let mut start = None;
    for i in 0..=samples.len() {
        let water = i < samples.len() && !samples[i].land;
        if water && start.is_none() {
            start = Some(i);
        }
        if !water {
            if let Some(s) = start.take() {
                runs.push(WaterRun {
                    start: s,
                    end: i,
                    km: (i - s) as f64 * SAMPLE_KM,
                });
            }
        }
    }
    runs
}

pub fn longest_water_run(via: &[[f64; 2]], raster: &Raster) -> f64 {
    water_runs(via, raster)
        .iter()
        .map(|run| run.km)
        .fold(0.0, f64::max)
}

/// Longest water run as the renderer will see it: through the smoothed,
/// 0.9 km-resampled centerline, counted in samples. TWIN:
/// smoothRoadCenterline + roadLandRuns in
/// packages/game-renderer/src/campaign/mapPass.ts.
pub fn renderer_smoothed_longest_water_run(via: &[[f64; 2]], raster: &Raster) -> f64 {
    let center = renderer_resample(&smooth_renderer_centerline(via), 0.9);
    let mut longest = 0usize;
    let mut current = 0usize;
    for p in center {
        if land_at(raster, p) {
            longest = longest.max(current);
            current = 0;
        } else {
            current += 1;
        }
    }
    // Count samples, multiply once: an accumulated 0.9-sum drifts a ulp past
    // the exact bridge threshold and misclassifies a bridgeable dip.
    longest.max(current) as f64 * 0.9
}

fn renderer_resample(via: &[[f64; 2]], step: f64) -> Vec<[f64; 2]> {
    let mut out = vec![via[0]];
    for w in via.windows(2) {
        let len = dist(w[0], w[1]);
        let steps = ((len / step).round() as usize).max(1);
        for s in 1..=steps {
            let t = s as f64 / steps as f64;
            out.push([
                w[0][0] + (w[1][0] - w[0][0]) * t,
                w[0][1] + (w[1][1] - w[0][1]) * t,
            ]);
        }
    }
    out
}

fn smooth_renderer_centerline(via: &[[f64; 2]]) -> Vec<[f64; 2]> {
    if via.len() <= 2 {
        return via.to_vec();
    }
    let mut smoothed = Vec::with_capacity(via.len());
    smoothed.push(via[0]);
    for i in 1..via.len() - 1 {
        let prev = via[i - 1];
        let point = via[i];
        let next = via[i + 1];
        smoothed.push([
            point[0] * 0.72 + prev[0] * 0.14 + next[0] * 0.14,
            point[1] * 0.72 + prev[1] * 0.14 + next[1] * 0.14,
        ]);
    }
    smoothed.push(*via.last().unwrap());
    smoothed
}

fn append_original_span(out: &mut Vec<[f64; 2]>, via: &[[f64; 2]], from: f64, to: f64) {
    if to < from {
        return;
    }
    push_unique(out, point_along(via, from));
    let mut d = 0.0;
    for w in via.windows(2) {
        d += dist(w[0], w[1]);
        if d > from + 1e-9 && d < to - 1e-9 {
            push_unique(out, w[1]);
        }
    }
    push_unique(out, point_along(via, to));
}

fn densify_polyline(via: &[[f64; 2]], step: f64) -> Vec<[f64; 2]> {
    let len = polyline_len(via);
    let mut out = Vec::new();
    let mut d = 0.0;
    while d < len {
        push_unique(&mut out, point_along(via, d));
        d += step;
    }
    push_unique(&mut out, *via.last().unwrap());
    out
}

fn push_unique(out: &mut Vec<[f64; 2]>, p: [f64; 2]) {
    if out.last().map(|&q| dist(q, p) < 1e-9).unwrap_or(false) {
        return;
    }
    out.push(p);
}

fn land_at(raster: &Raster, p: [f64; 2]) -> bool {
    let Some([x, y]) = raster.cell_of(p) else {
        return false;
    };
    raster.is_land_cell(x, y)
}

fn read_nodes(map: &Value) -> BTreeMap<u32, NodeInfo> {
    map["nodes"]
        .as_array()
        .expect("nodes array")
        .iter()
        .map(|node| {
            let id = node["id"].as_u64().expect("node id") as u32;
            (
                id,
                NodeInfo {
                    name: node["name"].as_str().expect("node name").to_string(),
                    pos: point_from_value(&node["pos"]),
                },
            )
        })
        .collect()
}

fn road_degrees(map: &Value) -> BTreeMap<u32, usize> {
    let mut degree = BTreeMap::new();
    for edge in map["edges"].as_array().expect("edges array") {
        if edge["kind"].as_str() != Some("road") {
            continue;
        }
        *degree
            .entry(edge["a"].as_u64().expect("edge a") as u32)
            .or_default() += 1;
        *degree
            .entry(edge["b"].as_u64().expect("edge b") as u32)
            .or_default() += 1;
    }
    degree
}

fn point_from_value(v: &Value) -> [f64; 2] {
    let a = v.as_array().expect("point array");
    [
        a[0].as_f64().expect("point x"),
        a[1].as_f64().expect("point y"),
    ]
}

fn via_from_value(v: &Value) -> Vec<[f64; 2]> {
    v.as_array()
        .expect("via array")
        .iter()
        .map(point_from_value)
        .collect()
}

fn point_value(p: [f64; 2]) -> Value {
    serde_json::json!([p[0], p[1]])
}

fn via_value(via: &[[f64; 2]]) -> Value {
    Value::Array(via.iter().map(|&p| point_value(p)).collect())
}

pub fn ordered_pair<'a>(a: &'a str, b: &'a str) -> (&'a str, &'a str) {
    if a <= b {
        (a, b)
    } else {
        (b, a)
    }
}

pub fn ferry_pair_allowed(pair: (&str, &str)) -> bool {
    ROAD_FERRY_CROSSINGS
        .iter()
        .any(|&(a, b)| ordered_pair(a, b) == pair)
}

fn format_junction_snaps(snaps: &[(u32, f64)]) -> String {
    if snaps.is_empty() {
        return String::new();
    }
    let detail = snaps
        .iter()
        .map(|(id, km)| format!(" {id}:{km:.1}km"))
        .collect::<Vec<_>>()
        .join(",");
    format!(" ({detail})")
}

fn format_ferries(ferries: &[(String, String, f64)]) -> String {
    if ferries.is_empty() {
        return String::new();
    }
    let detail = ferries
        .iter()
        .map(|(a, b, km)| format!(" {a}--{b}:{km:.1}km"))
        .collect::<Vec<_>>()
        .join(",");
    format!(" ({detail})")
}

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
pub const BRAID_NEAR_KM: f64 = 3.0;
/// Fraction of the shorter edge that must hug the longer one.
pub const BRAID_OVERLAP_FRAC: f64 = 0.6;
/// Ignore short shared approaches into a town: only corridors this long braid.
pub const BRAID_MIN_OVERLAP_KM: f64 = 24.0;
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
            let via = via_from_value(&edge["via"]);
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

fn point_segment_dist(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    let d = [b[0] - a[0], b[1] - a[1]];
    let len2 = d[0] * d[0] + d[1] * d[1];
    let t = if len2 <= 1e-12 {
        0.0
    } else {
        (((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / len2).clamp(0.0, 1.0)
    };
    dist(p, [a[0] + t * d[0], a[1] + t * d[1]])
}

/// True when dropping edge `skip` keeps every CITY pair as connected as it
/// was — stranding a junction is fine (the stub cascade removes it), splitting
/// cities apart is not.
fn drop_preserves_city_partition(map: &Value, skip: usize) -> bool {
    crate::connectivity::city_partition(map, Some(skip))
        == crate::connectivity::city_partition(map, None)
}

pub struct DebraidReport {
    pub dropped: Vec<String>,
    pub kept_braids: Vec<String>,
}

/// Remove braided road edges from the committed map, connectivity-preserving:
/// per pair the longer (bypass) edge goes first; if that would disconnect its
/// endpoints the shorter is tried; if both are load-bearing the braid stays
/// and is reported. Ferry-ledger edges are never dropped (the invariants test
/// requires each ROAD_FERRY_CROSSINGS pair to exist). Reruns detection after
/// every drop, then cascades stub junctions and remaps ambush spots.
pub fn debraid_committed_roads(out_dir: &str) {
    let path = format!("{out_dir}/campaign-map.json");
    let mut map: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("campaign-map.json"))
            .expect("campaign-map json");
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

pub fn debraid_map(map: &mut Value) -> DebraidReport {
    let before = crate::connectivity::city_partition(map, None);
    crate::connectivity::tag_edge_original_indices(map);

    let edge_names = |map: &Value, idx: usize| -> (String, String) {
        let nodes = read_nodes(map);
        let edge = &map["edges"].as_array().expect("edges array")[idx];
        let a = edge["a"].as_u64().expect("edge a") as u32;
        let b = edge["b"].as_u64().expect("edge b") as u32;
        (nodes[&a].name.clone(), nodes[&b].name.clone())
    };
    let is_ferry = |map: &Value, idx: usize| -> bool {
        let (a, b) = edge_names(map, idx);
        ferry_pair_allowed(ordered_pair(&a, &b))
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
            let (p, q) = (ordered_pair(p.0, p.1), ordered_pair(q.0, q.1));
            let (l, s) = (ordered_pair(&la, &lb), ordered_pair(&sa, &sb));
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

    crate::connectivity::prune_stub_junctions(map);
    crate::connectivity::remap_ambush_spots_by_original_index(map);

    let after = crate::connectivity::city_partition(map, None);
    assert_eq!(
        before, after,
        "debraid must not change which cities connect to which"
    );
    DebraidReport {
        dropped,
        kept_braids,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::raster::RenderMaskClass;

    fn rect_poly(x0: f64, y0: f64, x1: f64, y1: f64) -> sources::Poly {
        let ring = vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
        sources::Poly {
            bbox: BBox::of(ring.iter().copied()),
            rings: vec![ring],
        }
    }

    fn land_raster_with_water(water: sources::Poly) -> Raster {
        let bb = BBox {
            min: [0.0, 0.0],
            max: [60.0, 60.0],
        };
        let mut raster = Raster::new(bb, 1.0);
        raster.fill_poly(
            &rect_poly(0.0, 0.0, 60.0, 60.0),
            RenderMaskClass::Land.rgb(),
        );
        raster.fill_poly(&water, RenderMaskClass::Sea.rgb());
        raster
    }

    #[test]
    fn reroute_bay_notch_but_refuse_full_width_channel() {
        let bay = land_raster_with_water(rect_poly(20.0, 0.0, 40.0, 32.0));
        let via = vec![[5.5, 20.5], [55.5, 20.5]];
        let rerouted = reroute_road_via(&via, &bay);

        assert!(
            rerouted.changed,
            "bay crossing should route around painted water"
        );
        assert_eq!(rerouted.via[0], via[0]);
        assert_eq!(*rerouted.via.last().unwrap(), via[1]);
        assert!(
            water_runs(&rerouted.via, &bay)
                .iter()
                .all(|run| run.km <= ROAD_WATER_RUN_MAX_KM),
            "rerouted bay road still has long water runs: {:?}",
            water_runs(&rerouted.via, &bay)
        );

        let channel = land_raster_with_water(rect_poly(20.0, 0.0, 40.0, 60.0));
        let refused = reroute_road_via(&via, &channel);
        assert!(
            !refused.changed,
            "full-width channel should be treated as a ferry candidate"
        );
        assert_eq!(refused.via, via);
        assert!(
            longest_water_run(&refused.via, &channel) > ROAD_WATER_RUN_MAX_KM,
            "refused channel should still require a ferry ledger entry"
        );
    }

    #[test]
    fn debraid_drops_bypass_edge_and_remaps_ambush_spots() {
        // A--B direct (100km) hugs the two local legs A--C--B: a braid. The
        // bypass must go, the legs stay, and ambush spots follow the edges.
        let mut map = serde_json::json!({
            "nodes": [
                {"id": 1, "name": "A", "kind": "city", "pos": [0.0, 0.0]},
                {"id": 2, "name": "B", "kind": "city", "pos": [100.0, 0.0]},
                {"id": 3, "name": "C", "kind": "city", "pos": [50.0, 2.0]},
            ],
            "edges": [
                {"a": 1, "b": 2, "kind": "road",
                 "via": [[0.0, 0.0], [50.0, 2.0], [100.0, 0.0]]},
                {"a": 1, "b": 3, "kind": "road", "via": [[0.0, 0.0], [50.0, 2.0]]},
                {"a": 3, "b": 2, "kind": "road", "via": [[50.0, 2.0], [100.0, 0.0]]},
            ],
            "ambush_spots": [
                {"edge": 0, "at": [50.0, 1.0]},
                {"edge": 2, "at": [75.0, 1.0]},
            ],
        });

        let report = debraid_map(&mut map);

        assert_eq!(report.dropped.len(), 1, "dropped: {:?}", report.dropped);
        assert!(report.dropped[0].starts_with("A--B"), "{:?}", report.dropped);
        assert!(report.kept_braids.is_empty(), "{:?}", report.kept_braids);
        let edges = map["edges"].as_array().unwrap();
        assert_eq!(edges.len(), 2);
        assert!(braided_road_pairs(&map).is_empty());
        // The A--B spot died with its edge; the C--B spot follows C--B to
        // its new index 1 (value-checked, not just counted).
        let spots = map["ambush_spots"].as_array().unwrap();
        assert_eq!(spots.len(), 1);
        assert_eq!(spots[0]["edge"], 1);
        assert_eq!(spots[0]["at"], serde_json::json!([75.0, 1.0]));
        assert_eq!(edges[1]["a"], 3);
        assert_eq!(edges[1]["b"], 2);
    }

    #[test]
    fn debraid_keeps_both_edges_when_dropping_would_disconnect() {
        // Two cities joined by two parallel 100km roads 2km apart: a braid,
        // but ONE of them may go — the second is load-bearing.
        let mut map = serde_json::json!({
            "nodes": [
                {"id": 1, "name": "A", "kind": "city", "pos": [0.0, 0.0]},
                {"id": 2, "name": "B", "kind": "city", "pos": [100.0, 0.0]},
            ],
            "edges": [
                {"a": 1, "b": 2, "kind": "road",
                 "via": [[0.0, 0.0], [50.0, 2.0], [100.0, 0.0]]},
                {"a": 1, "b": 2, "kind": "road", "via": [[0.0, 0.0], [100.0, 0.0]]},
            ],
            "ambush_spots": [],
        });

        let report = debraid_map(&mut map);

        assert_eq!(report.dropped.len(), 1, "dropped: {:?}", report.dropped);
        assert_eq!(map["edges"].as_array().unwrap().len(), 1);
        assert!(
            braided_road_pairs(&map).is_empty(),
            "single surviving road cannot braid with itself"
        );
    }

    #[test]
    fn debraid_cascades_stub_junction_left_by_a_drop() {
        // The bypass runs A--J--B through junction J whose only other edge is
        // the braid remainder: dropping the bypass legs strands J, and the
        // stub cascade must remove it rather than leave a dead junction.
        let mut map = serde_json::json!({
            "nodes": [
                {"id": 1, "name": "A", "kind": "city", "pos": [0.0, 0.0]},
                {"id": 2, "name": "B", "kind": "city", "pos": [100.0, 0.0]},
                {"id": 3, "name": "C", "kind": "city", "pos": [50.0, 2.0]},
                {"id": 4, "name": "x", "kind": "junction", "pos": [50.0, 1.0]},
            ],
            "edges": [
                {"a": 1, "b": 4, "kind": "road", "via": [[0.0, 0.0], [50.0, 1.0]]},
                {"a": 4, "b": 2, "kind": "road", "via": [[50.0, 1.0], [100.0, 0.0]]},
                {"a": 1, "b": 3, "kind": "road", "via": [[0.0, 0.0], [50.0, 2.0]]},
                {"a": 3, "b": 2, "kind": "road", "via": [[50.0, 2.0], [100.0, 0.0]]},
            ],
            "ambush_spots": [],
        });

        debraid_map(&mut map);

        let names: Vec<&str> = map["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n["name"].as_str().unwrap())
            .collect();
        assert!(!names.contains(&"x"), "stub junction must cascade: {names:?}");
        assert!(braided_road_pairs(&map).is_empty());
        assert_eq!(map["edges"].as_array().unwrap().len(), 2);
    }
}
