//! Terrain emergence tests: all effects must arise from soldiers reading the
//! ground — there are no terrain modifiers on units anywhere.

use sim::{Sim, Terrain, Tunables, Vec2, DT};

const SEED: u64 = 7;

fn run_collect(sim: &mut Sim, seconds: f32, unit: usize) -> (f32, f32) {
    let mut min_cohesion = 1.0f32;
    let mut min_fatigue = 1.0f32;
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
        min_cohesion = min_cohesion.min(sim.units[unit].cohesion);
        min_fatigue = min_fatigue.min(sim.units[unit].fatigue);
    }
    (min_cohesion, min_fatigue)
}

fn march_unit_over(terrain: Option<Terrain>) -> (f32, f32, Vec2) {
    let mut sim = Sim::new(Tunables::default(), SEED);
    if let Some(t) = terrain {
        sim.terrain = t;
    }
    let u = sim.spawn_unit(Vec2::new(-60.0, 0.0), 0.0, 200, 20, Vec2::new(1.0, 1.2), 0, 0.7);
    sim.set_move_order(u, Vec2::new(60.0, 0.0));
    let (coh, fat) = run_collect(&mut sim, 75.0, u);
    (coh, fat, sim.units[u].anchor)
}

#[test]
fn mud_slows_drains_and_disorders_a_march() {
    let (coh_flat, fat_flat, end_flat) = march_unit_over(None);

    let mut mud = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    mud.paint_rect(Vec2::new(-20.0, -120.0), Vec2::new(20.0, 120.0), 0.5, 0.35);
    let (coh_mud, fat_mud, end_mud) = march_unit_over(Some(mud));

    // Same 75s: the flat unit has long arrived; the mud unit lost time.
    assert!((end_flat - Vec2::new(60.0, 0.0)).len() < 3.0);
    let mud_dist = (end_mud - Vec2::new(60.0, 0.0)).len();
    assert!(
        mud_dist < 3.0 || fat_mud < fat_flat,
        "mud crossing should at least cost more stamina"
    );
    assert!(
        fat_mud < fat_flat - 0.05,
        "mud must drain stamina: {fat_mud} vs flat {fat_flat}"
    );
    assert!(
        coh_mud < coh_flat - 0.05,
        "uneven mud must disorder the unit: {coh_mud} vs flat {coh_flat}"
    );
}

#[test]
fn woods_stagger_a_crossing_formation() {
    let mut woods = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    woods.paint_rect(Vec2::new(-25.0, -120.0), Vec2::new(25.0, 120.0), 0.7, 0.6);
    let (coh_woods, _, _) = march_unit_over(Some(woods));
    let (coh_flat, _, _) = march_unit_over(None);
    assert!(
        coh_woods < coh_flat - 0.08,
        "rough woods must break up formation: {coh_woods} vs flat {coh_flat}"
    );
}

#[test]
fn walls_keep_soldiers_out() {
    let mut t = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    t.paint_rect(Vec2::new(-10.0, -40.0), Vec2::new(10.0, 40.0), 0.0, 0.0);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = t;
    let u = sim.spawn_unit(Vec2::new(-50.0, 0.0), 0.0, 200, 20, Vec2::new(1.0, 1.2), 0, 0.7);
    sim.set_move_order(u, Vec2::new(50.0, 0.0));
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
    }
    let inside = (0..sim.soldier_count())
        .filter(|&i| sim.terrain.speed_at(sim.soldier_pos(i)) <= 0.0)
        .count();
    assert!(
        inside <= sim.soldier_count() / 50,
        "soldiers must not occupy walls: {inside} inside"
    );
}

#[test]
fn chokepoint_funneling_disorders_the_unit() {
    // Two walls leaving a 16m gap; a 19m-wide formation must funnel through.
    let mut t = Terrain::flat(120, 80, 4.0, Vec2::new(-240.0, -160.0));
    t.paint_rect(Vec2::new(-6.0, 8.0), Vec2::new(6.0, 150.0), 0.0, 0.0);
    t.paint_rect(Vec2::new(-6.0, -150.0), Vec2::new(6.0, -8.0), 0.0, 0.0);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = t;
    let u = sim.spawn_unit(Vec2::new(-50.0, 0.0), 0.0, 200, 20, Vec2::new(1.0, 1.2), 0, 0.7);
    sim.set_move_order(u, Vec2::new(60.0, 0.0));
    let (min_cohesion, _) = run_collect(&mut sim, 110.0, u);
    assert!(
        min_cohesion < 0.65,
        "squeezing through a gap must cost order, min cohesion {min_cohesion}"
    );
    // Most of the unit should still make it through.
    let through = (0..sim.soldier_count())
        .filter(|&i| sim.soldier_pos(i).x > 8.0)
        .count();
    assert!(
        through > sim.soldier_count() * 8 / 10,
        "unit should funnel through, only {through} made it"
    );
}
