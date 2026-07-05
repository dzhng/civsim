mod common;

use common::settle::{
    assert_settles, block, decimate, march_class_block_to, march_until_arrived, print_window,
    seed1_terrain, seed1_west_wall_edge, window_motion,
};
use common::{no_morale_parade, run};
use sim::{Sim, Terrain, Tunables, Vec2};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 7;

#[test]
fn settle_after_straight_move() {
    let mut sim = Sim::new(no_morale_parade(), SEED);
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    sim.set_move_order(unit, Vec2::new(0.0, 80.0));
    let arrived = march_until_arrived(&mut sim, unit);
    println!("arrived at t={arrived:.1}s");
    assert_settles(&mut sim, unit, 20.0, 60.0);
}

#[test]
fn settle_after_angled_move() {
    let deg: f32 = 40.0;
    let ang = FRAC_PI_2 - deg.to_radians();
    let dest = Vec2::new(ang.cos(), ang.sin()) * 80.0;

    for (facing, label) in [(None, "plain"), (Some(FRAC_PI_2), "face-north")] {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let unit = block(&mut sim);
        run(&mut sim, 5.0);
        match facing {
            Some(f) => sim.set_move_order_facing(unit, dest, f),
            None => sim.set_move_order(unit, dest),
        }
        let arrived = march_until_arrived(&mut sim, unit);
        println!("[{label}] arrived at t={arrived:.1}s");
        assert_settles(&mut sim, unit, 20.0, 60.0);
    }
}

#[test]
fn settle_after_frayed_angled_move() {
    let deg: f32 = 35.0;
    let ang = FRAC_PI_2 - deg.to_radians();
    let dest = Vec2::new(ang.cos(), ang.sin()) * 80.0;
    let mut sim = Sim::new(Tunables::default(), SEED);
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    decimate(&mut sim, unit, 3);
    run(&mut sim, 5.0);
    sim.set_move_order_facing(unit, dest, FRAC_PI_2);
    let arrived = march_until_arrived(&mut sim, unit);
    println!(
        "arrived at t={arrived:.1}s alive={} files_eff={}",
        sim.units[unit].alive_count, sim.units[unit].files_eff
    );
    assert_settles(&mut sim, unit, 20.0, 60.0);
}

#[test]
fn settle_on_rough_patch() {
    let mut terrain = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    terrain.paint_rect(Vec2::new(-40.0, 20.0), Vec2::new(40.0, 120.0), 1.0, 0.45);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = terrain;
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    sim.set_move_order(unit, Vec2::new(0.0, 60.0));
    let arrived = march_until_arrived(&mut sim, unit);
    println!("arrived at t={arrived:.1}s");
    assert_settles(&mut sim, unit, 20.0, 60.0);
}

#[test]
fn settle_after_crossing_rough_strip() {
    let mut terrain = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    terrain.paint_rect(Vec2::new(-40.0, 20.0), Vec2::new(40.0, 50.0), 1.0, 0.45);
    let mut sim = Sim::new(no_morale_parade(), SEED);
    sim.terrain = terrain;
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    sim.set_move_order(unit, Vec2::new(0.0, 80.0));
    let arrived = march_until_arrived(&mut sim, unit);
    println!("arrived at t={arrived:.1}s");
    assert_settles(&mut sim, unit, 20.0, 60.0);
}

#[test]
fn settle_adjacent_group_move() {
    let deg: f32 = 40.0;
    let ang = FRAC_PI_2 - deg.to_radians();
    let step = Vec2::new(ang.cos(), ang.sin()) * 80.0;
    let mut sim = Sim::new(Tunables::default(), SEED);
    let a = block(&mut sim);
    let b = sim.spawn_unit(
        Vec2::new(22.0, 0.0),
        FRAC_PI_2,
        120,
        20,
        Vec2::new(1.0, 1.0),
        0,
        1.0,
    );
    run(&mut sim, 5.0);
    sim.set_move_order_facing(a, step, FRAC_PI_2);
    sim.set_move_order_facing(b, Vec2::new(22.0, 0.0) + step, FRAC_PI_2);
    let arrived_a = march_until_arrived(&mut sim, a);
    let arrived_b = march_until_arrived(&mut sim, b);
    println!("arrived a t={arrived_a:.1}s b(+{arrived_b:.1}s)");
    assert_settles(&mut sim, a, 20.0, 60.0);
    assert_settles(&mut sim, b, 20.0, 60.0);
}

#[test]
fn settle_near_impassable_pocket() {
    // Margins where every ideal slot is on standable ground: the churn here
    // was the wall-split bond/slot tractor (slice 02a). The shallower
    // margins, where the FRAME itself has slots on impassable cells, are a
    // different mechanism and live in the 02b gate below.
    for margin in [14.0, 18.0] {
        let terrain = seed1_terrain();
        let (wall_x, wall_y) = seed1_west_wall_edge(&terrain);
        let mut sim = Sim::new(Tunables::default(), SEED);
        sim.terrain = terrain;
        let unit = march_class_block_to(&mut sim, Vec2::new(wall_x + margin, wall_y));
        println!("margin={margin:.1}");
        assert_settles(&mut sim, unit, 30.0, 60.0);
    }
}

#[ignore = "formation-settle slice 02b"]
#[test]
fn settle_with_frame_slots_in_wall() {
    // Destination so close to the cliff that the frame's own slots land on
    // impassable/slow cells (measured at margin 10: blocked=2 slow=5): the
    // halted-frame escape slide, the corridor width machinery, and the
    // at-ease reform churn episodically instead of converging.
    for margin in [10.0, 12.0] {
        let terrain = seed1_terrain();
        let (wall_x, wall_y) = seed1_west_wall_edge(&terrain);
        let mut sim = Sim::new(Tunables::default(), SEED);
        sim.terrain = terrain;
        let unit = march_class_block_to(&mut sim, Vec2::new(wall_x + margin, wall_y));
        println!("margin={margin:.1}");
        assert_settles(&mut sim, unit, 30.0, 60.0);
    }
}

#[ignore = "formation-settle slice 02b"]
#[test]
fn settle_inside_marginal_corridor() {
    let gap_half = 9.7f32;
    let mut terrain = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    terrain.paint_rect(
        Vec2::new(-60.0, -100.0),
        Vec2::new(-gap_half + 0.6, 100.0),
        0.0,
        0.0,
    );
    terrain.paint_rect(
        Vec2::new(gap_half + 0.6, -100.0),
        Vec2::new(60.0, 100.0),
        0.0,
        0.0,
    );
    let mut sim = Sim::new(
        Tunables {
            micro_rough: 0.0,
            morale_enabled: false,
            ..Tunables::default()
        },
        SEED,
    );
    sim.terrain = terrain;
    let unit = sim.spawn_unit(
        Vec2::new(0.0, -80.0),
        FRAC_PI_2,
        120,
        20,
        Vec2::new(1.0, 1.0),
        0,
        1.0,
    );
    run(&mut sim, 3.0);
    sim.set_move_order(unit, Vec2::new(0.0, 0.0));
    let arrived = march_until_arrived(&mut sim, unit);
    println!(
        "arrived t={arrived:.1}s files_eff={}",
        sim.units[unit].files_eff
    );
    assert_settles(&mut sim, unit, 30.0, 60.0);
}

#[ignore = "formation-settle slice 03"]
#[test]
fn settle_overlapping_friendly() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let unit = block(&mut sim);
    let _friend = sim.spawn_unit(
        Vec2::new(15.0, 80.0),
        FRAC_PI_2,
        120,
        20,
        Vec2::new(1.0, 1.0),
        0,
        1.0,
    );
    run(&mut sim, 5.0);
    sim.set_move_order_facing(unit, Vec2::new(0.0, 80.0), FRAC_PI_2);
    let arrived = march_until_arrived(&mut sim, unit);
    println!("arrived at t={arrived:.1}s");
    assert_settles(&mut sim, unit, 30.0, 60.0);
}

#[test]
fn grind_lateral_slosh_bounded() {
    let mut sim = Sim::new(no_morale_parade(), SEED);
    let a = block(&mut sim);
    let b = sim.spawn_unit(
        Vec2::new(0.0, 30.0),
        -FRAC_PI_2,
        120,
        20,
        Vec2::new(1.0, 1.0),
        1,
        1.0,
    );
    for h in sim.health.iter_mut() {
        *h = 1e9;
    }
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    run(&mut sim, 15.0);

    let mut windows = Vec::new();
    for w in 0..12 {
        let s = window_motion(&mut sim, a, 10.0);
        print_window(&format!("grind {:>3}-{:>3}s", w * 10, (w + 1) * 10), &s);
        windows.push(s);
    }
    let sustained = windows[6..].iter().map(|s| s.mean_lat).sum::<f32>() / 6.0;
    assert!(
        sustained <= 0.7,
        "sustained grind lateral slosh must stay <= 0.7 m/s, got {sustained:.3}"
    );
}
