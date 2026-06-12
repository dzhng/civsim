//! Body collision: the physical medium of the battle.
//!
//! Soldiers are circles; mounted soldiers are TWO circles (an elongated horse)
//! whose rider sits at the center — rider reachability is pure geometry.
//! Overlapping bodies push apart, the lighter yielding more. A body being
//! driven from behind (measured backpressure) yields less and so transmits
//! force forward — deep columns push thin lines back, pike walls hold, and
//! crowds crush, all from this one rule.
//!
//! Per-soldier outputs measured here (never written by gameplay):
//! - pressure: EMA |received push| (m/s) — crush; kills evade.
//! - press vector: EMA net received push — directional transmission.
//! Charge impacts (closing speed × effective mass) stun and displace.

use crate::class::{HORSE_BODY_R, HORSE_HALF_LEN};
use crate::math::Vec2;
use crate::sim::Sim;
use crate::tunables::DT;

impl Sim {
    pub(crate) fn apply_separation(&mut self) {
        let n = self.soldier_count();
        if n == 0 {
            return;
        }
        let tun = self.tun;

        // --- per-unit brace factor; per-soldier effective mass -------------
        let brace: Vec<f32> = self.units.iter().map(|u| u.brace()).collect();

        // --- build bodies ----------------------------------------------------
        self.body_pos.clear();
        self.body_r.clear();
        self.body_owner.clear();
        for i in 0..n {
            if self.alive[i] == 0 {
                continue;
            }
            let px = self.positions[2 * i];
            let py = self.positions[2 * i + 1];
            if self.mounted[i] == 1 {
                let f = crate::math::dir(self.facings[i]);
                for s in [-1.0f32, 1.0] {
                    self.body_pos.push(px + f.x * HORSE_HALF_LEN * s);
                    self.body_pos.push(py + f.y * HORSE_HALF_LEN * s);
                    self.body_r.push(HORSE_BODY_R);
                    self.body_owner.push(i as u32);
                }
            } else {
                self.body_pos.push(px);
                self.body_pos.push(py);
                self.body_r.push(self.radius[i]);
                self.body_owner.push(i as u32);
            }
        }
        let nb = self.body_owner.len();
        let max_pair = 2.0 * self.max_radius.max(HORSE_BODY_R);
        let cell = (max_pair * 1.3).max(0.5);

        let Sim {
            positions,
            prev_positions,
            grid,
            scratch,
            terrain,
            mass,
            pressure,
            press_x,
            press_y,
            stun,
            mom_x,
            mom_y,
            soldier_unit,
            units,
            body_pos,
            body_r,
            body_owner,
            ..
        } = self;
        grid.rebuild(cell, body_pos);
        // scratch: per-soldier [push_x, push_y]; plus raw pressure accumulators.
        scratch.clear();
        scratch.resize(2 * n, 0.0);
        let mut raw_x = vec![0.0f32; n];
        let mut raw_y = vec![0.0f32; n];
        let mut raw_mag = vec![0.0f32; n];

        let m_eff = |i: usize| mass[i] * brace[soldier_unit[i] as usize];
        let vel = |i: usize| -> Vec2 {
            Vec2::new(
                (positions[2 * i] - prev_positions[2 * i]) / DT,
                (positions[2 * i + 1] - prev_positions[2 * i + 1]) / DT,
            )
        };

        for bi in 0..nb {
            let i = body_owner[bi] as usize;
            let px = body_pos[2 * bi];
            let py = body_pos[2 * bi + 1];
            let cx = (px / cell).floor() as i32;
            let cy = (py / cell).floor() as i32;
            let mut seen = [usize::MAX; 9];
            let mut seen_len = 0;
            let mut push = Vec2::ZERO;

            for oy in -1..=1i32 {
                for ox in -1..=1i32 {
                    let b = grid.bucket(cx + ox, cy + oy);
                    if seen[..seen_len].contains(&b) {
                        continue;
                    }
                    seen[seen_len] = b;
                    seen_len += 1;
                    let (lo, hi) = (grid.starts[b] as usize, grid.starts[b + 1] as usize);
                    for &bj in &grid.entries[lo..hi] {
                        let bj = bj as usize;
                        let j = body_owner[bj] as usize;
                        if j == i {
                            continue;
                        }
                        let dx = px - body_pos[2 * bj];
                        let dy = py - body_pos[2 * bj + 1];
                        let d2 = dx * dx + dy * dy;
                        let min_dist = body_r[bi] + body_r[bj];
                        if d2 >= min_dist * min_dist {
                            continue;
                        }
                        if d2 > 1e-8 {
                            let d = d2.sqrt();
                            let (nx, ny) = (dx / d, dy / d);
                            // Slide lubricates FRIENDLY crowds (relief-in-place,
                            // funneling). Enemies don't politely sidestep each
                            // other: head-on enemy contact deadlocks into a
                            // battle line, which is the point.
                            let ui = soldier_unit[i] as usize;
                            let uj = soldier_unit[j] as usize;
                            let slide = if units[ui].team == units[uj].team {
                                tun.separation_slide
                            } else {
                                0.0
                            };
                            // Directional transmission: a body pushed from
                            // behind (its measured press vector driving it
                            // along -n, i.e. into j) yields less. A staggered
                            // man absorbs the press instead of transmitting
                            // it — sustained strikes break the force chain.
                            let gate_i = if stun[i] > 0.0 { 0.0 } else { 1.0 };
                            let gate_j = if stun[j] > 0.0 { 0.0 } else { 1.0 };
                            let drive_i = 1.0
                                + tun.press_drive
                                    * gate_i
                                    * (-(press_x[i] * nx + press_y[i] * ny)).max(0.0);
                            let drive_j = 1.0
                                + tun.press_drive
                                    * gate_j
                                    * (press_x[j] * nx + press_y[j] * ny).max(0.0);
                            let w_i = m_eff(i) * drive_i;
                            let w_j = m_eff(j) * drive_j;
                            let share = w_j / (w_i + w_j);
                            let overlap = (min_dist - d) * share;
                            push.x += (nx - slide * ny) * overlap;
                            push.y += (ny + slide * nx) * overlap;

                            // Charge impact: a fast enemy body slamming in
                            // knocks the lighter party down and bowls it back.
                            if units[ui].team != units[uj].team {
                                let closing = (vel(j) - vel(i)).dot(Vec2::new(nx, ny)).max(0.0);
                                if closing > tun.charge_min_speed {
                                    let momentum = m_eff(j) * closing;
                                    push.x += nx * closing * tun.impact_push * DT * share;
                                    push.y += ny * closing * tun.impact_push * DT * share;
                                    if momentum > tun.stun_momentum && m_eff(j) > m_eff(i) {
                                        stun[i] = stun[i].max(tun.stun_time);
                                    }
                                    // The impactor RETAINS 0.6 of its closing
                                    // momentum as carried drive (the rest bleeds
                                    // into the body it just hit): armed here,
                                    // spent against the crowd, zeroed by
                                    // stagger. Never exceeds what the approach
                                    // physically justifies — a sprinting heavy
                                    // carries a stride; half a ton of horse
                                    // carries meters.
                                    let cur = (mom_x[j] * mom_x[j] + mom_y[j] * mom_y[j]).sqrt();
                                    if cur < momentum * 0.6 {
                                        mom_x[j] = nx * momentum * 0.6;
                                        mom_y[j] = ny * momentum * 0.6;
                                    }
                                }
                            }
                        } else {
                            push.x += if i < j { 0.01 } else { -0.01 };
                        }
                    }
                }
            }
            scratch[2 * i] += push.x;
            scratch[2 * i + 1] += push.y;
            raw_x[i] += push.x;
            raw_y[i] += push.y;
            raw_mag[i] += push.len();
        }

        // --- apply (capped per soldier, walls slide) + update pressure EMAs --
        let alpha = 1.0 - (-DT / tun.press_tau).exp();
        for i in 0..n {
            let mut px = scratch[2 * i];
            let mut py = scratch[2 * i + 1];
            let mag = (px * px + py * py).sqrt();
            if mag > tun.separation_max_push {
                let k = tun.separation_max_push / mag;
                px *= k;
                py *= k;
            }
            let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
            let np = Vec2::new(p.x + px, p.y + py);
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

            pressure[i] += (raw_mag[i] / DT - pressure[i]) * alpha;
            press_x[i] += (raw_x[i] / DT - press_x[i]) * alpha;
            press_y[i] += (raw_y[i] / DT - press_y[i]) * alpha;
        }
    }
}
