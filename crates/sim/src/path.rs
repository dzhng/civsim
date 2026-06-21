//! Anchor pathfinding: A* over the terrain grid, impassables only.
//!
//! Slow ground (mud, woods, brush) is NOT routed around — anchors march
//! through it and the soldiers' stumbling is the cost. Only speed-0 cells
//! (rock, wall, water) deflect the plan. Paths are computed at order time,
//! smoothed by line-of-sight, and the anchor walks the waypoints.

use crate::math::Vec2;
use crate::terrain::Terrain;
use std::cmp::Ordering;
use std::collections::BinaryHeap;

/// Straight-segment visibility over passable ground.
pub fn los_clear(t: &Terrain, a: Vec2, b: Vec2) -> bool {
    let d = b - a;
    let len = d.len();
    if len < 1e-3 {
        return true;
    }
    let steps = (len / (t.cell * 0.5)).ceil() as usize;
    for s in 0..=steps {
        let p = a + d * (s as f32 / steps as f32);
        if t.speed_at(p) <= 0.0 {
            return false;
        }
    }
    true
}

#[derive(PartialEq)]
struct Node {
    f: f32,
    idx: usize,
}

impl Eq for Node {}

impl Ord for Node {
    fn cmp(&self, other: &Self) -> Ordering {
        // Min-heap by f, deterministic tie-break by cell index.
        other
            .f
            .total_cmp(&self.f)
            .then_with(|| other.idx.cmp(&self.idx))
    }
}

impl PartialOrd for Node {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn cell_of(t: &Terrain, p: Vec2) -> Option<(i32, i32)> {
    let cx = ((p.x - t.origin.x) / t.cell).floor() as i32;
    let cy = ((p.y - t.origin.y) / t.cell).floor() as i32;
    if cx < 0 || cy < 0 || cx >= t.w as i32 || cy >= t.h as i32 {
        None
    } else {
        Some((cx, cy))
    }
}

fn cell_center(t: &Terrain, cx: i32, cy: i32) -> Vec2 {
    Vec2::new(
        t.origin.x + (cx as f32 + 0.5) * t.cell,
        t.origin.y + (cy as f32 + 0.5) * t.cell,
    )
}

fn passable(t: &Terrain, cx: i32, cy: i32) -> bool {
    if cx < 0 || cy < 0 || cx >= t.w as i32 || cy >= t.h as i32 {
        return true; // off-map is ordinary ground
    }
    t.speed[cy as usize * t.w + cx as usize] > 0.0
}

/// Nearest passable cell to `p` (ring search), for clamping endpoints.
fn nearest_passable(t: &Terrain, p: Vec2) -> Option<(i32, i32)> {
    let (cx, cy) = cell_of(t, p)?;
    if passable(t, cx, cy) {
        return Some((cx, cy));
    }
    for r in 1..=8i32 {
        for dy in -r..=r {
            for dx in -r..=r {
                if dx.abs() != r && dy.abs() != r {
                    continue;
                }
                if passable(t, cx + dx, cy + dy)
                    && cell_of(t, cell_center(t, cx + dx, cy + dy)).is_some()
                {
                    return Some((cx + dx, cy + dy));
                }
            }
        }
    }
    None
}

/// Resolve a MOVE destination off impassable ground to where men can actually
/// stand. If `to` is already standable it is returned unchanged (pathfinding
/// routes around any obstacle in the way). If `to` is inside an impassable (a
/// rock, water), return the NEAR FACE along the approach — march back from `to`
/// toward the ordered-from point `from` to the first standable point — so the
/// unit halts cleanly in front of the obstacle instead of wandering the long way
/// round to a far-side rim (which arrives scattered) or chasing a point it can
/// never reach (steering at the raw target once its path exhausts → never
/// arrives, never re-seats, cohesion stuck low). Falls back to the geometric
/// nearest passable cell, then to `to`, if the approach march finds nothing.
pub(crate) fn clamp_to_passable(t: &Terrain, from: Vec2, to: Vec2) -> Vec2 {
    if t.speed_at(to) > 0.0 {
        return to;
    }
    let d = to - from;
    let len = d.len();
    if len > 1e-3 {
        let dirv = d * (1.0 / len);
        let step = (t.cell * 0.5).max(0.5);
        let mut s = len;
        while s > 0.0 {
            let p = from + dirv * s;
            if t.speed_at(p) > 0.0 {
                return p;
            }
            s -= step;
        }
    }
    match nearest_passable(t, to) {
        Some(c) => cell_center(t, c.0, c.1),
        None => to,
    }
}

/// A* from `from` to `to`, returning smoothed waypoints (excluding `from`,
/// ending at `to` or the nearest passable point). None = no path or trivial.
pub fn plan(t: &Terrain, from: Vec2, to: Vec2) -> Option<Vec<Vec2>> {
    if los_clear(t, from, to) {
        return None; // straight line is fine; no plan needed
    }
    let start = nearest_passable(t, from)?;
    let goal = nearest_passable(t, to)?;
    let w = t.w as i32;
    let n = t.w * t.h;
    let idx = |c: (i32, i32)| (c.1 * w + c.0) as usize;

    let mut g = vec![f32::INFINITY; n];
    let mut came: Vec<u32> = vec![u32::MAX; n];
    let mut heap = BinaryHeap::new();
    let h = |c: (i32, i32)| {
        let dx = (c.0 - goal.0).abs() as f32;
        let dy = (c.1 - goal.1).abs() as f32;
        // Octile distance.
        (dx.max(dy) + 0.41421 * dx.min(dy)) * t.cell
    };
    g[idx(start)] = 0.0;
    heap.push(Node {
        f: h(start),
        idx: idx(start),
    });

    const DIRS: [(i32, i32, f32); 8] = [
        (1, 0, 1.0),
        (-1, 0, 1.0),
        (0, 1, 1.0),
        (0, -1, 1.0),
        (1, 1, 1.41421),
        (1, -1, 1.41421),
        (-1, 1, 1.41421),
        (-1, -1, 1.41421),
    ];

    let goal_idx = idx(goal);
    let mut found = false;
    let mut expanded = 0usize;
    while let Some(Node { idx: ci, .. }) = heap.pop() {
        if ci == goal_idx {
            found = true;
            break;
        }
        expanded += 1;
        if expanded > 30_000 {
            break; // pathological: give up, walk straight
        }
        let c = ((ci as i32) % w, (ci as i32) / w);
        for &(dx, dy, step) in &DIRS {
            let nc = (c.0 + dx, c.1 + dy);
            if nc.0 < 0 || nc.1 < 0 || nc.0 >= w || nc.1 >= t.h as i32 {
                continue;
            }
            if !passable(t, nc.0, nc.1) {
                continue;
            }
            // No diagonal corner-cutting through walls.
            if dx != 0 && dy != 0 && (!passable(t, c.0 + dx, c.1) || !passable(t, c.0, c.1 + dy)) {
                continue;
            }
            let ni = idx(nc);
            let ng = g[ci] + step * t.cell;
            if ng < g[ni] {
                g[ni] = ng;
                came[ni] = ci as u32;
                heap.push(Node {
                    f: ng + h(nc),
                    idx: ni,
                });
            }
        }
    }
    if !found {
        return None;
    }

    // Reconstruct, then smooth with line-of-sight string pulling.
    let mut cells = vec![goal_idx];
    let mut cur = goal_idx;
    while came[cur] != u32::MAX {
        cur = came[cur] as usize;
        cells.push(cur);
    }
    cells.reverse();
    let pts: Vec<Vec2> = cells
        .iter()
        .map(|&ci| cell_center(t, (ci as i32) % w, (ci as i32) / w))
        .collect();

    let mut way = Vec::new();
    let mut a = from;
    let mut i = 0;
    while i < pts.len() {
        // Furthest point still visible from `a`.
        let mut j = i;
        while j + 1 < pts.len() && los_clear(t, a, pts[j + 1]) {
            j += 1;
        }
        way.push(pts[j]);
        a = pts[j];
        i = j + 1;
    }
    way.push(to);
    Some(way)
}
