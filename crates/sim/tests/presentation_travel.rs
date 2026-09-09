//! Read-only movement observation, not a new physical movement law.
use sim::{Sim, Tunables, UnitClassId, Vec2, DT};

fn overlap() -> Sim {
    let mut sim = Sim::new(
        Tunables {
            morale_enabled: false,
            micro_rough: 0.0,
            ..Tunables::default()
        },
        0x5150,
    );
    sim.spawn_class(Vec2::ZERO, 0.0, 1, UnitClassId::HeavySword, 0);
    sim.spawn_class(Vec2::new(0.2, 0.0), 0.0, 1, UnitClassId::HeavySword, 0);
    sim.health.fill(1.0e9);
    sim
}

#[test]
fn qualified_travel_excludes_expiring_stun_but_counts_recovery_in_the_same_batch() {
    let mut sim = overlap();
    sim.stun[0] = DT * 0.5;
    let start = sim.positions[..2].to_vec();
    sim.tick();
    assert!(sim.stun[0] <= 0.0);
    assert_ne!(
        &sim.positions[..2],
        &start,
        "disabled body must actually be displaced by overlap"
    );
    assert_eq!(
        sim.motor_travel[0], [0.0; 3],
        "timer expiry must not relabel disabled transport"
    );
    let recovered_start = [sim.positions[0] as f64, sim.positions[1] as f64];
    sim.tick();
    let dx = sim.positions[0] as f64 - recovered_start[0];
    let dy = sim.positions[1] as f64 - recovered_start[1];
    assert!(dx.hypot(dy) > 0.0, "enabled recovery must actually move");
    assert_eq!(sim.motor_travel[0], [dx, dy, dx.hypot(dy)]);
}

#[test]
fn conscious_pressure_recovery_counts_final_solver_motion_not_drive() {
    let mut sim = overlap();
    let start = sim.positions.clone();
    sim.tick();
    let dx = sim.positions[0] as f64 - start[0] as f64;
    let dy = sim.positions[1] as f64 - start[1] as f64;
    assert!(
        dx < 0.0 && dy != 0.0,
        "overlap must produce constrained recovery: {dx},{dy}"
    );
    assert_eq!(sim.motor_travel[0], [dx, dy, dx.hypot(dy)]);
    let mut free = overlap();
    free.positions[2] = 20.0;
    free.units[1].anchor.x = 20.0;
    free.units[1].centroid.x = 20.0;
    free.tick();
    assert!(
        free.motor_travel[0][2] < dx.hypot(dy),
        "no-overlap control must remove the recovery"
    );
}

#[test]
fn routing_counts_but_disabled_cavalry_momentum_and_dead_bodies_do_not() {
    let mut sim = Sim::new(
        Tunables {
            morale_enabled: false,
            micro_rough: 0.0,
            ..Tunables::default()
        },
        0x5150,
    );
    sim.spawn_class(Vec2::ZERO, 0.0, 1, UnitClassId::ShockCavalry, 0);
    sim.stun[0] = DT * 0.5;
    sim.mom_x[0] = sim.mass[0] * 3.0;
    sim.tick();
    assert!(sim.positions[0] > 0.0, "disabled horse must coast");
    assert!(sim.stun[0] <= 0.0);
    assert_eq!(sim.motor_travel[0], [0.0; 3]);
    sim.units[0].routing = true;
    let start = sim.positions.clone();
    sim.tick();
    let dx = sim.positions[0] as f64 - start[0] as f64;
    let dy = sim.positions[1] as f64 - start[1] as f64;
    assert!(dy.abs() > 0.0);
    assert_eq!(sim.motor_travel[0], [dx, dy, dx.hypot(dy)]);
    let before_death = sim.motor_travel[0];
    sim.alive[0] = 0;
    sim.tick();
    assert_eq!(
        sim.motor_travel[0], before_death,
        "no stale eligibility after death"
    );
}

#[test]
fn reversing_tick_paths_accumulate_without_net_cancellation_and_survive_growth() {
    let mut sim = overlap();
    sim.units[0].routing = true;
    // Isolate one body's route, avoiding overlap correction in the direction control.
    sim.positions[2] = 20.0;
    sim.units[1].anchor.x = 20.0;
    sim.units[1].centroid.x = 20.0;
    let mut expected = [0.0; 3];
    for direction in [-1.0, 1.0, -1.0, 1.0] {
        sim.units[0].home_dir_y = direction;
        let start = sim.positions.clone();
        sim.tick();
        let dx = sim.positions[0] as f64 - start[0] as f64;
        let dy = sim.positions[1] as f64 - start[1] as f64;
        expected[0] += dx;
        expected[1] += dy;
        expected[2] += dx.hypot(dy);
        assert_eq!(sim.motor_travel[0], expected);
    }
    assert!(
        expected[2] > expected[0].hypot(expected[1]),
        "path must retain reversed travel"
    );
    sim.spawn_class(Vec2::new(40.0, 0.0), 0.0, 1, UnitClassId::HeavySword, 0);
    assert_eq!(sim.motor_travel[0], expected);
    assert_eq!(sim.motor_travel[2], [0.0; 3]);
    sim.tick();
    assert!(sim.motor_travel[0][2] > expected[2]);
}

#[test]
fn long_lived_counters_retain_small_enabled_steps() {
    let mut sim = overlap();
    sim.motor_travel[0] = [1.0e9, -1.0e9, 1.0e9];
    let start = sim.positions.clone();
    sim.tick();
    let dx = sim.positions[0] as f64 - start[0] as f64;
    let dy = sim.positions[1] as f64 - start[1] as f64;
    assert_eq!(
        sim.motor_travel[0],
        [1.0e9 + dx, -1.0e9 + dy, 1.0e9 + dx.hypot(dy)]
    );
    assert!(
        sim.motor_travel[0][2] > 1.0e9,
        "f32 accumulation would lose this step"
    );
}
