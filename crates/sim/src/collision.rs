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
        self.impact_kill_count.resize(n, 0);
        self.enemy_contact.resize(n, false);
        for i in 0..n {
            // A charger's kill quota refreshes only when it breaks CLEAR of the
            // enemy — rode through, free to wheel and charge afresh — NOT when it
            // merely bogs in the press. A horse stuck in a grind keeps its spent
            // quota, so it can't farm the crowd by re-impacting each lurch; a slow
            // walk-in therefore gets ONE impact event, like a fast charge, and the
            // charge wins on closing speed (more dv) rather than on dwell time.
            if !self.enemy_contact[i] {
                self.impact_kill_count[i] = 0;
                self.charge_wpn_spent[i] = false; // couch a fresh lance for the next charge
            }
            self.enemy_contact[i] = false; // recomputed this tick from overlaps
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
            facings,
            radius,
            alive,
            cur_weapon,
            rng,
            impact_kill_count,
            enemy_contact,
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
        let mut project_unit_active = vec![0u8; units.len()];
        let mut project_any = false;

        let m_eff = |i: usize| mass[i] * brace[soldier_unit[i] as usize];
        let unit_near_enemy: Vec<bool> = units
            .iter()
            .map(|u| {
                if u.tramples() && u.mass_advance > tun.charge_spent_speed {
                    return false;
                }
                let eu = 0.5 * u.width().max(u.depth());
                units.iter().any(|v| {
                    v.team != u.team
                        && v.alive_count > 0
                        && !(v.tramples() && v.mass_advance > tun.charge_spent_speed)
                        && (v.center() - u.center()).len()
                            < eu + 0.5 * v.width().max(v.depth()) + 40.0
                })
            })
            .collect();
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
                        let ui = soldier_unit[i] as usize;
                        let uj = soldier_unit[j] as usize;
                        let enemies = units[ui].team != units[uj].team;
                        if enemies {
                            // Both bodies are touching an enemy this tick — keep
                            // their charge quota spent until they break clear.
                            enemy_contact[i] = true;
                            enemy_contact[j] = true;
                        }
                        if bj > bi
                            && !((units[ui].tramples()
                                && units[ui].mass_advance > tun.charge_spent_speed)
                                || (units[uj].tramples()
                                    && units[uj].mass_advance > tun.charge_spent_speed))
                            && (enemies || unit_near_enemy[ui] || unit_near_enemy[uj])
                        {
                            project_unit_active[ui] = 1;
                            project_unit_active[uj] = 1;
                            project_any = true;
                        }
                        if d2 > 1e-8 {
                            let d = d2.sqrt();
                            let (nx, ny) = (dx / d, dy / d);
                            // Slide lubricates FRIENDLY crowds (relief-in-place,
                            // funneling). Enemies don't politely sidestep each
                            // other: head-on enemy contact deadlocks into a
                            // battle line, which is the point.
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
                            if enemies
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

                            // Impact: a fast clash knocks men down and bowls them
                            // back. It scales with the CLOSING speed measured ABOVE
                            // charge_min — `excess` is (closing - charge_min), so a
                            // collision AT the threshold does nothing and the blow
                            // ramps up from there: two men braking to a halt as they
                            // meet (closing ~3, just over the floor) barely jostle,
                            // a horse at the gallop (closing ~8+) delivers a lethal
                            // share. The victim's velocity change is the reduced-mass
                            // share, w_j/(w_i+w_j)·excess — bounded, never the horse's
                            // mass times it. No charge "state": walk, run and charge
                            // differ only by closing speed, through this one equation.
                            // Brace lives in w_i: a backed man has more effective
                            // mass, a smaller dv, and keeps his feet.
                            if enemies {
                                // CARRIED closing: the relative carried momentum (each
                                // unit's measured mass_advance along its facing), NOT the
                                // post-brake instantaneous velocity. The ram brake bleeds
                                // the contact velocity to a crawl for a charge and a
                                // walk-in alike, hiding the gallop; the carried speed
                                // keeps it. It is still a true CLOSING — two riders
                                // carrying fast the SAME way close at ~0 and do nothing,
                                // only a head-on approach scores.
                                let cj = crate::math::dir(units[uj].facing);
                                let ci = crate::math::dir(units[ui].facing);
                                let maj = units[uj].mass_advance;
                                let mai = units[ui].mass_advance;
                                let rel_x = cj.x * maj - ci.x * mai;
                                let rel_y = cj.y * maj - ci.y * mai;
                                let closing = (rel_x * nx + rel_y * ny).max(0.0);
                                if closing > tun.charge_min_speed {
                                    // The impact WOUND scales with the CLOSING speed — the
                                    // first-principled measure: two riders going the same
                                    // way barely close however fast they gallop, so a stern
                                    // chase does nothing; only a real head-on closing does.
                                    // Normalised ramp from impact_floor (0) to
                                    // impact_full_speed (1): the floor sits ABOVE a walk-in
                                    // / jog-in closing, so light running ITSELF onto a horse
                                    // (or a near-matched chase) deals ZERO, and only a
                                    // committed charge clears it. Brace lives in w_i (the
                                    // share): a backed man takes a smaller dv, keeps his feet.
                                    let span =
                                        (tun.impact_full_speed - tun.impact_floor).max(0.1);
                                    let ramp =
                                        ((closing - tun.impact_floor) / span).clamp(0.0, 1.0);
                                    let dv = ramp * w_j / (w_i + w_j);
                                    push.x += nx * closing * tun.impact_push * DT * share;
                                    push.y += ny * closing * tun.impact_push * DT * share;
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
                                            let grip =
                                                (tun.trample_bleed * share * units[uj].brace())
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
                                    // A man is felled when the normalised impact dv
                                    // clears impact_fell_min — so a half-speed clash
                                    // (a walk-in, light running itself on) jostles but
                                    // does NOT knock down, only a real charge does.
                                    // Brace already lives in w_i (a backed man takes a
                                    // smaller dv and keeps his feet).
                                    if dv > tun.impact_fell_min && stun[i] <= 0.0 {
                                        // Each body the impactor rides into JARS it —
                                        // spend the impactor's unit stamina by the shock
                                        // delivered. Plowing a dense block is a string of
                                        // these jolts, so a charge blows the horses and
                                        // can't be spammed (it scales with how much it
                                        // plows, not a flat cost).
                                        let shock = (closing / tun.charge_min_speed).min(2.0);
                                        units[uj].stamina =
                                            (units[uj].stamina - tun.impact_drain * shock).max(0.0);
                                        let vstats = units[ui].stats;
                                        // Can he see it coming? You dodge a charge you
                                        // face; you're ridden down from behind.
                                        let incoming = (-ny).atan2(-nx);
                                        let aspect =
                                            crate::math::wrap_angle(incoming - facings[i]).abs();
                                        let (front, seen) = if aspect < crate::combat::FRONT_ARC {
                                            (true, 1.0)
                                        } else if aspect < crate::combat::SIDE_ARC {
                                            (false, 0.6)
                                        } else {
                                            (false, 0.25)
                                        };
                                        // EVADE the charge: a nimble man throws himself
                                        // clear — light high-evade troops slip a charge a
                                        // pinned heavy block cannot. A clean dodge takes no
                                        // wound and no fell.
                                        if rng.chance(vstats.evade * seen) {
                                            // sidestepped — only the push (already added)
                                        } else {
                                            let knockback = units[uj].stats.knockback_mult;
                                            // BLOCK: a raised front shield soaks the shock.
                                            let block_mult = if front && rng.chance(vstats.block) {
                                                tun.impact_block_mult
                                            } else {
                                                1.0
                                            };
                                            let dmg = tun.impact_damage * knockback * dv * block_mult;
                                            let quota_left = impact_kill_count[j] < tun.impact_kill_cap;
                                            let pool = if mounted[i] == 1 {
                                                &mut mount_health[i]
                                            } else {
                                                &mut health[i]
                                            };
                                            // A charger rides at most `impact_kill_cap` men down
                                            // per charge: the shock is spent on the man it skewers
                                            // on the way in; the rest it only bowls over. Whether
                                            // the blow is lethal is decided by dv alone (above) —
                                            // a slow walk-in simply never reaches a killing dv, so
                                            // it knocks men down and the fight is a GRIND, with no
                                            // special charge-state needed. (Per-charger quota —
                                            // M-equivariant.)
                                            if quota_left && *pool - dmg <= 0.0 {
                                                *pool -= dmg;
                                                impact_kills.push(i);
                                                impact_kill_count[j] += 1;
                                            } else {
                                                *pool -= dmg.min((*pool - 0.05).max(0.0));
                                                stun[i] = tun.stun_time;
                                            }
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
                                    let want = w_j * closing * 0.6;
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
                let braced = weapons[held].braced();
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
                    let ui = soldier_unit[i] as usize;
                    project_unit_active[ui] = 1;
                    project_unit_active[uj] = 1;
                    project_any = true;
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
                    Vec2::new(
                        wall_cx[i] + to.x * (wall_r[i] / dd),
                        wall_cy[i] + to.y * (wall_r[i] / dd),
                    )
                } else {
                    np
                }
            } else {
                np
            };
            positions[2 * i] = np.x;
            positions[2 * i + 1] = np.y;
        }

        // ITERATIVE BODY PROJECTION: the one-shot separation above is capped as
        // crowd relief, but after a deep press it can leave enemy bodies still
        // interpenetrating. A second, symmetric constraint solve removes only
        // the remaining physical impossibility: two bodies occupying the same
        // space. Corrections are Jacobi-staged per pass (all reads come from the
        // pass-start candidate positions, then apply together) so pair order does
        // not make one line shove with freshly-updated state.
        const BODY_PROJECTION_PASSES: usize = 3;
        if project_any {
            for _ in 0..BODY_PROJECTION_PASSES {
                body_pos.clear();
                body_r.clear();
                body_owner.clear();
                for i in 0..n {
                    if alive[i] == 0 {
                        continue;
                    }
                    let px = positions[2 * i];
                    let py = positions[2 * i + 1];
                    if mounted[i] == 1 {
                        let f = crate::math::dir(facings[i]);
                        for s in [-1.0f32, 1.0] {
                            body_pos.push(px + f.x * HORSE_HALF_LEN * s);
                            body_pos.push(py + f.y * HORSE_HALF_LEN * s);
                            body_r.push(HORSE_BODY_R);
                            body_owner.push(i as u32);
                        }
                    } else {
                        body_pos.push(px);
                        body_pos.push(py);
                        body_r.push(radius[i]);
                        body_owner.push(i as u32);
                    }
                }
                grid.rebuild(cell, body_pos);
                scratch.clear();
                scratch.resize(2 * n, 0.0);
                let mut any = false;
                for bi in 0..body_owner.len() {
                    let i = body_owner[bi] as usize;
                    let ui = soldier_unit[i] as usize;
                    if project_unit_active[ui] == 0 {
                        continue;
                    }
                    let px = body_pos[2 * bi];
                    let py = body_pos[2 * bi + 1];
                    let cx = (px / cell).floor() as i32;
                    let cy = (py / cell).floor() as i32;
                    let mut seen = [usize::MAX; 9];
                    let mut seen_len = 0;
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
                                let uj = soldier_unit[j] as usize;
                                if j == i || (project_unit_active[uj] != 0 && bj <= bi) {
                                    continue;
                                }
                                if units[ui].team != units[uj].team
                                    && ((units[ui].tramples()
                                        && units[ui].mass_advance > tun.charge_spent_speed)
                                        || (units[uj].tramples()
                                            && units[uj].mass_advance > tun.charge_spent_speed))
                                {
                                    continue;
                                }
                                let relax = if units[ui].team == units[uj].team {
                                    0.5
                                } else {
                                    1.0
                                };
                                let dx = px - body_pos[2 * bj];
                                let dy = py - body_pos[2 * bj + 1];
                                let min_dist = body_r[bi] + body_r[bj];
                                let d2 = dx * dx + dy * dy;
                                if d2 >= min_dist * min_dist {
                                    continue;
                                }
                                let (nx, ny, d) = if d2 > 1e-8 {
                                    let d = d2.sqrt();
                                    (dx / d, dy / d, d)
                                } else if i < j {
                                    (1.0, 0.0, 0.0)
                                } else {
                                    (-1.0, 0.0, 0.0)
                                };
                                let w_i = m_eff(i);
                                let w_j = m_eff(j);
                                let inv = 1.0 / (w_i + w_j);
                                let overlap = min_dist - d;
                                let si = w_j * inv;
                                let sj = w_i * inv;
                                scratch[2 * i] += nx * overlap * si * relax;
                                scratch[2 * i + 1] += ny * overlap * si * relax;
                                scratch[2 * j] -= nx * overlap * sj * relax;
                                scratch[2 * j + 1] -= ny * overlap * sj * relax;
                                any = true;
                            }
                        }
                    }
                }
                if !any {
                    break;
                }
                for i in 0..n {
                    if alive[i] == 0 {
                        continue;
                    }
                    let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
                    let np = Vec2::new(p.x + scratch[2 * i], p.y + scratch[2 * i + 1]);
                    if terrain.speed_at(np) > 0.0 || terrain.speed_at(p) <= 0.0 {
                        positions[2 * i] = np.x;
                        positions[2 * i + 1] = np.y;
                    }
                }
            }
        }

        // The throws that broke bodies: bookkeeping after the borrow ends.
        self.impact_casualties += impact_kills.len() as u64;
        for &i in &impact_kills {
            self.kill_with(i, crate::combat::KillCause::Impact);
        }
    }
}
