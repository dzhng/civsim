//! PROBE (temporary): diagnostic telemetry for the formation-settle churn.
//! The pinned contracts live in `mechanics_settle.rs`; this file keeps the
//! print-only sweeps, the slot/ASCII-map audit, and the force-trace probe
//! that specs/formation-settle slices 02-04 diagnose with. Retired by
//! slice 05 once the families are fixed. Run with --nocapture.

mod common;

use common::settle::{
    block, decimate, march_class_block_to, march_until_arrived, print_window, seed1_terrain,
    seed1_west_wall_edge, window_motion,
};
use common::{no_morale, no_morale_parade, run};
use sim::{Sim, Terrain, Tunables, UnitClassId, Vec2};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 7;

/// Run `windows` 10s telemetry windows, prefixing each line with `label` and
/// the unit's cohesion at print time.
fn print_settle(sim: &mut Sim, unit: usize, label: &str, windows: usize) {
    for w in 0..windows {
        let s = window_motion(sim, unit, 10.0);
        print_window(
            &format!(
                "{label} {:>3}-{:>3}s coh={:.3}",
                w * 10,
                (w + 1) * 10,
                sim.units[unit].cohesion
            ),
            &s,
        );
    }
}

#[test]
fn probe_baseline_no_order() {
    // Known-good check for the detector: a block that was never ordered
    // anywhere should be dead still.
    let mut sim = Sim::new(no_morale_parade(), SEED);
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    print_settle(&mut sim, unit, "baseline", 6);
}

#[test]
fn probe_settle_after_move_order() {
    let mut sim = Sim::new(no_morale_parade(), SEED);
    let unit = block(&mut sim);
    run(&mut sim, 5.0); // let the spawn settle first
    sim.set_move_order(unit, Vec2::new(0.0, 80.0));
    let t = march_until_arrived(&mut sim, unit);
    println!("arrived at t={t:.1}s (move_target cleared)");
    print_settle(&mut sim, unit, "window", 18);
}

#[test]
fn probe_settle_with_micro_rough() {
    // Same march but on default-roughness ground (what the game runs).
    let mut sim = Sim::new(no_morale(), SEED);
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    sim.set_move_order(unit, Vec2::new(0.0, 80.0));
    let t = march_until_arrived(&mut sim, unit);
    println!("arrived at t={t:.1}s");
    print_settle(&mut sim, unit, "rough", 12);
}

#[test]
fn probe_settle_after_move_with_facing() {
    // UI drag orders come with a final facing: arrival includes a pivot.
    // Pivot 90 degrees off the march direction to exercise the reseat.
    let mut sim = Sim::new(no_morale_parade(), SEED);
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    sim.set_move_order_facing(unit, Vec2::new(0.0, 80.0), std::f32::consts::PI);
    let t = march_until_arrived(&mut sim, unit);
    println!("arrived at t={t:.1}s");
    print_settle(&mut sim, unit, "pivot", 12);
}

#[test]
fn probe_settle_after_angled_move() {
    // David's report: the churn hit after a move ~30-40 degrees off the
    // unit's facing (not straight ahead). The angled march wheels the frame
    // while marching; probe the whole angle band, plain move order (no
    // commanded facing), on the parade ground.
    for deg in [20.0f32, 30.0, 40.0, 60.0] {
        let ang = FRAC_PI_2 - deg.to_radians(); // heading rotated off north
        let dest = Vec2::new(ang.cos(), ang.sin()) * 80.0;
        let mut sim = Sim::new(no_morale_parade(), SEED);
        let unit = block(&mut sim);
        run(&mut sim, 5.0);
        sim.set_move_order(unit, dest);
        let t = march_until_arrived(&mut sim, unit);
        println!("[{deg:.0}deg] arrived at t={t:.1}s");
        print_settle(&mut sim, unit, &format!("[{deg:.0}deg]"), 12);
    }
}

#[test]
fn probe_settle_after_angled_move_default_tunables() {
    // The same angled march under the game's default tunables, plus the
    // drag-order variant where the commanded final facing stays the ORIGINAL
    // north facing, so arrival includes an un-wheel pivot.
    for (facing, label) in [(None, "plain"), (Some(FRAC_PI_2), "face-north")] {
        for deg in [30.0f32, 40.0] {
            let ang = FRAC_PI_2 - deg.to_radians();
            let dest = Vec2::new(ang.cos(), ang.sin()) * 80.0;
            let mut sim = Sim::new(Tunables::default(), SEED);
            let unit = block(&mut sim);
            run(&mut sim, 5.0);
            match facing {
                Some(f) => sim.set_move_order_facing(unit, dest, f),
                None => sim.set_move_order(unit, dest),
            }
            let t = march_until_arrived(&mut sim, unit);
            println!("[{label} {deg:.0}deg] arrived at t={t:.1}s");
            print_settle(&mut sim, unit, &format!("[{label} {deg:.0}deg]"), 9);
        }
    }
}

#[test]
fn probe_settle_overlapping_friendly() {
    // Order a unit to a spot whose ideal frame OVERLAPS a standing friendly
    // block: the slots land under the neighbour's bodies — same unreachable-
    // equilibrium shape as the wall pocket, with bodies instead of terrain.
    // Sweep the overlap from grazing to half-deep.
    for overlap in [2.0f32, 5.0, 10.0] {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let unit = block(&mut sim);
        // Standing friendly ahead-right; mover's destination frame intrudes
        // `overlap` meters into its flank.
        let _friend = sim.spawn_unit(
            Vec2::new(20.0 - overlap, 80.0),
            FRAC_PI_2,
            120,
            20,
            Vec2::new(1.0, 1.0),
            0,
            1.0,
        );
        run(&mut sim, 5.0);
        sim.set_move_order_facing(unit, Vec2::new(0.0, 80.0), FRAC_PI_2);
        let t = march_until_arrived(&mut sim, unit);
        println!("[overlap {overlap:.0}] arrived at t={t:.1}s");
        print_settle(&mut sim, unit, &format!("[overlap {overlap:.0}]"), 12);
    }
}

#[test]
fn probe_settle_group_angled_move_adjacent() {
    // The realistic composite: a battle line of two units 2m apart, group-
    // dragged 40 degrees off facing to destinations that keep them adjacent,
    // both with a commanded north facing (the group-drag arrival pivot).
    // A 20m frame wheeling into place sweeps its corners through the
    // neighbour's footprint.
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
    let t = march_until_arrived(&mut sim, a);
    let t2 = march_until_arrived(&mut sim, b);
    println!("arrived a t={t:.1}s b(+{t2:.1}s)");
    // Telemetry follows unit a; b is symmetric (its cohesion rides the label).
    for w in 0..12 {
        let sa = window_motion(&mut sim, a, 10.0);
        print_window(
            &format!(
                "[a] {:>3}-{:>3}s coh={:.3} bcoh={:.3}",
                w * 10,
                (w + 1) * 10,
                sim.units[a].cohesion,
                sim.units[b].cohesion
            ),
            &sa,
        );
    }
}

#[test]
fn probe_settle_frayed_angled_move() {
    // Ragged post-battle unit (uneven casualties) + 35-degree drag move,
    // default tunables: partial ranks re-center during every reform — the
    // shape in David's screenshot.
    let deg: f32 = 35.0;
    let ang = FRAC_PI_2 - deg.to_radians();
    let dest = Vec2::new(ang.cos(), ang.sin()) * 80.0;
    let mut sim = Sim::new(Tunables::default(), SEED);
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    decimate(&mut sim, unit, 3); // ~33% dead, ragged ranks
    run(&mut sim, 5.0);
    sim.set_move_order_facing(unit, dest, FRAC_PI_2);
    let t = march_until_arrived(&mut sim, unit);
    println!(
        "arrived at t={t:.1}s alive={} files_eff={}",
        sim.units[unit].alive_count, sim.units[unit].files_eff
    );
    print_settle(&mut sim, unit, "frayed-angled", 12);
}

#[test]
fn probe_frame_timeline_at_shallow_margin() {
    // Slice 02b instrumentation: film the frame-level state through the
    // margin-10 episodic bursts — anchor, files_eff, cohesion, blocked/slow
    // slot counts, at_ease — one line per second for 180s after arrival.
    // The oscillator hides in which of these moves FIRST at a burst.
    let terrain = seed1_terrain();
    let (wall_x, wall_y) = seed1_west_wall_edge(&terrain);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = terrain;
    let unit = march_class_block_to(&mut sim, Vec2::new(wall_x + 10.0, wall_y));
    let dt_ticks = 30; // 1s
    let mut prev_anchor = sim.units[unit].anchor;
    for s in 0..180 {
        for _ in 0..dt_ticks {
            sim.tick();
        }
        let u = &sim.units[unit];
        let mut blocked = 0;
        let mut slow = 0;
        for slot in 0..u.alive_count {
            let sp = sim.terrain.speed_at(u.slot_world(slot));
            if sp <= 0.0 {
                blocked += 1;
            } else if sp < 0.99 {
                slow += 1;
            }
        }
        let da = (u.anchor - prev_anchor).len();
        println!(
            "t={s:>3}s anchor=({:7.2},{:7.2}) d_anchor={da:5.2} files_eff={:>2} coh={:.3} blocked={blocked} slow={slow} at_ease={} frame_speed={:.3}",
            u.anchor.x, u.anchor.y, u.files_eff, u.cohesion, u.at_ease, u.frame_speed
        );
        prev_anchor = u.anchor;
    }
}

#[test]
fn probe_burst_second_by_second() {
    // 1s-resolution telemetry through the margin-10 burst cycle: slot
    // relabels, per-man motion, and cohesion together — which moves first?
    let terrain = seed1_terrain();
    let (wall_x, wall_y) = seed1_west_wall_edge(&terrain);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = terrain;
    let unit = march_class_block_to(&mut sim, Vec2::new(wall_x + 10.0, wall_y));
    for s in 0..90 {
        let w = window_motion(&mut sim, unit, 1.0);
        let u = &sim.units[unit];
        println!(
            "t={s:>3}s coh={:.3} speed={:.3} slot_changes={:>3} big_movers={:>3} max_exc={:.2}",
            u.cohesion, w.mean_speed, w.slot_changes, w.big_movers, w.max_excursion
        );
    }
}

#[test]
fn probe_settle_on_rough_patch() {
    // Halt ON painted-rough ground (scree-like 0.45, and marsh-like 0.7 with
    // a speed cut): the per-tick stumble stagger keeps re-rolling each man's
    // speed cap — does a standing unit ever go quiet? Runs under the game's
    // DEFAULT tunables (micro_rough jitter + morale on), not parade isolation,
    // so every rough-related channel is live.
    for (speed, rough, label) in [(1.0f32, 0.45f32, "scree"), (0.6, 0.7, "marsh")] {
        let mut t = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
        t.paint_rect(Vec2::new(-40.0, 20.0), Vec2::new(40.0, 120.0), speed, rough);
        let mut sim = Sim::new(Tunables::default(), SEED);
        sim.terrain = t;
        let unit = block(&mut sim);
        run(&mut sim, 5.0);
        sim.set_move_order(unit, Vec2::new(0.0, 60.0)); // deep inside the patch
        let t2 = march_until_arrived(&mut sim, unit);
        println!("[{label}] arrived at t={t2:.1}s");
        print_settle(&mut sim, unit, &format!("[{label}]"), 12);
    }
}

#[test]
fn probe_settle_straddling_rough_edge() {
    // Halt with the front ranks on rough and the rear on clean ground: the
    // staggered caps differ ACROSS the lattice, so the weave is pulled
    // unevenly every tick.
    let mut t = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    t.paint_rect(Vec2::new(-40.0, 78.0), Vec2::new(40.0, 120.0), 1.0, 0.45);
    let mut sim = Sim::new(no_morale_parade(), SEED);
    sim.terrain = t;
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    // 6-rank block, anchor (front) at y=80: ranks straddle the y=78 edge.
    sim.set_move_order(unit, Vec2::new(0.0, 80.0));
    let t2 = march_until_arrived(&mut sim, unit);
    println!("arrived at t={t2:.1}s");
    print_settle(&mut sim, unit, "straddle", 12);
}

#[test]
fn probe_settle_after_crossing_rough_strip() {
    // March THROUGH a rough strip and halt on clean ground beyond: does the
    // disorder acquired in the strip settle once everyone is clear?
    let mut t = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    t.paint_rect(Vec2::new(-40.0, 20.0), Vec2::new(40.0, 50.0), 1.0, 0.45);
    let mut sim = Sim::new(no_morale_parade(), SEED);
    sim.terrain = t;
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    sim.set_move_order(unit, Vec2::new(0.0, 80.0)); // 30m past the strip
    let t2 = march_until_arrived(&mut sim, unit);
    println!("arrived at t={t2:.1}s");
    print_settle(&mut sim, unit, "crossed", 12);
}

#[test]
fn probe_settle_after_move_with_casualties() {
    let mut sim = Sim::new(no_morale_parade(), SEED);
    let unit = block(&mut sim);
    run(&mut sim, 5.0);
    decimate(&mut sim, unit, 4); // ~25% dead, ragged ranks
    run(&mut sim, 5.0);
    sim.set_move_order(unit, Vec2::new(0.0, 80.0));
    let t = march_until_arrived(&mut sim, unit);
    println!(
        "arrived at t={t:.1}s alive={} files_eff={}",
        sim.units[unit].alive_count, sim.units[unit].files_eff
    );
    print_settle(&mut sim, unit, "frayed", 18);
}

#[test]
fn probe_settle_with_enemy_in_sight() {
    // Arrival inside at_ease_range of a standing enemy: the alert branches
    // (threat facing, no at-ease fidget/reform) own the settle now.
    let mut sim = Sim::new(no_morale_parade(), SEED);
    let unit = block(&mut sim);
    let _enemy = sim.spawn_unit(
        Vec2::new(0.0, 120.0),
        -FRAC_PI_2,
        120,
        20,
        Vec2::new(1.0, 1.0),
        1,
        1.0,
    );
    run(&mut sim, 5.0);
    sim.set_move_order(unit, Vec2::new(0.0, 80.0)); // stops 40m from the foe
    let t = march_until_arrived(&mut sim, unit);
    println!("arrived at t={t:.1}s at_ease={}", sim.units[unit].at_ease);
    print_settle(&mut sim, unit, "alert", 12);
}

#[test]
fn probe_settle_on_rock_destination() {
    // The scenario_terrain halted_on_rock shape: order the unit ONTO a rock;
    // the frame creeps clear but do the men ever settle? (task #56 red)
    let mut t = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
    t.paint_circle(Vec2::new(40.0, 0.0), 9.0, 0.0, 0.0);
    let mut sim = Sim::new(
        Tunables {
            micro_rough: 0.0,
            morale_enabled: false,
            ..Tunables::default()
        },
        SEED,
    );
    sim.terrain = t;
    let unit = sim.spawn_unit(
        Vec2::new(-40.0, 0.0),
        0.0,
        200,
        20,
        Vec2::new(1.0, 1.2),
        0,
        0.7,
    );
    sim.set_move_order(unit, Vec2::new(40.0, 0.0));
    run(&mut sim, 60.0); // march + arrival + escape creep
    print_settle(&mut sim, unit, "rock", 12);
}

#[test]
fn probe_settle_halted_inside_marginal_corridor() {
    // Halt a 20-file block inside a gap barely narrower than its frontage:
    // update_corridor's quantized clearance probes + files_eff ramp + full
    // reassign_slots on every width flip = suspected left/right line churn.
    for gap_half in [8.0f32, 9.0, 9.7, 10.3, 11.0] {
        let mut t = Terrain::flat(100, 60, 4.0, Vec2::new(-200.0, -120.0));
        // Walls east and west of a north-running lane, offset 0.6m so the
        // unit never sits perfectly centered.
        t.paint_rect(
            Vec2::new(-60.0, -100.0),
            Vec2::new(-gap_half + 0.6, 100.0),
            0.0,
            0.0,
        );
        t.paint_rect(
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
        sim.terrain = t;
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
        let t2 = march_until_arrived(&mut sim, unit);
        println!(
            "[gap {gap_half:.1}] arrived t={t2:.1}s files_eff={}",
            sim.units[unit].files_eff
        );
        print_settle(&mut sim, unit, &format!("[gap {gap_half:.1}]"), 6);
    }
}

#[test]
fn probe_settle_on_genmap() {
    // The game path: curated generated map, default tunables, real class,
    // drag-style move order — flat interior destinations.
    for (dest, label) in [
        (Vec2::new(0.0, 0.0), "center"),
        (Vec2::new(120.0, 60.0), "east"),
        (Vec2::new(-160.0, -40.0), "west"),
    ] {
        let mut sim = Sim::new(Tunables::default(), SEED);
        sim.terrain = seed1_terrain();
        print!("[{label}] ");
        let unit = march_class_block_to(&mut sim, dest);
        print_settle(&mut sim, unit, &format!("[{label}]"), 9);
    }
}

#[test]
fn probe_settle_against_genmap_cliff() {
    // Halt next to the ragged west cliff of curated seed 1: jittered wall
    // cells put the quantized corridor probes on a knife edge.
    let (wall_x, wall_y) = seed1_west_wall_edge(&seed1_terrain());
    println!("west wall edge at x={wall_x:.1} y={wall_y:.1}");
    for margin in [10.0f32, 12.0, 14.0, 18.0] {
        let mut sim = Sim::new(Tunables::default(), SEED);
        sim.terrain = seed1_terrain();
        print!("[margin {margin:.0}] ");
        let unit = march_class_block_to(&mut sim, Vec2::new(wall_x + margin, wall_y));
        print_settle(&mut sim, unit, &format!("[margin {margin:.0}]"), 12);
        audit_slots(&sim, unit, &format!("[margin {margin:.0}]"));
    }
}

#[test]
fn probe_spawn_in_place_at_cliff_dest() {
    // Same pocket, no march: spawn already formed at the destination.
    // Churn here = the spot itself is an unstable equilibrium; quiet here =
    // the march-in scrum is a second attractor.
    let terrain = seed1_terrain();
    let (wall_x, wall_y) = seed1_west_wall_edge(&terrain);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = terrain;
    let dest = Vec2::new(wall_x + 14.0, wall_y);
    let unit = sim.spawn_class_with_files(dest, FRAC_PI_2, 120, 20, UnitClassId::MediumInfantry, 0);
    print_settle(&mut sim, unit, "inplace", 6);
}

#[test]
fn probe_lateral_motion_during_grind() {
    // The battle-time counterpart of the arrival churn: two identical
    // immortal blocks attack each other; how much of the sustained grind
    // motion is lateral shimmer?
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
    // Immortal: no deaths ending the grind early.
    for h in sim.health.iter_mut() {
        *h = 1e9;
    }
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    run(&mut sim, 15.0); // approach + contact
    for w in 0..12 {
        let s = window_motion(&mut sim, a, 10.0);
        print_window(&format!("grind {:>3}-{:>3}s", w * 10, (w + 1) * 10), &s);
    }
}

#[test]
fn probe_grind_lateral_by_rank() {
    // Slice 04 attribution, step 3: the front trading blows may jostle;
    // rank 5 of a static press should be near-still. If the rear carries
    // front-level lateral speed, the lattice is ringing, not fighting.
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
    run(&mut sim, 75.0); // deep into the sustained grind
                         // 20s of per-rank lateral speed: mean |lat| per rank of unit a.
    let u_start = sim.units[a].start;
    let u_count = sim.units[a].count;
    let files = sim.units[a].files_eff.max(1);
    let ticks = (20.0 / sim::DT) as usize;
    let mut prev: Vec<Vec2> = (u_start..u_start + u_count)
        .map(|i| sim.soldier_pos(i))
        .collect();
    let ranks = u_count.div_ceil(files);
    let mut lat_sum = vec![0.0f64; ranks];
    let mut n_sum = vec![0.0f64; ranks];
    for _ in 0..ticks {
        sim.tick();
        let u = &sim.units[a];
        let f = sim::dir(u.facing);
        let right = Vec2::new(f.y, -f.x);
        for (k, i) in (u_start..u_start + u_count).enumerate() {
            if sim.alive[i] != 1 {
                continue;
            }
            let rank = sim.soldier_slot[i] as usize / files;
            let p = sim.soldier_pos(i);
            let v = Vec2::new(p.x - prev[k].x, p.y - prev[k].y);
            lat_sum[rank] += (v.x * right.x + v.y * right.y).abs() as f64 / sim::DT as f64;
            n_sum[rank] += 1.0;
            prev[k] = p;
        }
    }
    for r in 0..ranks {
        println!(
            "rank {r} (front=0): mean |lat| = {:.3} m/s over {:.0} samples",
            lat_sum[r] / n_sum[r].max(1.0),
            n_sum[r]
        );
    }
}

#[test]
fn probe_deep_reform_churn() {
    // Slice 04 half 2: what does each engaged_deep_reform beat actually
    // find? Logs, per 2s beat window deep in the quieted grind: labels
    // flipped, and the man-slot error distribution JUST BEFORE the beat.
    // High flips + low slot error = a well-seated block being churned by
    // marginal swaps (the degraded-state gate is missing).
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
    run(&mut sim, 75.0);
    let u_start = sim.units[a].start;
    let u_count = sim.units[a].count;
    for beat in 0..15 {
        // Sample man-slot error now.
        let u = &sim.units[a];
        let mut errs: Vec<f32> = (u_start..u_start + u_count)
            .filter(|&i| sim.alive[i] == 1)
            .map(|i| (sim.soldier_pos(i) - u.slot_world(sim.soldier_slot[i] as usize)).len())
            .collect();
        errs.sort_by(f32::total_cmp);
        let before: Vec<u32> = (u_start..u_start + u_count)
            .map(|i| sim.soldier_slot[i])
            .collect();
        run(&mut sim, 2.0); // one deep-reform cadence
        let flips = (u_start..u_start + u_count)
            .filter(|&i| sim.soldier_slot[i] != before[i - u_start])
            .count();
        println!(
            "beat {beat:>2}: flips={flips:>3}  slot_err p50={:.2} p90={:.2} max={:.2}",
            errs[errs.len() / 2],
            errs[errs.len() * 9 / 10],
            errs[errs.len() - 1]
        );
    }
}

#[cfg(feature = "force-trace")]
#[test]
fn probe_trace_grind_lateral_forces() {
    // Slice 04 attribution, step 2: which channels carry the LATERAL
    // component of the sustained grind motion? Projected per record onto
    // the unit's right axis, split front ranks (0-1) vs rear (2+).
    use std::collections::BTreeMap;
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
    run(&mut sim, 75.0);
    sim.clear_force_trace();
    run(&mut sim, 2.0);
    let u = &sim.units[a];
    let files = u.files_eff.max(1);
    let f = sim::dir(u.facing);
    let right = Vec2::new(f.y, -f.x);
    let mut front: BTreeMap<_, f32> = BTreeMap::new();
    let mut rear: BTreeMap<_, f32> = BTreeMap::new();
    for rec in sim.force_trace.records() {
        if rec.soldier < u.start || rec.soldier >= u.start + u.count {
            continue;
        }
        let rank = sim.soldier_slot[rec.soldier] as usize / files;
        let lat = (rec.vec.x * right.x + rec.vec.y * right.y).abs();
        let bucket = if rank <= 1 { &mut front } else { &mut rear };
        *bucket.entry(rec.channel).or_insert(0.0) += lat;
    }
    println!("lateral |component| by channel over 2s (unit a):");
    println!("  FRONT (ranks 0-1):");
    for (ch, mag) in &front {
        println!("    {ch:?}: {mag:8.2}");
    }
    println!("  REAR (ranks 2+):");
    for (ch, mag) in &rear {
        println!("    {ch:?}: {mag:8.2}");
    }
}

/// Slot ground audit + ASCII neighbourhood map: how many ideal slots sit on
/// impassable / slow ground, how far are men from their slots, and where do
/// men ('o'), slots ('S', '@' = both) and walls ('#', '.' = slow) sit around
/// the anchor (1 cell = 2m, 80x36).
fn audit_slots(sim: &Sim, unit: usize, label: &str) {
    let u = &sim.units[unit];
    let mut blocked = 0;
    let mut slow = 0;
    for s in 0..u.alive_count {
        let sp = sim.terrain.speed_at(u.slot_world(s));
        if sp <= 0.0 {
            blocked += 1;
        } else if sp < 0.99 {
            slow += 1;
        }
    }
    let mut dists: Vec<f32> = (u.start..u.start + u.count)
        .filter(|&i| sim.alive[i] == 1)
        .map(|i| {
            let slot = u.slot_world(sim.soldier_slot[i] as usize);
            (sim.soldier_pos(i) - slot).len()
        })
        .collect();
    dists.sort_by(f32::total_cmp);
    println!(
        "{label} slots blocked={blocked} slow={slow} dist_to_slot p50={:.1} p90={:.1} max={:.1}",
        dists[dists.len() / 2],
        dists[dists.len() * 9 / 10],
        dists[dists.len() - 1]
    );
    let anchor = u.anchor;
    let (w, h, cell) = (80i32, 36i32, 2.0f32);
    let mut grid = vec![b' '; (w * h) as usize];
    for gy in 0..h {
        for gx in 0..w {
            let p = Vec2::new(
                anchor.x + (gx - w / 2) as f32 * cell,
                anchor.y + (h / 2 - gy) as f32 * cell,
            );
            let sp = sim.terrain.speed_at(p);
            grid[(gy * w + gx) as usize] = if sp <= 0.0 {
                b'#'
            } else if sp < 0.99 {
                b'.'
            } else {
                b' '
            };
        }
    }
    let mut mark = |p: Vec2, c: u8| {
        let gx = ((p.x - anchor.x) / cell).round() as i32 + w / 2;
        let gy = h / 2 - ((p.y - anchor.y) / cell).round() as i32;
        if (0..w).contains(&gx) && (0..h).contains(&gy) {
            let g = &mut grid[(gy * w + gx) as usize];
            *g = match (*g, c) {
                (b'o', b'S') | (b'S', b'o') => b'@',
                _ => c,
            };
        }
    };
    for s in 0..u.alive_count {
        mark(u.slot_world(s), b'S');
    }
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 1 {
            mark(sim.soldier_pos(i), b'o');
        }
    }
    println!("{label} map (anchor at center):");
    for gy in 0..h {
        let row: String =
            String::from_utf8_lossy(&grid[(gy * w) as usize..((gy + 1) * w) as usize]).into_owned();
        println!("|{row}|");
    }
}

#[cfg(feature = "force-trace")]
#[test]
fn probe_trace_cliff_churn_forces() {
    // Force ledger of the genmap-cliff churn: what carries the milling?
    use std::collections::BTreeMap;
    let terrain = seed1_terrain();
    let (wall_x, wall_y) = seed1_west_wall_edge(&terrain);
    let mut sim = Sim::new(Tunables::default(), SEED);
    sim.terrain = terrain;
    let unit = march_class_block_to(&mut sim, Vec2::new(wall_x + 14.0, wall_y));
    run(&mut sim, 60.0); // deep in the churn
    sim.clear_force_trace();
    run(&mut sim, 2.0); // trace window
                        // Per-channel |vec| sums across the unit for the window.
    let u = &sim.units[unit];
    let mut per_channel: BTreeMap<_, f32> = BTreeMap::new();
    let mut per_channel_net: BTreeMap<_, Vec2> = BTreeMap::new();
    for rec in sim.force_trace.records() {
        if rec.soldier >= u.start && rec.soldier < u.start + u.count {
            *per_channel.entry(rec.channel).or_insert(0.0) += rec.vec.len();
            let e = per_channel_net.entry(rec.channel).or_insert(Vec2::ZERO);
            *e = *e + rec.vec;
        }
    }
    println!("channel |sum| (net) over 2s, 120 men:");
    for (ch, mag) in &per_channel {
        let net = per_channel_net[ch];
        println!("  {ch:?}: {mag:8.2}  net=({:+.2},{:+.2})", net.x, net.y);
    }
    // Worst straggler's ledger summary.
    let worst = (u.start..u.start + u.count)
        .filter(|&i| sim.alive[i] == 1)
        .max_by(|&a, &b| {
            let da = (sim.soldier_pos(a) - u.slot_world(sim.soldier_slot[a] as usize)).len();
            let db = (sim.soldier_pos(b) - u.slot_world(sim.soldier_slot[b] as usize)).len();
            da.total_cmp(&db)
        })
        .unwrap();
    let mut worst_ch: BTreeMap<_, f32> = BTreeMap::new();
    for rec in sim.force_trace.ledger_for_soldier(worst) {
        *worst_ch.entry(rec.channel).or_insert(0.0) += rec.vec.len();
    }
    let d = (sim.soldier_pos(worst) - u.slot_world(sim.soldier_slot[worst] as usize)).len();
    println!("worst straggler {worst} dist={d:.1}:");
    for (ch, mag) in &worst_ch {
        println!("  {ch:?}: {mag:8.2}");
    }

    // Wall-split census: how many men have (a) a straight segment to their
    // SLOT crossing impassable ground, or (b) a slot-adjacent NEIGHBOUR whose
    // bond segment crosses impassable ground? These are the two candidate
    // "unreachable target" populations for the slice-02 fix.
    let blocked_segment = |a: Vec2, b: Vec2| -> bool {
        let d = b - a;
        let len = d.len();
        if len < 1e-3 {
            return false;
        }
        let steps = (len / 1.0).ceil() as usize;
        (1..steps).any(|s| {
            let p = a + d * (s as f32 / steps as f32);
            sim.terrain.speed_at(p) <= 0.0
        })
    };
    let files = u.files_eff.max(1);
    let mut slot_blocked = 0;
    let mut bond_blocked = 0;
    let mut far_and_blocked = 0;
    for i in u.start..u.start + u.count {
        if sim.alive[i] != 1 {
            continue;
        }
        let p = sim.soldier_pos(i);
        let slot = u.slot_world(sim.soldier_slot[i] as usize);
        let sb = blocked_segment(p, slot);
        if sb {
            slot_blocked += 1;
            if (p - slot).len() > 5.0 {
                far_and_blocked += 1;
            }
        }
        let si = sim.soldier_slot[i] as usize;
        let (file, rank) = (si % files, si / files);
        let mut any_bond_blocked = false;
        let mut check_neighbor = |nslot: isize| {
            if nslot < 0 || nslot as usize >= u.count {
                return;
            }
            if let Some(j) = (u.start..u.start + u.count)
                .find(|&j| sim.alive[j] == 1 && sim.soldier_slot[j] as usize == nslot as usize)
            {
                let jp = sim.soldier_pos(j);
                if blocked_segment(p, jp) {
                    any_bond_blocked = true;
                }
            }
        };
        if file > 0 {
            check_neighbor(si as isize - 1);
        }
        if file + 1 < files {
            check_neighbor(si as isize + 1);
        }
        if rank > 0 {
            check_neighbor(si as isize - files as isize);
        }
        check_neighbor(si as isize + files as isize);
        if any_bond_blocked {
            bond_blocked += 1;
        }
        let _ = sb;
    }
    println!(
        "wall-split census: slot_blocked={slot_blocked} (far>{{5m}}={far_and_blocked}) bond_blocked={bond_blocked} of {} alive",
        u.alive_count
    );
}

#[cfg(feature = "force-trace")]
#[test]
fn probe_trace_overlap_buzz_forces() {
    // Slice 03 conviction: the friendly-overlap standing buzz — does the
    // cycle close through the separation solver (BodySeparation* records
    // alternating with SlotPull/WeaveNet), and which men carry it?
    use std::collections::BTreeMap;
    let mut sim = Sim::new(Tunables::default(), SEED);
    let unit = {
        let u = sim.spawn_unit(Vec2::ZERO, FRAC_PI_2, 120, 20, Vec2::new(1.0, 1.0), 0, 1.0);
        u
    };
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
    march_until_arrived(&mut sim, unit);
    run(&mut sim, 30.0); // settled into the buzz
    sim.clear_force_trace();
    run(&mut sim, 2.0);
    for (label, uidx) in [("mover", unit), ("friend", _friend)] {
        let u = &sim.units[uidx];
        let mut per_channel: BTreeMap<_, f32> = BTreeMap::new();
        let mut per_channel_net: BTreeMap<_, Vec2> = BTreeMap::new();
        for rec in sim.force_trace.records() {
            if rec.soldier >= u.start && rec.soldier < u.start + u.count {
                *per_channel.entry(rec.channel).or_insert(0.0) += rec.vec.len();
                let e = per_channel_net.entry(rec.channel).or_insert(Vec2::ZERO);
                *e = *e + rec.vec;
            }
        }
        println!("[{label}] channel |sum| (net) over 2s:");
        for (ch, mag) in &per_channel {
            let net = per_channel_net[ch];
            println!("  {ch:?}: {mag:8.2}  net=({:+.2},{:+.2})", net.x, net.y);
        }
        // How many of the mover's slots sit under the friend's bodies?
        let other = &sim.units[if uidx == unit { _friend } else { unit }];
        let mut overlapped = 0;
        for s in 0..u.alive_count {
            let sw = u.slot_world(s);
            let occupied = (other.start..other.start + other.count).any(|j| {
                sim.alive[j] == 1 && (sim.soldier_pos(j) - sw).len() < sim.radius[j] * 2.0
            });
            if occupied {
                overlapped += 1;
            }
        }
        println!(
            "[{label}] slots under other unit's bodies: {overlapped}/{}",
            u.alive_count
        );
    }
}

#[cfg(feature = "force-trace")]
#[test]
fn probe_trace_corridor_buzz_forces() {
    // Family A': force ledger of the marginal-corridor standing buzz —
    // which channels alternate, and does the cycle close through the
    // separation solver (slice-03 shape) or terrain projection (slice-02)?
    use std::collections::BTreeMap;
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
    march_until_arrived(&mut sim, unit);
    run(&mut sim, 30.0); // settled into the buzz
    sim.clear_force_trace();
    run(&mut sim, 2.0);
    let u = &sim.units[unit];
    let mut per_channel: BTreeMap<_, f32> = BTreeMap::new();
    let mut per_channel_net: BTreeMap<_, Vec2> = BTreeMap::new();
    for rec in sim.force_trace.records() {
        if rec.soldier >= u.start && rec.soldier < u.start + u.count {
            *per_channel.entry(rec.channel).or_insert(0.0) += rec.vec.len();
            let e = per_channel_net.entry(rec.channel).or_insert(Vec2::ZERO);
            *e = *e + rec.vec;
        }
    }
    println!(
        "corridor buzz channel |sum| (net) over 2s, files_eff={}:",
        u.files_eff
    );
    for (ch, mag) in &per_channel {
        let net = per_channel_net[ch];
        println!("  {ch:?}: {mag:8.2}  net=({:+.2},{:+.2})", net.x, net.y);
    }
    // Which men carry it: edge files vs center files mean |record|.
    let files = u.files_eff.max(1);
    let mut edge_sum = 0.0f32;
    let mut edge_n = 0.0f32;
    let mut center_sum = 0.0f32;
    let mut center_n = 0.0f32;
    for rec in sim.force_trace.records() {
        if rec.soldier < u.start || rec.soldier >= u.start + u.count {
            continue;
        }
        let file = sim.soldier_slot[rec.soldier] as usize % files;
        let mag = rec.vec.len();
        if file < 2 || file >= files - 2 {
            edge_sum += mag;
            edge_n += 1.0;
        } else {
            center_sum += mag;
            center_n += 1.0;
        }
    }
    println!(
        "edge-file mean |rec|={:.4} ({} recs)  center mean |rec|={:.4} ({} recs)",
        edge_sum / edge_n.max(1.0),
        edge_n,
        center_sum / center_n.max(1.0),
        center_n
    );
}
