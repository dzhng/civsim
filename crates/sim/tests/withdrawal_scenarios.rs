//! Fighting-withdrawal mechanics: foot units maneuvering near an enemy keep
//! their face to the threat; only the Withdraw order turns backs; cavalry
//! wheels and breaks off like cavalry.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 31337;

fn no_morale() -> Tunables {
    Tunables {
        morale_enabled: false,
        ..Tunables::default()
    }
}

#[test]
fn foot_units_back_pedal_facing_the_threat() {
    let mut sim = Sim::new(no_morale(), SEED);
    // Heavy line faces an enemy 25m north; ordered to fall back 40m south.
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let _foe = sim.spawn_class(Vec2::new(0.0, 25.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    sim.set_move_order(u, Vec2::new(0.0, -40.0));
    let mut worst_face = 0.0f32;
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
        let foe_dist = (sim.units[1].center() - sim.units[u].center()).len();
        if sim.units[u].speed > 0.3 && foe_dist < 48.0 {
            // While retreating IN THREAT RANGE, the face stays on the enemy.
            // (Beyond it, turning to march is correct.)
            worst_face = worst_face.max(sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs());
        }
    }
    assert!(
        (sim.units[u].anchor - Vec2::new(0.0, -40.0)).len() < 5.0,
        "the fighting withdrawal must arrive, at {:?}",
        sim.units[u].anchor
    );
    assert!(
        worst_face < 0.7,
        "shields stay toward the threat while moving: worst deviation {worst_face:.2} rad"
    );
}

#[test]
fn withdraw_command_turns_and_goes_faster() {
    let time_back = |use_withdraw: bool| -> (f32, f32) {
        let mut sim = Sim::new(no_morale(), SEED);
        let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
        let _foe = sim.spawn_class(Vec2::new(0.0, 25.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
        if use_withdraw {
            sim.set_withdraw_order(u, Vec2::new(0.0, -60.0));
        } else {
            sim.set_move_order(u, Vec2::new(0.0, -60.0));
        }
        let mut t = 0.0;
        let mut worst_face = 0.0f32;
        while (sim.units[u].anchor - Vec2::new(0.0, -60.0)).len() > 5.0 && t < 120.0 {
            sim.tick();
            t += DT;
            if use_withdraw && sim.units[u].speed > 1.0 {
                worst_face = worst_face.max(sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs());
            }
        }
        (t, worst_face)
    };
    let (t_move, _) = time_back(false);
    let (t_withdraw, turn) = time_back(true);
    assert!(
        t_withdraw < t_move - 3.0,
        "turning your back is faster: withdraw {t_withdraw:.0}s vs fighting retreat {t_move:.0}s"
    );
    assert!(
        turn > 1.5,
        "the Withdraw order actually turns the unit around: deviation {turn:.2} rad"
    );
}

#[test]
fn cavalry_breaks_off_by_wheeling_not_reversing() {
    let mut sim = Sim::new(no_morale(), SEED);
    let cav = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 120, UnitClassId::ShockCavalry, 0);
    let _foe = sim.spawn_class(Vec2::new(0.0, 30.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    sim.set_move_order(cav, Vec2::new(0.0, -80.0));
    let mut turned = false;
    for _ in 0..(50.0 / DT) as usize {
        sim.tick();
        let f = sim::wrap_angle(sim.units[cav].facing + FRAC_PI_2).abs();
        if f < 0.4 {
            turned = true; // facing now points the way it is going
        }
    }
    assert!(turned, "horses wheel to break off — no back-pedaling mounts");
    assert!(
        (sim.units[cav].anchor - Vec2::new(0.0, -80.0)).len() < 6.0,
        "and they get there, at {:?}",
        sim.units[cav].anchor
    );
}

#[test]
fn reverse_move_backs_up_holding_facing_at_a_penalty() {
    // No enemy at all: the facing held is the facing the unit started with.
    let mut sim = Sim::new(no_morale(), SEED);
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    sim.set_reverse_move_order(u, Vec2::new(0.0, -40.0));
    let mut t_rev = 0.0;
    let mut worst_face = 0.0f32;
    while (sim.units[u].anchor - Vec2::new(0.0, -40.0)).len() > 3.0 && t_rev < 120.0 {
        sim.tick();
        t_rev += DT;
        worst_face = worst_face.max(sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs());
    }
    assert!(t_rev < 100.0, "the reverse move must arrive");
    assert!(
        worst_face < 0.25,
        "reversing never turns the unit: deviation {worst_face:.2} rad"
    );
    // And it is slower than marching the same leg forward.
    let mut sim2 = Sim::new(no_morale(), SEED);
    let v = sim2.spawn_class(Vec2::new(0.0, 0.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    sim2.set_move_order(v, Vec2::new(0.0, -40.0));
    let mut t_fwd = 0.0;
    while (sim2.units[v].anchor - Vec2::new(0.0, -40.0)).len() > 3.0 && t_fwd < 120.0 {
        sim2.tick();
        t_fwd += DT;
    }
    assert!(
        t_rev > t_fwd * 1.25,
        "back-pedaling costs speed: reverse {t_rev:.0}s vs forward {t_fwd:.0}s"
    );
}

#[test]
fn reverse_move_ignores_run_pace() {
    let mut sim = Sim::new(no_morale(), SEED);
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    sim.set_pace(u, sim::Pace::Run);
    sim.set_reverse_move_order(u, Vec2::new(0.0, -40.0));
    let mut top_speed = 0.0f32;
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
        top_speed = top_speed.max(sim.units[u].speed);
    }
    assert!(
        top_speed < 1.6,
        "you cannot sprint backwards: top speed {top_speed:.2} m/s"
    );
}
