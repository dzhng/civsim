//! Anchor-intelligence tests: route around the big stuff, squeeze through
//! the narrow stuff, queue behind your own traffic — march straight through
//! everything merely slow.

use sim::{Sim, Terrain, Tunables, Vec2, DT};

const SEED: u64 = 77;

fn run(sim: &mut Sim, seconds: f32) {
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
    }
}

fn living_frac_with<F: Fn(Vec2) -> bool>(sim: &Sim, u: usize, pred: F) -> f32 {
    let unit = &sim.units[u];
    let mut hit = 0;
    let mut n = 0;
    for i in unit.start..unit.start + unit.count {
        if sim.alive[i] == 1 {
            n += 1;
            if pred(sim.soldier_pos(i)) {
                hit += 1;
            }
        }
    }
    hit as f32 / n.max(1) as f32
}

#[test]
fn anchor_routes_around_a_rock() {
    let mut t = Terrain::flat(120, 80, 4.0, Vec2::new(-240.0, -160.0));
    t.paint_circle(Vec2::new(0.0, 0.0), 14.0, 0.0, 0.0);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = t;
    let u = sim.spawn_unit(Vec2::new(-60.0, 0.0), 0.0, 200, 20, Vec2::new(1.0, 1.2), 0, 0.7);
    sim.set_move_order(u, Vec2::new(60.0, 0.0));
    let mut min_cohesion = 1.0f32;
    for _ in 0..(120.0 / DT) as usize {
        sim.tick();
        min_cohesion = min_cohesion.min(sim.units[u].cohesion);
        let a = sim.units[u].anchor;
        assert!(
            sim.terrain.speed_at(a) > 0.0,
            "the planned anchor must never stand inside the rock, at {a:?}"
        );
    }
    assert!(
        (sim.units[u].anchor - Vec2::new(60.0, 0.0)).len() < 4.0,
        "unit must arrive around the rock, at {:?}",
        sim.units[u].anchor
    );
    assert!(
        min_cohesion > 0.55,
        "routing around is orderly, not a face-plant: min cohesion {min_cohesion}"
    );
}

#[test]
fn formation_compresses_through_a_corridor_and_recovers() {
    // Walls leaving a 12m gate; a 20-file (19m) formation must squeeze.
    let mut t = Terrain::flat(120, 80, 4.0, Vec2::new(-240.0, -160.0));
    t.paint_rect(Vec2::new(-8.0, 6.0), Vec2::new(8.0, 120.0), 0.0, 0.0);
    t.paint_rect(Vec2::new(-8.0, -120.0), Vec2::new(8.0, -6.0), 0.0, 0.0);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = t;
    let u = sim.spawn_unit(Vec2::new(-60.0, 0.0), 0.0, 200, 20, Vec2::new(1.0, 1.2), 0, 0.7);
    sim.set_move_order(u, Vec2::new(60.0, 0.0));
    let mut min_files = usize::MAX;
    for _ in 0..(140.0 / DT) as usize {
        sim.tick();
        min_files = min_files.min(sim.units[u].files_eff);
    }
    assert!(
        min_files < 14,
        "the frame must compress inside the gate, narrowest {min_files} files"
    );
    assert_eq!(
        sim.units[u].files_eff, 20,
        "the formation reverts on open ground"
    );
    let through = living_frac_with(&sim, u, |p| p.x > 10.0);
    assert!(through > 0.85, "most men must make it through, got {through:.2}");
    assert!(
        sim.units[u].cohesion > 0.75,
        "order recovers after the defile, cohesion {}",
        sim.units[u].cohesion
    );
}

#[test]
fn same_flow_units_queue_at_a_gate() {
    let mut t = Terrain::flat(120, 80, 4.0, Vec2::new(-240.0, -160.0));
    t.paint_rect(Vec2::new(-8.0, 5.0), Vec2::new(8.0, 120.0), 0.0, 0.0);
    t.paint_rect(Vec2::new(-8.0, -120.0), Vec2::new(8.0, -5.0), 0.0, 0.0);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = t;
    let a = sim.spawn_unit(Vec2::new(-45.0, 0.0), 0.0, 160, 16, Vec2::new(1.0, 1.2), 0, 0.7);
    let b = sim.spawn_unit(Vec2::new(-70.0, 0.0), 0.0, 160, 16, Vec2::new(1.0, 1.2), 0, 0.7);
    let c = sim.spawn_unit(Vec2::new(-95.0, 0.0), 0.0, 160, 16, Vec2::new(1.0, 1.2), 0, 0.7);
    for u in [a, b, c] {
        sim.set_move_order(u, Vec2::new(70.0, 0.0));
    }
    let in_gate = |p: Vec2| p.x > -9.0 && p.x < 9.0;
    let mut worst_jam = 0usize;
    for _ in 0..(240.0 / DT) as usize {
        sim.tick();
        if sim.tick_count % 30 == 0 {
            let jam = [a, b, c]
                .iter()
                .filter(|&&u| living_frac_with(&sim, u, in_gate) > 0.35)
                .count();
            worst_jam = worst_jam.max(jam);
        }
    }
    assert!(
        worst_jam <= 2,
        "units must take the gate in column, not all at once: {worst_jam} jammed"
    );
    for u in [a, b, c] {
        let through = living_frac_with(&sim, u, |p| p.x > 9.0);
        assert!(through > 0.8, "unit {u} must eventually cross, got {through:.2}");
    }
}

#[test]
fn opposing_commands_cross_without_coordination() {
    // Two friendly units with opposite orders walk through each other —
    // no yielding, just shoulders (and the cohesion bill).
    let mut sim = Sim::new(Tunables::default(), SEED);
    let east = sim.spawn_unit(Vec2::new(-30.0, 0.0), 0.0, 160, 16, Vec2::new(1.0, 1.2), 0, 0.7);
    let west = sim.spawn_unit(Vec2::new(30.0, 0.0), std::f32::consts::PI, 160, 16, Vec2::new(1.0, 1.2), 0, 0.7);
    sim.set_move_order(east, Vec2::new(50.0, 0.0));
    sim.set_move_order(west, Vec2::new(-50.0, 0.0));
    run(&mut sim, 90.0);
    assert!(
        (sim.units[east].anchor - Vec2::new(50.0, 0.0)).len() < 4.0,
        "east unit must push through, at {:?}",
        sim.units[east].anchor
    );
    assert!(
        (sim.units[west].anchor - Vec2::new(-50.0, 0.0)).len() < 4.0,
        "west unit must push through, at {:?}",
        sim.units[west].anchor
    );
}
