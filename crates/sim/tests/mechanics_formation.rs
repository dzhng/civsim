//! FORMATION slot-map mechanics.
//!
//! These tests read the live `soldier_slot` map through `Sim::tick`: casualty
//! closing while fighting/advancing is column-fixed, and lateral re-evening is a
//! separate clear-beat/reform behavior.

mod common;

use common::{block, no_morale_parade, run};
use sim::{Pace, Sim, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 7;
const CLEAR_BEAT_TICKS: usize = 30;

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

fn rear_lane_lateral_excursion(
    sim: &Sim,
    unit: usize,
    before_slots: &[u32],
    before_positions: &[f32],
    before_anchor: Vec2,
    min_rank: usize,
) -> (f32, f32, usize) {
    let u = &sim.units[unit];
    let files = u.files_eff.max(1);
    let f = sim::dir(u.facing);
    let r = Vec2::new(f.y, -f.x);
    let before_frame_lat = before_anchor.dot(r);
    let frame_lat = u.anchor.dot(r);
    let mut excursions = Vec::new();

    for i in unit_range(sim, unit) {
        if sim.alive[i] == 0 {
            continue;
        }
        let old_slot = before_slots[i] as usize;
        if old_slot / files < min_rank {
            continue;
        }
        let p0 = Vec2::new(before_positions[2 * i], before_positions[2 * i + 1]);
        let p1 = sim.soldier_pos(i);
        let before_lane = p0.dot(r) - before_frame_lat;
        let lane = p1.dot(r) - frame_lat;
        excursions.push((lane - before_lane).abs());
    }

    excursions.sort_by(|a, b| a.total_cmp(b));
    assert!(
        !excursions.is_empty(),
        "expected living rear-rank soldiers for no-crab measurement"
    );
    let p95 = excursions[((excursions.len() - 1) as f32 * 0.95).round() as usize];
    let max = *excursions.last().unwrap();
    (p95, max, excursions.len())
}

#[test]
fn advancing_casualties_close_forward_within_the_same_file() {
    let files = 5;
    let killed_file = 1;
    let killed_rank = 2;
    let (mut sim, unit) = block(no_morale_parade(), SEED, files, 5, 1.0, 1.0, 0);
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
    let (mut sim, unit) = block(no_morale_parade(), SEED, files, ranks, 1.0, 1.0, 0);
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
fn rear_ranks_do_not_crab_sideways_while_engaged_casualties_close() {
    let files = 7;
    let ranks = 7;
    let killed_file = 3;
    let (mut sim, unit) = block(no_morale_parade(), SEED, files, ranks, 1.0, 1.0, 0);
    let before_slots = sim.soldier_slot.clone();
    let before_positions = sim.positions.clone();
    let before_anchor = sim.units[unit].anchor;

    kill_slot(&mut sim, unit, killed_file);
    kill_slot(&mut sim, unit, files + killed_file);

    let mut max_p95: f32 = 0.0;
    let mut max_peak: f32 = 0.0;
    let mut measured = 0usize;
    for _ in 0..(1.0 / DT) as usize {
        // This is a scripted contact fixture: keep the unit in the engaged
        // casualty-closing path without introducing enemy-push noise. Any
        // sideways motion here is the relabel crab this spec exists to prevent.
        sim.units[unit].engaged = 2;
        sim.tick();
        let (p95, peak, n) = rear_lane_lateral_excursion(
            &sim,
            unit,
            &before_slots,
            &before_positions,
            before_anchor,
            2,
        );
        max_p95 = max_p95.max(p95);
        max_peak = max_peak.max(peak);
        measured = n;
    }

    eprintln!("NO-CRAB rear lane excursion n={measured} p95={max_p95:.3}m peak={max_peak:.3}m");
    // The anti-crab contract is about preventing file-wide sideways relabels
    // (~1m), not forbidding the small spring settle after the front-rank notch.
    assert!(
        max_p95 < 0.45 && max_peak < 0.55,
        "rear ranks crabbed sideways while engaged casualties closed: p95 {max_p95:.3}m peak {max_peak:.3}m; a file relabel is ~1.0m"
    );
}

#[test]
fn adjacent_wiped_files_get_bounded_rear_donors() {
    let files = 6;
    let ranks = 6;
    let (mut sim, unit) = block(no_morale_parade(), SEED, files, ranks, 1.0, 1.0, 0);
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

#[test]
fn dragged_frontage_anchors_left_edge_and_changes_width() {
    let (mut sim, u) = block(no_morale_parade(), SEED, 12, 10, 0.9, 1.0, 0);
    let start = Vec2::new(40.0, 60.0);
    for width in [12.0, 24.0] {
        let end = start + Vec2::new(width, 0.0);
        let preview = sim.formation_line(&[u], start, end);
        let p = &preview[0];
        let span = (p.files - 1) as f32 * sim.units[u].spacing.x;
        assert!((p.target.x - span / 2.0 - start.x).abs() < 0.001);
        assert!((p.target.y - start.y).abs() < 0.001);
        assert!(span <= width + 0.001 && span > width - sim.units[u].spacing.x - 0.001);
        assert!((p.facing - FRAC_PI_2).abs() < 0.001);
        sim.order_formation_line(&[u], start, end, false);
        assert_eq!(sim.units[u].files, p.files);
        assert_eq!(sim.units[u].final_facing, Some(p.facing));
        assert_eq!(
            sim.units[u].pending_target.or(sim.units[u].move_target),
            Some(p.target)
        );
    }
}

#[test]
fn queued_frontage_keeps_its_width_until_the_order_executes() {
    let (mut sim, u) = block(no_morale_parade(), SEED, 12, 10, 0.9, 1.0, 0);
    sim.order_formation_line(&[u], Vec2::new(20.0, 0.0), Vec2::new(26.0, 0.0), false);
    let first = sim.units[u]
        .pending_target
        .or(sim.units[u].move_target)
        .unwrap();
    let first_files = sim.units[u].files;
    let start = Vec2::new(40.0, 30.0);
    let end = Vec2::new(67.0, 30.0);
    let preview = sim.formation_line(&[u], start, end);
    sim.order_formation_line(&[u], start, end, true);
    assert_eq!(
        sim.units[u].files, first_files,
        "queued resizing must not reshape the active order"
    );
    for _ in 0..(90.0 / DT) as usize {
        sim.tick();
        if sim.units[u].files == preview[0].files {
            break;
        }
    }
    assert_eq!(sim.units[u].files, preview[0].files);
    assert!(
        sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs() < 0.03,
        "first arrival pivot must complete before the next placement starts"
    );
    assert!(
        (sim.units[u].anchor - first).len() < 3.0,
        "first leg must finish before reshaping"
    );
    assert_eq!(
        sim.units[u].pending_target.or(sim.units[u].move_target),
        Some(preview[0].target)
    );
    for _ in 0..(90.0 / DT) as usize {
        sim.tick();
    }
    assert!((sim.units[u].anchor - preview[0].target).len() < 3.0);
    assert!(
        sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs() < 0.2,
        "facing={} goal={:?} anchor={:?} cohesion={} speed={} target={:?}",
        sim.units[u].facing,
        sim.units[u].final_facing,
        sim.units[u].anchor,
        sim.units[u].cohesion,
        sim.units[u].frame_speed,
        sim.units[u].move_target
    );
}

#[test]
fn group_frontage_preserves_lateral_order_and_reverses_facing_with_the_drag() {
    let (mut sim, left) = block(no_morale_parade(), SEED, 12, 10, 0.9, 1.0, 0);
    let right = sim.spawn_unit(
        Vec2::new(30.0, 0.0),
        FRAC_PI_2,
        120,
        12,
        Vec2::new(0.9, 1.1),
        0,
        1.0,
    );
    for (start, end, first) in [
        (Vec2::new(40.0, 60.0), Vec2::new(95.0, 60.0), left),
        (Vec2::new(95.0, 60.0), Vec2::new(40.0, 60.0), right),
    ] {
        let placements = sim.formation_line(&[right, left], start, end);
        assert_eq!(placements[0].unit, first);
        let direction = (end - start) * (1.0 / (end - start).len());
        let first_width = (placements[0].files - 1) as f32 * 0.9;
        assert!((placements[0].target - direction * (first_width / 2.0) - start).len() < 0.001);
        let last = &placements[1];
        let right_edge = last.target + direction * ((last.files - 1) as f32 * 0.9 / 2.0);
        assert!((right_edge - end).len() < 0.91);
        assert!(sim::dir(last.facing).dot(direction).abs() < 0.001);
        assert!(sim::dir(last.facing).dot(Vec2::new(-direction.y, direction.x)) > 0.999);
        assert!(
            (last.target - placements[0].target).dot(direction)
                > (first_width + (last.files - 1) as f32 * 0.9) / 2.0
        );
    }
}

#[test]
fn damaged_formation_preview_uses_survivors_and_stays_at_its_ordered_width() {
    let (mut sim, u) = block(no_morale_parade(), SEED, 12, 10, 0.9, 1.0, 0);
    for soldier in 6..120 {
        sim.kill(soldier);
    }
    let start = Vec2::new(10.0, 20.0);
    let end = Vec2::new(100.0, 20.0);
    let preview = sim.formation_line(&[u], start, end);
    assert_eq!(
        preview[0].files, 2,
        "six survivors form three ranks, not empty files"
    );
    sim.order_formation_line(&[u], start, end, false);
    for _ in 0..30 {
        sim.tick();
    }
    assert_eq!(sim.units[u].files_eff, preview[0].files);
}

#[test]
fn painted_front_edge_survives_a_large_arrival_turn() {
    let mut tun = no_morale_parade();
    tun.arrive_radius = 1.5;
    let (mut sim, u) = block(tun, SEED, 12, 10, 0.9, 1.0, 0);
    let start = Vec2::new(60.0, 0.0);
    let end = Vec2::new(66.0, 0.0);
    sim.order_formation_line(&[u], start, end, false);
    for _ in 0..(180.0 / DT) as usize {
        sim.tick();
    }
    let front_left = sim.units[u].slot_world(0);
    assert!(
        (front_left - start).len() < 1.6,
        "painted left corner drifted to {front_left:?}"
    );
    assert!(sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs() < 0.01);
}

#[test]
fn mixed_width_units_fit_a_short_frontage_when_a_legal_layout_exists() {
    let (mut sim, a) = block(no_morale_parade(), SEED, 4, 30, 0.9, 1.0, 0);
    let b = sim.spawn_unit(
        Vec2::new(50.0, 0.0),
        FRAC_PI_2,
        120,
        40,
        Vec2::new(0.9, 1.1),
        0,
        1.0,
    );
    let start = Vec2::new(0.0, 40.0);
    let end = Vec2::new(12.0, 40.0);
    let layout = sim.formation_line(&[a, b], start, end);
    let last = &layout[1];
    let edge = last.target.x + (last.files - 1) as f32 * 0.9 / 2.0;
    assert!(
        edge <= end.x + 0.001 && edge > end.x - 0.91,
        "right edge {edge} must fit 12m drag"
    );
}

#[test]
fn impassable_frontage_preview_matches_the_accepted_destination() {
    let (mut sim, u) = block(no_morale_parade(), SEED, 12, 10, 0.9, 1.0, 0);
    sim.terrain = sim::terrain::Terrain::flat(100, 100, 1.0, Vec2::ZERO);
    for y in 40..60 {
        for x in 40..60 {
            sim.terrain.speed[y * 100 + x] = 0.0;
        }
    }
    let start = Vec2::new(40.0, 50.0);
    let end = Vec2::new(52.0, 50.0);
    let preview = sim.formation_line(&[u], start, end);
    sim.order_formation_line(&[u], start, end, false);
    assert_eq!(
        Some(preview[0].target),
        sim.units[u].pending_target.or(sim.units[u].move_target)
    );
    assert!(sim.terrain.speed_at(preview[0].target) > 0.0);
}
