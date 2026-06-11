//! Morale: the will to fight. A hidden state, but it obeys the same law as
//! everything else — its INPUTS are physical facts (casualty rate, contact
//! bearings, anchor drift vs intent, incoming charge momentum, arrows,
//! nearby routs) and its OUTPUTS are physical behaviors (flee as bodies).
//! Crowd pressure is deliberately NOT an input: an advancing column must
//! never rout from its own deliberate press.

use crate::math::{dir, Vec2};
use crate::sim::Sim;
use crate::unit::OrderMode;

/// Morale below this breaks the unit.
const BREAK_AT: f32 = 0.18;
/// Rallied units carry scars: ceiling multiplier per rout.
const RALLY_SCAR: f32 = 0.78;
/// A unit reduced below this fraction of its strength never rallies.
const SHATTER_FRAC: f32 = 0.16;

impl Sim {
    pub(crate) fn run_morale(&mut self, dt: f32) {
        if !self.tun.morale_enabled {
            return;
        }
        // Enemy unit summaries for geometry checks (cheap; 40 units).
        // (center, team, alive, routing, speed, mass)
        let summaries: Vec<(Vec2, u32, usize, bool, f32, f32)> = self
            .units
            .iter()
            .map(|u| {
                (
                    u.center(),
                    u.team,
                    u.alive_count,
                    u.routing,
                    u.speed,
                    crate::class::class_stats(u.class).mass,
                )
            })
            .collect();

        for ui in 0..self.units.len() {
            let u = &self.units[ui];
            if u.alive_count == 0 {
                continue;
            }
            let my_team = u.team;
            let my_center = u.center();
            let alive_n = u.alive_count.max(1) as f32;

            // --- physical inputs ------------------------------------------
            let casualty_rate = u.recent_casualties / alive_n; // per ~8s window
            let missile_rate = u.recent_missiles / alive_n;
            let losing_push = u.losing_push;

            // Attack DIRECTIONS from the contact histogram: contiguous active
            // sectors merge into one direction. A frontal fight (1-3 adjacent
            // sectors) is one direction and costs nothing; flanked = 2;
            // surrounded = 3+. Raw sector counts would panic every line fight.
            let active: Vec<bool> = (0..12).map(|k| u.contact_hist[k] > 1.5).collect();
            let mut groups = 0;
            for k in 0..12 {
                if active[k] && !active[(k + 11) % 12] {
                    groups += 1;
                }
            }
            if groups == 0 && active.iter().any(|&a| a) {
                groups = 1; // fully encircled: every sector active
            }
            let spread = groups as f32;
            let active_count = active.iter().filter(|&&a| a).count();
            let surrounded = groups >= 3 || active_count >= 8;

            // Charge intimidation: incoming kinetic energy, pre-contact.
            let mut intimidation = 0.0f32;
            // Nearby friendly routs: panic is contagious in sight range.
            let mut rout_contagion = 0.0f32;
            // Steady friends nearby brace the will.
            let mut steady_friends = 0.0f32;
            // The sight of enemy BACKS: a routing enemy emits nothing to
            // fear — it emits relief. This is what breaks the mutual-rout
            // race: the side that holds one beat longer gets paid for it.
            let mut enemy_backs = 0.0f32;
            for (vi, &(c, team, alive_v, v_routing, speed, mass)) in summaries.iter().enumerate() {
                if vi == ui || alive_v == 0 {
                    continue;
                }
                let d = (c - my_center).len();
                if team != my_team {
                    if v_routing {
                        if d < 90.0 {
                            enemy_backs += 1.0 - d / 90.0;
                        }
                        continue; // a broken enemy frightens nobody
                    }
                    if d < 70.0 {
                        // Mass x closing speed, scaled by proximity: a wall
                        // of horse at the gallop is terrifying whatever its
                        // controller calls the gait. Walking lines are not.
                        let closing = ((my_center - c) * (1.0 / d.max(0.1))).dot(dir(
                            self.units[vi].facing,
                        )) * speed;
                        if closing > 3.5 {
                            intimidation += mass * closing * (1.0 - d / 70.0) * 0.01;
                        }
                    }
                } else if d < 80.0 {
                    if v_routing {
                        rout_contagion += 1.0 - d / 80.0;
                    } else if alive_v > 50 {
                        steady_friends += 1.0 - d / 80.0;
                    }
                }
            }

            // --- amplifiers -------------------------------------------------
            let u = &self.units[ui];
            let amp = (1.0 + (1.0 - u.cohesion))
                * (1.0 + 0.5 * (1.0 - u.fatigue))
                * if surrounded { 1.6 } else { 1.0 };

            let drain = (0.4 * casualty_rate
                + 0.35 * missile_rate
                + 0.02 * losing_push
                + 0.025 * (spread - 1.0).max(0.0)
                + 0.06 * intimidation
                + 0.05 * rout_contagion)
                * amp;

            // Recovery: quiet, distant from FIGHTING threats (a fleeing
            // enemy nearby is no threat at all), among steady friends.
            let nearest_enemy = summaries
                .iter()
                .filter(|s| s.1 != my_team && s.2 > 0 && !s.3)
                .map(|s| (s.0 - my_center).len())
                .fold(f32::MAX, f32::min);
            let quiet = u.engaged == 0 && u.recent_casualties < 0.5 && nearest_enemy > 60.0;
            let recover = if quiet {
                (0.012 + 0.004 * steady_friends) * (0.5 + 0.5 * u.training)
            } else {
                0.0
            }
            // Watching the enemy break is worth more than any rest: it
            // counters the casualty tail of the fight just won.
            + 0.05 * enemy_backs;

            let u = &mut self.units[ui];
            u.morale = (u.morale - drain * dt + recover * dt).clamp(0.0, u.morale_ceiling);
            u.recent_missiles *= 1.0 - (dt / 8.0);
            u.losing_push *= 1.0 - (dt / 4.0);

            // --- break / rally ----------------------------------------------
            let shattered = (u.alive_count as f32) < SHATTER_FRAC * u.count as f32;
            if !u.routing && u.morale < BREAK_AT {
                u.routing = true;
                u.morale_ceiling *= RALLY_SCAR;
                u.move_target = None;
                u.pending_target = None;
                u.resume_target = None;
                u.path.clear();
                u.waiting = false;
                u.mode = OrderMode::Move;
            } else if u.routing && !shattered && quiet && u.morale > 0.45 * u.morale_ceiling {
                // Rallied: halt where they stand, scarred but a unit again.
                u.routing = false;
                u.anchor = u.centroid + dir(u.facing) * (0.5 * u.depth());
                u.deaths_since_reform = u.alive_count; // force a full re-form
            }
        }
    }

    /// 0 or 1 once one army is finished (>60% of its units routing or dead),
    /// u32::MAX while contested.
    pub fn victor(&self) -> Option<u32> {
        for team in [0u32, 1] {
            let mine: Vec<&crate::unit::Unit> =
                self.units.iter().filter(|u| u.team == team).collect();
            if mine.is_empty() {
                continue;
            }
            let finished = mine
                .iter()
                .filter(|u| u.alive_count == 0 || u.routing || u.morale_ceiling < 0.45)
                .count();
            if finished * 10 > mine.len() * 6 {
                return Some(1 - team);
            }
        }
        None
    }
}
