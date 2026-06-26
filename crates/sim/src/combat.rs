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
use crate::movement::stamina_factor;
use crate::sim::Sim;
use crate::tunables::DT;
use crate::unit::OrderMode;

/// Why a soldier died. Measurement only — lets tests split a unit's losses into
/// the charge's bodily shock, the lance going in, the standing grind, and arrows,
/// instead of one opaque kill total. `Scripted` is a hand-kill (tests/sandbox)
/// and is tallied to no combat bucket.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KillCause {
    Impact,
    ChargeMelee,
    GrindMelee,
    Missile,
    Scripted,
}

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
pub(crate) const SIDE_ARC: f32 = 2.1;
// Where a weapon can land is the weapon's own `zones` data (a sword = one front
// lobe, a mounted sabre = two flank lobes, blind over the horse's head and
// croup): see `crate::strike`.
/// Heavy shields work against a presented point too. Pikes are still fearsome
/// because they strike first, from long reach, in a narrow front-facing hedge —
/// not because a shielded man magically loses his shield block.
const BRACED_THRUST_BLOCK_MULT: f32 = 1.0;
// A MOVING target is hard to hit: every blow at a man (or horse) crossing in
// front of the striker has to lead a moving mark, and many miss. This is general
// — it applies to anyone in motion — but it is what lets a trampler carrying
// CLEAN through loose order come out light (it's galloping, almost nobody lands a
// blow), while one BOGGED in dense order (~stopped) is hit normally. Below the
// floor speed (a walk) there's no bump; it ramps with speed to a hard cap.
const MOVING_EVADE_FLOOR: f32 = 2.0; // m/s — below this, no bump (a walk doesn't dodge)
const MOVING_EVADE_GAIN: f32 = 0.06; // added evade per m/s above the floor
const MOVING_EVADE_CAP: f32 = 0.5; // a full gallop dodges at most half the blows

const MAX_NEARBY_FRIENDS: usize = 24;
type ScanPriority = (i32, i32, u32); // local forward cell, local lateral cell, local soldier

#[derive(Clone, Copy, Debug, PartialEq)]
struct NearbyFriend {
    owner: u32,
    bearing: f32,
    distance: f32,
    fighting: bool,
    priority: ScanPriority,
}

/// Record one nearby friendly soldier, independent of body/grid scan order.
/// Mounted soldiers contribute two collision bodies but only one pair of arms;
/// keep the nearer body geometry rather than counting the rider twice. When the
/// sanity cap fills, local-frame scan priority chooses the sample; fixed world
/// cell traversal must never decide who obstructs a swing.
fn record_friend(
    friends: &mut [Option<NearbyFriend>; MAX_NEARBY_FRIENDS],
    friends_len: &mut usize,
    friend: NearbyFriend,
) {
    if let Some(existing) = friends[..*friends_len]
        .iter_mut()
        .flatten()
        .find(|f| f.owner == friend.owner)
    {
        if friend.distance < existing.distance {
            *existing = friend;
        }
    } else if *friends_len < MAX_NEARBY_FRIENDS {
        friends[*friends_len] = Some(friend);
        *friends_len += 1;
    } else {
        let least_preferred = friends
            .iter()
            .flatten()
            .enumerate()
            .max_by_key(|(_, f)| f.priority)
            .map(|(k, _)| k)
            .unwrap();
        if friend.priority < friends[least_preferred].unwrap().priority {
            friends[least_preferred] = Some(friend);
        }
    }
}

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

        // Each attacker's RANK among the men targeting his victim (index order,
        // from last tick's targets). Only the first GANG_CAP may SWING: you can't
        // get your weapon onto a foe two comrades already crowd. This caps the
        // gang's DAMAGE without touching targeting or the magnet — every man keeps
        // his foe and his place in the line, so the front and flank geometry are
        // untouched; the (cap+1)th man just presses, unable to land a blow. Capping
        // the local outnumbering is what stops a thinning line being ground 3:1.
        //
        // KEPT DELIBERATELY (David's call): this is a headcount GUARD, not real
        // geometry — strictly speaking how many blades reach a man should fall out
        // of reach/arc/obstruction. It earns its place only as a backstop against a
        // crowd BLOB overrunning a line. Hold it until we're certain the blob is
        // solved by forces alone (the weave compression + body wall); then this
        // can go. Do NOT lean new behavior on it.
        for a in self.attacked_by.iter_mut() {
            *a = 0;
        }
        // Jacobi staging: zero the per-victim accumulators. Strikes add to them
        // and the whole tick's wounds / shoves / staggers land together after the
        // pass, so index order is not a first-mover advantage (see sim.rs).
        self.dmg_acc.clear();
        self.dmg_acc.resize(n, 0.0);
        self.mount_dmg_acc.clear();
        self.mount_dmg_acc.resize(n, 0.0);
        self.dmg_from_charge.clear();
        self.dmg_from_charge.resize(n, 0.0);
        self.push_acc.clear();
        self.push_acc.resize(2 * n, 0.0);
        let mut gang_rank = vec![0u16; n];
        for i in 0..n {
            if self.alive[i] == 1 {
                let t = self.target[i];
                if t >= 0 {
                    gang_rank[i] = self.attacked_by[t as usize];
                    self.attacked_by[t as usize] += 1;
                }
            }
        }

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
            // Couching the lance is part of beginning the GALLOP, not a
            // melee-range weapon pick. The grind weapon-swap below only runs once
            // a foe is within DISENGAGE_DIST (6m) — so without this a charging
            // lancer kept his sidearm in hand for the whole approach and only
            // drew the lance AT contact (visibly wrong, and the couched point
            // never carried). Decide the charge weapon here, above the proximity
            // gates, keyed purely on charge state: the instant the burst opens
            // (~50m out) every rider levels his lance, and holds it until it
            // SNAPS on a man (charge_wpn_spent) or the charge bogs (charging
            // drops). No fumble cooldown — the lance comes down with the gallop.
            if self.units[ui].charging && !self.charge_wpn_spent[i] {
                if let Some(ci) = self.units[ui]
                    .stats
                    .weapons
                    .iter()
                    .position(|w| w.is_charge())
                {
                    self.cur_weapon[i] = ci as u8;
                    self.switch_cd[i] = 0.0;
                }
            }
            if !near_enemy[ui] {
                self.target[i] = -1;
                self.fighting[i] = 0;
                self.fight_near[i] = 0;
                self.front_clear[i] = 1;
                continue;
            }
            let my_team = self.units[ui].team;
            let disengaged = self.units[ui].mode == OrderMode::Disengage || self.units[ui].routing;
            let stats = self.units[ui].stats;
            let weapons = stats.weapons;
            let max_reach = weapons.iter().map(|w| w.reach).fold(0.0f32, f32::max);
            let my_r = self.radius[i];
            let p = self.soldier_pos(i);
            let local_f = dir(self.facings[i]);
            let local_r = Vec2::new(local_f.y, -local_f.x);
            // Targeting strike field (slice 01): a man targets the foe he can bring
            // his blade to bear on SOONEST (cost = turn-to-edge + travel), not the
            // nearest body. The field is the GRIND weapon's zones (the widest-arc
            // melee blade, never the one-phase lance): for a mounted sabre that is
            // the flank lobes, so the seek DISPERSES riders across the front (the
            // wide knockdown swath of a charge) and onto flank foes it can cut, not
            // bunched on one foe dead-ahead. The lance spits forward independently
            // (its strike reads its own front lobe, below). Foot ignores this field:
            // its turn cost is gated off, so its cost is pure distance ≈ nearest.
            let grind = weapons
                .iter()
                .filter(|w| !w.is_charge())
                .max_by(|a, b| a.zones.swing_arc().total_cmp(&b.zones.swing_arc()))
                .copied()
                .unwrap_or(weapons[0]);
            let tgt_field = crate::strike::field(
                grind.zones,
                grind.min_range,
                grind.reach,
                1.0,
                AIM_TOLERANCE,
            );
            // Cost in seconds: turn time (rad / turn-rate) + travel time
            // (gap-beyond-reach / closing gait). Both honest seconds, so they
            // weight themselves; slice 05 refines travel with the accel ramp.
            let turn_rate = (tun.soldier_turn_rate * stats.turn_mult).max(0.1);
            let approach_speed = (tun.run_speed * stats.pace_mult).max(0.5);

            // --- find nearest enemy + count envelope obstruction ------------
            // The scan covers awareness range: targeting, obstruction, AND
            // the local fight-density measurement all come from this pass.
            let search = (max_reach + 1.2).max(DISENGAGE_DIST);
            let range_cells = ((search / cell).ceil() as i32).clamp(1, 4);
            let mut nearest: i32 = -1;
            let mut nearest_d = f32::MAX;
            // STICKY TARGET: a man fights the foe he is already squared up to and
            // only switches when a new one is meaningfully closer. Re-picking the
            // single nearest body every tick made his facing OSCILLATE — the
            // nearest flips between near-equidistant foes in a packed grind, so his
            // body chased a target that reversed several times a second (real
            // soldiers don't twitch their stance 30x/s). Track the current foe's
            // live distance so we can keep him unless clearly out-classed.
            let prev_target = self.target[i];
            let mut prev_target_d = f32::MAX;
            // Cost-based selection (slice 01): nearest_d stays the CHOSEN foe's
            // real distance (downstream reach/fight checks need a distance), but
            // the CHOICE is argmin engage-cost.
            let mut nearest_cost = f32::MAX;
            // (victim, surface distance, bearing)
            let mut candidates: [(u32, f32, f32); 12] = [(0, 0.0, 0.0); 12];
            let mut cand_len = 0usize;
            // Friendly soldiers nearby: raw bearing + distance (offsets are
            // computed against facing or target bearing as needed).
            let mut friends: [Option<NearbyFriend>; MAX_NEARBY_FRIENDS] =
                [None; MAX_NEARBY_FRIENDS];
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
                    let (lo, hi) = (
                        self.grid.starts[b] as usize,
                        self.grid.starts[b + 1] as usize,
                    );
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
                            if d_surf < (max_reach * 0.9).max(1.6) {
                                let priority = (
                                    (to.dot(local_f) / cell).floor() as i32,
                                    (to.dot(local_r) / cell).floor() as i32,
                                    (j - self.units[uj].start) as u32,
                                );
                                record_friend(
                                    &mut friends,
                                    &mut friends_len,
                                    NearbyFriend {
                                        owner: j as u32,
                                        bearing,
                                        distance: d_surf.max(0.05),
                                        fighting: self.fighting[j] == 1,
                                        priority,
                                    },
                                );
                            }
                            continue;
                        }
                        // Engage cost, in METRES (a wheel converted to the distance
                        // it would cover): `travel + turn_time*closing_speed`. The
                        // turn term is MOUNTED-only — a man on foot pivots freely
                        // (turn ~instant), so his cost is EXACTLY `d_surf` and his
                        // targeting is byte-for-byte nearest (he still turns to
                        // meet a flanker; the raw distance compare also avoids the
                        // float-tie churn a `/speed` would add). A HORSE can't pivot
                        // at speed and a wide sabre is blind over its head, so a
                        // rider genuinely must wheel to bring the blade to bear: a
                        // foe in the flank lobe is cheap, one dead-ahead in the
                        // blind front is dear. That wheel cost is the measured bug.
                        let off = wrap_angle(bearing - self.facings[i]).abs();
                        let cost = if self.mounted[i] == 1 {
                            d_surf + tgt_field.turn_to_edge(off) / turn_rate * approach_speed
                        } else {
                            d_surf
                        };
                        if cost < nearest_cost {
                            nearest_cost = cost;
                            nearest_d = d_surf;
                            nearest = j as i32;
                        }
                        if j as i32 == prev_target {
                            prev_target_d = d_surf;
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
            // Keep the foe we're already on unless the new nearest is clearly
            // closer (>15%) — the hysteresis that stops the facing oscillation.
            // A man PULLING OUT (disengage/rout) doesn't cling to his foe, though:
            // stickiness would keep a withdrawing unit nailed in contact, so it
            // yields to the latest nearest and lets the gap open as it backs off.
            // Selection is argmin engage-cost (arc-aware); the sticky hysteresis
            // stays on DISTANCE — its job is anti-oscillation, and keying it off
            // cost made a line man DROP a foe that merely drifted to his flank
            // (its turn penalty spiked), churning targets mid-grind. Keep the foe
            // I'm squared up to unless a new one is meaningfully closer.
            self.target[i] = if !disengaged
                && prev_target >= 0
                && self.alive[prev_target as usize] == 1
                && prev_target_d <= DISENGAGE_DIST
                && prev_target_d <= nearest_d * 1.15
            {
                prev_target
            } else {
                nearest
            };
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
            let blocked = friends[..friends_len].iter().flatten().any(|f| {
                f.fighting && f.distance < 1.2 && wrap_angle(f.bearing - t_bearing).abs() < 0.45
            });
            self.front_clear[i] = (!blocked) as u8;
            // Situational awareness (see Sim::awareness): each comrade STACKED in
            // the cone toward the foe (within ~3.5m, ±34°) halves the man's view of
            // it. A clear line ⇒ ~1 (turns to meet a flanker); buried behind 2-3
            // ranks ⇒ ~0.1-0.25 (can't see it, holds frontage). A smooth gradient.
            let cover = friends[..friends_len]
                .iter()
                .flatten()
                .filter(|f| f.distance < 3.5 && wrap_angle(f.bearing - t_bearing).abs() < 0.6)
                .count();
            self.awareness[i] = 0.5f32.powi(cover as i32);
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
            let desired = if let (Some(ci), Some(gi)) = (
                weapons.iter().position(|w| w.is_charge()),
                weapons.iter().position(|w| !w.is_charge()),
            ) {
                // CHARGE vs GRIND: a horseman's two weapons are for two phases. While
                // the charge still carries momentum he fights the CHARGE weapon (the
                // lance) — long, couched, taken at speed as the mass plows through.
                // The instant the charge is spent and it's a standing melee, he drops
                // to his GRIND sidearm (the wide-arc sword) — which is where a stalled
                // charge earns most of its kills. Gating on CHARGE STATE (not aim or
                // reach) is what lets the lance plow without stopping to fence, and
                // keeps the sword for the press where the narrow lance is useless.
                // HYSTERESIS around the spent/charge speeds: the mass speed jitters in
                // a grind, so latch on what's in hand — keep the lance only while the
                // charge still carries (> spent), and once on the sword don't redraw
                // the lance for a stray jostle, only a fresh full-speed charge
                // (> charge_min). Without this the weapon thrashes every tick and the
                // rider spends the fight switching instead of swinging.
                // The lance is couched ONLY for an actual charge: hold it while the
                // unit is charging (the `charging` latch carries its own hysteresis,
                // set on the gallop and dropped when it bogs) and this rider's lance
                // hasn't yet SNAPPED on a man. A walk-in never charges, so it fights
                // the sword from the start — no lance kills without a gallop. Once
                // bogged or spent, the sabre, where a stalled charge earns its grind.
                let keep_charge = !self.charge_wpn_spent[i] && self.units[ui].charging;
                Some(if keep_charge { ci } else { gi })
            } else if let Some(bi) = weapons.iter().position(|w| w.braced()) {
                let pike = &weapons[bi];
                // The pike is leveled down the UNIT's frontage and braced there; a
                // man can only drive it while he is himself SQUARED UP to that line.
                // If he has turned his body off the frontage to meet a man on his
                // flank, the long shaft is useless to him sideways — he drops to his
                // side-arm. So the pike bears only when (a) the foe is in the
                // frontage arc AND (b) the soldier still faces along it.
                let self_off = wrap_angle(self.facings[i] - self.units[ui].facing).abs();
                let pike_bears = front_off <= pike.zones.primary_half() + AIM_TOLERANCE
                    && self_off < FRONT_ARC
                    && nearest_d >= pike.min_range
                    && nearest_d <= pike.reach;
                if pike_bears {
                    Some(bi)
                } else if let Some(si) = weapons.iter().position(|w| !w.braced()) {
                    // a foe the pike can't take: sword if it's in reach, else hold
                    // the pike leveled to the front (the default)
                    if nearest_d <= weapons[si].reach {
                        Some(si)
                    } else {
                        Some(bi)
                    }
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
            let aim_facing = if weapon.braced() {
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
                let target_p = self.soldier_pos(nearest as usize);
                let aim = wrap_angle((target_p - p).y.atan2((target_p - p).x) - aim_facing).abs();
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
                // A grounded/braced point is locked to the formation frontage:
                // it can stop what is presented to the formation's FRONT cone,
                // not a flank/rear charge. This is deliberately broader than
                // the thrust's damage arc: adjacent points overlap into a hedge
                // for charge-stopping, while the later swing gate remains
                // narrow.
                // Mobile long weapons (lances, long swords) are not a fixed
                // hedge; keep their existing charge-presentation behavior.
                let hedge_bears = aim <= 1.25;
                if planted > 0.0 && (!weapon.braced() || hedge_bears) {
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
                        if weapon.braced() && self.units[vu].tramples() {
                            // A horse feeding itself onto a presented point pays
                            // in flesh as well as momentum. This is not a swing
                            // (no cadence, block, or flourish): it is the
                            // mounted body doing the work by closing onto the
                            // braced shaft. Off-axis/flank charges are already
                            // excluded by `hedge_bears` above.
                            let to_center = (tp - p).len() - self.radius[i] - 0.35;
                            let dmg = weapon.damage
                                * (closing / tun.charge_min_speed.max(0.1)).clamp(0.0, 2.0)
                                * planted
                                * hedge
                                * DT
                                * 6.0;
                            // Charge-impale: a body run onto a braced point — its
                            // whole wound is charge-driven (closing-speed scaled).
                            self.dmg_from_charge[v] += dmg;
                            if to_center > weapon.reach {
                                self.mount_dmg_acc[v] += dmg;
                            } else {
                                self.dmg_acc[v] += dmg;
                            }
                        }
                    }
                }
            }

            // --- swing when ready and roughly aligned ------------------------
            self.attack_cd[i] -= 3.0 * DT;
            if self.attack_cd[i] > 0.0 {
                continue;
            }
            // GANG CAP: a foe already crowded by gang_cap comrades leaves no room
            // for this man's blade to WOUND — but he still swings and SHOVES (the
            // push that holds the contact line apart), so the front neither blobs
            // nor loses the standoff; only the gang's DAMAGE is capped.
            let can_wound = gang_rank[i] < tun.gang_cap;
            let facing = aim_facing;
            // The aim gate: a man holds his swing until his weapon bears. A foot
            // blade gates on the seek TARGET (he is facing it); a flank SABRE never
            // gates here (the resolve picks whoever is in its side lobes). A couched
            // LANCE is the exception: it spits whatever is dead-ahead REGARDLESS of
            // where the rider's dispersed seek points (the seek scatters riders for
            // the wide knockdown swath), so it gates on the closest foe in its OWN
            // front lobe — else it whiffs every time the unit hunts a flank foe.
            if weapon.is_charge() {
                let lance = crate::strike::field(
                    weapon.zones,
                    weapon.min_range,
                    weapon.reach,
                    1.0,
                    AIM_TOLERANCE,
                );
                let bears = (0..cand_len).any(|k| {
                    let (v, d, b) = candidates[k];
                    self.alive[v as usize] == 1 && lance.contains(wrap_angle(b - facing).abs(), d)
                });
                if !bears {
                    continue;
                }
            } else if !weapon.zones.is_flank() {
                let target_p = self.soldier_pos(nearest as usize);
                let aim = wrap_angle((target_p - p).y.atan2((target_p - p).x) - aim_facing);
                if aim.abs() > weapon.zones.primary_half() + AIM_TOLERANCE {
                    continue;
                }
            }

            // Obstruction: friendly bodies inside THIS weapon's swing envelope
            // (their subtended angle widens up close). Thrusts (tiny arc)
            // thread past comrades' shoulders — that's why pikes work in
            // ranks; sweeps need clearance, so wide arcs choke in a press.
            let swing = weapon.zones.swing_arc();
            let arc_weight = swing / (swing + 0.5);
            let crowded = friends[..friends_len]
                .iter()
                .flatten()
                .filter(|f| {
                    let off = wrap_angle(f.bearing - aim_facing).abs();
                    f.distance < weapon.reach * 0.9
                        && off < weapon.zones.primary_half() + (0.7 / (f.distance + 0.5)).atan()
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
            let net =
                (self.press_x[i] * self.press_x[i] + self.press_y[i] * self.press_y[i]).sqrt();
            let vice = (self.pressure[i] - net).max(0.0);
            let pinned = (vice / VICE_PIN).clamp(0.0, 1.0);
            let obstruct = crowded * (OBSTRUCT_FLOOR + (1.0 - OBSTRUCT_FLOOR) * pinned);
            // Swing cadence does NOT slow with fatigue — a tired man swings as
            // often, but each blow lands SOFTER (see stamina_damage_floor in
            // strike). Coupling fatigue to cadence instead made grinds CRAWL: a
            // spent line both swung slow AND still kept its guard up, so almost
            // nothing landed and an even fight never resolved. The fatigue lever
            // is power-per-blow + a collapsing guard, not swing rate.
            let interval = weapon.attack_interval * (1.0 + 0.35 * obstruct);
            self.attack_cd[i] = interval;

            // --- resolve the swing ------------------------------------------------
            // The arc is the FIELD OF WHO YOU CAN HIT, not a sweep. A normal weapon
            // strikes the CLOSEST foe in that field — one man per stroke. Only a
            // CLEAVE weapon (the wide two-hander) hits everyone in the field. The
            // field is the front arc for foot; for a mounted SABRE it is the two
            // flank lobes (the horse's head and croup are blind).
            let m_a = self.mass[i] * self.units[ui].brace();
            // The strike FIELD: the weapon's zones, with the FRONT lobe crowd-
            // narrowed by `1 + obstruct` so a choked sweep shrinks its cone (a
            // flank sabre's lobes are fixed). Reach and the front/flank geometry
            // fold in, so the resolve below is one `contains`.
            let field = crate::strike::field(
                weapon.zones,
                weapon.min_range,
                weapon.reach,
                1.0 + obstruct,
                AIM_TOLERANCE,
            );
            if weapon.cleave {
                let mut struck = 0usize;
                for k in 0..cand_len {
                    if struck >= MAX_VICTIMS {
                        break;
                    }
                    let (v, d_surf, bearing) = candidates[k];
                    let v = v as usize;
                    if self.alive[v] != 1 {
                        continue;
                    }
                    if !field.contains(wrap_angle(bearing - facing).abs(), d_surf) {
                        continue;
                    }
                    struck += 1;
                    self.strike(i, v, weapon, bearing, m_a, can_wound, &tun);
                }
            } else {
                // closest foe in the field gets the one stroke
                let mut best: Option<usize> = None;
                let mut best_d = f32::MAX;
                for k in 0..cand_len {
                    let (v, d_surf, bearing) = candidates[k];
                    if d_surf >= best_d || self.alive[v as usize] != 1 {
                        continue;
                    }
                    if field.contains(wrap_angle(bearing - facing).abs(), d_surf) {
                        best_d = d_surf;
                        best = Some(k);
                    }
                }
                if let Some(k) = best {
                    let (v, _, bearing) = candidates[k];
                    self.strike(i, v as usize, weapon, bearing, m_a, can_wound, &tun);
                }
            }
        }

        // --- Jacobi apply: every blow dealt this tick lands now, together. ----
        // Deaths resolve only here, so within a tick no strike is cancelled by an
        // earlier one in index order — the mutual blows of a head-on clash are
        // mutual, which is what makes the engine M-equivariant.
        for v in 0..n {
            if self.alive[v] == 0 {
                continue;
            }
            // Shove first (a survivor's bonds must reflect the displacement before
            // next tick reads crush; a corpse needs no update).
            let (sx, sy) = (self.push_acc[2 * v], self.push_acc[2 * v + 1]);
            if sx != 0.0 || sy != 0.0 {
                let np = Vec2::new(self.positions[2 * v] + sx, self.positions[2 * v + 1] + sy);
                if self.terrain.speed_at(np) > 0.0 {
                    self.positions[2 * v] = np.x;
                    self.positions[2 * v + 1] = np.y;
                }
            }
            // Label a melee kill charge vs grind by where the wound came from:
            // if at least half the staged damage was charge-driven (lance still
            // carrying, or a charge-impale) it is a charge kill, else the grind.
            let melee_cause = {
                let total = self.mount_dmg_acc[v] + self.dmg_acc[v];
                if total > 0.0 && self.dmg_from_charge[v] * 2.0 >= total {
                    KillCause::ChargeMelee
                } else {
                    KillCause::GrindMelee
                }
            };
            if self.mount_dmg_acc[v] > 0.0 {
                self.mount_health[v] -= self.mount_dmg_acc[v];
                if self.mount_health[v] <= 0.0 {
                    self.kill_with(v, melee_cause);
                    continue;
                }
            }
            if self.dmg_acc[v] > 0.0 {
                self.health[v] -= self.dmg_acc[v];
                if self.health[v] <= 0.0 {
                    self.kill_with(v, melee_cause);
                }
            }
        }
        self.has_fighting = self.fighting.iter().any(|&f| f == 1);
    }

    /// One strike: evade / block / wound, with push on anything not evaded.
    fn strike(
        &mut self,
        attacker: usize,
        victim: usize,
        weapon: &Weapon,
        bearing: f32,
        m_attacker: f32,
        can_wound: bool,
        tun: &crate::tunables::Tunables,
    ) {
        let uv = self.soldier_unit[victim] as usize;
        let vstats = self.units[uv].stats;
        // Effective cohesion: a trampler reads full (its blob doesn't fight
        // worse); every other class pays disorder in evade and block.
        let cohesion = self.units[uv].effective_cohesion();

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
        // (A horse's "charge protection" needs no special term: a moving horse is
        // hard to hit because it isn't yet mobbed — low crush pressure → the
        // pressure factor below keeps its evade high; a stalled horse is a mobbed
        // horse — high pressure → evade already gone. The same physics that makes
        // cavalry win the charge and lose the grind, measured ONCE, as pressure.)
        // GUARD FATIGUE: a tiring man cannot keep his guard up. As the unit's
        // stamina drains in a sustained grind both his shield (block, below) and
        // his footwork (evade) lose effectiveness, falling toward stamina_guard_floor
        // when spent. This is what RESOLVES a long stalemate — fresh shielded lines
        // block nearly everything, but a grind drains both sides until guards erode,
        // blows land, and one breaks. Full early (stamina starts at 1.0), so short
        // decisive fights are untouched; only the drawn-out grind opens up.
        let guard = tun.stamina_guard_floor
            + (1.0 - tun.stamina_guard_floor) * stamina_factor(self.units[uv].stamina);
        // A mark CROSSING the striker's front is hard to hit — a flat dodge ON
        // TOP of the stat evade, scaling with the victim's LATERAL speed (the part
        // of its motion perpendicular to the strike line). Only sideways motion
        // counts: a foe running straight AT you or away closes/opens the range but
        // is no harder to land on than a standing one — same as stationary. This
        // is general (anyone crossing), but biggest for a trampler riding PAST the
        // ranks; it's independent of the stat evade/cohesion (even a no-evade heavy
        // is hard to strike as it flashes by).
        let vmx = (self.positions[2 * victim] - self.prev_positions[2 * victim]) / DT;
        let vmy = (self.positions[2 * victim + 1] - self.prev_positions[2 * victim + 1]) / DT;
        let rdx = self.positions[2 * victim] - self.positions[2 * attacker];
        let rdy = self.positions[2 * victim + 1] - self.positions[2 * attacker + 1];
        let rl = (rdx * rdx + rdy * rdy).sqrt().max(1e-3);
        let radial = (vmx * rdx + vmy * rdy) / rl; // speed toward/away — does NOT count
        let lateral = (vmx * vmx + vmy * vmy - radial * radial).max(0.0).sqrt();
        let moving_evade =
            ((lateral - MOVING_EVADE_FLOOR).max(0.0) * MOVING_EVADE_GAIN).min(MOVING_EVADE_CAP);
        let evade = (vstats.evade
            * seen
            * cohesion
            * guard
            * (1.0 - self.pressure[victim] / 4.2).clamp(0.0, 1.0)
            + moving_evade)
            .min(0.95);
        if self.rng.chance(evade) {
            return; // dodged — the couched point passed by, lance NOT spent
        }
        // The charge weapon (lance) is one strike: the moment it COMMITS — past the
        // dodge, so it will either land or be turned on a shield — it SNAPS, and the
        // rider drops to his sidearm. Only a clean evade spares it (it never made
        // contact). Generalises to any weapon with the charge flag. (If the rider
        // slowed below charge before now, he never couched it — it's never reached.)
        if weapon.is_charge() {
            self.charge_wpn_spent[attacker] = true;
        }

        // A hit does not delete physics: a body moving at speed KEEPS its
        // momentum (p = m·v) and glides through the impact — this is how a
        // charging line crashes home through the spear hits of the final stride
        // instead of politely stopping at reach. (There is no melee "stagger"
        // stun: a landed blow does not freeze a man's strike or step — only a
        // real KNOCK-DOWN, from a charge or a missile, takes him off his feet.
        // The reach wall is held by the weapon-repel FORCE, not by stunning the
        // attacker mid-stride.)
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

        // Block: front shield arc only; still takes the push. A BRACED point
        // (a leveled pike) is harder to parry than a sword's arc, but it still
        // has to interact with heavy shields or phalanx-vs-heavy stops reading
        // as a long shielded grind.
        let shielded = aspect_v < FRONT_ARC;
        let braced_thrust = if weapon.braced() {
            BRACED_THRUST_BLOCK_MULT
        } else {
            1.0
        };
        let blocked = shielded
            && self
                .rng
                .chance(vstats.block * (0.5 + 0.5 * cohesion) * braced_thrust * guard);

        // Push: momentum through the weapon — a braced thruster hurls an
        // unbraced man back bodily; equal masses just rock each other.
        let m_v = self.mass[victim] * self.units[uv].brace();
        let push = tun.hit_push * (m_attacker / m_v).clamp(0.3, 3.5);
        let d = dir(bearing);
        // Stage the shove: all of a tick's shoves on this victim sum and land
        // together after the pass (the terrain clamp is applied there). The shove
        // IS the pressure input — it shortens his bonds, and the weave reads that
        // compression as crush next tick.
        self.push_acc[2 * victim] += d.x * push;
        self.push_acc[2 * victim + 1] += d.y * push;

        // Blocked, or gang-capped (no room to land the blade): the shove above
        // still happened — only the wound is denied.
        if blocked || !can_wound {
            return;
        }

        // Damage: the rider is PREFERRED — a foot soldier goes for the man, not the
        // animal — but he lands on the rider only if his weapon physically reaches
        // that high (the rider sits at the horse's center, ~0.35m exposed up top);
        // else the blow falls on the horse. Pure reach geometry, no charge-state
        // fudge: if a short blade can't reach a bogged rider, the answer is the foot
        // closing the distance (separation physics), not a magic exposure bonus.
        let attacker_p = self.soldier_pos(attacker);
        let victim_p = self.soldier_pos(victim);
        let to_center = (victim_p - attacker_p).len() - self.radius[attacker] - 0.35;

        // A tiring attacker hits SOFTER: damage falls toward stamina_damage_floor
        // of its fresh value as he spends (a 25% floor when fully blown). This is
        // the offence half of fatigue; the cadence is unchanged.
        let dmg = weapon.damage
            * (tun.stamina_damage_floor
                + (1.0 - tun.stamina_damage_floor) * stamina_factor(self.units[ua].stamina));
        // A wound is charge-driven iff it came from the charge weapon (the lance) —
        // the couched point going in. The sword is the grind, even while the horse
        // is still rolling forward: a moving sabre is a man fighting his way through
        // the press, not a charge. Attribute by WEAPON, not by speed. (The lance is
        // already marked spent above, the instant it committed.)
        if weapon.is_charge() {
            self.dmg_from_charge[victim] += dmg;
        }
        // Stage the wound; it is applied (and the kill resolved) after the pass,
        // so a man mortally hit by a low-index foe still lands his simultaneous
        // strike this tick.
        if self.mounted[victim] == 1 && to_center > weapon.reach {
            self.mount_dmg_acc[victim] += dmg;
        } else {
            self.dmg_acc[victim] += dmg;
        }
    }

    /// Public for scenario tests and sandbox tooling: drop a soldier dead
    /// where he stands (bookkeeping included). A hand-kill is `Scripted` — it
    /// counts in the casualty totals but in no combat-cause bucket.
    pub fn kill(&mut self, i: usize) {
        self.kill_with(i, KillCause::Scripted);
    }

    /// Drop a soldier dead, recording WHY (for the per-unit loss-by-cause tally).
    pub(crate) fn kill_with(&mut self, i: usize, cause: KillCause) {
        if self.alive[i] == 0 {
            return;
        }
        self.alive[i] = 0;
        self.stun[i] = 0.0; // a corpse is not also stunned (one state, not flags)
        self.target[i] = -1;
        let routing = self.units[self.soldier_unit[i] as usize].routing;
        let u = &mut self.units[self.soldier_unit[i] as usize];
        u.alive_count = u.alive_count.saturating_sub(1);
        u.deaths_since_reform += 1;
        u.recent_casualties += 1.0;
        match cause {
            KillCause::Impact => u.lost_impact += 1,
            KillCause::ChargeMelee => u.lost_charge_melee += 1,
            KillCause::GrindMelee => u.lost_grind_melee += 1,
            KillCause::Missile => u.lost_missile += 1,
            KillCause::Scripted => {}
        }
        // A real (non-scripted) death after the unit has already broken is a
        // ride-down, not decisive killing — tracked apart so tests can exclude it.
        if routing && cause != KillCause::Scripted {
            u.lost_post_rout += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{record_friend, NearbyFriend, MAX_NEARBY_FRIENDS};

    fn normalized(order: impl IntoIterator<Item = NearbyFriend>) -> Vec<NearbyFriend> {
        let mut friends = [None; MAX_NEARBY_FRIENDS];
        let mut friends_len = 0usize;
        for friend in order {
            record_friend(&mut friends, &mut friends_len, friend);
        }
        let mut measured: Vec<_> = friends[..friends_len].iter().flatten().copied().collect();
        measured.sort_by_key(|f| f.owner);
        measured
    }

    #[test]
    fn nearby_friend_measure_is_body_scan_order_independent() {
        let bodies = [
            NearbyFriend {
                owner: 7,
                bearing: 0.3,
                distance: 1.2,
                fighting: true,
                priority: (0, 2, 7),
            },
            NearbyFriend {
                owner: 2,
                bearing: -0.1,
                distance: 0.8,
                fighting: false,
                priority: (0, 1, 2),
            },
            NearbyFriend {
                owner: 7,
                bearing: 0.2,
                distance: 0.6,
                fighting: true,
                priority: (0, 2, 7),
            }, // nearer body of the same mounted soldier
        ];
        assert_eq!(normalized(bodies), normalized(bodies.into_iter().rev()));
        assert_eq!(
            normalized(bodies)[1],
            NearbyFriend {
                owner: 7,
                bearing: 0.2,
                distance: 0.6,
                fighting: true,
                priority: (0, 2, 7)
            }
        );

        let crowded: Vec<_> = (0..40)
            .map(|i| NearbyFriend {
                owner: i,
                bearing: 0.0,
                distance: 1.0,
                fighting: true,
                priority: (i as i32 / 8, i as i32 % 8, i),
            })
            .collect();
        assert_eq!(
            normalized(crowded.clone()),
            normalized(crowded.into_iter().rev())
        );
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
