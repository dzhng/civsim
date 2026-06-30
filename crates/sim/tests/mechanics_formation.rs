//! FORMATION slot-map mechanics.
//!
//! These tests read the live `soldier_slot` map through `Sim::tick`: casualty
//! closing while fighting/advancing is column-fixed, and lateral re-evening is a
//! separate clear-beat/reform behavior.

mod common;

use common::{no_morale_parade, run};
use sim::{Pace, Sim, Vec2};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 7;
const CLEAR_BEAT_TICKS: usize = 30;

fn block(files: usize, ranks: usize) -> (Sim, usize) {
    let mut sim = Sim::new(no_morale_parade(), SEED);
    let unit = sim.spawn_unit(
        Vec2::ZERO,
        FRAC_PI_2,
        files * ranks,
        files,
        Vec2::new(1.0, 1.0),
        0,
        1.0,
    );
    (sim, unit)
}

fn kill_slot(sim: &mut Sim, unit: usize, slot: usize) {
    let u = &sim.units[unit];
    let soldier = (u.start..u.start + u.count)
        .find(|&i| sim.alive[i] == 1 && sim.soldier_slot[i] as usize == slot)
        .expect("slot should have a living soldier");
    sim.kill(soldier);
}

fn kill_file(sim: &mut Sim, unit: usize, file: usize, ranks: usize) {
    let files = sim.units[unit].files_eff.max(1);
    for rank in 0..ranks {
        kill_slot(sim, unit, rank * files + file);
    }
}

fn unit_range(sim: &Sim, unit: usize) -> std::ops::Range<usize> {
    let u = &sim.units[unit];
    u.start..u.start + u.count
}

fn living_slots(sim: &Sim, unit: usize) -> Vec<usize> {
    unit_range(sim, unit)
        .filter(|&i| sim.alive[i] == 1)
        .map(|i| sim.soldier_slot[i] as usize)
        .collect()
}

fn file_occupied(sim: &Sim, unit: usize, file: usize) -> bool {
    let files = sim.units[unit].files_eff.max(1);
    living_slots(sim, unit)
        .into_iter()
        .any(|slot| slot % files == file)
}

fn file_population(sim: &Sim, unit: usize, file: usize) -> usize {
    let files = sim.units[unit].files_eff.max(1);
    living_slots(sim, unit)
        .into_iter()
        .filter(|slot| slot % files == file)
        .count()
}

fn max_lateral_slot_error(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let f = sim::dir(u.facing);
    let r = Vec2::new(f.y, -f.x);
    unit_range(sim, unit)
        .filter(|&i| sim.alive[i] == 1)
        .map(|i| {
            let p = sim.soldier_pos(i);
            let slot = u.slot_world(sim.soldier_slot[i] as usize);
            (p - slot).dot(r).abs()
        })
        .fold(0.0, f32::max)
}

#[test]
fn advancing_casualties_close_forward_within_the_same_file() {
    let files = 5;
    let killed_file = 1;
    let killed_rank = 2;
    let (mut sim, unit) = block(files, 5);
    let before = sim.soldier_slot.clone();
    kill_slot(&mut sim, unit, killed_rank * files + killed_file);
    sim.set_move_order(unit, Vec2::new(0.0, 80.0));

    sim.tick();

    for i in unit_range(&sim, unit) {
        if sim.alive[i] == 0 {
            continue;
        }
        let old = before[i] as usize;
        let new = sim.soldier_slot[i] as usize;
        if old % files != killed_file || old / files < killed_rank {
            assert_eq!(new, old, "men ahead of the hole and other files stay put");
        } else {
            assert_eq!(new % files, killed_file, "soldier {i} changed file");
            assert_eq!(
                new / files,
                old / files - 1,
                "soldier {i} did not step forward exactly one rank"
            );
        }
    }
}

#[test]
fn wiped_file_stays_notched_until_the_clear_beat_reform() {
    let files = 5;
    let ranks = 4;
    let wiped_file = 2;
    let (mut sim, unit) = block(files, ranks);
    let before = sim.soldier_slot.clone();
    kill_file(&mut sim, unit, wiped_file, ranks);
    sim.units[unit].engaged = 2;

    sim.tick();

    assert!(
        !file_occupied(&sim, unit, wiped_file),
        "column closing while engaged must preserve the wiped-file notch"
    );
    for i in unit_range(&sim, unit) {
        if sim.alive[i] == 1 {
            assert_eq!(
                sim.soldier_slot[i] as usize, before[i] as usize,
                "neighbouring files must not close sideways while contact is live"
            );
        }
    }
    assert!(
        sim.units[unit].disengage_reform_pending,
        "contact should arm one lateral re-even after the clear beat"
    );

    for _ in 0..CLEAR_BEAT_TICKS {
        sim.tick();
    }

    assert!(
        file_occupied(&sim, unit, wiped_file),
        "the clear-beat re-form should laterally re-even the frontage"
    );
    assert!(
        !sim.units[unit].disengage_reform_pending,
        "the clear-beat re-form is a one-shot"
    );
}

#[test]
fn adjacent_wiped_files_get_bounded_rear_donors() {
    let files = 6;
    let ranks = 6;
    let (mut sim, unit) = block(files, ranks);
    let before = sim.soldier_slot.clone();
    kill_file(&mut sim, unit, 2, ranks);
    kill_file(&mut sim, unit, 3, ranks);
    sim.units[unit].engaged = 2;

    sim.tick();

    assert_eq!(
        file_population(&sim, unit, 2) + file_population(&sim, unit, 3),
        2,
        "a two-file lane should be seeded by a bounded number of donors"
    );
    let lateral_movers: Vec<_> = unit_range(&sim, unit)
        .filter(|&i| {
            sim.alive[i] == 1 && sim.soldier_slot[i] as usize % files != before[i] as usize % files
        })
        .collect();
    assert_eq!(
        lateral_movers.len(),
        2,
        "only bounded rear donors should change file, not the whole rank"
    );
    for i in lateral_movers {
        assert!(
            before[i] as usize / files >= ranks - 1,
            "donor {i} should come from the rear/deep rank"
        );
    }
}

#[test]
fn live_frontage_reshape_gathers_before_running_off() {
    let mut sim = Sim::new(no_morale_parade(), SEED);
    let unit = sim.spawn_unit(Vec2::ZERO, FRAC_PI_2, 240, 30, Vec2::new(0.9, 1.1), 0, 1.0);

    sim.set_files(unit, 8);
    sim.set_pace(unit, Pace::Run);
    sim.set_move_order(unit, Vec2::new(0.0, 120.0));
    run(&mut sim, 12.0);

    let max_lat_err = max_lateral_slot_error(&sim, unit);
    assert!(
        max_lat_err < 2.0,
        "a live width change should gather around its new slots before running off; max lateral slot error {max_lat_err:.1}m"
    );
}
