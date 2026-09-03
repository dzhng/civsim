use crate::raster;
use serde_json::Value;
use std::collections::BTreeSet;

const WATER_LABEL: u32 = u32::MAX;
const LAND_FALLBACK_RADIUS_CELLS: isize = 4;
pub fn landmass_labels(raster: &raster::Raster) -> Vec<u32> {
    let mut labels = vec![WATER_LABEL; raster.w * raster.h];
    let mut next_label = 0u32;
    let mut stack = Vec::new();

    for y in 0..raster.h {
        for x in 0..raster.w {
            let i = y * raster.w + x;
            if labels[i] != WATER_LABEL || !raster.is_land_cell(x, y) {
                continue;
            }

            labels[i] = next_label;
            stack.push((x, y));
            while let Some((cx, cy)) = stack.pop() {
                for dy in -1isize..=1 {
                    for dx in -1isize..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let nx = cx as isize + dx;
                        let ny = cy as isize + dy;
                        if nx < 0 || ny < 0 || nx >= raster.w as isize || ny >= raster.h as isize {
                            continue;
                        }
                        let ni = ny as usize * raster.w + nx as usize;
                        if labels[ni] == WATER_LABEL
                            && raster.is_land_cell(nx as usize, ny as usize)
                        {
                            labels[ni] = next_label;
                            stack.push((nx as usize, ny as usize));
                        }
                    }
                }
            }

            next_label += 1;
        }
    }

    labels
}

/// The partition of CITY node ids into connected components (roads + sea
/// lanes), optionally excluding one edge by index — the debraid safety
/// currency: a drop is legal only when the partition it leaves equals the
/// partition it found.
pub fn city_partition(map: &Value, skip_edge: Option<usize>) -> BTreeSet<BTreeSet<u32>> {
    let edges = map["edges"]
        .as_array()
        .expect("edges array")
        .iter()
        .enumerate()
        .filter(|(idx, _)| Some(*idx) != skip_edge)
        .map(|(_, edge)| {
            (
                edge["a"].as_u64().expect("edge a") as u32,
                edge["b"].as_u64().expect("edge b") as u32,
            )
        });
    let cities: BTreeSet<u32> = map["nodes"]
        .as_array()
        .expect("nodes array")
        .iter()
        .filter(|node| node["kind"].as_str() == Some("city"))
        .map(|node| node["id"].as_u64().expect("node id") as u32)
        .collect();

    crate::graph::components(
        map["nodes"]
            .as_array()
            .expect("nodes array")
            .iter()
            .map(|node| node["id"].as_u64().expect("node id") as u32),
        edges,
    )
    .into_iter()
    .map(|component| component.intersection(&cities).copied().collect())
    .filter(|component: &BTreeSet<u32>| !component.is_empty())
    .collect()
}

pub fn main_component(map: &Value, capital_ids: &[u32]) -> BTreeSet<u32> {
    let seeds: BTreeSet<u32> = capital_ids.iter().copied().collect();
    let edges = map["edges"]
        .as_array()
        .expect("edges array")
        .iter()
        .map(|edge| {
            (
                edge["a"].as_u64().expect("edge a") as u32,
                edge["b"].as_u64().expect("edge b") as u32,
            )
        });
    crate::graph::components(
        map["nodes"]
            .as_array()
            .expect("nodes array")
            .iter()
            .map(|node| node["id"].as_u64().expect("node id") as u32),
        edges,
    )
    .into_iter()
    .filter(|component| !component.is_disjoint(&seeds))
    .flatten()
    .collect()
}

pub(crate) fn label_at_pos(pos: [f64; 2], labels: &[u32], raster: &raster::Raster) -> Option<u32> {
    debug_assert_eq!(labels.len(), raster.w * raster.h);
    for (x, y) in nearby_cells(pos, raster, LAND_FALLBACK_RADIUS_CELLS) {
        let label = labels[y * raster.w + x];
        if label != WATER_LABEL {
            return Some(label);
        }
    }
    None
}

pub(crate) fn snap_land(pos: [f64; 2], raster: &raster::Raster) -> Option<[f64; 2]> {
    if let Some([x, y]) = raster.cell_of(pos) {
        if raster.is_land_cell(x, y) {
            return Some(pos);
        }
    }
    raster
        .nearest_land_neighborhood_center(pos, 40.0, 0)
        .or_else(|| nearest_land_cell_center(pos, raster))
}

fn nearest_land_cell_center(pos: [f64; 2], raster: &raster::Raster) -> Option<[f64; 2]> {
    let radius = raster.w.max(raster.h) as isize;
    nearby_cells(pos, raster, radius)
        .into_iter()
        .find(|&(x, y)| raster.is_land_cell(x, y))
        .map(|(x, y)| raster.cell_center(x, y))
}

fn nearby_cells(
    pos: [f64; 2],
    raster: &raster::Raster,
    radius_cells: isize,
) -> Vec<(usize, usize)> {
    let [fx, fy] = fractional_cell(pos, raster);
    let cx = fx.floor() as isize;
    let cy = fy.floor() as isize;
    let mut cells = Vec::new();
    for dy in -radius_cells..=radius_cells {
        for dx in -radius_cells..=radius_cells {
            let x = cx + dx;
            let y = cy + dy;
            if x < 0 || y < 0 || x >= raster.w as isize || y >= raster.h as isize {
                continue;
            }
            let d2 = (fx - x as f64).powi(2) + (fy - y as f64).powi(2);
            cells.push((d2, x as usize, y as usize));
        }
    }
    cells.sort_by(|a, b| {
        a.0.total_cmp(&b.0)
            .then_with(|| a.2.cmp(&b.2))
            .then_with(|| a.1.cmp(&b.1))
    });
    cells.into_iter().map(|(_, x, y)| (x, y)).collect()
}

fn fractional_cell(pos: [f64; 2], raster: &raster::Raster) -> [f64; 2] {
    if let Some([x, y]) = raster.cell_of(pos) {
        return [x as f64, y as f64];
    }

    let c00 = raster.cell_center(0, 0);
    let cell_w = if raster.w > 1 {
        raster.cell_center(1, 0)[0] - c00[0]
    } else {
        1.0
    };
    let cell_h = if raster.h > 1 {
        c00[1] - raster.cell_center(0, 1)[1]
    } else {
        1.0
    };
    let min_x = c00[0] - cell_w / 2.0;
    let max_y = c00[1] + cell_h / 2.0;
    [(pos[0] - min_x) / cell_w, (max_y - pos[1]) / cell_h]
}
