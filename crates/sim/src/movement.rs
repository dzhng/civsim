//! Formation controller and the speed/stamina model.
//!
//! The controller realizes player intent, rate-limited by cohesion AND by
//! geometry — rotation may never ask the outermost soldiers to move faster
//! than their legs allow, so big blocks wheel slowly without any hand-tuned
//! per-size rules.

use crate::math::{dir, lerp, move_toward, rotate_toward, wrap_angle};
use crate::tunables::{Pace, Tunables};
use crate::unit::Unit;

/// How much of the above-walk speed range remains available: flat while
/// fresh, falling off once the reserve is below ~70%. Walking always works.
pub(crate) fn stamina_factor(stamina: f32) -> f32 {
    (stamina / 0.7).min(1.0).powf(1.5)
}

#[cfg(test)]
mod posture_observation_tests {
    use super::*;
    use crate::unit::OrderMode;
    use crate::{Sim, Vec2, DT};

    #[test]
    fn withdrawal_reports_retained_facing_without_a_soldier_target() {
        let mut sim = Sim::new(Tunables::default(), 47);
        sim.spawn_unit(Vec2::ZERO, 0.0, 1, 1, Vec2::new(1.0, 1.0), 0, 1.0);
        let u = &mut sim.units[0];
        u.mode = OrderMode::Disengage;
        u.move_target = Some(Vec2::new(-30.0, 0.0));
        update_unit_motion(&sim.tun, u, DT, 1.0);
        assert!(u.guarded_facing);
        assert!(u.anchor.x < 0.0);
        assert!(
            u.facing.cos() > 0.9,
            "withdrawal retains the old front while wheeling"
        );
        u.move_target = None;
        u.at_ease = true;
        update_unit_motion(&sim.tun, u, DT, 1.0);
        assert!(
            !u.guarded_facing,
            "the observation must not survive a different branch"
        );
    }

    #[test]
    fn threat_drift_and_locked_retreat_report_guarded_but_free_pivot_does_not() {
        let mut sim = Sim::new(Tunables::default(), 47);
        sim.spawn_unit(Vec2::ZERO, 0.0, 1, 1, Vec2::new(1.0, 1.0), 0, 1.0);
        let u = &mut sim.units[0];
        u.move_target = Some(Vec2::new(-30.0, 0.0));
        u.threat_bearing = Some(0.0);
        u.pace = Pace::Run;
        update_unit_motion(&sim.tun, u, DT, 1.0);
        assert!(
            u.guarded_facing,
            "the engine's walking drift overrides ordered run"
        );
        assert_eq!(u.facing, 0.0);
        u.threat_bearing = None;
        u.engaged = 1;
        update_unit_motion(&sim.tun, u, DT, 1.0);
        assert!(u.guarded_facing, "locked retreat holds the contact front");
        u.engaged = 0;
        update_unit_motion(&sim.tun, u, DT, 1.0);
        assert!(
            !u.guarded_facing,
            "an ordinary about-face is not a threat-facing branch"
        );
        u.evade_auto = true;
        update_unit_motion(&sim.tun, u, DT, 1.0);
        assert!(
            u.guarded_facing,
            "automatic escape uses the same retained-facing drift"
        );
    }
}

/// Off-axis legs: full pace straight ahead, ~0.7 for a sidestep, sliding
/// toward ~0.55 walking backwards — you cannot sprint sideways or
/// backwards. One law for every loose-order drift (kiting flight, the
/// engage-posture strafe).
pub(crate) fn drift_factor(desired: f32, facing: f32) -> f32 {
    let c = wrap_angle(desired - facing).cos();
    if c >= 0.0 {
        0.7 + 0.3 * c
    } else {
        0.7 + 0.15 * c
    }
}

/// Facing swing rate (rad/s) for loose-order drift — individuals turning,
/// not a formation wheeling.
const DRIFT_TURN_RATE: f32 = 1.2;

/// The unit's effective pace, degraded by stamina (a spent unit "runs" at a
/// walk). Attacks close at the double regardless of the ordered pace.
pub(crate) fn pace_speed(tun: &Tunables, u: &Unit) -> f32 {
    // The charge burst overrides pace, but ONLY in the measured final
    // approach of an explicit attack (set in the reflex pass).
    let top = if u.charging {
        tun.charge_speed
    } else {
        match u.effective_pace() {
            Pace::Walk => tun.base_speed,
            Pace::Run => tun.run_speed,
        }
    };
    // pace_mult scales the ABOVE-WALK range only, not the walk floor — every
    // class walks at ~base_speed (a horse walks about like a marching man), but a
    // fast class opens a big gap at the run and a huge one at the charge. (Scaling
    // the whole speed made cavalry "walk" at 4.4 m/s.)
    let base = tun.base_speed + (top - tun.base_speed) * stamina_factor(u.stamina) * u.pace_mult;
    // RAM DRAG: driving through a resisting crowd is braked by the
    // measured ENEMY counter-press, scaled by the unit's own measured
    // speed — the force balance that stops a trample. The pairwise
    // collision solver alone cannot: each horse only contests the one
    // man it overlaps this tick and outmasses him, so a braced column's
    // collective weight has to act through this measured channel.
    // The gate spares working contact (column jitter, the slow shove)
    // and ramps in over a narrow band; past it the FULL counter-press
    // counts — the wall brakes the front rank and the front rank brakes
    // the ranks piling in behind (the chain is the collective force).
    // The high floor on the SMOOTHED press is a TRAMPLER signal — it lets a horse
    // ride through a thin screen (low sustained press) yet bog on a wall (high).
    // Infantry keep the instantaneous press and a low floor: their grind into a
    // press IS braked (the clash holds at first contact, no lag), only a working
    // shove below the floor is spared.
    // Trampler: a TIGHT ramp on the smoothed press so a braced wall (just over the
    // floor) grips fully while a screen (just under) is spared — the brace/no-brace
    // line is narrow. Infantry: the original wide ramp on the instantaneous press.
    let (press, floor, ramp) = if u.tramples() {
        (
            u.ram_press,
            tun.press_brake_floor,
            0.3 * tun.press_brake_floor,
        )
    } else {
        (u.counter_press, 0.45, 0.6 * 0.45)
    };
    // A trampler rides CLEAN through a shallow screen however wide — its per-man
    // press is inflated by the screen's width into the wall band, but a few ranks
    // have no DEPTH to stop a horse. At/below 4 ranks the drag is waived outright:
    // a 4-deep line is grinds-through territory (the charge keeps its burst and
    // punches out the far side); the brake earns its keep from ~6 braced ranks up
    // (bracing_is_what_stops_the_charge bogs at depth 6, enough_depth at 8).
    let grip = if u.tramples() && u.foe_ranks > 0.0 && u.foe_ranks <= 4.0 {
        0.0
    } else {
        ((press - floor) / ramp).clamp(0.0, 1.0)
    };
    // Quadratic in the unit's own speed — ram pressure, not sticky mud:
    // a slow press into a wall keeps its shove (the pikes kill it by
    // reach, not by rule), a gallop into the same wall eats its drive.
    let v = u.mass_advance.max(0.0) / tun.base_speed;
    let drag = tun.press_brake * grip * press * v * v;
    (base - drag).max(0.0)
}

/// Catch-up sprint for out-of-position soldiers. Drilled troops surge harder;
/// tired units sag toward walking pace, so they re-form (and wheel) slower.
pub(crate) fn soldier_surge_speed(tun: &Tunables, u: &Unit) -> f32 {
    let drill = 0.85 + 0.3 * u.training;
    // pace_mult on the above-walk range only (matches pace_speed) — a slow class
    // still sprints from ~base_speed, a fast one sprints far harder.
    tun.base_speed
        + (tun.surge_speed - tun.base_speed) * stamina_factor(u.stamina) * drill * u.pace_mult
}

/// Per-man top-speed ceiling DURING A CHARGE — the all-out final-approach burst,
/// faster than the catch-up surge. The men's per-man speed cap is normally built
/// on the surge ceiling; if a charge were capped there too, the charge pace
/// (cruise) would be clamped back down to a surge and a charge would be no faster
/// than a hard run. Same shape as the surge, but off charge_speed.
pub(crate) fn soldier_charge_speed(tun: &Tunables, u: &Unit) -> f32 {
    let drill = 0.85 + 0.3 * u.training;
    tun.base_speed
        + (tun.charge_speed - tun.base_speed) * stamina_factor(u.stamina) * drill * u.pace_mult
}

pub(crate) fn update_unit_motion(tun: &Tunables, u: &mut Unit, dt: f32, ground: f32) {
    u.guarded_facing = false;
    // Turn rate is NOT throttled by cohesion: a disordered unit must still be
    // able to WHEEL — above all to about-face and flee a grind it is losing.
    // Cohesion gating the turn made a routed-but-not-yet-broken unit unable to
    // turn away (it can never re-form while engaged, so the throttle never
    // lifts, and it is cut down facing the enemy). The wheel is still bounded by
    // real physics — the geometric corner-speed cap (which carries stamina via
    // the surge ceiling) and ground — just not by formation order.
    let accel = tun.base_accel * u.accel_mult * lerp(tun.min_accel_frac, 1.0, u.cohesion);
    // Wheeling asks the outer soldiers to surge, so the rotation budget is
    // the surge speed — tired units visibly pivot slower. Bad ground slows
    // legs and therefore everything derived from them.
    let top = soldier_surge_speed(tun, u) * ground;

    // The anchor walks its planned waypoints; the final goal uses the arrive
    // radius, intermediate corners don't brake.
    let intermediate = u.path_idx + 1 < u.path.len();
    let steer_goal = if u.path_idx < u.path.len() {
        u.move_target.map(|_| u.path[u.path_idx])
    } else {
        u.move_target
    };

    match steer_goal {
        Some(t) => {
            let to = t - u.anchor;
            let mut dist = to.len();
            let attacking = matches!(u.mode, crate::unit::OrderMode::Attack(_));
            if intermediate || attacking {
                // No deceleration into corners — and no "arriving" at an
                // enemy: an attack drives until the leash or the kill stops
                // it, never the arrive radius.
                dist = dist.max(12.0);
            } else if dist < tun.arrive_radius {
                u.move_target = None;
                u.path.clear();
                u.path_idx = 0;
                u.pivoting = false;
                u.frame_speed = move_toward(u.frame_speed, 0.0, accel * 2.0 * dt);
                return;
            }
            if u.waiting {
                u.guarded_facing = !u.at_ease;
                // Queued behind same-flow traffic in a corridor.
                u.frame_speed = move_toward(u.frame_speed, 0.0, accel * 2.0 * dt);
                if u.frame_speed > 0.0 {
                    u.anchor = u.anchor + dir(u.facing) * (u.frame_speed * dt);
                }
                return;
            }
            let desired = to.y.atan2(to.x);
            let err = wrap_angle(desired - u.facing);

            // Skirmish legs: loose-order troops don't wheel — they drift in
            // any direction (back-pedaling away from a threat while still
            // facing it), at a modest penalty. A wide screen that had to
            // about-face like a phalanx would die where it stood.
            if u.evade_auto {
                u.guarded_facing = true;
                u.pivoting = false;
                u.facing = rotate_toward(u.facing, desired, DRIFT_TURN_RATE * dt);
                let target_speed = (pace_speed(tun, u) * ground * drift_factor(desired, u.facing))
                    .min((2.0 * accel * dist).sqrt());
                u.frame_speed = move_toward(u.frame_speed, target_speed, accel * dt);
                u.anchor = u.anchor + to * (u.frame_speed * dt / dist.max(0.01));
                return;
            }

            // DISENGAGE drift: foot and pinned mounts peel off immediately, never
            // halting for a drilled about-face. A drilled
            // halt-then-turn strands a unit that still carries charge speed (it
            // coasts straight INTO the foe before it can rotate), and a unit that
            // cannot re-form while engaged can never clear a "halt, re-form, then
            // turn" gate at all — it dies facing the enemy. Instead this path
            // DRIFTS toward the escape point (moving AWAY at once, not along its
            // foe-ward facing) while WHEELING to face it; as the heading comes
            // round the back-pedal opens into a run. Free mounted units are
            // excluded: a horse is a long body, so it must use the normal car-like
            // wheel path below instead of translating sideways while still pointed
            // off the escape line. A mounted unit already pinned in a grind still
            // gets the peel-off drift; otherwise it can stall in place while trying
            // to wheel inside the crowd.
            if matches!(u.mode, crate::unit::OrderMode::Disengage)
                && (!u.is_mounted() || u.engaged > 0)
            {
                u.guarded_facing = true;
                u.pivoting = false;
                let geom = tun.wheel_speed_factor * top / u.bound_radius().max(1.0);
                let rate = tun.base_turn_rate.min(geom);
                u.facing = rotate_toward(u.facing, desired, rate * dt);
                let target_speed = (pace_speed(tun, u) * ground * drift_factor(desired, u.facing))
                    .min((2.0 * accel * dist).sqrt());
                u.frame_speed = move_toward(u.frame_speed, target_speed, accel * dt);
                u.cruise = move_toward(u.cruise, target_speed, accel * dt);
                u.anchor = u.anchor + to * (u.frame_speed * dt / dist.max(0.01));
                return;
            }

            // Locked in melee (a third of the unit fighting): the FACING is
            // owned by the contact pass (face the enemy across the whole
            // front), not by any maneuvering heading here. A grinding line
            // neither strafes, pivots, nor arcs toward its order — that is what
            // let an attack wheel toward its jittering / behind-the-line target
            // while a steady-target move held. It still creeps its anchor along
            // its current facing under the leash.
            // Mounted units are exempt — cavalry wheels and re-charges, it
            // doesn't grind in place; let it keep steering.
            // Locked when a third of the unit fights OR the whole FRONT RANK is in
            // contact — the latter catches a NARROW deep column, whose front is
            // fully engaged but is far under a third of its mass, so it would
            // otherwise never lock and would drive its frame clean through the
            // line it is supposed to grind against (the asymmetric pass-through).
            let locked = !u.is_mounted()
                && (u.engaged * 12 > u.alive_count.max(1)
                    || u.engaged >= u.files_eff.max(1) as usize);
            u.guarded_facing = locked;

            // ENGAGE posture (the Move default): a foot unit maneuvering
            // near an enemy never shows its back. If the move direction
            // points away from the threat, it keeps its face (and shields)
            // on the enemy and DRIFTS — strafing/back-pedaling at walking
            // pace with a direction penalty. NOT once locked in a grind: a
            // committed line holds and fights, it doesn't sidestep.
            // Disengage (Withdraw) turns and runs instead. Cavalry can't
            // sidestep: it wheels and breaks off like cavalry.
            if !locked && u.mode != crate::unit::OrderMode::Disengage && !u.is_mounted() {
                if let Some(threat) = u.threat_bearing {
                    let move_off = wrap_angle(desired - threat).abs();
                    if move_off > 1.35 {
                        u.guarded_facing = true;
                        u.pivoting = false;
                        u.facing = rotate_toward(u.facing, threat, DRIFT_TURN_RATE * dt);
                        // Walking pace by design (a strafe is never a run), and
                        // walk is class-independent now, so no pace_mult here; ram
                        // drag is immaterial (quadratic in speed, ~0 at a walk).
                        let target_speed =
                            (tun.base_speed * ground * drift_factor(desired, u.facing))
                                .min((2.0 * accel * dist).sqrt());
                        u.frame_speed = move_toward(u.frame_speed, target_speed, accel * dt);
                        u.anchor = u.anchor + to * (u.frame_speed * dt / dist.max(0.01));
                        return;
                    }
                }
            }

            // Hysteresis: a big heading change enters the pivot; the unit
            // stays in it until nearly aligned, then marches out. Never while
            // locked — melee is not the time for a drilled about-face (a
            // disengage, which DOES need to break contact, already peeled off
            // above via the wheel-and-run drift, so it never reaches here).
            if !locked && err.abs() > tun.pivot_facing_err {
                u.pivoting = true;
            } else if locked || err.abs() < tun.pivot_exit_err {
                u.pivoting = false;
            }

            if u.pivoting {
                // Halt, then rotate the whole formation about its center
                // while ranks re-form (drilled about-face), instead of
                // dragging the block through an arc like cloth.
                u.frame_speed = move_toward(u.frame_speed, 0.0, accel * 2.0 * dt);
                u.cruise = move_toward(u.cruise, 0.0, accel * 2.0 * dt);
                if u.frame_speed < 0.05 {
                    let geom = tun.wheel_speed_factor * top / u.bound_radius().max(1.0);
                    let rate = tun.base_turn_rate.min(geom);
                    let center = u.center();
                    u.facing = rotate_toward(u.facing, desired, rate * dt);
                    u.anchor = center + dir(u.facing) * (0.5 * u.depth());
                } else {
                    u.anchor = u.anchor + dir(u.facing) * (u.frame_speed * dt);
                }
            } else {
                // March, arcing toward the target. The rotation budget is the
                // speed the rear corners have left over after marching.
                if !locked {
                    let spare = (top * top - u.frame_speed * u.frame_speed)
                        .max((0.25 * top).powi(2))
                        .sqrt();
                    let geom = tun.wheel_speed_factor * spare / u.march_turn_radius().max(1.0);
                    let rate = tun.base_turn_rate.min(geom);
                    u.facing = rotate_toward(u.facing, desired, rate * dt);
                }
                // A CHARGE does not brake to arrive — the whole point is
                // to make contact at full speed and let the bodies cash it.
                // LOCKED in melee: the frame HOLDS at the men (target 0) — a
                // grinding line never drives its anchor toward a goal past the
                // foe (that towed the slots through the enemy: the pass-through).
                // Advance is OTHISMOS — the men shove through by compression and
                // the leash drags the anchor behind. The frame follows the fight.
                // A locked MOVE (not Attack, not Disengage) whose target is BEHIND the
                // facing is a shields-front WITHDRAWAL: the men keep facing/fighting
                // the foe, but the frame drives in REVERSE toward the order — paired
                // with the loose backing-off leash in the anchor law, this actually
                // extracts the unit instead of it grinding forward on the magnet.
                let backing_off = locked
                    && matches!(u.mode, crate::unit::OrderMode::Move)
                    && u.move_target.map_or(false, |mt| {
                        let to = mt - u.anchor;
                        to.dot(dir(u.facing)) < -0.2 * to.len()
                    });
                let target_speed = if u.charging {
                    pace_speed(tun, u) * ground
                } else if backing_off {
                    (pace_speed(tun, u) * ground * 0.6).min((2.0 * accel * dist).sqrt())
                } else if locked {
                    // A locked ATTACK or a forward MOVE: the frame HOLDS at the men
                    // (othismos), never driving the anchor toward a goal past the
                    // foe. (A withdrawal peels off above via the disengage drift, or
                    // backs off shields-front just above — neither reaches here.)
                    0.0
                } else {
                    (pace_speed(tun, u) * ground).min((2.0 * accel * dist).sqrt())
                };
                u.frame_speed = move_toward(u.frame_speed, target_speed, accel * dt);
                // CRUISE is the clean, leash-immune copy of this intended speed —
                // the men feed it forward to track the frame without lag.
                u.cruise = move_toward(u.cruise, target_speed, accel * dt);
                // Backing off drives the anchor toward the ORDER (reverse), not along
                // the held facing (which points at the foe).
                let drive = if backing_off {
                    u.move_target.map_or(dir(u.facing), |mt| {
                        let to = mt - u.anchor;
                        let l = to.len();
                        if l > 0.01 {
                            to * (1.0 / l)
                        } else {
                            dir(u.facing)
                        }
                    })
                } else {
                    dir(u.facing)
                };
                u.anchor = u.anchor + drive * (u.frame_speed * dt);
            }
        }
        None => {
            u.frame_speed = move_toward(u.frame_speed, 0.0, accel * 2.0 * dt);
            u.cruise = move_toward(u.cruise, 0.0, accel * 2.0 * dt);
            if u.frame_speed > 0.0 {
                u.anchor = u.anchor + dir(u.facing) * (u.frame_speed * dt);
            }
            // Arrived with a commanded facing: pivot to it, then settle.
            if let Some(ff) = u.final_facing {
                if u.frame_speed < 0.05 {
                    let err = wrap_angle(ff - u.facing);
                    if err.abs() < 0.08 {
                        u.final_facing = None;
                        u.pivoting = false;
                    } else {
                        u.pivoting = true;
                        let geom = tun.wheel_speed_factor * top / u.bound_radius().max(1.0);
                        let rate = tun.base_turn_rate.min(geom);
                        let center = u.center();
                        u.facing = rotate_toward(u.facing, ff, rate * dt);
                        u.anchor = center + dir(u.facing) * (0.5 * u.depth());
                    }
                }
            } else {
                u.pivoting = false;
                u.guarded_facing = !u.at_ease;
            }
        }
    }
}
