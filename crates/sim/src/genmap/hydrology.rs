//! Gravity-derived water for generated battle maps.
//!
//! Priority-flood owns lake levels; D8 accumulation owns stream traces; final
//! terrain painting is a deterministic post-condition over those masks.

use super::MapRecipe;
use crate::terrain::Terrain;
pub use contract::HydrologyRecipe;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, VecDeque};

const TINT_WATER: u8 = 1;
const TINT_MUD: u8 = 5;

const LAKE_MIN_DEPTH_M: f32 = 0.18;
const STREAM_DEPTH_M: f32 = 0.22;
const STREAM_BED_RADIUS_CELLS: isize = 2;
const FLOW_EPSILON_M: f32 = 0.000_001;
const MIN_PLAYABLE_LAKE_CELLS: usize = 1_500;
const MAX_PLAYABLE_LAKES: usize = 1;

#[derive(Clone, Debug)]
pub struct Drainage {
    lake: Vec<u8>,
    water_level: Vec<f32>,
    suppressed_mountain_hollow: Vec<u8>,
    marsh: Vec<u8>,
    stream: Vec<u8>,
    ford: Vec<u8>,
    streams: Vec<Vec<usize>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LakeSurfaceReport {
    pub id: usize,
    pub level: f32,
    pub min_cell_x: usize,
    pub min_cell_y: usize,
    pub max_cell_x: usize,
    pub max_cell_y: usize,
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
    pub cells: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrainageReport {
    pub lake_count: usize,
    pub lake_cells: usize,
    pub lakes: Vec<LakeSurfaceReport>,
    pub playable_lake_count: usize,
    pub playable_lake_cells: usize,
    pub largest_playable_lake_cells: usize,
    pub suppressed_mountain_hollow_count: usize,
    pub suppressed_mountain_hollow_cells: usize,
    pub marsh_cells: usize,
    pub stream_count: usize,
    pub stream_cells: usize,
    pub stream_lake_connections: usize,
    pub stream_runoff_connections: usize,
    pub stream_dead_ends: usize,
    pub stream_impassable_cells: usize,
    pub corridor_crossing_streams: usize,
    pub ford_count: usize,
    pub water_level_set: bool,
    pub streams_descend: bool,
}

pub fn apply(recipe: &MapRecipe, t: &mut Terrain, corridor_path: &[usize]) -> Drainage {
    let flood = priority_flood(t);
    let flow = flow_accumulation(t, &flood);
    let mut drainage = select_lakes(recipe, t, &flood, corridor_path);
    add_lake_feeder_streams(recipe, t, &mut drainage);
    let traced = trace_streams(recipe, t, &flood, &flow, &drainage.lake);
    for stream in traced {
        if drainage.streams.len() >= recipe.hydrology.stream_count as usize {
            break;
        }
        drainage.streams.push(stream);
    }
    drainage.streams.retain(|s| s.len() >= 8);
    mark_streams_and_fords(t, corridor_path, &mut drainage);
    carve_streams(t, &mut drainage);
    apply_lakes_to_height(t, corridor_path, &mut drainage);
    drainage.marsh = marsh_mask(
        t,
        &drainage.lake,
        &drainage.stream,
        recipe.hydrology.marsh_width_cells as isize,
    );
    for (i, &is_lake) in drainage.lake.iter().enumerate() {
        if is_lake != 0 {
            t.tint[i] = TINT_WATER;
        }
    }
    drainage
}

pub fn paint(drainage: &Drainage, t: &mut Terrain) {
    for i in 0..t.w * t.h {
        if drainage.lake[i] != 0 {
            t.speed[i] = 0.0;
            t.rough[i] = 0.0;
            t.tint[i] = TINT_WATER;
        } else if drainage.ford[i] != 0 || drainage.stream[i] != 0 {
            t.speed[i] = t.speed[i].clamp(0.54, 0.72);
            t.rough[i] = 0.18;
            t.tint[i] = TINT_MUD;
        } else if drainage.marsh[i] != 0 && t.speed[i] > 0.0 {
            t.speed[i] = t.speed[i].min(0.68);
            t.rough[i] = t.rough[i].max(0.16);
            t.tint[i] = TINT_MUD;
        }
    }
}

impl Drainage {
    pub fn report(&self, t: &Terrain) -> DrainageReport {
        let lake_count = count_components(t, &self.lake);
        let lake_cells = self.lake.iter().filter(|&&v| v != 0).count();
        let lakes = self.lake_surfaces(t);
        let playable_lakes = playable_lake_components(t, &self.lake);
        let playable_lake_count = playable_lakes.len();
        let playable_lake_cells = playable_lakes.iter().map(|c| c.cells.len()).sum();
        let largest_playable_lake_cells = playable_lakes
            .iter()
            .map(|c| c.cells.len())
            .max()
            .unwrap_or(0);
        let suppressed_mountain_hollow_count =
            count_components(t, &self.suppressed_mountain_hollow);
        let suppressed_mountain_hollow_cells = self
            .suppressed_mountain_hollow
            .iter()
            .filter(|&&v| v != 0)
            .count();
        let marsh_cells = self.marsh.iter().filter(|&&v| v != 0).count();
        let stream_cells = self.stream.iter().filter(|&&v| v != 0).count();
        let ford_count = self.ford.iter().filter(|&&v| v != 0).count();
        let corridor_crossing_streams = self
            .streams
            .iter()
            .filter(|s| s.iter().any(|&i| self.ford[i] != 0))
            .count();
        let mut stream_lake_connections = 0usize;
        let mut stream_runoff_connections = 0usize;
        let mut stream_dead_ends = 0usize;
        for stream in &self.streams {
            match stream_connection(t, &self.lake, stream) {
                StreamConnection::Lake => stream_lake_connections += 1,
                StreamConnection::Runoff => stream_runoff_connections += 1,
                StreamConnection::DeadEnd => stream_dead_ends += 1,
            }
        }
        let stream_impassable_cells = self
            .stream
            .iter()
            .enumerate()
            .filter(|&(i, &v)| v != 0 && self.lake[i] == 0 && t.speed[i] <= 0.0)
            .count();
        DrainageReport {
            lake_count,
            lake_cells,
            lakes,
            playable_lake_count,
            playable_lake_cells,
            largest_playable_lake_cells,
            suppressed_mountain_hollow_count,
            suppressed_mountain_hollow_cells,
            marsh_cells,
            stream_count: self.streams.len(),
            stream_cells,
            stream_lake_connections,
            stream_runoff_connections,
            stream_dead_ends,
            stream_impassable_cells,
            corridor_crossing_streams,
            ford_count,
            water_level_set: self.water_level_set(t),
            streams_descend: self.streams_descend(t),
        }
    }

    fn water_level_set(&self, t: &Terrain) -> bool {
        for i in 0..t.w * t.h {
            if self.lake[i] == 0 {
                continue;
            }
            if (t.height[i] - self.water_level[i]).abs() > 0.001 {
                return false;
            }
        }
        true
    }

    fn streams_descend(&self, t: &Terrain) -> bool {
        for stream in &self.streams {
            for pair in stream.windows(2) {
                if t.height[pair[1]] > t.height[pair[0]] + 0.002 {
                    return false;
                }
            }
        }
        true
    }

    fn lake_surfaces(&self, t: &Terrain) -> Vec<LakeSurfaceReport> {
        components(t, &self.lake)
            .into_iter()
            .enumerate()
            .map(|(id, component)| {
                let mut min_cx = usize::MAX;
                let mut min_cy = usize::MAX;
                let mut max_cx = 0usize;
                let mut max_cy = 0usize;
                let mut level = f32::NEG_INFINITY;
                for &i in &component.cells {
                    let cx = i % t.w;
                    let cy = i / t.w;
                    min_cx = min_cx.min(cx);
                    min_cy = min_cy.min(cy);
                    max_cx = max_cx.max(cx);
                    max_cy = max_cy.max(cy);
                    level = level.max(self.water_level[i]);
                }
                LakeSurfaceReport {
                    id,
                    level,
                    min_cell_x: min_cx,
                    min_cell_y: min_cy,
                    max_cell_x: max_cx,
                    max_cell_y: max_cy,
                    min_x: t.origin.x + min_cx as f32 * t.cell,
                    min_y: t.origin.y + min_cy as f32 * t.cell,
                    max_x: t.origin.x + (max_cx + 1) as f32 * t.cell,
                    max_y: t.origin.y + (max_cy + 1) as f32 * t.cell,
                    cells: component.cells.len(),
                }
            })
            .collect()
    }
}

struct Flood {
    filled: Vec<f32>,
    rank: Vec<u32>,
}

#[derive(Clone, Copy)]
struct FloodItem {
    level: f32,
    order: u32,
    index: usize,
}

impl Eq for FloodItem {}

impl PartialEq for FloodItem {
    fn eq(&self, other: &Self) -> bool {
        self.level.to_bits() == other.level.to_bits()
            && self.order == other.order
            && self.index == other.index
    }
}

impl Ord for FloodItem {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .level
            .total_cmp(&self.level)
            .then_with(|| other.order.cmp(&self.order))
            .then_with(|| other.index.cmp(&self.index))
    }
}

impl PartialOrd for FloodItem {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn priority_flood(t: &Terrain) -> Flood {
    let n = t.w * t.h;
    let mut filled = vec![0.0; n];
    let mut rank = vec![0u32; n];
    let mut seen = vec![0u8; n];
    let mut heap = BinaryHeap::new();
    let mut order = 0u32;
    let seed = |i: usize,
                seen: &mut [u8],
                filled: &mut [f32],
                heap: &mut BinaryHeap<FloodItem>,
                order: &mut u32| {
        if seen[i] != 0 {
            return;
        }
        seen[i] = 1;
        filled[i] = t.height[i];
        heap.push(FloodItem {
            level: filled[i],
            order: *order,
            index: i,
        });
        *order += 1;
    };
    if t.w == 0 || t.h == 0 {
        return Flood { filled, rank };
    }
    for cx in 0..t.w {
        seed(cx, &mut seen, &mut filled, &mut heap, &mut order);
        seed(
            (t.h - 1) * t.w + cx,
            &mut seen,
            &mut filled,
            &mut heap,
            &mut order,
        );
    }
    for cy in 0..t.h {
        seed(cy * t.w, &mut seen, &mut filled, &mut heap, &mut order);
        seed(
            cy * t.w + t.w - 1,
            &mut seen,
            &mut filled,
            &mut heap,
            &mut order,
        );
    }
    let mut pop_rank = 0u32;
    while let Some(item) = heap.pop() {
        rank[item.index] = pop_rank;
        pop_rank += 1;
        let cx = item.index % t.w;
        let cy = item.index / t.w;
        for ni in neighbors4(t, cx, cy) {
            if seen[ni] != 0 {
                continue;
            }
            seen[ni] = 1;
            filled[ni] = t.height[ni].max(item.level);
            heap.push(FloodItem {
                level: filled[ni],
                order,
                index: ni,
            });
            order += 1;
        }
    }
    Flood { filled, rank }
}

fn flow_accumulation(t: &Terrain, flood: &Flood) -> Flow {
    let n = t.w * t.h;
    let down: Vec<Option<usize>> = (0..n).map(|i| d8_down(t, flood, i)).collect();
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| flow_height(flood, b).total_cmp(&flow_height(flood, a)));
    let mut accum = vec![1u32; n];
    for i in order {
        if let Some(to) = down[i] {
            accum[to] = accum[to].saturating_add(accum[i]);
        }
    }
    Flow { accum, down }
}

struct Flow {
    accum: Vec<u32>,
    down: Vec<Option<usize>>,
}

fn d8_down(t: &Terrain, flood: &Flood, i: usize) -> Option<usize> {
    let cx = i % t.w;
    let cy = i / t.w;
    let here = flow_height(flood, i);
    let mut best = None;
    let mut best_h = here;
    let y0 = cy.saturating_sub(1);
    let y1 = (cy + 1).min(t.h - 1);
    let x0 = cx.saturating_sub(1);
    let x1 = (cx + 1).min(t.w - 1);
    for yy in y0..=y1 {
        for xx in x0..=x1 {
            if xx == cx && yy == cy {
                continue;
            }
            let ni = yy * t.w + xx;
            let h = flow_height(flood, ni);
            if h < best_h {
                best_h = h;
                best = Some(ni);
            }
        }
    }
    best
}

fn flow_height(flood: &Flood, i: usize) -> f32 {
    flood.filled[i] + flood.rank[i] as f32 * FLOW_EPSILON_M
}

fn select_lakes(
    recipe: &MapRecipe,
    t: &Terrain,
    flood: &Flood,
    corridor_path: &[usize],
) -> Drainage {
    let n = t.w * t.h;
    let mut wet = vec![0u8; n];
    let mut suppressed_mountain_hollow = vec![0u8; n];
    // No path-disc exclusion: clipping lake cells along the pre-lake corridor
    // path sliced a ruler-straight shoreline. Lakes select whole; the corridor
    // certificate runs on the FINAL speed field and routes around water (the
    // ~780 m corridor dwarfs the ~300 m-offset basins), and the sweep proves
    // it per seed.
    let _ = corridor_path;
    let slope = super::passability::slope_field(t);
    for (i, w) in wet.iter_mut().enumerate() {
        let (x, y) = world_xy(t, i);
        let fill_depth = flood.filled[i] - t.height[i];
        if fill_depth <= LAKE_MIN_DEPTH_M || y.abs() >= recipe.half_h * 0.58 {
            continue;
        }
        if is_mountain_hollow(recipe, t, &slope, i) {
            suppressed_mountain_hollow[i] = 1;
        } else {
            // Whole fill components join the wet mask; the playable-zone
            // gate applies per COMPONENT below - per-cell x-thresholds
            // sliced ruler-straight shorelines through the fill.
            let _ = x;
            *w = 1;
        }
    }
    let mut components = components(t, &wet);
    components.retain(|c| {
        // A lake qualifies by its CORE: the deepest fill cell sits in the
        // seeded playable-basin zone. Spill beyond the zone stays part of
        // the lake (natural shoreline); centroids drift with spill and
        // per-cell clips slice straight edges - both rejected.
        let core = c
            .cells
            .iter()
            .copied()
            .max_by(|&a, &b| {
                (flood.filled[a] - t.height[a]).total_cmp(&(flood.filled[b] - t.height[b]))
            })
            .unwrap_or(0);
        let (x, y) = world_xy(t, core);
        is_playable_lake_zone(x, y, recipe)
    });
    for c in &mut components {
        c.max_depth = c
            .cells
            .iter()
            .map(|&i| flood.filled[i] - t.height[i])
            .fold(0.0, f32::max);
    }
    components.sort_by(|a, b| {
        b.cells
            .len()
            .cmp(&a.cells.len())
            .then_with(|| b.max_depth.total_cmp(&a.max_depth))
            .then_with(|| a.first.cmp(&b.first))
    });
    let budget = ((n as f32) * recipe.hydrology.lake_area_budget).round() as usize;
    let mut lake = vec![0u8; n];
    let mut water_level = vec![f32::NAN; n];
    let mut used = 0usize;
    let mut lakes = 0usize;
    for c in components {
        if used >= budget || lakes >= MAX_PLAYABLE_LAKES || c.cells.len() < 300 {
            continue;
        }
        // Oversized components DRAIN to the budget: lower the water level to
        // a height quantile, then keep only the connected piece holding the
        // deepest core - the shoreline stays one true height contour and the
        // lake stays one body (keeping "lowest cells" splinters multi-basin
        // components into ponds).
        let cap = budget.saturating_sub(used).max(300);
        let mut cells = c.cells;
        if cells.len() > cap {
            let mut heights: Vec<f32> = cells.iter().map(|&i| t.height[i]).collect();
            heights.sort_by(f32::total_cmp);
            // The budget is soft; the readable-lake floor is the contract.
            // Raise the level in steps until the core-connected piece clears
            // the floor (sibling sub-basins can hold most of the quantile
            // mass at the strict cap).
            let mut target = cap.min(heights.len());
            let mut kept = keep_core_piece(t, &cells, heights[target - 1]);
            while kept.len() < MIN_PLAYABLE_LAKE_CELLS && target < heights.len() {
                target = (target + target / 4 + 64).min(heights.len());
                kept = keep_core_piece(t, &cells, heights[target - 1]);
            }
            cells = kept;
        }
        if cells.len() < 300 {
            continue;
        }
        let level = cells
            .iter()
            .map(|&i| t.height[i])
            .fold(f32::NEG_INFINITY, f32::max);
        for i in cells {
            lake[i] = 1;
            water_level[i] = level.max(t.height[i] + LAKE_MIN_DEPTH_M);
        }
        used = lake.iter().filter(|&&v| v != 0).count();
        lakes += 1;
    }
    Drainage {
        lake,
        water_level,
        suppressed_mountain_hollow,
        marsh: vec![0u8; n],
        stream: vec![0u8; n],
        ford: vec![0u8; n],
        streams: Vec::new(),
    }
}

fn trace_streams(
    recipe: &MapRecipe,
    t: &Terrain,
    flood: &Flood,
    flow: &Flow,
    lake: &[u8],
) -> Vec<Vec<usize>> {
    let mut candidates: Vec<usize> = (0..t.w * t.h)
        .filter(|&i| flow.accum[i] >= recipe.hydrology.stream_accum_threshold)
        .filter(|&i| {
            let (x, y) = world_xy(t, i);
            x.abs() <= 700.0
                && y.abs() <= recipe.half_h * 0.92
                && t.height[i] < recipe.slope_bands.highland_cap_min_m
        })
        .collect();
    candidates.sort_by(|&a, &b| {
        flow.accum[b]
            .cmp(&flow.accum[a])
            .then_with(|| flow_height(flood, b).total_cmp(&flow_height(flood, a)))
            .then_with(|| a.cmp(&b))
    });

    let mut streams = Vec::new();
    let mut starts = Vec::new();
    for i in candidates {
        if starts.iter().any(|&s| grid_dist2(t, i, s) < 32 * 32) {
            continue;
        }
        let path = trace_from(t, flow, lake, i);
        if path.len() < 10 {
            continue;
        }
        if stream_connects(t, lake, &path) {
            starts.push(i);
            streams.push(path);
        }
        if streams.len() >= recipe.hydrology.stream_count as usize {
            return streams;
        }
    }
    let mut fallback_candidates: Vec<usize> = (0..t.w * t.h).collect();
    fallback_candidates.sort_by(|&a, &b| flow.accum[b].cmp(&flow.accum[a]).then_with(|| a.cmp(&b)));
    for i in fallback_candidates {
        if streams.len() >= recipe.hydrology.stream_count as usize {
            break;
        }
        if streams
            .iter()
            .filter_map(|s| s.first().copied())
            .any(|s| grid_dist2(t, i, s) < 32 * 32)
        {
            continue;
        }
        let path = trace_from(t, flow, lake, i);
        if path.len() >= 10 && stream_connects(t, lake, &path) {
            streams.push(path);
        }
    }
    streams
}

fn trace_from(t: &Terrain, flow: &Flow, lake: &[u8], start: usize) -> Vec<usize> {
    let mut path = Vec::new();
    let mut seen = vec![0u8; t.w * t.h];
    let mut i = start;
    for _ in 0..280 {
        if seen[i] != 0 {
            break;
        }
        seen[i] = 1;
        path.push(i);
        if lake[i] != 0 {
            break;
        }
        let cx = i % t.w;
        let cy = i / t.w;
        if cx == 0 || cy == 0 || cx + 1 == t.w || cy + 1 == t.h {
            break;
        }
        let Some(next) = flow.down[i] else {
            break;
        };
        i = next;
    }
    path
}

fn add_lake_feeder_streams(recipe: &MapRecipe, t: &Terrain, drainage: &mut Drainage) {
    let lakes = playable_lake_components(t, &drainage.lake);
    for lake in lakes {
        if drainage.streams.len() >= recipe.hydrology.stream_count as usize {
            break;
        }
        if lake.cells.len() < MIN_PLAYABLE_LAKE_CELLS {
            continue;
        }
        let Some(path) = feeder_stream_to_lake(recipe, t, &lake, drainage.streams.len()) else {
            continue;
        };
        if path.len() >= 10
            && !drainage
                .streams
                .iter()
                .filter_map(|s| s.first().copied())
                .any(|s| grid_dist2(t, path[0], s) < 28 * 28)
        {
            drainage.streams.push(path);
        }
    }
}

fn is_playable_lake_zone(x: f32, y: f32, recipe: &MapRecipe) -> bool {
    x.abs() >= 220.0 && x.abs() <= 620.0 && y.abs() <= recipe.half_h * 0.58
}

fn is_mountain_hollow(recipe: &MapRecipe, t: &Terrain, slope: &[f32], i: usize) -> bool {
    if t.height[i] >= recipe.slope_bands.highland_cap_min_m {
        return true;
    }
    let cx = i % t.w;
    let cy = i / t.w;
    let radius = 2isize;
    let x0 = (cx as isize - radius).max(0) as usize;
    let x1 = (cx as isize + radius).min(t.w as isize - 1) as usize;
    let y0 = (cy as isize - radius).max(0) as usize;
    let y1 = (cy as isize + radius).min(t.h as isize - 1) as usize;
    for yy in y0..=y1 {
        for xx in x0..=x1 {
            if slope[yy * t.w + xx] >= recipe.slope_bands.cliff_min {
                return true;
            }
        }
    }
    false
}

fn stream_connects(t: &Terrain, lake: &[u8], stream: &[usize]) -> bool {
    !matches!(
        stream_connection(t, lake, stream),
        StreamConnection::DeadEnd
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum StreamConnection {
    Lake,
    Runoff,
    DeadEnd,
}

fn stream_connection(t: &Terrain, lake: &[u8], stream: &[usize]) -> StreamConnection {
    let Some(&end) = stream.last() else {
        return StreamConnection::DeadEnd;
    };
    if lake[end] != 0 {
        return StreamConnection::Lake;
    }
    let cy = end / t.w;
    if cy == 0 || cy + 1 == t.h {
        StreamConnection::Runoff
    } else {
        StreamConnection::DeadEnd
    }
}

fn playable_lake_components(t: &Terrain, lake: &[u8]) -> Vec<Component> {
    components(t, lake)
        .into_iter()
        .filter(|c| {
            c.cells.iter().any(|&i| {
                let (x, y) = world_xy(t, i);
                x.abs() >= 220.0 && x.abs() <= 620.0 && y.abs() <= 470.0
            })
        })
        .collect()
}

fn feeder_stream_to_lake(
    recipe: &MapRecipe,
    t: &Terrain,
    lake: &Component,
    ordinal: usize,
) -> Option<Vec<usize>> {
    let mut sx = 0isize;
    let mut sy = 0isize;
    for &i in &lake.cells {
        sx += (i % t.w) as isize;
        sy += (i / t.w) as isize;
    }
    let n = lake.cells.len().max(1) as isize;
    let end_x = (sx / n).clamp(1, t.w as isize - 2);
    let end_y = (sy / n).clamp(1, t.h as isize - 2);
    let side = if ((recipe.seed as usize + ordinal) & 1) == 0 {
        -1
    } else {
        1
    };
    let lateral = if ordinal & 1 == 0 { -88 } else { 88 };
    let mut start_x = (end_x + lateral).clamp(1, t.w as isize - 2);
    let mut start_y = (end_y + side * 118).clamp(1, t.h as isize - 2);
    for step in 0..36 {
        let i = start_y as usize * t.w + start_x as usize;
        if !lake.cells.contains(&i) {
            break;
        }
        start_x = (start_x + lateral.signum() * (2 + step / 8)).clamp(1, t.w as isize - 2);
        start_y = (start_y + side * (2 + step / 10)).clamp(1, t.h as isize - 2);
    }
    let mut path = grid_line(t, start_x, start_y, end_x, end_y);
    let lake_end = path.iter().position(|&i| lake.cells.contains(&i));
    if let Some(pos) = lake_end {
        path.truncate(pos + 1);
    } else if let Some(&nearest) = lake.cells.iter().min_by_key(|&&i| {
        let dx = i as isize % t.w as isize - end_x;
        let dy = i as isize / t.w as isize - end_y;
        dx * dx + dy * dy
    }) {
        path.push(nearest);
    }
    Some(path)
}

fn grid_line(t: &Terrain, x0: isize, y0: isize, x1: isize, y1: isize) -> Vec<usize> {
    let dx = (x1 - x0).abs();
    let dy = -(y1 - y0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut err = dx + dy;
    let mut x = x0;
    let mut y = y0;
    let mut out = Vec::new();
    loop {
        out.push(y as usize * t.w + x as usize);
        if x == x1 && y == y1 {
            break;
        }
        let e2 = 2 * err;
        if e2 >= dy {
            err += dy;
            x += sx;
        }
        if e2 <= dx {
            err += dx;
            y += sy;
        }
    }
    out
}

fn mark_streams_and_fords(_t: &Terrain, _corridor_path: &[usize], drainage: &mut Drainage) {
    for stream in &drainage.streams {
        for &i in stream {
            drainage.stream[i] = 1;
        }
    }
}

fn carve_streams(t: &mut Terrain, drainage: &mut Drainage) {
    let base_height = t.height.clone();
    for stream in &drainage.streams {
        let terminal_lake_level = stream
            .last()
            .copied()
            .filter(|&i| drainage.lake[i] != 0)
            .map(|i| drainage.water_level[i]);
        let mut previous = f32::INFINITY;
        let stream_len = stream.len();
        for (pos, &i) in stream.iter().enumerate() {
            if drainage.lake[i] != 0 {
                previous = drainage.water_level[i];
                continue;
            }
            let depth = STREAM_DEPTH_M;
            let mut target = (base_height[i] - depth).min(previous - 0.003);
            if let Some(level) = terminal_lake_level {
                let remaining = (stream_len - pos) as f32;
                target = target.max(level + remaining * 0.003);
            }
            previous = target;
            carve_disc(t, i, target, depth, STREAM_BED_RADIUS_CELLS);
            t.height[i] = target;
        }
    }
}

fn apply_lakes_to_height(t: &mut Terrain, _corridor_path: &[usize], drainage: &mut Drainage) {
    // Lakes apply whole: carving a protected channel along the pre-lake
    // corridor path sliced a ruler-straight edge through the shoreline (and
    // left below-fill cliff slivers). The corridor certificate runs on the
    // FINAL speed field and routes around water; basins sit ~300 m off the
    // corridor spine in a ~780 m-wide corridor, so connectivity holds by
    // construction and the sweep proves it.
    for (i, &is_lake) in drainage.lake.iter().enumerate() {
        if is_lake != 0 {
            t.height[i] = drainage.water_level[i];
        }
    }
}

fn keep_core_piece(t: &Terrain, cells: &[usize], level: f32) -> Vec<usize> {
    let core = cells
        .iter()
        .copied()
        .min_by(|&a, &b| t.height[a].total_cmp(&t.height[b]))
        .unwrap_or(cells[0]);
    let allowed: std::collections::HashSet<usize> = cells
        .iter()
        .copied()
        .filter(|&i| t.height[i] <= level)
        .collect();
    let mut piece = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut q = std::collections::VecDeque::from([core]);
    seen.insert(core);
    while let Some(i) = q.pop_front() {
        piece.push(i);
        let cx = i % t.w;
        let cy = i / t.w;
        for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
            let nx = cx as i32 + dx;
            let ny = cy as i32 + dy;
            if nx < 0 || ny < 0 || nx >= t.w as i32 || ny >= t.h as i32 {
                continue;
            }
            let ni = ny as usize * t.w + nx as usize;
            if allowed.contains(&ni) && seen.insert(ni) {
                q.push_back(ni);
            }
        }
    }
    piece
}

fn marsh_mask(t: &Terrain, lake: &[u8], stream: &[u8], width: isize) -> Vec<u8> {
    let mut out = vec![0u8; t.w * t.h];
    for i in 0..t.w * t.h {
        if lake[i] == 0 && stream[i] == 0 {
            continue;
        }
        let cx = i % t.w;
        let cy = i / t.w;
        let x0 = (cx as isize - width).max(0) as usize;
        let x1 = (cx as isize + width).min(t.w as isize - 1) as usize;
        let y0 = (cy as isize - width).max(0) as usize;
        let y1 = (cy as isize + width).min(t.h as isize - 1) as usize;
        for yy in y0..=y1 {
            for xx in x0..=x1 {
                let ni = yy * t.w + xx;
                if lake[ni] == 0 && stream[ni] == 0 {
                    out[ni] = 1;
                }
            }
        }
    }
    out
}

fn carve_disc(t: &mut Terrain, center: usize, target: f32, depth: f32, radius: isize) {
    let cx = center % t.w;
    let cy = center / t.w;
    let r2 = radius * radius;
    let x0 = (cx as isize - radius).max(0) as usize;
    let x1 = (cx as isize + radius).min(t.w as isize - 1) as usize;
    let y0 = (cy as isize - radius).max(0) as usize;
    let y1 = (cy as isize + radius).min(t.h as isize - 1) as usize;
    for yy in y0..=y1 {
        for xx in x0..=x1 {
            let dx = xx as isize - cx as isize;
            let dy = yy as isize - cy as isize;
            let d2 = dx * dx + dy * dy;
            if d2 > r2 {
                continue;
            }
            let q = d2 as f32 / r2.max(1) as f32;
            let s = q * q * (3.0 - 2.0 * q);
            let h = target + depth * s;
            let i = yy * t.w + xx;
            if h < t.height[i] {
                t.height[i] = h;
            }
        }
    }
}

struct Component {
    cells: Vec<usize>,
    first: usize,
    max_depth: f32,
}

fn components(t: &Terrain, mask: &[u8]) -> Vec<Component> {
    let mut seen = vec![0u8; t.w * t.h];
    let mut out = Vec::new();
    let mut q = VecDeque::new();
    for start in 0..t.w * t.h {
        if seen[start] != 0 || mask[start] == 0 {
            continue;
        }
        seen[start] = 1;
        q.push_back(start);
        let mut cells = Vec::new();
        while let Some(i) = q.pop_front() {
            cells.push(i);
            let cx = i % t.w;
            let cy = i / t.w;
            for ni in neighbors4(t, cx, cy) {
                if seen[ni] == 0 && mask[ni] != 0 {
                    seen[ni] = 1;
                    q.push_back(ni);
                }
            }
        }
        let first = cells.iter().copied().min().unwrap_or(start);
        out.push(Component {
            cells,
            first,
            max_depth: 0.0,
        });
    }
    out
}

fn count_components(t: &Terrain, mask: &[u8]) -> usize {
    components(t, mask).len()
}

fn neighbors4(t: &Terrain, cx: usize, cy: usize) -> impl Iterator<Item = usize> {
    let mut out = [usize::MAX; 4];
    let mut n = 0usize;
    if cx > 0 {
        out[n] = cy * t.w + cx - 1;
        n += 1;
    }
    if cx + 1 < t.w {
        out[n] = cy * t.w + cx + 1;
        n += 1;
    }
    if cy > 0 {
        out[n] = (cy - 1) * t.w + cx;
        n += 1;
    }
    if cy + 1 < t.h {
        out[n] = (cy + 1) * t.w + cx;
        n += 1;
    }
    out.into_iter().take(n)
}

fn grid_dist2(t: &Terrain, a: usize, b: usize) -> isize {
    let ax = (a % t.w) as isize;
    let ay = (a / t.w) as isize;
    let bx = (b % t.w) as isize;
    let by = (b / t.w) as isize;
    let dx = ax - bx;
    let dy = ay - by;
    dx * dx + dy * dy
}

fn world_xy(t: &Terrain, i: usize) -> (f32, f32) {
    let cx = i % t.w;
    let cy = i / t.w;
    (
        t.origin.x + (cx as f32 + 0.5) * t.cell,
        t.origin.y + (cy as f32 + 0.5) * t.cell,
    )
}
