//! Terrain emergence tests: all effects must arise from soldiers reading the
//! ground — there are no terrain modifiers on units anywhere.

use sim::{Sim, Terrain, Tunables, Vec2, DT};

const SEED: u64 = 7;

fn run_collect(sim: &mut Sim, seconds: f32, unit: usize) -> (f32, f32) {
    let mut min_cohesion = 1.0f32;
    let mut min_stamina = 1.0f32;
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
        min_cohesion = min_cohesion.min(sim.units[unit].cohesion);
        min_stamina = min_stamina.min(sim.units[unit].stamina);
    }
    (min_cohesion, min_stamina)
}

fn march_unit_over(seed: u64, terrain: Option<Terrain>) -> (f32, f32, Vec2) {
    let mut sim = Sim::new(Tunables::default(), seed);
    if let Some(t) = terrain {
        sim.terrain = t;
    }
    let u = sim.spawn_unit(
        Vec2::new(-60.0, 0.0),
        0.0,
        200,
        20,
        Vec2::new(1.0, 1.2),
        0,
        0.7,
    );
    sim.set_move_order(u, Vec2::new(60.0, 0.0));
    let (coh, fat) = run_collect(&mut sim, 75.0, u);
    (coh, fat, sim.units[u].anchor)
}

fn mud_strip() -> Terrain {
    let mut mud = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    mud.paint_rect(Vec2::new(-20.0, -120.0), Vec2::new(20.0, 120.0), 0.5, 0.35);
    mud
}

/// END cohesion after the march (not the min): a flat march DIPS mid-stride and
/// RE-FORMS, so its minimum equals the mud's — only the FINAL order shows that the
/// mud left the unit lastingly frayed while the flat unit recovered.
fn march_end_cohesion(seed: u64, terrain: Option<Terrain>) -> f32 {
    let mut sim = Sim::new(Tunables::default(), seed);
    if let Some(t) = terrain {
        sim.terrain = t;
    }
    let u = sim.spawn_unit(
        Vec2::new(-60.0, 0.0),
        0.0,
        200,
        20,
        Vec2::new(1.0, 1.2),
        0,
        0.7,
    );
    sim.set_move_order(u, Vec2::new(60.0, 0.0));
    for _ in 0..(75.0 / DT) as usize {
        sim.tick();
    }
    sim.units[u].cohesion
}

#[test]
fn mud_slows_drains_and_disorders_a_march() {
    let (_, fat_flat, end_flat) = march_unit_over(SEED, None);
    let (_, fat_mud, end_mud) = march_unit_over(SEED, Some(mud_strip()));

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
    // The END cohesion is CHAOTIC per seed — a marching unit's order oscillates
    // and the 75s snapshot catches a random phase — so the "mud disorders MORE"
    // claim is the seed AVERAGE of the FINAL order: across seeds the mud crossing
    // ends measurably more frayed than the flat march, which re-forms.
    let seeds = [
        SEED,
        SEED + 1,
        SEED + 2,
        SEED + 3,
        SEED + 4,
        SEED + 5,
        SEED + 6,
        SEED + 7,
    ];
    let n = seeds.len() as f32;
    let coh_flat = seeds
        .iter()
        .map(|&s| march_end_cohesion(s, None))
        .sum::<f32>()
        / n;
    let coh_mud = seeds
        .iter()
        .map(|&s| march_end_cohesion(s, Some(mud_strip())))
        .sum::<f32>()
        / n;
    assert!(
        coh_mud < coh_flat - 0.05,
        "uneven mud must disorder the unit: mean mud {coh_mud:.2} vs flat {coh_flat:.2}"
    );
}

#[test]
fn woods_stagger_a_crossing_formation() {
    let mut woods = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    woods.paint_rect(Vec2::new(-25.0, -120.0), Vec2::new(25.0, 120.0), 0.7, 0.6);
    let (coh_woods, _, _) = march_unit_over(SEED, Some(woods));
    let (coh_flat, _, _) = march_unit_over(SEED, None);
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
    let u = sim.spawn_unit(
        Vec2::new(-50.0, 0.0),
        0.0,
        200,
        20,
        Vec2::new(1.0, 1.2),
        0,
        0.7,
    );
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

/// Park a unit ON an outcrop (ordered straight into it): the frame must creep
/// clear so NO slot rests inside the rock — the geometry/escape half of the old
/// `halted_frame_slides_off_rocks`. This is the nav-escape mechanic (anchor
/// creeps off impassable ground); whether the MEN then re-seat into the cleared
/// frame is the separate cohesion-recovery claim, decoupled below (RED today).
fn halted_on_rock() -> (Sim, usize) {
    let mut t = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    t.paint_circle(Vec2::new(40.0, 0.0), 9.0, 0.0, 0.0);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = t;
    let u = sim.spawn_unit(
        Vec2::new(-40.0, 0.0),
        0.0,
        200,
        20,
        Vec2::new(1.0, 1.2),
        0,
        0.7,
    );
    sim.set_move_order(u, Vec2::new(40.0, 0.0)); // target = the rock
    for _ in 0..(120.0 / DT) as usize {
        sim.tick();
    }
    (sim, u)
}

#[test]
fn halted_frame_slides_every_slot_clear_of_the_rock() {
    let (sim, u) = halted_on_rock();
    let unit = &sim.units[u];
    let bad_slots = (0..unit.alive_count)
        .filter(|&s| sim.terrain.speed_at(unit.slot_world(s)) <= 0.0)
        .count();
    assert_eq!(bad_slots, 0, "no slot may rest inside a wall");
}

/// The cohesion-recovery half: once the frame is achievable (every slot on clear
/// ground — proven by the test above), the MEN must re-seat into it, so a unit
/// parked on a rock recovers order instead of holding permanent false disorder.
/// RED today (cohesion ~0.22): the frame escapes but the men never settle — the
/// residual-disorder bug (task #56), decoupled here so the escape geometry isn't
/// held hostage to the unsolved re-seat.
#[test]
fn halted_frame_recovers_cohesion_once_clear() {
    let (sim, u) = halted_on_rock();
    let unit = &sim.units[u];
    assert!(
        unit.cohesion > 0.8,
        "cohesion must recover once the frame is achievable, got {}",
        unit.cohesion
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
    let u = sim.spawn_unit(
        Vec2::new(-50.0, 0.0),
        0.0,
        200,
        20,
        Vec2::new(1.0, 1.2),
        0,
        0.7,
    );
    sim.set_move_order(u, Vec2::new(60.0, 0.0));
    let (min_cohesion, _) = run_collect(&mut sim, 110.0, u);
    assert!(
        min_cohesion < 0.68, // chaos-marginal hair (0.649-0.651 across builds)
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
