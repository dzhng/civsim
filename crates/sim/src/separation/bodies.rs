use crate::class::{HORSE_BODY_R, HORSE_HALF_LEN};
use crate::force_trace::ForceChannel;
use crate::math::Vec2;
use crate::sim::Sim;
use crate::tunables::DT;

pub(super) fn grid_cell(max_pair: f32) -> f32 {
    (max_pair * 1.3).max(0.5)
}

pub(super) fn rebuild(sim: &mut Sim, n: usize) {
    // --- build bodies ----------------------------------------------------
    sim.body_pos.clear();
    sim.body_r.clear();
    sim.body_owner.clear();
    sim.impact_kill_count.resize(n, 0);
    sim.enemy_contact.resize(n, false);
    for i in 0..n {
        // A charger's kill quota refreshes only when it breaks CLEAR of the
        // enemy — rode through, free to wheel and charge afresh — NOT when it
        // merely bogs in the press. A horse stuck in a grind keeps its spent
        // quota, so it can't farm the crowd by re-impacting each lurch; a slow
        // walk-in therefore gets ONE impact event, like a fast charge, and the
        // charge wins on closing speed (more dv) rather than on dwell time.
        if !sim.enemy_contact[i] {
            sim.impact_kill_count[i] = 0;
            sim.charge_wpn_spent[i] = false; // couch a fresh lance for the next charge
        }
        sim.enemy_contact[i] = false; // recomputed this tick from overlaps
        if sim.alive[i] == 0 {
            continue;
        }
        let px = sim.positions[2 * i];
        let py = sim.positions[2 * i + 1];
        if sim.mounted[i] == 1 {
            let f = crate::math::dir(sim.facings[i]);
            for s in [-1.0f32, 1.0] {
                sim.body_pos.push(px + f.x * HORSE_HALF_LEN * s);
                sim.body_pos.push(py + f.y * HORSE_HALF_LEN * s);
                sim.body_r.push(HORSE_BODY_R);
                sim.body_owner.push(i as u32);
            }
        } else {
            sim.body_pos.push(px);
            sim.body_pos.push(py);
            sim.body_r.push(sim.radius[i]);
            sim.body_owner.push(i as u32);
        }
    }
}

pub(super) struct MomentumCtx<'a> {
    pub(super) n_sol: usize,
    pub(super) mom_x: &'a mut [f32],
    pub(super) mom_y: &'a mut [f32],
    pub(super) bleed_x: &'a [f32],
    pub(super) bleed_y: &'a [f32],
    pub(super) set_mag: &'a [f32],
    pub(super) set_nx: &'a [f32],
    pub(super) set_ny: &'a [f32],
    pub(super) soldier_unit: &'a [u32],
}

pub(super) fn apply_momentum(ctx: MomentumCtx<'_>, tracer: &mut crate::force_trace::Tracer<'_>) {
    let MomentumCtx {
        n_sol,
        mom_x,
        mom_y,
        bleed_x,
        bleed_y,
        set_mag,
        set_nx,
        set_ny,
        soldier_unit,
    } = ctx;
    // Apply the staged charge momentum together: BLEED first (the trample
    // spends the charger's carried drive into braced bodies), THEN raise to
    // the retain FLOOR only where the bled momentum fell below it — a floor,
    // not an overwrite. As the charge bogs, its closing speed (and so the
    // floor) drops with it, and the bleed finally wins and it stops.
    for s in 0..n_sol {
        let mom_before = Vec2::new(mom_x[s], mom_y[s]);
        mom_x[s] += bleed_x[s];
        mom_y[s] += bleed_y[s];
        if set_mag[s] > 0.0 {
            let cur = (mom_x[s] * mom_x[s] + mom_y[s] * mom_y[s]).sqrt();
            if cur < set_mag[s] {
                mom_x[s] = set_nx[s] * set_mag[s];
                mom_y[s] = set_ny[s] * set_mag[s];
            }
        }
        let mom_after = Vec2::new(mom_x[s], mom_y[s]);
        if mom_after.x != mom_before.x || mom_after.y != mom_before.y {
            tracer.record(
                s,
                soldier_unit[s] as usize,
                ForceChannel::KnockbackMomentum,
                None,
                mom_after - mom_before,
                "charge_momentum_bleed_or_retain",
            );
        }
    }
}

pub(super) struct ImpactCtx<'a> {
    pub(super) tun: crate::tunables::Tunables,
    pub(super) enemies: bool,
    pub(super) units: &'a mut [crate::unit::Unit],
    pub(super) ui: usize,
    pub(super) uj: usize,
    pub(super) nx: f32,
    pub(super) ny: f32,
    pub(super) w_i: f32,
    pub(super) w_j: f32,
    pub(super) share: f32,
    pub(super) push: &'a mut Vec2,
    pub(super) i: usize,
    pub(super) j: usize,
    pub(super) trampled: &'a mut [f32],
    pub(super) stun: &'a mut [f32],
    pub(super) mom0_x: &'a [f32],
    pub(super) mom0_y: &'a [f32],
    pub(super) bleed_x: &'a mut [f32],
    pub(super) bleed_y: &'a mut [f32],
    pub(super) facings: &'a [f32],
    pub(super) rng: &'a mut crate::Pcg32,
    pub(super) impact_kill_count: &'a mut [u32],
    pub(super) mounted: &'a [u8],
    pub(super) mount_health: &'a mut [f32],
    pub(super) health: &'a mut [f32],
    pub(super) impact_kills: &'a mut Vec<usize>,
    pub(super) set_mag: &'a mut [f32],
    pub(super) set_nx: &'a mut [f32],
    pub(super) set_ny: &'a mut [f32],
}

pub(super) fn resolve_impact<F>(
    ctx: ImpactCtx<'_>,
    tracer: &mut crate::force_trace::Tracer<'_>,
    brace_dir: &F,
) where
    F: Fn(usize, f32, f32, bool) -> f32,
{
    let ImpactCtx {
        tun,
        enemies,
        units,
        ui,
        uj,
        nx,
        ny,
        w_i,
        w_j,
        share,
        push,
        i,
        j,
        trampled,
        stun,
        mom0_x,
        mom0_y,
        bleed_x,
        bleed_y,
        facings,
        rng,
        impact_kill_count,
        mounted,
        mount_health,
        health,
        impact_kills,
        set_mag,
        set_nx,
        set_ny,
    } = ctx;
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
        // post-brake instantaneous velocity. The brake bleeds the
        // contact velocity to a crawl, hiding the gallop. And a
        // body bogging into a line decays its measured speed within
        // a tick or two — so a COMMITTED charger keeps the gallop it
        // is carrying (floored at the full-impact speed while
        // `charging`): it delivers its shock INTO the line as it
        // decelerates, not only in the first frame of contact. It is
        // still a true CLOSING — two riders carrying fast the SAME
        // way close at ~0 and do nothing; only a head-on approach
        // scores. A NON-charging body (a walk-in) keeps its real
        // crawl, so it delivers no shock.
        let carry = |u: usize| units[u].mass_advance;
        let cj = crate::math::dir(units[uj].facing);
        let ci = crate::math::dir(units[ui].facing);
        let rel_x = cj.x * carry(uj) - ci.x * carry(ui);
        let rel_y = cj.y * carry(uj) - ci.y * carry(ui);
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
            let span = (tun.impact_full_speed - tun.impact_floor).max(0.1);
            let ramp = ((closing - tun.impact_floor) / span).clamp(0.0, 1.0);
            let dv = ramp * w_j / (w_i + w_j);
            push.x += nx * closing * tun.impact_push * DT * share;
            push.y += ny * closing * tun.impact_push * DT * share;
            let impact_push = Vec2::new(nx, ny) * (closing * tun.impact_push * DT * share);
            tracer.record(
                i,
                ui,
                ForceChannel::ImpactPush,
                None,
                impact_push,
                "charge_closing_impact_push",
            );
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
                // A charge bleeds momentum only into a STANDING,
                // braced man — the resistance is his planted feet
                // and leveled weapon. A man already knocked DOWN
                // (stunned or bowled) is ridden OVER, not shoved
                // through; he no longer bleeds the gallop. So each
                // standing rank bleeds the charge ONCE, then is
                // felled and ridden over — DEPTH still bogs it
                // (more standing ranks = more total bleed), but the
                // men it has already downed don't double-dip and
                // drag a long-stun charge to a halt on its own kills.
                let down = trampled[j] > 0.0 || stun[j] > 0.0;
                let toward = -(mom0_x[i] * nx + mom0_y[i] * ny);
                if toward > 0.0 && !down {
                    // The victim bleeds the charge by the brace
                    // he sets toward it — full if it hits his
                    // braced FRONT, almost none on his flank/rear
                    // (the charger i is at +n from him).
                    let grip = (tun.trample_bleed * share * brace_dir(j, nx, ny, true)).min(0.85);
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
                units[uj].stamina = (units[uj].stamina - tun.impact_drain * shock).max(0.0);
                let vstats = units[ui].stats;
                // Can he see it coming? You dodge a charge you
                // face; you're ridden down from behind.
                let incoming = (-ny).atan2(-nx);
                let aspect = crate::math::wrap_angle(incoming - facings[i]).abs();
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
}

pub(super) struct PairCtx<'a> {
    pub(super) tun: crate::tunables::Tunables,
    pub(super) nb: usize,
    pub(super) body_owner: &'a [u32],
    pub(super) body_pos: &'a [f32],
    pub(super) body_r: &'a [f32],
    pub(super) cell: f32,
    pub(super) grid: &'a crate::grid::SpatialHash,
    pub(super) soldier_unit: &'a [u32],
    pub(super) units: &'a mut [crate::unit::Unit],
    pub(super) enemy_contact: &'a mut [bool],
    pub(super) unit_near_enemy: &'a [bool],
    pub(super) project_unit_active: &'a mut [u8],
    pub(super) project_any: &'a mut bool,
    pub(super) trampled: &'a mut [f32],
    pub(super) stun: &'a mut [f32],
    pub(super) mom0_x: &'a [f32],
    pub(super) mom0_y: &'a [f32],
    pub(super) bleed_x: &'a mut [f32],
    pub(super) bleed_y: &'a mut [f32],
    pub(super) facings: &'a [f32],
    pub(super) rng: &'a mut crate::Pcg32,
    pub(super) impact_kill_count: &'a mut [u32],
    pub(super) mounted: &'a [u8],
    pub(super) mount_health: &'a mut [f32],
    pub(super) health: &'a mut [f32],
    pub(super) impact_kills: &'a mut Vec<usize>,
    pub(super) set_mag: &'a mut [f32],
    pub(super) set_nx: &'a mut [f32],
    pub(super) set_ny: &'a mut [f32],
    pub(super) scratch: &'a mut [f32],
    pub(super) wall_depth: &'a mut [f32],
    pub(super) wall_cx: &'a mut [f32],
    pub(super) wall_cy: &'a mut [f32],
    pub(super) wall_r: &'a mut [f32],
}

pub(super) fn separate_pairs<F, G>(
    ctx: PairCtx<'_>,
    m_eff: &F,
    brace_dir: &G,
    tracer: &mut crate::force_trace::Tracer<'_>,
) where
    F: Fn(usize, f32, f32, bool) -> f32,
    G: Fn(usize, f32, f32, bool) -> f32,
{
    let PairCtx {
        tun,
        nb,
        body_owner,
        body_pos,
        body_r,
        cell,
        grid,
        soldier_unit,
        units,
        enemy_contact,
        unit_near_enemy,
        project_unit_active,
        project_any,
        trampled,
        stun,
        mom0_x,
        mom0_y,
        bleed_x,
        bleed_y,
        facings,
        rng,
        impact_kill_count,
        mounted,
        mount_health,
        health,
        impact_kills,
        set_mag,
        set_nx,
        set_ny,
        scratch,
        wall_depth,
        wall_cx,
        wall_cy,
        wall_r,
    } = ctx;
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
                        *project_any = true;
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
                        // Each braces toward the other: i's threat is j (dir -n),
                        // j's threat is i (dir +n). A flanked man is "lighter".
                        let w_i = m_eff(i, -nx, -ny, enemies);
                        let w_j = m_eff(j, nx, ny, enemies);
                        let share = w_j / (w_i + w_j);
                        let overlap = (min_dist - d) * share;
                        push.x += (nx - slide * ny) * overlap;
                        push.y += (ny + slide * nx) * overlap;
                        let normal_push = Vec2::new(nx, ny) * overlap;
                        let slide_push = Vec2::new(-slide * ny, slide * nx) * overlap;
                        tracer.record(
                            i,
                            ui,
                            ForceChannel::BodySeparationNormal,
                            None,
                            normal_push,
                            if enemies {
                                "enemy_body_normal"
                            } else {
                                "friendly_body_normal"
                            },
                        );
                        if slide_push.x != 0.0 || slide_push.y != 0.0 {
                            tracer.record(
                                i,
                                ui,
                                ForceChannel::BodySeparationFriendlySlide,
                                None,
                                slide_push,
                                "friendly_slide_component",
                            );
                        }

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

                        resolve_impact(
                            ImpactCtx {
                                tun,
                                enemies,
                                units: &mut *units,
                                ui,
                                uj,
                                nx,
                                ny,
                                w_i,
                                w_j,
                                share,
                                push: &mut push,
                                i,
                                j,
                                trampled: &mut *trampled,
                                stun: &mut *stun,
                                mom0_x,
                                mom0_y,
                                bleed_x: &mut *bleed_x,
                                bleed_y: &mut *bleed_y,
                                facings,
                                rng: &mut *rng,
                                impact_kill_count: &mut *impact_kill_count,
                                mounted,
                                mount_health: &mut *mount_health,
                                health: &mut *health,
                                impact_kills: &mut *impact_kills,
                                set_mag: &mut *set_mag,
                                set_nx: &mut *set_nx,
                                set_ny: &mut *set_ny,
                            },
                            tracer,
                            brace_dir,
                        );
                    } else {
                        let tie = Vec2::new(
                            if i < j {
                                tun.body_separation_tiebreak
                            } else {
                                -tun.body_separation_tiebreak
                            },
                            0.0,
                        );
                        if tie.x != 0.0 {
                            push = push + tie;
                            tracer.record(
                                i,
                                soldier_unit[i] as usize,
                                ForceChannel::BodySeparationTieBreak,
                                None,
                                tie,
                                "coincident_body_index_tiebreak",
                            );
                        }
                    }
                }
            }
        }
        scratch[2 * i] += push.x;
        scratch[2 * i + 1] += push.y;
    }
}
