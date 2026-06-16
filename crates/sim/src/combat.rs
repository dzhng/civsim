//! Melee: arc swings against whatever is in the envelope.
//!
//! A weapon is five numbers (reach, min_range, arc, interval, damage).
//! Everything else is geometry and measurement:
//! - cleave: every enemy inside the (reach × arc) envelope is struck;
//! - crush sensitivity: friendly bodies inside the envelope shrink the arc
//!   and slow the swing — big envelopes (long swords) die in a press,
//!   tiny ones (daggers, pike lines) thrive;
//! - riders: a mounted body's rider sits at its center — only weapons whose
//!   reach spans the horse's length can strike him frontally, anything can
//!   from the flanks. No anti-cavalry stats anywhere.
//! - pushes: every landed OR blocked strike displaces the defender by
//!   attacker/defender effective-mass ratio. Evasion avoids the push but
//!   needs room: it scales to zero under crush pressure.
//!
//! Runs at 10 Hz per soldier (round-robin thirds), deterministic.

use crate::class::{UnitClassId, Weapon};
use crate::math::{dir, wrap_angle, Vec2};
use crate::movement::fatigue_capacity;
use crate::sim::Sim;
use crate::tunables::DT;
use crate::unit::OrderMode;

/// Alignment slack on top of arc/2 for striking the primary target.
const AIM_TOLERANCE: f32 = 0.35;
/// Victims struck by one swing, at most (sanity cap; arc decides reality).
const MAX_VICTIMS: usize = 5;
/// Engagement breaks beyond this surface distance (m). Doubles as the
/// local-fight-density radius (fight_near): one awareness bubble.
const DISENGAGE_DIST: f32 = 6.0;
/// A man covers this arc (rad from facing) with shield and eyes: full
/// block and full evade inside it. One arc for melee and missiles alike.
pub(crate) const FRONT_ARC: f32 = 1.05;
/// Canceling push (m/s) at which a man is fully WEDGED — the vice that
/// pins his elbows. Measured as scalar pressure minus the net push vector:
/// shoved from one side they nearly cancel out to zero (you yield a step
/// and keep your arms); pressed from opposing sides the magnitudes stay
/// and the net dies — that remainder is the vice. (Scaled to the FULL
/// received-push ledger — weapon pushes post too, roughly doubling melee
/// pressure readings relative to the collision-only era.)
const VICE_PIN: f32 = 1.0;
/// Crowding penalty an UNWEDGED man still pays: a comrade in your arc is
/// geometry you must work around even with room to step and time the sweep.
const OBSTRUCT_FLOOR: f32 = 0.7;
/// Out to here a blow comes side-on: evade degrades; behind it, a blow
/// lands on a man facing the wrong way.
const SIDE_ARC: f32 = 2.1;

impl Sim {
    /// One combat pass; call every tick. Soldier i acts when i % 3 == phase.
    pub(crate) fn run_combat(&mut self) {
        let n = self.soldier_count();
        if n == 0 {
            return;
        }
        let tun = self.tun;
        let phase = (self.tick_count % 3) as usize;
        let cell = self.grid.cell_size;

        // Units anywhere near an enemy (coarse gate so the quiet 90% of the
        // battlefield costs nothing).
        let near_enemy: Vec<bool> = self
            .units
            .iter()
            .map(|u| {
                let eu = 0.5 * u.width().max(u.depth());
                self.units.iter().any(|v| {
                    v.team != u.team
                        && v.alive_count > 0
                        && (v.center() - u.center()).len()
                            < eu + 0.5 * v.width().max(v.depth()) + 40.0
                })
            })
            .collect();

        for i in (phase..n).step_by(3) {
            if self.alive[i] == 0 || self.stun[i] > 0.0 {
                continue;
            }
            let ui = self.soldier_unit[i] as usize;
            if !near_enemy[ui] {
                self.target[i] = -1;
                self.fighting[i] = 0;
                self.fight_near[i] = 0;
                self.front_clear[i] = 1;
                continue;
            }
            let my_team = self.units[ui].team;
            let disengaged =
                self.units[ui].mode == OrderMode::Disengage || self.units[ui].routing;
            let stats = self.units[ui].stats;
            let weapons = stats.weapons;
            let max_reach = weapons.iter().map(|w| w.reach).fold(0.0f32, f32::max);
            let my_r = self.radius[i];
            let p = self.soldier_pos(i);

            // --- find nearest enemy + count envelope obstruction ------------
            // The scan covers awareness range: targeting, obstruction, AND
            // the local fight-density measurement all come from this pass.
            let search = (max_reach + 1.2).max(DISENGAGE_DIST);
            let range_cells = ((search / cell).ceil() as i32).clamp(1, 4);
            let mut nearest: i32 = -1;
            let mut nearest_d = f32::MAX;
            // (victim, surface distance, bearing)
            let mut candidates: [(u32, f32, f32); 12] = [(0, 0.0, 0.0); 12];
            let mut cand_len = 0usize;
            // Friendly bodies nearby: raw bearing + distance (offsets are
            // computed against facing or target bearing as needed).
            // (bearing, d_surf, is_fighting)
            let mut friends: [(f32, f32, bool); 24] = [(0.0, 0.0, false); 24];
            let mut friends_len = 0usize;
            let mut fight_near = 0u32;

            let cx = (p.x / cell).floor() as i32;
            let cy = (p.y / cell).floor() as i32;
            let mut seen = [usize::MAX; 81]; // 9x9: range_cells caps at 4
            let mut seen_len = 0;
            for oy in -range_cells..=range_cells {
                for ox in -range_cells..=range_cells {
                    let b = self.grid.bucket(cx + ox, cy + oy);
                    if seen[..seen_len].contains(&b) {
                        continue;
                    }
                    seen[seen_len] = b;
                    seen_len += 1;
                    let (lo, hi) = (self.grid.starts[b] as usize, self.grid.starts[b + 1] as usize);
                    for &bj in &self.grid.entries[lo..hi] {
                        let bj = bj as usize;
                        let j = self.body_owner[bj] as usize;
                        if j == i || self.alive[j] == 0 {
                            continue;
                        }
                        let bp = Vec2::new(self.body_pos[2 * bj], self.body_pos[2 * bj + 1]);
                        let to = bp - p;
                        let d_surf = to.len() - self.body_r[bj] - my_r;
                        if d_surf > search {
                            continue;
                        }
                        let bearing = to.y.atan2(to.x);
                        let uj = self.soldier_unit[j] as usize;
                        if self.units[uj].team == my_team {
                            if uj == ui && self.fighting[j] == 1 && d_surf < DISENGAGE_DIST {
                                fight_near += 1;
                            }
                            if d_surf < (max_reach * 0.9).max(1.6) && friends_len < friends.len() {
                                friends[friends_len] =
                                    (bearing, d_surf.max(0.05), self.fighting[j] == 1);
                                friends_len += 1;
                            }
                            continue;
                        }
                        if d_surf < nearest_d {
                            nearest_d = d_surf;
                            nearest = j as i32;
                        }
                        if cand_len < candidates.len() && d_surf <= max_reach {
                            // Dedup per owner (two horse circles = one victim).
                            if !candidates[..cand_len].iter().any(|c| c.0 == j as u32) {
                                candidates[cand_len] = (j as u32, d_surf, bearing);
                                cand_len += 1;
                            }
                        }
                    }
                }
            }

            self.fight_near[i] = fight_near.min(10) as u8;
            if nearest < 0 || nearest_d > DISENGAGE_DIST {
                self.target[i] = -1;
                self.fighting[i] = 0;
                continue;
            }
            self.target[i] = nearest;
            // Empty frontage toward the target: the measured anti-blender
            // leash. Blocked = a comrade's body within 1.5m inside +-40deg
            // of the target bearing.
            let t_bearing = {
                let tp = self.soldier_pos(nearest as usize);
                (tp - p).y.atan2((tp - p).x)
            };
            // Blocked = a comrade ALREADY FIGHTING stands DIRECTLY between
            // me and my target (within 1.2m, +-26deg). Lateral fighting
            // neighbors don't block — a hurled man may step back into the
            // gap he was thrown from; only true rank-stacking is the blender.
            let blocked = friends[..friends_len].iter().any(|&(b, d, f)| {
                f && d < 1.2 && wrap_angle(b - t_bearing).abs() < 0.45
            });
            self.front_clear[i] = (!blocked) as u8;
            // Awareness is not combat: the fight starts when weapons can land.
            self.fighting[i] = (nearest_d <= max_reach + 0.3) as u8;
            let u = &mut self.units[ui];
            u.contact_unit = self.soldier_unit[nearest as usize];
            if disengaged {
                continue;
            }

            // --- weapon by judgment (distance), or the unit's drawn order ---
            // A braced weapon (the sarissa) is held by DEFAULT, leveled down the
            // unit's frontage. It can only bear on a foe inside its arc of that
            // frontage — you can't pivot a grounded pike in the ranks. So: keep
            // the pike unless a foe the pike CAN'T take (too close, or off the
            // front) is within side-arm reach — then draw the sword; the moment
            // nobody is in sword reach, fall back to the leveled pike. This is the
            // one source of truth for what's in hand: the renderer draws it, and
            // the IMPALE below only fires while the pike is up.
            let front_off = wrap_angle(t_bearing - self.units[ui].facing).abs();
            let desired = if self.units[ui].weapon_pref == 1 && weapons.len() > 1 {
                Some(weapons.len() - 1)
            } else if let Some(bi) = weapons.iter().position(|w| w.braced) {
                let pike = &weapons[bi];
                let pike_bears = front_off <= pike.arc * 0.5 + AIM_TOLERANCE
                    && nearest_d >= pike.min_range
                    && nearest_d <= pike.reach;
                if pike_bears {
                    Some(bi)
                } else if let Some(si) = weapons.iter().position(|w| !w.braced) {
                    // a foe the pike can't take: sword if it's in reach, else hold
                    // the pike leveled to the front (the default)
                    if nearest_d <= weapons[si].reach { Some(si) } else { Some(bi) }
                } else {
                    Some(bi)
                }
            } else {
                pick_weapon_index(&weapons, nearest_d)
            };
            let Some(desired) = desired else {
                continue; // enemy inside every min_range and outside sidearms
            };
            // Swapping weapons takes a moment of fumbling — no strikes
            // mid-swap. (This is the pike line's vulnerability when closed
            // on: a second of helplessness while the side swords come out.)
            if self.switch_cd[i] > 0.0 {
                self.switch_cd[i] -= 3.0 * DT;
                if self.switch_cd[i] <= 0.0 {
                    self.cur_weapon[i] = desired as u8;
                }
                continue;
            }
            if desired as u8 != self.cur_weapon[i] {
                self.switch_cd[i] = 1.0;
                continue;
            }
            let weapon = &weapons[self.cur_weapon[i] as usize];
            // The weapon in hand must actually bear on the target.
            if nearest_d < weapon.min_range || nearest_d > weapon.reach {
                continue;
            }
            // A braced weapon aims along the UNIT's frontage (a grounded sarissa
            // can't be turned in the ranks); everything else tracks the man's own
            // facing as he squares up. Used by the aim gate, the obstruction
            // check, and the swing alike.
            let aim_facing = if weapon.braced {
                self.units[ui].facing
            } else {
                self.facings[i]
            };

            // IMPALE — a PRESENTED point, before any swing: a body closing
            // at charge grade onto a planted pole spends its own momentum
            // on the point, every tick it is in reach (presentation is
            // free; only thrusting has a cadence — this is how a hedge
            // stops horses at reach, BEFORE the bodies meet and the
            // knockdown storm flattens the front rank). Reach is the
            // physics: a pole braces to grip, rear hand, ground; a sword
            // absorbs and deflects. Closing reads kin_* (measured motion,
            // never position deltas — the phantom door stays shut).
            {
                let planted = ((weapon.reach - 1.0) / 2.2).clamp(0.0, 1.0);
                // HEDGE depth: a wall is points DEEP. The stop is the
                // per-point leverage (reach², `planted²`) times the
                // fraction of the reach-deep hedge that is actually manned
                // — a sarissa block projects ~3 ranks of points, a thin
                // line one. So a deep phalanx walls horse, a 2-deep pike
                // file merely pricks it, and a short spear can never build
                // a hedge its reach can't reach. (Bounded to 1: a hedge
                // never returns MORE than its full depth.)
                let hedge = {
                    let pu = &self.units[ui];
                    let ranks = pu.alive_count as f32 / pu.files_eff.max(1) as f32;
                    let spacing = pu.stats.spacing.y.max(0.5);
                    let reach_ranks = (weapon.reach / spacing).max(1.0);
                    (ranks / reach_ranks).clamp(0.0, 1.0)
                };
                if planted > 0.0 {
                    let v = nearest as usize;
                    let p = self.soldier_pos(i);
                    let tp = self.soldier_pos(v);
                    let to = tp - p;
                    let l = to.len().max(0.1);
                    let d = to * (1.0 / l);
                    let kin = Vec2::new(self.kin_vx[v], self.kin_vy[v]);
                    let closing = (-(kin.dot(d))).max(0.0);
                    // Charge-grade gate for men (slow infantry pressers pay
                    // nothing extra — the deep-pike contract); a TRAMPLING
                    // body feeds itself onto the point at ANY speed — a
                    // horse has no shield to put between itself and a pike.
                    let vu = self.soldier_unit[v] as usize;
                    let gate = if self.units[vu].tramples() {
                        0.5
                    } else {
                        tun.charge_min_speed
                    };
                    if closing > gate {
                        let w_i = self.mass[i] * self.units[ui].brace();
                        let share = w_i / (w_i + self.mass[v]);
                        let stop = closing * DT * share * planted * planted * hedge * 8.0;
                        let np = Vec2::new(
                            self.positions[v * 2] + d.x * stop,
                            self.positions[v * 2 + 1] + d.y * stop,
                        );
                        if self.terrain.speed_at(np) > 0.0 {
                            self.positions[v * 2] = np.x;
                            self.positions[v * 2 + 1] = np.y;
                        }
                        // ...and the point bleeds the carried glide itself.
                        let toward = -(self.mom_x[v] * d.x + self.mom_y[v] * d.y);
                        if toward > 0.0 {
                            let grip = (share * planted * planted * hedge * 0.8).min(0.45);
                            self.mom_x[v] += d.x * toward * grip;
                            self.mom_y[v] += d.y * toward * grip;
                        }
                    }
                }
            }

            // --- swing when ready and roughly aligned ------------------------
            self.attack_cd[i] -= 3.0 * DT;
            if self.attack_cd[i] > 0.0 {
                continue;
            }
            let target_p = self.soldier_pos(nearest as usize);
            let aim = wrap_angle((target_p - p).y.atan2((target_p - p).x) - aim_facing);
            if aim.abs() > weapon.arc * 0.5 + AIM_TOLERANCE {
                continue; // still turning to face (a braced pike never turns)
            }

            // Obstruction: friendly bodies inside THIS weapon's swing envelope
            // (their subtended angle widens up close). Thrusts (tiny arc)
            // thread past comrades' shoulders — that's why pikes work in
            // ranks; sweeps need clearance, so wide arcs choke in a press.
            let arc_weight = weapon.arc / (weapon.arc + 0.5);
            let crowded = friends[..friends_len]
                .iter()
                .filter(|&&(b, d, _)| {
                    let off = wrap_angle(b - aim_facing).abs();
                    d < weapon.reach * 0.9 && off < weapon.arc * 0.5 + (0.7 / (d + 0.5)).atan()
                })
                .count() as f32
                * arc_weight;
            // ...weighted by the VICE: crowding is geometry, the vice is
            // what stops you working around it. A man shoved from ONE side
            // yields a step and times his sweep between shoulders; a man
            // wedged between opposing masses has his elbows pinned. This is
            // also one-sided crush working as intended: compressing an
            // enemy chokes THEIR swings without choking the free-standing
            // men doing the crushing.
            let net = (self.press_x[i] * self.press_x[i]
                + self.press_y[i] * self.press_y[i])
                .sqrt();
            let vice = (self.pressure[i] - net).max(0.0);
            let pinned = (vice / VICE_PIN).clamp(0.0, 1.0);
            let obstruct = crowded * (OBSTRUCT_FLOOR + (1.0 - OBSTRUCT_FLOOR) * pinned);
            let arc_eff = weapon.arc / (1.0 + obstruct);
            let capacity = fatigue_capacity(self.units[ui].fatigue);
            let interval =
                weapon.attack_interval * (1.0 + 0.35 * obstruct) * (1.0 + 0.8 * (1.0 - capacity));
            self.attack_cd[i] = interval;

            // --- resolve the swing against everyone in the effective arc ----
            let facing = aim_facing;
            let m_a = self.mass[i] * self.units[ui].brace();
            let mut struck = 0usize;
            for k in 0..cand_len {
                if struck >= MAX_VICTIMS {
                    break;
                }
                let (v, d_surf, bearing) = candidates[k];
                let v = v as usize;
                if self.alive[v] == 0 {
                    continue;
                }
                if d_surf < weapon.min_range || d_surf > weapon.reach {
                    continue;
                }
                let off = wrap_angle(bearing - facing).abs();
                let is_primary = v == nearest as usize;
                if off > arc_eff * 0.5 + if is_primary { AIM_TOLERANCE } else { 0.0 } {
                    continue;
                }
                struck += 1;
                self.strike(i, v, weapon, bearing, m_a, &tun);
            }
        }
    }

    /// One strike: evade / block / wound, with push on anything not evaded.
    fn strike(
        &mut self,
        attacker: usize,
        victim: usize,
        weapon: &Weapon,
        bearing: f32,
        m_attacker: f32,
        tun: &crate::tunables::Tunables,
    ) {
        let uv = self.soldier_unit[victim] as usize;
        let vstats = self.units[uv].stats;
        let cohesion = self.units[uv].cohesion;

        // Reactive facing memory + unit contact bookkeeping.
        let incoming = wrap_angle(bearing + std::f32::consts::PI);
        self.hit_dir[victim] = incoming;
        self.hit_ttl[victim] = 3.0;
        let bucket = crate::unit::bearing_bucket(incoming);
        self.units[uv].contact_hist[bucket] += 1.0;
        let ua = self.soldier_unit[attacker] as usize;
        let bucket_a = crate::unit::bearing_bucket(bearing);
        self.units[ua].contact_hist[bucket_a] += 0.4;

        // Evade (read: parry/dodge): needs room — crush pressure removes
        // it — and DIRECTION: you can't slip a blow you can't see. Full
        // rate across the front, weakened side-on, nearly gone from square
        // behind. (Block was always front-arc-only; this is its agile twin
        // for the shieldless classes.)
        let aspect_v = wrap_angle(incoming - self.facings[victim]).abs();
        let seen = if aspect_v < FRONT_ARC {
            1.0
        } else if aspect_v < SIDE_ARC {
            0.6
        } else {
            0.25
        };
        let evade =
            vstats.evade * seen * cohesion * (1.0 - self.pressure[victim] / 4.2).clamp(0.0, 1.0);
        if self.rng.chance(evade) {
            return;
        }

        // Any non-evaded impact staggers: you do not stride forward while a
        // pike slams your shield. (This is what makes reach walls hold.)
        // But a stagger does not delete physics: a body moving at speed
        // KEEPS its momentum (p = m·v) and glides through the stumble —
        // this is how a charging line crashes home through the spear hits
        // of the final stride instead of politely stopping at reach.
        let vvx = (self.positions[2 * victim] - self.prev_positions[2 * victim]) / DT;
        let vvy = (self.positions[2 * victim + 1] - self.prev_positions[2 * victim + 1]) / DT;
        let vsp = (vvx * vvx + vvy * vvy).sqrt();
        if vsp > 2.0 {
            let m = self.mass[victim] * vsp * 0.8;
            let cur = (self.mom_x[victim].powi(2) + self.mom_y[victim].powi(2)).sqrt();
            if cur < m {
                self.mom_x[victim] = vvx / vsp * m;
                self.mom_y[victim] = vvy / vsp * m;
            }
        }
        self.stun[victim] = self.stun[victim].max(0.35);

        // Block: front shield arc only; still takes the push.
        let shielded = aspect_v < FRONT_ARC;
        let blocked = shielded && self.rng.chance(vstats.block * (0.5 + 0.5 * cohesion));

        // Push: momentum through the weapon — a braced thruster hurls an
        // unbraced man back bodily; equal masses just rock each other.
        let m_v = self.mass[victim] * self.units[uv].brace();
        let push = tun.hit_push * (m_attacker / m_v).clamp(0.3, 3.5);
        let d = dir(bearing);
        let np = Vec2::new(
            self.positions[2 * victim] + d.x * push,
            self.positions[2 * victim + 1] + d.y * push,
        );
        if self.terrain.speed_at(np) > 0.0 {
            self.positions[2 * victim] = np.x;
            self.positions[2 * victim + 1] = np.y;
            // The shove itself IS the pressure input: it shortens his bonds,
            // and the weave reads that compression as crush next tick.
        }

        if blocked {
            return;
        }

        // Damage: the rider only if the weapon's reach spans to him — he sits
        // at the horse's center, a large target (~0.35m exposure) up top.
        let attacker_p = self.soldier_pos(attacker);
        let victim_p = self.soldier_pos(victim);
        let to_center = (victim_p - attacker_p).len() - self.radius[attacker] - 0.35;
        if self.mounted[victim] == 1 && to_center > weapon.reach {
            // Only the mount's body is in reach: the horse soaks it.
            self.mount_health[victim] -= weapon.damage;
            if self.mount_health[victim] <= 0.0 {
                self.kill(victim);
            }
        } else {
            self.health[victim] -= weapon.damage;
            if self.health[victim] <= 0.0 {
                self.kill(victim);
            }
        }
    }

    /// Public for scenario tests and sandbox tooling: drop a soldier dead
    /// where he stands (bookkeeping included).
    pub fn kill(&mut self, i: usize) {
        if self.alive[i] == 0 {
            return;
        }
        self.alive[i] = 0;
        self.stun[i] = 0.0; // a corpse is not also stunned (one state, not flags)
        self.target[i] = -1;
        let u = &mut self.units[self.soldier_unit[i] as usize];
        u.alive_count = u.alive_count.saturating_sub(1);
        u.deaths_since_reform += 1;
        u.recent_casualties += 1.0;
    }
}

fn pick_weapon_index(weapons: &[Weapon], d: f32) -> Option<usize> {
    weapons
        .iter()
        .position(|w| d >= w.min_range && d <= w.reach)
        .or_else(|| {
            let last = weapons.len().checked_sub(1)?;
            (d <= weapons[last].reach).then_some(last)
        })
}

/// Skirmish-class check used by later phases.
pub fn is_missile_class(class: UnitClassId) -> bool {
    matches!(
        class,
        UnitClassId::Archers | UnitClassId::Skirmishers | UnitClassId::HorseArchers
    )
}
