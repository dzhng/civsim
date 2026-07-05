use super::run;
use sim::genmap::MapRecipe;
use sim::{Sim, Terrain, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// ~3x the measured 0.018 m/s idle fidget baseline; loose sanity rail, not a golden value.
pub const SETTLE_SPEED: f32 = 0.06;

pub struct WindowStats {
    pub mean_speed: f32,
    pub mean_lat: f32,
    /// Largest |cumulative lateral drift from window start| any soldier reached.
    pub max_excursion: f32,
    /// Soldiers whose lateral excursion exceeded half a spacing (visible shift).
    pub big_movers: usize,
    /// soldier_slot reassignments observed during the window.
    pub slot_changes: usize,
    /// Unit anchor drift over the window, lateral component only.
    pub anchor_lat: f32,
    /// Unit facing change over the window (radians).
    pub facing_delta: f32,
}

pub fn window_motion(sim: &mut Sim, unit: usize, seconds: f32) -> WindowStats {
    let u = &sim.units[unit];
    let range = u.start..u.start + u.count;
    let anchor0 = u.anchor;
    let facing0 = u.facing;
    let ticks = (seconds / DT) as usize;
    let mut prev: Vec<Vec2> = range.clone().map(|i| sim.soldier_pos(i)).collect();
    let start: Vec<Vec2> = prev.clone();
    let mut prev_slot: Vec<u32> = range.clone().map(|i| sim.soldier_slot[i]).collect();
    let mut sum_speed = 0.0f64;
    let mut sum_lat = 0.0f64;
    let mut max_excursion = 0.0f32;
    let mut excursion = vec![0.0f32; prev.len()];
    let mut slot_changes = 0usize;
    let mut samples = 0.0f64;
    for _ in 0..ticks {
        sim.tick();
        let u = &sim.units[unit];
        let f = sim::dir(u.facing);
        let right = Vec2::new(f.y, -f.x);
        for (k, i) in range.clone().enumerate() {
            if sim.alive[i] != 1 {
                continue;
            }
            let p = sim.soldier_pos(i);
            let v = Vec2::new(p.x - prev[k].x, p.y - prev[k].y);
            let lat = v.x * right.x + v.y * right.y;
            sum_speed += (v.x * v.x + v.y * v.y).sqrt() as f64 / DT as f64;
            sum_lat += lat.abs() as f64 / DT as f64;
            let cum = Vec2::new(p.x - start[k].x, p.y - start[k].y);
            let cum_lat = (cum.x * right.x + cum.y * right.y).abs();
            excursion[k] = excursion[k].max(cum_lat);
            max_excursion = max_excursion.max(cum_lat);
            if sim.soldier_slot[i] != prev_slot[k] {
                slot_changes += 1;
                prev_slot[k] = sim.soldier_slot[i];
            }
            prev[k] = p;
            samples += 1.0;
        }
    }
    let u = &sim.units[unit];
    let f = sim::dir(facing0);
    let right = Vec2::new(f.y, -f.x);
    let da = Vec2::new(u.anchor.x - anchor0.x, u.anchor.y - anchor0.y);
    let samples = samples.max(1.0);
    WindowStats {
        mean_speed: (sum_speed / samples) as f32,
        mean_lat: (sum_lat / samples) as f32,
        max_excursion,
        big_movers: excursion.iter().filter(|&&e| e > 0.5).count(),
        slot_changes,
        anchor_lat: da.x * right.x + da.y * right.y,
        facing_delta: sim::wrap_angle(u.facing - facing0),
    }
}

pub fn print_window(label: &str, s: &WindowStats) {
    println!(
        "{label}: speed={:.4} lat={:.4} max_exc={:.2} big_movers={:>3} slot_changes={:>4} anchor_lat={:+.3} facing_d={:+.4}",
        s.mean_speed,
        s.mean_lat,
        s.max_excursion,
        s.big_movers,
        s.slot_changes,
        s.anchor_lat,
        s.facing_delta
    );
}

/// Tick until the order fully resolves (or 240s), returning the elapsed time.
pub fn march_until_arrived(sim: &mut Sim, unit: usize) -> f32 {
    let mut t = 0.0f32;
    while t < 240.0 {
        let u = &sim.units[unit];
        if u.pending_target.is_none()
            && u.move_target.is_none()
            && u.final_facing.is_none()
            && u.frame_speed < 0.05
        {
            break;
        }
        sim.tick();
        t += DT;
    }
    t
}

pub fn assert_settles(sim: &mut Sim, unit: usize, within_s: f32, watch_s: f32) {
    run(sim, within_s);
    let windows = (watch_s / 10.0) as usize;
    let mut stats = Vec::with_capacity(windows);
    let mut failed = false;
    for w in 0..windows {
        let s = window_motion(sim, unit, 10.0);
        if s.mean_speed >= SETTLE_SPEED || s.slot_changes != 0 {
            failed = true;
        }
        stats.push((w, sim.units[unit].cohesion, s));
    }
    if failed {
        for (w, cohesion, s) in &stats {
            print_window(
                &format!(
                    "settle {:>3}-{:>3}s coh={:.3}",
                    within_s as usize + w * 10,
                    within_s as usize + (w + 1) * 10,
                    cohesion
                ),
                s,
            );
        }
        panic!(
            "unit {unit} did not settle: every 10s window over {watch_s:.1}s after {within_s:.1}s must have mean_speed < {SETTLE_SPEED:.3} and slot_changes == 0"
        );
    }
}

/// The stock probe formation: 120 men, 20 files, 1m spacing.
pub fn block(sim: &mut Sim) -> usize {
    sim.spawn_unit(Vec2::ZERO, FRAC_PI_2, 120, 20, Vec2::new(1.0, 1.0), 0, 1.0)
}

/// Kill one soldier in every `stride` to fray the block like a post-battle unit.
pub fn decimate(sim: &mut Sim, unit: usize, stride: usize) {
    let u = &sim.units[unit];
    let range = u.start..u.start + u.count;
    let victims: Vec<usize> = range.filter(|i| i % stride == 0).collect();
    for i in victims {
        sim.kill(i);
    }
}

/// Curated generated battle map, seed 1 (the "Shore & Crags" catalog entry).
pub fn seed1_terrain() -> Terrain {
    sim::genmap::generate(&MapRecipe {
        seed: 1,
        ..MapRecipe::default()
    })
}

/// First point on seed 1 with open ground east and a solid wall west: scan a
/// few y rows for an impassable->passable transition.
pub fn seed1_west_wall_edge(terrain: &Terrain) -> (f32, f32) {
    for yi in -6..=6 {
        let y = yi as f32 * 50.0;
        let mut x = -900.0f32;
        while x < 0.0 {
            if terrain.speed_at(Vec2::new(x, y)) > 0.0
                && terrain.speed_at(Vec2::new(x - 2.0, y)) <= 0.0
                && terrain.speed_at(Vec2::new(x - 6.0, y)) <= 0.0
            {
                return (x, y);
            }
            x += 1.0;
        }
    }
    panic!("no west wall found in scanned rows");
}

/// March a fresh MediumInfantry block from 70m south onto `dest` (drag-style
/// order with a commanded facing) and report the arrival time.
pub fn march_class_block_to(sim: &mut Sim, dest: Vec2) -> usize {
    let unit = sim.spawn_class_with_files(
        dest + Vec2::new(0.0, -70.0),
        FRAC_PI_2,
        120,
        20,
        UnitClassId::MediumInfantry,
        0,
    );
    run(sim, 3.0);
    sim.set_move_order_facing(unit, dest, FRAC_PI_2);
    let t = march_until_arrived(sim, unit);
    println!(
        "arrived at t={t:.1}s files_eff={}",
        sim.units[unit].files_eff
    );
    unit
}
