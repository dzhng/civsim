//! Soldier-soldier collision: pairs closer than 2 * soldier_radius push
//! apart (Jacobi-style: displacements computed from a snapshot, then
//! applied, so the result is order-independent and deterministic).
//! Displaced soldiers drift from their slots, so collision feeds disorder
//! through the normal measurement with no extra coupling code.

use crate::sim::Sim;

impl Sim {
    pub(crate) fn apply_separation(&mut self) {
        let n = self.soldier_count();
        if n == 0 {
            return;
        }
        let tun = self.tun;
        let max_pair = 2.0 * self.max_radius;
        let cell = (max_pair * 1.3).max(0.5);
        let Sim {
            positions,
            grid,
            scratch,
            terrain,
            radius,
            mass,
            ..
        } = self;
        grid.rebuild(cell, positions);
        scratch.clear();
        scratch.resize(2 * n, 0.0);

        for i in 0..n {
            let px = positions[2 * i];
            let py = positions[2 * i + 1];
            let cx = (px / cell).floor() as i32;
            let cy = (py / cell).floor() as i32;
            // Distinct cells can hash to one bucket; visit each bucket once
            // or pairs in it would be pushed twice.
            let mut seen = [usize::MAX; 9];
            let mut seen_len = 0;
            let mut push_x = 0.0f32;
            let mut push_y = 0.0f32;

            for oy in -1..=1i32 {
                for ox in -1..=1i32 {
                    let b = grid.bucket(cx + ox, cy + oy);
                    if seen[..seen_len].contains(&b) {
                        continue;
                    }
                    seen[seen_len] = b;
                    seen_len += 1;
                    let (lo, hi) = (grid.starts[b] as usize, grid.starts[b + 1] as usize);
                    for &j in &grid.entries[lo..hi] {
                        let j = j as usize;
                        if j == i {
                            continue;
                        }
                        let dx = px - positions[2 * j];
                        let dy = py - positions[2 * j + 1];
                        let d2 = dx * dx + dy * dy;
                        let min_dist = radius[i] + radius[j];
                        if d2 >= min_dist * min_dist {
                            continue;
                        }
                        if d2 > 1e-8 {
                            let d = d2.sqrt();
                            // The lighter body yields: a horse barging into a
                            // man moves him, not itself. (No anti-anything
                            // stats — just mass.)
                            let share = mass[j] / (mass[i] + mass[j]);
                            let overlap = (min_dist - d) * share;
                            let (nx, ny) = (dx / d, dy / d);
                            // Radial push plus a tangential slide with the same
                            // chirality on both sides of the pair, so head-on
                            // soldiers spiral past each other instead of
                            // deadlocking in symmetric shoving.
                            push_x += (nx - tun.separation_slide * ny) * overlap;
                            push_y += (ny + tun.separation_slide * nx) * overlap;
                        } else {
                            // Coincident: antisymmetric deterministic nudge.
                            push_x += if i < j { 0.01 } else { -0.01 };
                        }
                    }
                }
            }

            let mag = (push_x * push_x + push_y * push_y).sqrt();
            if mag > tun.separation_max_push {
                let k = tun.separation_max_push / mag;
                push_x *= k;
                push_y *= k;
            }
            scratch[2 * i] = push_x;
            scratch[2 * i + 1] = push_y;
        }

        // Apply, but the crowd can't shove a man inside a wall: slide along
        // it instead (the press piles up against walls, not into them).
        use crate::math::Vec2;
        for i in 0..n {
            let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
            let np = Vec2::new(p.x + scratch[2 * i], p.y + scratch[2 * i + 1]);
            let np = if terrain.speed_at(np) > 0.0 || terrain.speed_at(p) <= 0.0 {
                np
            } else {
                let sx = Vec2::new(np.x, p.y);
                let sy = Vec2::new(p.x, np.y);
                if terrain.speed_at(sx) > 0.0 {
                    sx
                } else if terrain.speed_at(sy) > 0.0 {
                    sy
                } else {
                    p
                }
            };
            positions[2 * i] = np.x;
            positions[2 * i + 1] = np.y;
        }
    }
}
