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
pub(crate) fn fatigue_capacity(fatigue: f32) -> f32 {
    (fatigue / 0.7).min(1.0).powf(1.5)
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

/// The unit's effective pace, degraded by fatigue (a spent unit "runs" at a
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
    let base = tun.base_speed + (top - tun.base_speed) * fatigue_capacity(u.fatigue) * u.pace_mult;
    // RAM DRAG: driving through a resisting crowd is braked by the
    // measured ENEMY counter-press, scaled by the unit's own measured
    // speed — the force balance that stops a trample. The pairwise
    // collision solver alone cannot: each horse only contests the one
    // man it overlaps this tick and outmasses him, so a braced column's
    // collective weight has to act through this measured channel.
    // The gate spares working contact (column jitter, the othismos shove)
    // and ramps in over a narrow band; past it the FULL counter-press
    // counts — the wall brakes the front rank and the front rank brakes
    // the ranks piling in behind (the chain is the collective force).
    let grip = ((u.counter_press - tun.press_brake_floor) / (0.6 * tun.press_brake_floor))
        .clamp(0.0, 1.0);
    // Quadratic in the unit's own speed — ram pressure, not sticky mud:
    // a slow press into a wall keeps its shove (the pikes kill it by
    // reach, not by rule), a gallop into the same wall eats its drive.
    let v = u.mass_advance.max(0.0) / tun.base_speed;
    let drag = tun.press_brake * grip * u.counter_press * v * v;
    (base - drag).max(0.0)
}

/// Catch-up sprint for out-of-position soldiers. Drilled troops surge harder;
/// tired units sag toward walking pace, so they re-form (and wheel) slower.
pub(crate) fn soldier_surge_speed(tun: &Tunables, u: &Unit) -> f32 {
    let drill = 0.85 + 0.3 * u.training;
    // pace_mult on the above-walk range only (matches pace_speed) — a slow class
    // still sprints from ~base_speed, a fast one sprints far harder.
    tun.base_speed
        + (tun.surge_speed - tun.base_speed) * fatigue_capacity(u.fatigue) * drill * u.pace_mult
}

/// Per-man top-speed ceiling DURING A CHARGE — the all-out final-approach burst,
/// faster than the catch-up surge. The men's per-man speed cap is normally built
/// on the surge ceiling; if a charge were capped there too, the charge pace
/// (cruise) would be clamped back down to a surge and a charge would be no faster
/// than a hard run. Same shape as the surge, but off charge_speed.
pub(crate) fn soldier_charge_speed(tun: &Tunables, u: &Unit) -> f32 {
    let drill = 0.85 + 0.3 * u.training;
    tun.base_speed
        + (tun.charge_speed - tun.base_speed) * fatigue_capacity(u.fatigue) * drill * u.pace_mult
}

pub(crate) fn update_unit_motion(tun: &Tunables, u: &mut Unit, dt: f32, ground: f32) {
    // Cohesion throttles rotation MULTIPLICATIVELY with the geometric cap:
    // when the measurement says soldiers aren't tracking the rotation (mud
    // under one wing, exhaustion, crowding), the wheel slows until they
    // catch up — for any unit size. min() alone is blind for wide units,
    // whose geometric cap sits far below the cohesion-throttled base rate.
    let turn_throttle = lerp(tun.min_turn_frac, 1.0, u.cohesion);
    let accel = tun.base_accel * lerp(tun.min_accel_frac, 1.0, u.cohesion);
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
                u.pivoting = false;
                u.facing = rotate_toward(u.facing, desired, DRIFT_TURN_RATE * dt);
                let target_speed = (pace_speed(tun, u) * ground * drift_factor(desired, u.facing))
                    .min((2.0 * accel * dist).sqrt());
                u.frame_speed = move_toward(u.frame_speed, target_speed, accel * dt);
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
                        u.pivoting = false;
                        u.facing = rotate_toward(u.facing, threat, DRIFT_TURN_RATE * dt);
                        // Walking pace by design (a strafe is never a run), and
                        // walk is class-independent now, so no pace_mult here; ram
                        // drag is immaterial (quadratic in speed, ~0 at a walk).
                        let target_speed = (tun.base_speed * ground
                            * drift_factor(desired, u.facing))
                        .min((2.0 * accel * dist).sqrt());
                        u.frame_speed = move_toward(u.frame_speed, target_speed, accel * dt);
                        u.anchor = u.anchor + to * (u.frame_speed * dt / dist.max(0.01));
                        return;
                    }
                }
            }

            // Hysteresis: a big heading change enters the pivot; the unit
            // stays in it until nearly aligned, then marches out. Never while
            // locked — melee is not the time for a drilled about-face — EXCEPT a
            // WITHDRAW, which MUST about-face out of contact to flee (a locked
            // unit otherwise keeps facing the foe and drives its frame straight
            // back INTO it instead of away).
            let disengaging = matches!(u.mode, crate::unit::OrderMode::Disengage);
            if (!locked || disengaging) && err.abs() > tun.pivot_facing_err {
                u.pivoting = true;
            } else if (locked && !disengaging) || err.abs() < tun.pivot_exit_err {
                u.pivoting = false;
            }

            if u.pivoting {
                // Halt, then rotate the whole formation about its center
                // while ranks re-form (drilled about-face), instead of
                // dragging the block through an arc like cloth.
                u.frame_speed = move_toward(u.frame_speed, 0.0, accel * 2.0 * dt);
                u.cruise = move_toward(u.cruise, 0.0, accel * 2.0 * dt);
                if u.frame_speed < 0.05 {
                    let geom = tun.wheel_speed_factor * top / u.pivot_radius().max(1.0);
                    let rate = tun.base_turn_rate.min(geom) * turn_throttle;
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
                    let spare =
                        (top * top - u.frame_speed * u.frame_speed).max((0.25 * top).powi(2)).sqrt();
                    let geom = tun.wheel_speed_factor * spare / u.march_turn_radius().max(1.0);
                    let rate = tun.base_turn_rate.min(geom) * turn_throttle;
                    u.facing = rotate_toward(u.facing, desired, rate * dt);
                }
                // A CHARGE does not brake to arrive — the whole point is
                // to make contact at full speed and let the bodies cash it.
                // LOCKED in melee: the frame HOLDS at the men (target 0) — a
                // grinding line never drives its anchor toward a goal past the
                // foe (that towed the slots through the enemy: the pass-through).
                // Advance is OTHISMOS — the men shove through by compression and
                // the leash drags the anchor behind. The frame follows the fight.
                let target_speed = if u.charging {
                    pace_speed(tun, u) * ground
                } else if locked && !matches!(u.mode, crate::unit::OrderMode::Disengage) {
                    // A WITHDRAW still drives its frame AWAY even while the rear is
                    // in contact — the frame must LEAD the men out, or the leash
                    // pins the disengaging unit in the grind it is trying to flee.
                    0.0
                } else {
                    (pace_speed(tun, u) * ground).min((2.0 * accel * dist).sqrt())
                };
                u.frame_speed = move_toward(u.frame_speed, target_speed, accel * dt);
                // CRUISE is the clean, leash-immune copy of this intended speed —
                // the men feed it forward to track the frame without lag.
                u.cruise = move_toward(u.cruise, target_speed, accel * dt);
                u.anchor = u.anchor + dir(u.facing) * (u.frame_speed * dt);
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
                        let geom = tun.wheel_speed_factor * top / u.pivot_radius().max(1.0);
                        let rate = tun.base_turn_rate.min(geom) * turn_throttle;
                        let center = u.center();
                        u.facing = rotate_toward(u.facing, ff, rate * dt);
                        u.anchor = center + dir(u.facing) * (0.5 * u.depth());
                    }
                }
            } else {
                u.pivoting = false;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::Vec2;
    use crate::tunables::DT;

    #[test]
    fn low_cohesion_turns_slower() {
        let tun = Tunables::default();
        let mut disordered = Unit {
            class: crate::class::UnitClassId::LightSpear,
            stats: crate::class::class_stats(crate::class::UnitClassId::LightSpear),
            pace_mult: 1.0,
            start: 0,
            count: 0,
            files: 1,
            files_eff: 1,
            path: Vec::new(),
            path_idx: 0,
            waiting: false,
            spacing: Vec2::new(1.0, 1.0),
            anchor: Vec2::ZERO,
            facing: 0.0,
            frame_speed: 0.0,
            cruise: 0.0,
            brace_ramp: 0.0,
            move_target: Some(Vec2::new(0.0, 100.0)),
            pending_target: None,
            pending_mode: crate::unit::OrderMode::Move,
            pending_timer: 0.0,
            pending_total: 0.0,
            pace: Pace::Walk,
            fatigue: 1.0,
            training: 0.5,
            team: 0,
            home_dir_y: -1.0,
            disorder: 1.0,
            cohesion: 0.1,
            pivoting: false,
            mode: crate::unit::OrderMode::Move,
            stance: crate::unit::Stance::Othismos,
            charge_enabled: false,
            charging: false,
            fear_adapt: 0.0,
            charge_time: 0.0,
            charge_at_speed: false,
            drain_mult: 1.0,
            resume_target: None,
            alive_count: 0,
            deaths_since_reform: 0,
            engaged: 0,
            contact_hist: [0.0; 12],
            contact_unit: 0,
            quiet_ticks: 0,
            recent_casualties: 0.0,
            ammo: 0,
            fire_at_will: true,
            evade_auto: false,
            morale: 1.0,
            morale_ceiling: 1.0,
            routing: false,
            recent_missiles: 0.0,
            losing_push: 0.0,
            centroid: Vec2::ZERO,
            at_ease: false,
            counter_press: 0.0,
            mass_advance: 0.0,
            final_facing: None,
            reform_timer: 0.0,
            pursue: false,
            threat_bearing: None,
            threat_unit: None,
            latch_best: f32::INFINITY,
            latch_cd: 0.0,
            weapon_pref: 0,
            switch_timer: 0.0,
            pending_pref: 0,
            order_queue: Vec::new(),
        };
        let mut ordered = Unit {
            disorder: 0.0,
            cohesion: 1.0,
            move_target: Some(Vec2::new(0.0, 100.0)),
            path: Vec::new(),
            order_queue: Vec::new(),
            ..disordered
        };
        for _ in 0..15 {
            update_unit_motion(&tun, &mut disordered, DT, 1.0);
            update_unit_motion(&tun, &mut ordered, DT, 1.0);
        }
        assert!(
            ordered.facing > disordered.facing * 2.0,
            "high cohesion should turn much faster: {} vs {}",
            ordered.facing,
            disordered.facing
        );
    }
}
