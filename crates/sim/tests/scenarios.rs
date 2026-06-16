//! Behavioral scenario tests against the public API. Each test asserts an
//! emergent property the design promises — if the emergence breaks, so does
//! the test.

use sim::{Pace, Sim, Tunables, Vec2, DT};
use std::f32::consts::PI;

const SEED: u64 = 42;

fn run(sim: &mut Sim, seconds: f32) {
    let ticks = (seconds / DT) as usize;
    for _ in 0..ticks {
        sim.tick();
    }
}

fn test_unit(sim: &mut Sim) -> usize {
    sim.spawn_unit(Vec2::ZERO, 0.0, 200, 20, Vec2::new(1.0, 1.2), 0, 0.7)
}

fn mean_slot_error(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    (u.start..u.start + u.count).map(|i| sim.slot_error(i)).sum::<f32>() / u.count as f32
}

#[test]
fn spawns_in_perfect_formation() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = test_unit(&mut sim);
    assert!(mean_slot_error(&sim, u) < 1e-4);
    assert_eq!(sim.soldier_count(), 200);
}

#[test]
fn marches_to_target_and_recovers_cohesion() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = test_unit(&mut sim);
    sim.set_move_order(u, Vec2::new(60.0, 0.0));
    run(&mut sim, 60.0);
    let unit = &sim.units[u];
    assert!(unit.move_target.is_none(), "order should have completed");
    assert!(
        (unit.anchor - Vec2::new(60.0, 0.0)).len() < 3.0,
        "anchor should be near target, got {:?}",
        unit.anchor
    );
    assert!(mean_slot_error(&sim, u) < 0.5, "soldiers should be seated");
    assert!(unit.cohesion > 0.85, "cohesion should recover after halt");
}

#[test]
fn large_turns_pivot_in_place_without_smearing() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = test_unit(&mut sim);
    sim.set_move_order(u, Vec2::new(40.0, 0.0));
    run(&mut sim, 10.0);
    sim.set_move_order(u, Vec2::new(-60.0, 0.0));
    run(&mut sim, 4.0);
    assert!(sim.units[u].pivoting, "should pivot for a 180");
    assert!(
        sim.units[u].frame_speed < 0.2,
        "should halt to pivot, speed {}",
        sim.units[u].frame_speed
    );
    run(&mut sim, 8.0);
    let mid = mean_slot_error(&sim, u);
    assert!(mid < 3.0, "pivot should keep ranks formed, mean err {mid}");
    run(&mut sim, 80.0);
    let unit = &sim.units[u];
    assert!(unit.move_target.is_none(), "order should complete");
    assert!((unit.anchor - Vec2::new(-60.0, 0.0)).len() < 3.0);
    assert!(
        unit.cohesion > 0.85,
        "cohesion should recover, got {}",
        unit.cohesion
    );
}

#[test]
fn friendly_units_passing_through_push_apart_and_lose_cohesion() {
    // Relief-in-place: two FRIENDLY units cross through each other. (Enemy
    // units stopped interpenetrating when melee landed: they halt and fight.)
    let mut sim = Sim::new(Tunables::default(), SEED);
    let a = sim.spawn_unit(Vec2::new(-15.0, 0.0), 0.0, 100, 10, Vec2::new(1.0, 1.2), 0, 0.7);
    let b = sim.spawn_unit(Vec2::new(15.0, 0.0), PI, 100, 10, Vec2::new(1.0, 1.2), 0, 0.7);
    sim.set_move_order(a, Vec2::new(40.0, 0.0));
    sim.set_move_order(b, Vec2::new(-40.0, 0.0));
    let mut min_cohesion = 1.0f32;
    for _ in 0..(90.0 / DT) as usize {
        sim.tick();
        min_cohesion = min_cohesion.min(sim.units[a].cohesion);
    }
    assert!(
        (sim.units[a].anchor - Vec2::new(40.0, 0.0)).len() < 3.0,
        "unit a should push through, anchor {:?}",
        sim.units[a].anchor
    );
    assert!(mean_slot_error(&sim, a) < 1.0, "unit a should re-form after crossing");
    assert!(
        min_cohesion < 0.9,
        "crossing a unit should cost cohesion, min was {min_cohesion}"
    );
    let n = sim.soldier_count();
    let mut min_d = f32::MAX;
    for i in 0..n {
        for j in (i + 1)..n {
            min_d = min_d.min((sim.soldier_pos(i) - sim.soldier_pos(j)).len());
        }
    }
    assert!(min_d > 0.4, "soldiers should not stack, min distance {min_d}");
}

#[test]
fn running_drains_fatigue_and_tired_units_slow_down() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = test_unit(&mut sim);
    sim.set_pace(u, Pace::Run);
    sim.set_move_order(u, Vec2::new(500.0, 0.0));
    run(&mut sim, 20.0);
    let fresh_speed = sim.units[u].frame_speed;
    assert!(fresh_speed > 3.0, "fresh unit should run fast, got {fresh_speed}");
    run(&mut sim, 70.0);
    let tired = &sim.units[u];
    assert!(
        tired.fatigue < 0.4,
        "90s of running should drain heavily, got {}",
        tired.fatigue
    );
    assert!(
        tired.frame_speed < fresh_speed * 0.8,
        "spent unit should sag toward a walk: {} vs fresh {fresh_speed}",
        tired.frame_speed
    );
}

#[test]
fn re_forming_is_free_running_drains_and_rest_recovers() {
    // Surging is a CORRECTION the controller orders, not a pace anyone
    // chose — so re-seating a scattered unit costs nothing. The chosen
    // exertions (a run) are what drain, and rest gives it back.
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = test_unit(&mut sim);
    {
        let (start, count) = (sim.units[u].start, sim.units[u].count);
        for s in 0..count {
            let i = start + s;
            sim.positions[2 * i] += ((s % 9) as f32 - 4.0) * 3.0;
            sim.positions[2 * i + 1] += ((s % 7) as f32 - 3.0) * 3.5;
        }
    }
    run(&mut sim, 6.0); // the catch-up sprint fires and re-seats
    let after_reform = sim.units[u].fatigue;
    assert!(
        after_reform > 0.99,
        "re-forming is stamina-free (the surge is a correction): {after_reform}"
    );
    sim.set_pace(u, sim::Pace::Run);
    sim.set_move_order(u, Vec2::new(0.0, 120.0));
    run(&mut sim, 30.0);
    let ran = sim.units[u].fatigue;
    assert!(ran < 0.8, "a chosen run drains: {ran}");
    sim.units[u].move_target = None;
    run(&mut sim, 120.0);
    let rested = sim.units[u].fatigue;
    assert!(
        rested > (ran + 0.2).min(0.995),
        "rest should recover fatigue: {rested} after {ran}"
    );
}

#[test]
fn deterministic_given_same_orders() {
    let build = || {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let u = test_unit(&mut sim);
        sim.set_move_order(u, Vec2::new(35.0, -20.0));
        run(&mut sim, 30.0);
        sim
    };
    let a = build();
    let b = build();
    assert_eq!(a.positions, b.positions);
    assert_eq!(a.facings, b.facings);
}

#[test]
fn running_disorganizes_walking_does_not() {
    // The same leg-speed spread, two paces: the walking line stays dressed,
    // the running one frays the longer it runs. Smooth field (micro_rough off)
    // so PACE is the only variable — micro-terrain stumbles disturb a march
    // independent of pace and are tested separately (terrain_micro). With the
    // weave cohesion, a walk below every man's top speed holds perfect dressing
    // (~1.0); a run above the slowest fifth's top frays from the spread alone.
    let cohesion_after = |run: bool| -> f32 {
        let mut sim = Sim::new(Tunables { micro_rough: 0.0, ..Tunables::default() }, 4711);
        let u = sim.spawn_unit(Vec2::ZERO, 0.0, 400, 40, Vec2::new(1.0, 1.2), 0, 0.7);
        if run {
            sim.set_pace(u, Pace::Run);
        }
        sim.set_move_order(u, Vec2::new(420.0, 0.0));
        // Measure mid-march at the same DISTANCE covered, not the same time.
        while sim.units[u].anchor.x < 170.0 { // mid-run, before fatigue ends it
            sim.tick();
        }
        sim.units[u].cohesion
    };
    let walking = cohesion_after(false);
    let running = cohesion_after(true);
    assert!(
        walking > 0.85,
        "a walking column holds its dressing: cohesion {walking:.2}"
    );
    assert!(
        running < walking - 0.12,
        "a long run frays the formation: running {running:.2} vs walking {walking:.2}"
    );
}
