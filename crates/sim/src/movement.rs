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

/// The unit's ordered pace, degraded by fatigue (a spent unit "runs" at a walk).
pub(crate) fn pace_speed(tun: &Tunables, u: &Unit) -> f32 {
    let base = match u.pace {
        Pace::Walk => tun.base_speed,
        Pace::Run => {
            tun.base_speed + (tun.run_speed - tun.base_speed) * fatigue_capacity(u.fatigue)
        }
    };
    base * u.speed_mult
}

/// Catch-up sprint for out-of-position soldiers. Drilled troops surge harder;
/// tired units sag toward walking pace, so they re-form (and wheel) slower.
pub(crate) fn soldier_surge_speed(tun: &Tunables, u: &Unit) -> f32 {
    let drill = 0.85 + 0.3 * u.training;
    (tun.base_speed + (tun.surge_speed - tun.base_speed) * fatigue_capacity(u.fatigue) * drill)
        * u.speed_mult
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

    match u.move_target {
        Some(t) => {
            let to = t - u.anchor;
            let dist = to.len();
            if dist < tun.arrive_radius {
                u.move_target = None;
                u.pivoting = false;
                u.speed = move_toward(u.speed, 0.0, accel * 2.0 * dt);
                return;
            }
            let desired = to.y.atan2(to.x);
            let err = wrap_angle(desired - u.facing);

            // Hysteresis: a big heading change enters the pivot; the unit
            // stays in it until nearly aligned, then marches out.
            if err.abs() > tun.pivot_facing_err {
                u.pivoting = true;
            } else if err.abs() < tun.pivot_exit_err {
                u.pivoting = false;
            }

            if u.pivoting {
                // Halt, then rotate the whole formation about its center
                // while ranks re-form (drilled about-face), instead of
                // dragging the block through an arc like cloth.
                u.speed = move_toward(u.speed, 0.0, accel * 2.0 * dt);
                if u.speed < 0.05 {
                    let geom = tun.wheel_speed_factor * top / u.pivot_radius().max(1.0);
                    let rate = tun.base_turn_rate.min(geom) * turn_throttle;
                    let center = u.center();
                    u.facing = rotate_toward(u.facing, desired, rate * dt);
                    u.anchor = center + dir(u.facing) * (0.5 * u.depth());
                } else {
                    u.anchor = u.anchor + dir(u.facing) * (u.speed * dt);
                }
            } else {
                // March, arcing toward the target. The rotation budget is the
                // speed the rear corners have left over after marching.
                let spare = (top * top - u.speed * u.speed).max((0.25 * top).powi(2)).sqrt();
                let geom = tun.wheel_speed_factor * spare / u.march_turn_radius().max(1.0);
                let rate = tun.base_turn_rate.min(geom) * turn_throttle;
                u.facing = rotate_toward(u.facing, desired, rate * dt);
                let target_speed = (pace_speed(tun, u) * ground).min((2.0 * accel * dist).sqrt());
                u.speed = move_toward(u.speed, target_speed, accel * dt);
                u.anchor = u.anchor + dir(u.facing) * (u.speed * dt);
            }
        }
        None => {
            u.pivoting = false;
            u.speed = move_toward(u.speed, 0.0, accel * 2.0 * dt);
            if u.speed > 0.0 {
                u.anchor = u.anchor + dir(u.facing) * (u.speed * dt);
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
            class: crate::class::UnitClassId::LightInfantry,
            speed_mult: 1.0,
            start: 0,
            count: 0,
            files: 1,
            spacing: Vec2::new(1.0, 1.0),
            anchor: Vec2::ZERO,
            facing: 0.0,
            speed: 0.0,
            move_target: Some(Vec2::new(0.0, 100.0)),
            pending_target: None,
            pending_timer: 0.0,
            pending_total: 0.0,
            pace: Pace::Walk,
            fatigue: 1.0,
            training: 0.5,
            team: 0,
            disorder: 1.0,
            cohesion: 0.1,
            pivoting: false,
        };
        let mut ordered = Unit {
            disorder: 0.0,
            cohesion: 1.0,
            move_target: Some(Vec2::new(0.0, 100.0)),
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
