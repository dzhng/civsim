//! Body collision: the physical medium of the battle.
//!
//! Soldiers are circles; mounted soldiers are TWO circles (an elongated horse)
//! whose rider sits at the center — rider reachability is pure geometry.
//! Overlapping bodies push apart, the lighter yielding more, sharing the
//! correction by effective mass. Force TRANSMISSION (deep columns walking thin
//! lines back, pike walls holding) is not modelled here — it emerges from the
//! weave springs in steer_soldiers, and CRUSH is read off that same weave
//! compression, not from the pushes posted here.
//!
//! What this pass owns: the hard non-overlap correction, the REAL WALL (a man
//! may not end the tick inside an enemy body), and charge impacts (closing
//! speed × effective mass) that stun and displace.

use crate::class::{HORSE_BODY_R, HORSE_HALF_LEN};
use crate::math::Vec2;
use crate::sim::Sim;
use crate::tunables::DT;

/// A non-braced weapon (a sword) holds an enemy this far past body contact — the
/// standoff band that stops two sword lines interleaving their lattices into a
/// blob (a rear man squirting into the gap between two enemies). Body separation
/// forbids only OVERLAP, so without this the lattices superimpose.
const SWORD_STANDOFF: f32 = 0.5;
/// The standoff band's repel is this fraction of the overlap repel — WEAK, so it
/// resists deep interleaving without moving where the front rank FIGHTS (a
/// full-strength standoff shifted the fight distance and rippled pressure/kills;
/// at this softness both stay green). Combat reach is far longer regardless.
const SWORD_STANDOFF_SOFT: f32 = 0.2;
/// A braced pole line is a hedge, not isolated one-file pokes: adjacent leveled
/// points overlap laterally so staggered fronts cannot zipper through the gaps.
const BRACED_REPEL_FILE_OVERLAP: f32 = 4.0;

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
            stun,
            trampled,
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
            cur_weapon,
            ..
        } = self;
        // Collision damage is applied after the pass (kill() needs &mut self).
        let mut impact_kills: Vec<usize> = Vec::new();
        // Jacobi impact: the charge stack READS carried momentum (the trample
        // bleed reads the trampler's, the retain-set reads the victim's) and
        // WRITES it across bodies. In place those reads/writes ran in body-index
        // order — a head-on charge resolved one side's momentum before the
        // other's, the deep-press half of the directional bias. Read the
        // tick-start snapshot; stage the bleed (additive) and the retain (a
        // max-magnitude set) and apply both after the body loop.
        let n_sol = mom_x.len();
        let mom0_x = mom_x.clone();
        let mom0_y = mom_y.clone();
        let mut bleed_x = vec![0.0f32; n_sol];
        let mut bleed_y = vec![0.0f32; n_sol];
        let mut set_mag = vec![0.0f32; n_sol];
        let mut set_nx = vec![0.0f32; n_sol];
        let mut set_ny = vec![0.0f32; n_sol];
        grid.rebuild(cell, body_pos);
        // The REAL WALL: deepest enemy body a soldier overlaps this tick. The
        // capped push relieves crowds gently; an ENEMY body, though, a man may
        // not END the tick standing inside — he is snapped to its contact ring.
        // This is what stops a SHORT-weapon clash walking through: the planted
        // front line is a wall of bodies the rear can't shove past. Long braced
        // weapons extend the same wall out to reach (the pole pass below).
        let mut wall_depth = vec![-1.0f32; n];
        let mut wall_cx = vec![0.0f32; n];
        let mut wall_cy = vec![0.0f32; n];
        let mut wall_r = vec![0.0f32; n];
        // scratch: per-soldier [push_x, push_y] (the body separation, capped).
        scratch.clear();
        scratch.resize(2 * n, 0.0);
        // The weapon repel is a SEPARATE force, applied UNCAPPED: it must compete
        // on its own magnitude against the rear-rank backing (the contest of
        // pushes that decides the standoff distance), not get flattened by the
        // crowd-relief separation cap into a binary win/lose wall.
        let mut repel = vec![0.0f32; 2 * n];

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
                            // Non-overlap shares by effective mass alone (brace
                            // included). Force TRANSMISSION — a deep column out-
                            // pushing a thin line — is no longer bolted on here:
                            // it emerges from the weave, where each rank's
                            // compression spring shoves the rank ahead, so depth
                            // wins on its own (measured: a 14-deep block walks a
                            // 3-deep one back, equal depths hold).
                            let w_i = m_eff(i);
                            let w_j = m_eff(j);
                            let share = w_j / (w_i + w_j);
                            let overlap = (min_dist - d) * share;
                            push.x += (nx - slide * ny) * overlap;
                            push.y += (ny + slide * nx) * overlap;

                            // Track the deepest ENEMY body for the hard wall —
                            // unless this body is trampling (it rides through).
                            if units[ui].team != units[uj].team
                                && !(units[ui].tramples()
                                    && units[ui].mass_advance > tun.charge_spent_speed)
                            {
                                let depth = min_dist - d;
                                if depth > wall_depth[i] {
                                    wall_depth[i] = depth;
                                    wall_cx[i] = body_pos[2 * bj];
                                    wall_cy[i] = body_pos[2 * bj + 1];
                                    wall_r[i] = min_dist;
                                }
                            }

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
                                    push.x += nx * closing * tun.impact_push * DT * share;
                                    push.y += ny * closing * tun.impact_push * DT * share;
                                    // TRAMPLE BLEED: a trampler spends its CARRIED
                                    // momentum on every enemy BODY it rides into,
                                    // proportional to that man's BRACE — a
                                    // planted, braced line brakes the charge with
                                    // its mass; a man on the move (brace ~1)
                                    // barely slows it. So rank by rank the charge
                                    // bleeds, and a few ranks of BRACED infantry
                                    // bog it below trample speed (then the body
                                    // wall pins it), while a MOVING line lets it
                                    // ride deeper. The grip is the BODY, not the
                                    // weapon — pikes brake hardest only because
                                    // they brace hardest (brace_mult). The glide
                                    // is where the charge lives (a position push
                                    // saturates against the separation cap).
                                    // TRAMPLE BLEED: the charge spends its carried
                                    // momentum on every enemy body it rides into,
                                    // scaled by that man's BRACE (always some — a
                                    // running man slows the horse a little; a
                                    // braced, planted one brakes it hard) and by
                                    // the mass share (a lighter charger bogs
                                    // sooner). Rank by rank it bleeds, so DEPTH
                                    // decides: a few ranks of braced infantry bog
                                    // it below trample speed (then the body wall
                                    // pins it); a thin line is cleared before it
                                    // spends.
                                    if units[ui].tramples() {
                                        let toward = -(mom0_x[i] * nx + mom0_y[i] * ny);
                                        if toward > 0.0 {
                                            let grip = (tun.trample_bleed * share * units[uj].brace())
                                                .min(0.85);
                                            bleed_x[i] += nx * toward * grip;
                                            bleed_y[i] += ny * toward * grip;
                                        }
                                        // BOWL the victim: while the charge is still
                                        // committed (riding at speed, not bogged), the
                                        // man it runs into is staggered out of the
                                        // weave so the lane stays open. A SPENT charge
                                        // (below trample speed) no longer bowls — the
                                        // line re-forms and pins it.
                                        if units[ui].mass_advance > tun.charge_spent_speed {
                                            trampled[j] = tun.trample_recover;
                                        }
                                    }
                                    // A felling blow resolves to ONE state,
                                    // never both: KILL xor KNOCK-DOWN. Only a man
                                    // on his feet (stun == 0) is felled afresh —
                                    // a man already down is ridden over, not
                                    // re-stunned into a permanent ragdoll. The
                                    // blow's damage (Δv over his braced, backed
                                    // mass; tramplers only — men bumping men at a
                                    // run bruise and fall) decides: if it drops
                                    // him he DIES, otherwise he is STUNNED. A
                                    // corpse is never also stunned; a stunned man
                                    // never also dying.
                                    // The felling threshold scales with the
                                    // victim's effective mass — w_i already folds
                                    // in his BRACE (a planted, backed man keeps
                                    // his feet; a loose man is bowled over), so no
                                    // extra pole/footing factor is needed.
                                    if momentum > tun.stun_momentum * w_i && stun[i] <= 0.0 {
                                        let dv = momentum / w_i.max(0.1);
                                        let knockback = units[uj].stats.knockback_mult;
                                        let pool = if mounted[i] == 1 {
                                            &mut mount_health[i]
                                        } else {
                                            &mut health[i]
                                        };
                                        *pool -= tun.impact_damage * knockback * dv;
                                        if *pool <= 0.0 {
                                            impact_kills.push(i); // killed — not stunned
                                        } else {
                                            stun[i] = tun.stun_time; // survived — knocked down
                                        }
                                    }
                                    // The impactor RETAINS 0.6 of its closing
                                    // momentum as carried drive (the rest bleeds
                                    // into the body it just hit): armed here,
                                    // spent against the crowd, zeroed by
                                    // stagger. Never exceeds what the approach
                                    // physically justifies — a sprinting heavy
                                    // carries a stride; half a ton of horse
                                    // carries meters.
                                    // Record the retain FLOOR (the largest 0.6×
                                    // closing momentum over this tick's impacts).
                                    // It is applied as a floor on the BLED momentum
                                    // after the pass — NOT an overwrite, or it would
                                    // erase the trample bleed and the charge would
                                    // never bog (it plowed clean through deep braced
                                    // blocks while this was a `=`).
                                    let want = momentum * 0.6;
                                    if want > set_mag[j] {
                                        set_mag[j] = want;
                                        set_nx[j] = nx;
                                        set_ny[j] = ny;
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
        }

        // Apply the staged charge momentum together: BLEED first (the trample
        // spends the charger's carried drive into braced bodies), THEN raise to
        // the retain FLOOR only where the bled momentum fell below it — a floor,
        // not an overwrite. As the charge bogs, its closing speed (and so the
        // floor) drops with it, and the bleed finally wins and it stops.
        for s in 0..n_sol {
            mom_x[s] += bleed_x[s];
            mom_y[s] += bleed_y[s];
            if set_mag[s] > 0.0 {
                let cur = (mom_x[s] * mom_x[s] + mom_y[s] * mom_y[s]).sqrt();
                if cur < set_mag[s] {
                    mom_x[s] = set_nx[s] * set_mag[s];
                    mom_y[s] = set_ny[s] * set_mag[s];
                }
            }
        }

        // --- WEAPON REPEL: a leveled weapon PUSHES the enemy out of its reach.
        // A man holds a foe off not with a wall but with a FORCE: the points (or
        // the blade) shove an enemy who is inside reach back out, along the
        // weapon's line, harder the deeper he is. It's a real TWO-WAY force —
        // each front man's weapon pushes the other's — so the line holds at
        // weapon's length on its own, the contest of pushes (not a clamp)
        // deciding the distance: a deeper, better-backed enemy can OVERPOWER the
        // repel and close (a sword line presses into a pike hedge if it has the
        // weight), which a wall could never allow. Posted into the same push
        // accumulator as the body separation, so it competes in the SAME medium
        // as the rear-rank shove that used to overrun the soft steering magnet.
        // A pike (long reach) pushes far, a sword (short) at arm's length — same
        // rule, the reach is the only difference.
        let max_reach = units.iter().fold(0.0f32, |m, u| {
            m.max(u.stats.weapons.iter().fold(0.0, |a, w| a.max(w.reach)))
        });
        if max_reach > 0.0 && tun.weapon_repel > 0.0 {
            // The grid is built at body-pair resolution; reach runs far past
            // that, so scan a wider window around each man.
            let reach_cells = (max_reach / cell).ceil() as i32 + 1;
            for bi in 0..nb {
                let j = body_owner[bi] as usize;
                let uj = soldier_unit[j] as usize;
                // A trampler rides THROUGH contact — it holds no line and repels
                // no one (the trample bleed, not a repel, spends its charge).
                if units[uj].tramples() {
                    continue;
                }
                // The weapon IN HAND sets the reach (a pike on its side-sword
                // pushes close, not at pike length).
                let held = cur_weapon[j] as usize;
                let weapons = units[uj].stats.weapons;
                if held >= weapons.len() {
                    continue;
                }
                // A BRACED weapon pushes from its points (its reach); everything
                // else pushes from the BODY (an arm's length is a body's length —
                // a sword has no standoff). Keeping non-braced at body radius
                // leaves the contact DISTANCE exactly where the plain body wall
                // already put it — the repel only makes that push DIRECTIONAL and
                // uncapped (so it holds the line), it does not move where men
                // fight, so it doesn't ripple the combat balance.
                let braced = weapons[held].braced;
                let reach = weapons[held].reach;
                // The weapon points down the UNIT's frontage; its push is frontal,
                // along that line. Swords cover one file; braced pole points overlap
                // several files into a continuous hedge so a staggered front cannot
                // zipper between isolated columns.
                let aim = crate::math::dir(units[uj].facing);
                let (perp_x, perp_y) = (-aim.y, aim.x);
                let half_w = units[uj].spacing.x.max(0.5)
                    * if braced {
                        BRACED_REPEL_FILE_OVERLAP
                    } else {
                        1.0
                    };
                let (jx, jy) = (body_pos[2 * bi], body_pos[2 * bi + 1]);
                let cx = (jx / cell).floor() as i32;
                let cy = (jy / cell).floor() as i32;
                // The NEAREST frontal foe in this bearer's column — the one man his
                // points actually fence. Only that pair is pushed: a pike bears on
                // the enemy DIRECTLY ahead, not on the ranks stacked behind him
                // (their own front man is between). Summing a push against every
                // foe in the reach cone (3-4 enemy ranks deep) over-counts and
                // launches the front man clean out — the standoff is one foe, one
                // hold.
                let mut near_i = usize::MAX;
                let mut near_fwd = f32::INFINITY;
                let mut near_pen = 0.0f32;
                for oy in -reach_cells..=reach_cells {
                    for ox in -reach_cells..=reach_cells {
                        let b = grid.bucket(cx + ox, cy + oy);
                        let (lo, hi) = (grid.starts[b] as usize, grid.starts[b + 1] as usize);
                        for &bk in &grid.entries[lo..hi] {
                            let i = body_owner[bk as usize] as usize;
                            let ui = soldier_unit[i] as usize;
                            if units[ui].team == units[uj].team {
                                continue;
                            }
                            // A committed charge rides ONTO the points (the impale
                            // is its reckoning) — it is not pushed back out.
                            if units[ui].tramples() {
                                continue;
                            }
                            let bsum = body_r[bi] + body_r[bk as usize];
                            let dx = body_pos[2 * bk as usize] - jx;
                            let dy = body_pos[2 * bk as usize + 1] - jy;
                            let fwd = dx * aim.x + dy * aim.y;
                            // The standoff holds only in a FRONTAL clash — where this
                            // bearer sits along the foe's OWN facing axis (the foe is
                            // squared up to him, two lines meeting). When the foe is
                            // taken on his FLANK or rear (this bearer is off to the
                            // foe's side — a wide line wrapping a block) there is no
                            // standoff: the wrapping man closes to body contact so the
                            // block is ENVELOPED, not held at arm's length. Keyed on
                            // the CONTACT direction (foe→bearer) vs the foe's facing,
                            // not the bearer's — a held block faces one way, so its
                            // flank men only read as flanked by where the foe stands.
                            // This is what separates the blob (frontal interleave,
                            // bad) from a wrap (flank envelopment, the point).
                            let foe_aim = crate::math::dir(units[ui].facing);
                            let d2c = dx * dx + dy * dy;
                            let frontal = (-dx * foe_aim.x - dy * foe_aim.y) > 0.55 * d2c.sqrt();
                            // A sword holds a SOFT standoff past body contact: full
                            // repel on overlap (front contact, where men FIGHT, is
                            // unchanged) plus a WEAK ramp in the standoff band beyond
                            // it — enough to resist a rear man squirting into the
                            // gaps between enemies (the blob), not enough to move the
                            // front line out. A braced point holds at its full reach.
                            // FOOT vs FOOT only: the blob is an infantry-line
                            // problem. Cavalry rides through and maneuvers in contact
                            // (its reach is the rider-reachability contract), so a
                            // horse-involved contact keeps body radius — no standoff.
                            let foot = mounted[j] == 0 && mounted[i] == 0;
                            let standoff_dist = if frontal && foot { SWORD_STANDOFF } else { 0.0 };
                            let rdist = if braced { reach } else { bsum + standoff_dist };
                            // Inside the forward reach band, in this man's column.
                            if fwd <= 0.0 || fwd >= rdist {
                                continue;
                            }
                            let lat = dx * perp_x + dy * perp_y;
                            if lat.abs() > half_w {
                                continue;
                            }
                            if fwd < near_fwd {
                                near_fwd = fwd;
                                near_i = i;
                                near_pen = if braced {
                                    rdist - fwd
                                } else {
                                    let overlap = (bsum - fwd).max(0.0);
                                    let standoff = (rdist - fwd.max(bsum)).max(0.0);
                                    overlap + SWORD_STANDOFF_SOFT * standoff
                                };
                            }
                        }
                    }
                }
                if near_i != usize::MAX {
                    // The weapon's points are a leveled body: the SAME two-way,
                    // mass-shared separation the bodies use (above), just acting at
                    // REACH instead of body radius. Newton's third law — the pike
                    // PUSHES the foe back out (resisting his advance, not merely
                    // backing the bearer off; a force that moves only its bearer
                    // can't hold a line) and recoils the bearer by the equal
                    // reaction. The split is by effective mass (brace included),
                    // exactly as for two colliding bodies: a BRACED, deep-backed
                    // bearer has a huge m_eff, so he barely recoils and the foe is
                    // shoved out — the standoff holds — while his own rear ranks get
                    // no back-shove to squirt sideways through. SOFT (∝ how deep the
                    // foe is inside reach), so it is no wall: a heavier / better-
                    // backed enemy out-masses the share and presses in, the contest
                    // of forces deciding the distance.
                    let i = near_i;
                    let (wj, wi) = (m_eff(j), m_eff(i));
                    let inv = 1.0 / (wi + wj);
                    let push = near_pen * tun.weapon_repel * DT;
                    repel[2 * i] += aim.x * push * (wj * inv);
                    repel[2 * i + 1] += aim.y * push * (wj * inv);
                    repel[2 * j] -= aim.x * push * (wi * inv);
                    repel[2 * j + 1] -= aim.y * push * (wi * inv);
                }
            }
        }

        // --- apply the non-overlap correction (capped per soldier, walls slide).
        for i in 0..n {
            let mut px = scratch[2 * i];
            let mut py = scratch[2 * i + 1];
            let mag = (px * px + py * py).sqrt();
            if mag > tun.separation_max_push {
                let k = tun.separation_max_push / mag;
                px *= k;
                py *= k;
            }
            // The weapon repel is its OWN capped correction, summed after the
            // body separation. Capping it (like the bodies) is what keeps a
            // symmetric front STABLE: an uncapped frontal shove is positive
            // feedback — the side that slips a hair ahead shoves the other back
            // harder, and a head-on clash of identical lines BUCKLES one way and
            // routs (the "heavy-v-heavy isn't even" failure). Capped, it can't
            // overshoot, so two equal fronts settle at weapon's length and grind
            // evenly — exactly as two equal bodies settle at contact.
            let mut rx = repel[2 * i];
            let mut ry = repel[2 * i + 1];
            let rmag = (rx * rx + ry * ry).sqrt();
            if rmag > tun.separation_max_push {
                let k = tun.separation_max_push / rmag;
                rx *= k;
                ry *= k;
            }
            px += rx;
            py += ry;
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
            // Hard wall: a man may not end the tick inside an enemy body. Snap
            // him out to the contact ring of the deepest one he overlaps.
            let np = if wall_depth[i] >= 0.0 {
                let to = Vec2::new(np.x - wall_cx[i], np.y - wall_cy[i]);
                let dd = to.len();
                if dd > 1e-4 && dd < wall_r[i] {
                    Vec2::new(wall_cx[i] + to.x * (wall_r[i] / dd), wall_cy[i] + to.y * (wall_r[i] / dd))
                } else {
                    np
                }
            } else {
                np
            };
            positions[2 * i] = np.x;
            positions[2 * i + 1] = np.y;
        }

        // The throws that broke bodies: bookkeeping after the borrow ends.
        self.impact_casualties += impact_kills.len() as u64;
        for &i in &impact_kills {
            self.kill(i);
        }
    }
}
