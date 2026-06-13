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

impl Sim {
    pub(crate) fn run_morale(&mut self, dt: f32) {
        if !self.tun.morale_enabled {
            return;
        }
        // The verdict must be SUSTAINED: a momentary rout (which may yet
        // rally) is not a decision — a 1v1 duel used to end the instant a
        // unit broke. Once the field has stayed decided for a few seconds,
        // the verdict is FINAL: morale freezes — the routed stay routed,
        // the standing never break — and the sim keeps running so the
        // pursuit plays out as bodies.
        if self.raw_victor().is_some() {
            self.verdict_hold += dt;
        } else {
            self.verdict_hold = 0.0;
        }
        if self.victor().is_some() {
            return;
        }
        // Enemy unit summaries for geometry checks (cheap; 40 units).
        // (center, team, alive, routing, speed, mass)
        // (center, team, alive, routing, measured advance of the MASS,
        // total living mass, offense = men x damage-per-second, pool =
        // men x health, morale). Formulas read men, mass, and measured
        // motion — never banners or commanded state (see README).
        let summaries: Vec<(Vec2, u32, usize, bool, f32, f32, f32, f32, f32)> = self
            .units
            .iter()
            .map(|u| {
                let stats = crate::class::class_stats(u.class);
                let dps = stats
                    .weapons
                    .iter()
                    .map(|w| w.damage / w.attack_interval)
                    .fold(0.0f32, f32::max);
                let n = u.alive_count as f32;
                (
                    u.center(),
                    u.team,
                    u.alive_count,
                    u.routing,
                    u.mass_advance.max(0.0),
                    n * stats.mass,
                    n * dps,
                    n * stats.health,
                    u.morale,
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
            let my_mass = alive_n * crate::class::class_stats(u.class).mass;
            let my_morale = u.morale;
            let my_pool = summaries[ui].7;
            for (vi, &(c, team, alive_v, v_routing, advance, mass_total, v_offense, _, v_morale)) in
                summaries.iter().enumerate()
            {
                if vi == ui || alive_v == 0 {
                    continue;
                }
                let d = (c - my_center).len();
                if team != my_team {
                    if v_routing {
                        if d < 90.0 {
                            // Relief scales with the SIZE of the rout you
                            // watch: a broken main line pays more than a
                            // fleeing handful of skirmishers.
                            let _ = v_offense;
                            let weight = (mass_total / my_mass).min(2.0);
                            enemy_backs += weight * (1.0 - d / 90.0);
                        }
                        continue; // a broken enemy frightens nobody
                    }
                    if d < 70.0 {
                        // Approaching MOMENTUM, relative to the mass it's
                        // aimed at: a wall of horse at the gallop is
                        // terrifying; five survivors of that wall are not.
                        // Measured advance, not commanded pace — a unit
                        // pinned in a jam frightens nobody.
                        let closing = ((my_center - c) * (1.0 / d.max(0.1)))
                            .dot(dir(self.units[vi].facing))
                            * advance;
                        if closing > 3.5 {
                            // Fear is ANTICIPATED HARM, both ledgers: the
                            // blood their weapons will draw (men x dps)
                            // PLUS the trample (mass x closing — the same
                            // momentum the collision system will cash on
                            // impact as knockdowns and displacement). The
                            // kinetic term is why horse out-frightens
                            // foot of equal dps: it arrives as a wall.
                            // 20 lancers on 100 heavies project ~nothing;
                            // 400 project a massacre. Confidence SHOWS:
                            // a wavering mass doesn't thunder — you fear
                            // units bolder than you, never shakier ones.
                            // The cap sits HIGH: a 10:1 mass closing in is
                            // hopeless, and hopelessness reads as exactly
                            // that — a token line breaks before the wall
                            // arrives, at full courage.
                            let arriving = v_offense + 0.01 * mass_total * closing;
                            let projected = (arriving / my_pool.max(1.0)).min(2.5);
                            let edge = ((v_morale - my_morale) / 0.25 + 1.0).clamp(0.0, 1.0);
                            intimidation += projected
                                * (closing / 6.0).min(1.5)
                                * (1.0 - d / 70.0)
                                * 3.0
                                * v_morale
                                * edge;
                        }
                    }
                } else if d < 80.0 {
                    if v_routing {
                        // Panic spreads from fleeing BODIES, not banners:
                        // an 8-man remnant streaming past is a sad sight,
                        // a 300-man collapse is a catastrophe.
                        let weight = (mass_total / my_mass).min(2.0);
                        rout_contagion += weight * (1.0 - d / 80.0);
                    } else if alive_v > 50 {
                        steady_friends += 1.0 - d / 80.0;
                    }
                }
            }

            // --- amplifiers -------------------------------------------------
            let u = &self.units[ui];
            // Discipline is the endurance of the will: a drilled line eats
            // casualties that send a levy running (the tier knob).
            let discipline = 1.85 - 1.4 * u.training;
            let amp = (1.0 + (1.0 - u.cohesion))
                * (1.0 + 0.5 * (1.0 - u.fatigue))
                * if surrounded { 1.6 } else { 1.0 }
                * discipline;

            // BLOOD is the primary breaker — a mirror grind runs minutes and
            // ends deep in the casualty list. Attack DIRECTIONS amplify the
            // blood (dying to blows from two sides breaks faster than the
            // same losses frontally) but flanking alone, with nobody dying,
            // flash-breaks nobody. The shove only registers as a real
            // drive-back; fear terms (charge, contagion) stay small.
            let directions = 1.0 + 0.5 * (spread - 1.0).max(0.0);
            // Fear HABITUATES: the stimulus drains by what exceeds the
            // adapted level (plus a quarter that always leaks through —
            // men never fully ignore cavalry at their backs). Blood does
            // not habituate.
            let fear = 0.05 * intimidation + 0.025 * rout_contagion;
            let fear_adapt = self.units[ui].fear_adapt;
            let fear_eff = (fear - fear_adapt).max(0.0) + 0.25 * fear;
            let drain = (0.038 * casualty_rate * directions
                + 0.06 * missile_rate
                + 0.002 * (losing_push - 1.2).max(0.0)
                + fear_eff)
                * amp;

            // Recovery: quiet, distant from FIGHTING threats (a fleeing
            // enemy nearby is no threat at all), among steady friends.
            let nearest_enemy = summaries
                .iter()
                .filter(|s| s.1 != my_team && s.2 > 0 && !s.3)
                .map(|s| (s.0 - my_center).len())
                .fold(f32::MAX, f32::min);
            // "At ease": no living, non-routing enemy within at_ease_range (the
            // SAME range that relaxes the stance and lets the line shuffle — a
            // unit at ease in one sense is at ease in all).
            let quiet =
                u.engaged == 0 && u.recent_casualties < 0.5 && nearest_enemy > self.tun.at_ease_range;
            let recover = if quiet {
                (0.012 + 0.004 * steady_friends) * (0.5 + 0.5 * u.training)
            } else {
                0.0
            }
            // Watching the enemy break is worth more than any rest: it
            // counters the casualty tail of the fight just won.
            + 0.05 * enemy_backs;

            let u = &mut self.units[ui];
            u.fear_adapt += (fear - u.fear_adapt) * (1.0 - (-dt / 15.0f32).exp());
            u.morale = (u.morale - drain * dt + recover * dt).clamp(0.0, u.morale_ceiling);
            u.recent_missiles *= 1.0 - (dt / 8.0);
            u.losing_push *= 1.0 - (dt / 4.0);

            // --- break / rally ----------------------------------------------
            if !u.routing && u.morale < BREAK_AT {
                u.routing = true;
                u.morale_ceiling *= RALLY_SCAR;
                u.move_target = None;
                u.pending_target = None;
                u.resume_target = None;
                u.path.clear();
                u.waiting = false;
                u.mode = OrderMode::Move;
            } else if u.routing && quiet && u.morale > 0.45 * u.morale_ceiling {
                // Rallied: halt where they stand, scarred but a unit again.
                u.routing = false;
                u.anchor = u.centroid + dir(u.facing) * (0.5 * u.depth());
                u.deaths_since_reform = u.alive_count; // force a full re-form
            }
        }
    }

    /// 0 or 1 once one army has been finished (>60% of its units routing or
    /// dead) for a SUSTAINED beat — transient routs may still rally.
    pub fn victor(&self) -> Option<u32> {
        if self.verdict_hold < 8.0 {
            return None;
        }
        self.raw_victor()
    }

    /// The instantaneous read of the same condition.
    fn raw_victor(&self) -> Option<u32> {
        for team in [0u32, 1] {
            let mine: Vec<&crate::unit::Unit> =
                self.units.iter().filter(|u| u.team == team).collect();
            if mine.is_empty() {
                continue;
            }
            // Only VISIBLE reality counts: dead or currently fleeing. (A
            // rally-scarred ceiling used to count standing, fighting units
            // as finished — the player saw one rout flip an apparently
            // healthy battle to game over.)
            let finished = mine
                .iter()
                .filter(|u| u.alive_count == 0 || u.routing)
                .count();
            if finished * 10 > mine.len() * 6 {
                return Some(1 - team);
            }
        }
        None
    }
}
