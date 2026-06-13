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
            kin_vx,
            kin_vy,
            grid,
            scratch,
            terrain,
            mass,
            recv_x,
            recv_y,
            recv_mag,
            cond_x,
            cond_y,
            stun,
            mom_x,
            mom_y,
            soldier_unit,
            units,
            body_pos,
            body_r,
            body_owner,
            health,
            mount_health,
            mounted,
            ..
        } = self;
        // Collision damage is applied after the pass (kill() needs &mut self).
        let mut impact_kills: Vec<usize> = Vec::new();
        grid.rebuild(cell, body_pos);
        let mut raw_cx = vec![0.0f32; n];
        let mut raw_cy = vec![0.0f32; n];
        // scratch: per-soldier [push_x, push_y]; plus raw pressure accumulators.
        scratch.clear();
        scratch.resize(2 * n, 0.0);

        let m_eff = |i: usize| mass[i] * brace[soldier_unit[i] as usize];
        // The impact stack reads HONEST velocity (legs + carried momentum,
        // recorded pre-solver) — position deltas in a scrum are dominated
        // by separation churn that carries no kinetic energy.
        let vel = |i: usize| -> Vec2 { Vec2::new(kin_vx[i], kin_vy[i]) };

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
                                    * (-(cond_x[i] * nx + cond_y[i] * ny)).max(0.0);
                            let drive_j = 1.0
                                + tun.press_drive
                                    * gate_j
                                    * (cond_x[j] * nx + cond_y[j] * ny).max(0.0);
                            let w_i = m_eff(i) * drive_i;
                            let w_j = m_eff(j) * drive_j;
                            let share = w_j / (w_i + w_j);
                            let overlap = (min_dist - d) * share;
                            push.x += (nx - slide * ny) * overlap;
                            push.y += (ny + slide * nx) * overlap;

                            // Charge impact: a fast enemy body slamming in
                            // knocks men down and bowls them back. Felling is
                            // a contest of masses: the threshold scales with
                            // the victim's FULL effective mass — brace and
                            // the press chain behind him both hold him up, so
                            // the front rank of a braced, backed column keeps
                            // its feet (and keeps transmitting) where a loose
                            // man is bowled over.
                            if units[ui].team != units[uj].team {
                                let closing = (vel(j) - vel(i)).dot(Vec2::new(nx, ny)).max(0.0);
                                if closing > tun.charge_min_speed {
                                    let momentum = m_eff(j) * closing;
                                    // IMPALE: when the body I am slamming
                                    // into holds a PLANTED POLE (reach is
                                    // the physics: a pike braces to grip,
                                    // rear hand, ground; a sword absorbs
                                    // and deflects), the point returns my
                                    // own closing momentum every tick of
                                    // the contact — a hedge is a brake,
                                    // not a cadence. Self-gating to
                                    // charge-grade closings: slow pressers
                                    // pay nothing (deep-pike infantry
                                    // contract). Waterloo squares.
                                    let pole = crate::class::class_stats(units[uj].class)
                                        .weapons
                                        .iter()
                                        .fold(0.0f32, |m, w| m.max(w.reach));
                                    let planted = ((pole - 1.0) / 2.2).clamp(0.0, 1.0);
                                    // Hedge depth (mirrors the combat impale):
                                    // the brake at contact is the per-point
                                    // grip times the fraction of the reach-
                                    // deep hedge that is manned.
                                    let hedge = {
                                        let pu = &units[uj];
                                        let ranks = pu.alive_count as f32
                                            / pu.files_eff.max(1) as f32;
                                        let sp = crate::class::class_stats(pu.class)
                                            .spacing
                                            .y
                                            .max(0.5);
                                        (ranks / (pole / sp).max(1.0)).clamp(0.0, 1.0)
                                    };
                                    // A braced man behind a planted POLE
                                    // keeps his feet against the very mass
                                    // his point is arresting — the horse
                                    // never truly reaches a standing pike
                                    // (its stop happens at reach). Without
                                    // this, the wall's own shove-back
                                    // re-slams the front rank prone and
                                    // the storm opens the hedge.
                                    let my_pole = crate::class::class_stats(units[ui].class)
                                        .weapons
                                        .iter()
                                        .fold(0.0f32, |m, w| m.max(w.reach));
                                    let my_planted = ((my_pole - 1.0) / 2.2).clamp(0.0, 1.0);
                                    let footing = 1.0 + 5.0 * my_planted * my_planted * (units[ui].brace() - 1.0).max(0.0);
                                    push.x += nx * closing * tun.impact_push * DT * share;
                                    push.y += ny * closing * tun.impact_push * DT * share;
                                    // ...and a planted POLE bleeds the
                                    // arriving body's CARRIED momentum
                                    // itself — the charge spends on the
                                    // point, every tick of the contact
                                    // (a position push saturates against
                                    // the separation cap; the glide is
                                    // where the charge actually lives).
                                    // Quadratic in the shaft: swords
                                    // shrug, spears resist, pikes WALL.
                                    if planted > 0.0 {
                                        let toward = -(mom_x[i] * nx + mom_y[i] * ny);
                                        if toward > 0.0 {
                                            let grip =
                                                (1.6 * share * planted * planted * hedge).min(0.5);
                                            mom_x[i] += nx * toward * grip;
                                            mom_y[i] += ny * toward * grip;
                                        }
                                    }
                                    if momentum > tun.stun_momentum * w_i * footing {
                                        // Being KNOCKED DOWN hurts, in
                                        // proportion to the throw (Δv =
                                        // momentum over your braced, backed
                                        // mass). One hurt per knockdown —
                                        // the impulse, not a grind — and
                                        // braced men who keep their feet
                                        // keep their bones.
                                        let dv = momentum / w_i.max(0.1);
                                        // Bones break under a TRAMPLING mass
                                        // (horse, chariot — the classes that
                                        // ride through), each at its own
                                        // weight of hoof. Men bumping men at
                                        // a run bruise and fall, nothing more.
                                        let knockback =
                                            crate::class::class_stats(units[uj].class).knockback_mult;
                                        // Universal: ANYONE felled at
                                        // charge-grade closing gets hurt —
                                        // no charge-state gate needed now
                                        // that closing is honest motion
                                        // (a scrum's churn reads ~0 and
                                        // can neither fell nor mint).
                                        if stun[i] <= 0.0 && knockback > 0.0 {
                                            let pool = if mounted[i] == 1 {
                                                &mut mount_health[i]
                                            } else {
                                                &mut health[i]
                                            };
                                            *pool -= tun.impact_damage * knockback * dv;
                                            if *pool <= 0.0 {
                                                impact_kills.push(i);
                                            }
                                        }
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
            recv_x[i] += push.x;
            recv_y[i] += push.y;
            recv_mag[i] += push.len();
            raw_cx[i] += push.x;
            raw_cy[i] += push.y;
        }

        // --- apply (capped per soldier, walls slide) + fold the CONDUCTION
        // chain EMA (collision-only; the full ledger folds at tick end) ----
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

            cond_x[i] += (raw_cx[i] / DT - cond_x[i]) * alpha;
            cond_y[i] += (raw_cy[i] / DT - cond_y[i]) * alpha;
        }

        // The throws that broke bodies: bookkeeping after the borrow ends.
        self.impact_casualties += impact_kills.len() as u64;
        for &i in &impact_kills {
            self.kill(i);
        }
    }
}
