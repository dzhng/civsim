//! Procedural-map certificates shared by tests, wasm debug stats, and
//! `generate` debug assertions.

use crate::terrain::Terrain;
use std::collections::VecDeque;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    North,
    South,
    East,
    West,
}

pub const EDGE_SCAN_METERS: f32 = 90.0;
pub const SEALED_SIDE_THRESHOLD: f32 = 0.9;
pub const OPEN_EDGE_THRESHOLD: f32 = 0.6;
pub const DEPLOYMENT_FRONTAGE_HALF_W: f32 = 350.0;
pub const DEPLOYMENT_BAND_HALF_H: f32 = 45.0;
pub const UNREACHABLE_FLANK_THRESHOLD: f32 = 0.95;
pub const ISOLATED_PASSABLE_POCKET_LIMIT_CELLS: usize = 96;

pub fn side_sealed_fraction(t: &Terrain, side: Side) -> f32 {
    assert!(matches!(side, Side::East | Side::West));
    let band = edge_band_cells(t);
    let mut blocked_rows = 0usize;
    for cy in 0..t.h {
        let mut hit = false;
        for b in 0..band {
            let cx = if side == Side::West { b } else { t.w - 1 - b };
            if t.speed[cy * t.w + cx] <= 0.0 {
                hit = true;
                break;
            }
        }
        if hit {
            blocked_rows += 1;
        }
    }
    blocked_rows as f32 / t.h.max(1) as f32
}

pub fn open_edge_fraction(t: &Terrain, side: Side) -> f32 {
    assert!(matches!(side, Side::North | Side::South));
    let cy = if side == Side::South { 0 } else { t.h - 1 };
    let mut open = 0usize;
    for cx in 0..t.w {
        if t.speed[cy * t.w + cx] > 0.0 {
            open += 1;
        }
    }
    open as f32 / t.w.max(1) as f32
}

pub fn deployment_band_passable_fraction(t: &Terrain, side: Side) -> f32 {
    assert!(matches!(side, Side::North | Side::South));
    let half_h = 0.5 * t.h as f32 * t.cell;
    let y = if side == Side::South {
        -0.75 * half_h
    } else {
        0.75 * half_h
    };
    let mut total = 0usize;
    let mut passable = 0usize;
    for cy in 0..t.h {
        let wy = t.origin.y + (cy as f32 + 0.5) * t.cell;
        if (wy - y).abs() > DEPLOYMENT_BAND_HALF_H {
            continue;
        }
        for cx in 0..t.w {
            let wx = t.origin.x + (cx as f32 + 0.5) * t.cell;
            if wx.abs() > DEPLOYMENT_FRONTAGE_HALF_W {
                continue;
            }
            total += 1;
            if t.speed[cy * t.w + cx] > 0.0 {
                passable += 1;
            }
        }
    }
    if total == 0 {
        return 0.0;
    }
    passable as f32 / total as f32
}

pub fn has_deployment_corridor(t: &Terrain) -> bool {
    deployment_reachability(t).north_connected
}

pub fn deployment_corridor_path(t: &Terrain) -> Option<Vec<usize>> {
    deployment_reachability(t).north_path
}

pub fn flank_unreachable_fraction(t: &Terrain, side: Side) -> f32 {
    assert!(matches!(side, Side::East | Side::West));
    let reach = deployment_reachability(t);
    let band = edge_band_cells(t);
    let mut total = 0usize;
    let mut unreachable = 0usize;
    for cy in 0..t.h {
        for b in 0..band {
            let cx = if side == Side::West { b } else { t.w - 1 - b };
            let i = cy * t.w + cx;
            if t.speed[i] <= 0.0 {
                continue;
            }
            total += 1;
            if reach.seen[i] == 0 {
                unreachable += 1;
            }
        }
    }
    if total == 0 {
        1.0
    } else {
        unreachable as f32 / total as f32
    }
}

pub fn speed_zero_cells_without_blocking_tint(t: &Terrain) -> usize {
    t.speed
        .iter()
        .zip(t.tint.iter())
        .filter(|&(speed, tint)| *speed <= 0.0 && *tint != 1 && *tint != 2)
        .count()
}

pub fn largest_isolated_passable_pocket_cells(t: &Terrain) -> usize {
    let reach = deployment_reachability(t);
    let mut seen = reach.seen.clone();
    let mut q = VecDeque::new();
    let mut largest = 0usize;
    for start in 0..t.w * t.h {
        if seen[start] != 0 || t.speed[start] <= 0.0 {
            continue;
        }
        seen[start] = 1;
        q.push_back(start);
        let mut cells = 0usize;
        while let Some(i) = q.pop_front() {
            cells += 1;
            let cx = i % t.w;
            let cy = i / t.w;
            let push = |ni: usize, seen: &mut [u8], q: &mut VecDeque<usize>| {
                if seen[ni] == 0 && t.speed[ni] > 0.0 {
                    seen[ni] = 1;
                    q.push_back(ni);
                }
            };
            if cx > 0 {
                push(i - 1, &mut seen, &mut q);
            }
            if cx + 1 < t.w {
                push(i + 1, &mut seen, &mut q);
            }
            if cy > 0 {
                push(i - t.w, &mut seen, &mut q);
            }
            if cy + 1 < t.h {
                push(i + t.w, &mut seen, &mut q);
            }
        }
        largest = largest.max(cells);
    }
    largest
}

struct Reachability {
    seen: Vec<u8>,
    north_connected: bool,
    north_path: Option<Vec<usize>>,
}

fn deployment_reachability(t: &Terrain) -> Reachability {
    if t.w == 0 || t.h == 0 {
        return Reachability {
            seen: Vec::new(),
            north_connected: false,
            north_path: None,
        };
    }
    let Some(south) = deployment_band_cells(t, Side::South) else {
        return Reachability {
            seen: vec![0u8; t.w * t.h],
            north_connected: false,
            north_path: None,
        };
    };
    let Some(north) = deployment_band_cells(t, Side::North) else {
        return Reachability {
            seen: vec![0u8; t.w * t.h],
            north_connected: false,
            north_path: None,
        };
    };
    let mut target = vec![0u8; t.w * t.h];
    for i in north {
        target[i] = 1;
    }
    let mut seen = vec![0u8; t.w * t.h];
    let mut parent = vec![usize::MAX; t.w * t.h];
    let mut q = VecDeque::new();
    for i in south {
        if t.speed[i] <= 0.0 || seen[i] != 0 {
            continue;
        }
        seen[i] = 1;
        parent[i] = i;
        q.push_back(i);
    }
    let mut north_connected = false;
    let mut target_hit = None;
    while let Some(i) = q.pop_front() {
        if target[i] != 0 {
            north_connected = true;
            if target_hit.is_none() {
                target_hit = Some(i);
            }
        }
        let cx = i % t.w;
        let cy = i / t.w;
        let push = |ni: usize,
                    from: usize,
                    seen: &mut [u8],
                    parent: &mut [usize],
                    q: &mut VecDeque<usize>| {
            if seen[ni] == 0 && t.speed[ni] > 0.0 {
                seen[ni] = 1;
                parent[ni] = from;
                q.push_back(ni);
            }
        };
        if cx > 0 {
            push(i - 1, i, &mut seen, &mut parent, &mut q);
        }
        if cx + 1 < t.w {
            push(i + 1, i, &mut seen, &mut parent, &mut q);
        }
        if cy > 0 {
            push(i - t.w, i, &mut seen, &mut parent, &mut q);
        }
        if cy + 1 < t.h {
            push(i + t.w, i, &mut seen, &mut parent, &mut q);
        }
    }
    let north_path = target_hit.map(|mut i| {
        let mut path = Vec::new();
        loop {
            path.push(i);
            if parent[i] == i || parent[i] == usize::MAX {
                break;
            }
            i = parent[i];
        }
        path.reverse();
        path
    });
    Reachability {
        seen,
        north_connected,
        north_path,
    }
}

fn edge_band_cells(t: &Terrain) -> usize {
    ((EDGE_SCAN_METERS / t.cell).round() as usize)
        .max(1)
        .min(t.w)
}

fn deployment_band_cells(t: &Terrain, side: Side) -> Option<Vec<usize>> {
    let half_h = 0.5 * t.h as f32 * t.cell;
    let y = if side == Side::South {
        -0.75 * half_h
    } else {
        0.75 * half_h
    };
    let mut cells = Vec::new();
    for cy in 0..t.h {
        let wy = t.origin.y + (cy as f32 + 0.5) * t.cell;
        if (wy - y).abs() > DEPLOYMENT_BAND_HALF_H {
            continue;
        }
        for cx in 0..t.w {
            let wx = t.origin.x + (cx as f32 + 0.5) * t.cell;
            if wx.abs() <= DEPLOYMENT_FRONTAGE_HALF_W {
                cells.push(cy * t.w + cx);
            }
        }
    }
    if cells.is_empty() {
        None
    } else {
        Some(cells)
    }
}
