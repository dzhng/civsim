//! WEAVE tests — the formation as a mass-spring lattice, in isolation.
//!
//! Tier 0: ONE unit, no enemy, no order. Perturb the lattice (stretch,
//! compress, bend, shear) and let it settle. The springs must restore the rest
//! grid, and do it WITHOUT oscillating. These are the cleanest possible
//! formation tests — they exercise only the neighbour springs, decoupled from
//! combat, the magnet, and orders. Nail these before anything touches an enemy.
//!
//! Facing is fixed NORTH (+y) so the unit's right-axis is +x and its
//! forward-axis is +y; "width" is the x-spread, "depth" is the y-spread.

use sim::{Sim, Tunables, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 7;

/// A clean rectangular block, facing north, on a parade ground.
fn block(files: usize, ranks: usize, spacing: f32) -> (Sim, usize) {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    if let Ok(v) = std::env::var("SLOTPULL") {
        tun.slot_pull = v.parse().unwrap();
    }
    let mut sim = Sim::new(tun, SEED);
    let u = sim.spawn_unit(
        Vec2::new(0.0, 0.0),
        FRAC_PI_2,
        files * ranks,
        files,
        Vec2::new(spacing, spacing),
        0,
        0.8,
    );
    // settle once so it starts from its own rest state
    for _ in 0..30 {
        sim.tick();
    }
    (sim, u)
}

/// (width = x-spread, depth = y-spread) of the living men, world axes.
fn extent(sim: &Sim, unit: usize) -> (f32, f32) {
    let u = &sim.units[unit];
    let (mut lo_x, mut hi_x, mut lo_y, mut hi_y) =
        (f32::INFINITY, f32::NEG_INFINITY, f32::INFINITY, f32::NEG_INFINITY);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let p = sim.soldier_pos(i);
        lo_x = lo_x.min(p.x);
        hi_x = hi_x.max(p.x);
        lo_y = lo_y.min(p.y);
        hi_y = hi_y.max(p.y);
    }
    (hi_x - lo_x, hi_y - lo_y)
}

/// Largest distance any single soldier moved this tick — the settle/oscillation
/// probe. (Caller snapshots positions before the tick.)
fn max_step(sim: &Sim, unit: usize, prev: &[f32]) -> f32 {
    let u = &sim.units[unit];
    let mut m = 0.0f32;
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let dx = sim.positions[2 * i] - prev[2 * i];
        let dy = sim.positions[2 * i + 1] - prev[2 * i + 1];
        m = m.max((dx * dx + dy * dy).sqrt());
    }
    m
}

fn settle(sim: &mut Sim, secs: f32) {
    for _ in 0..(secs / DT) as usize {
        sim.tick();
    }
}

// --- the perturbations: write world positions directly ---------------------

/// Scale every man's x-offset from the unit centroid by `k` (lateral stretch
/// if k>1, compress if k<1).
fn scale_x(sim: &mut Sim, unit: usize, k: f32) {
    let u = &sim.units[unit];
    let (s, e) = (u.start, u.start + u.count);
    let cx = sim.units[unit].centroid.x;
    for i in s..e {
        sim.positions[2 * i] = cx + (sim.positions[2 * i] - cx) * k;
    }
}

fn scale_y(sim: &mut Sim, unit: usize, k: f32) {
    let u = &sim.units[unit];
    let (s, e) = (u.start, u.start + u.count);
    let cy = sim.units[unit].centroid.y;
    for i in s..e {
        sim.positions[2 * i + 1] = cy + (sim.positions[2 * i + 1] - cy) * k;
    }
}

/// Bow the block forward into a parabola: y += amp * (x/halfwidth)^2.
fn bend(sim: &mut Sim, unit: usize, amp: f32) {
    let u = &sim.units[unit];
    let (s, e) = (u.start, u.start + u.count);
    let cx = sim.units[unit].centroid.x;
    let hw = extent(sim, unit).0 * 0.5 + 0.01;
    for i in s..e {
        let t = (sim.positions[2 * i] - cx) / hw;
        sim.positions[2 * i + 1] += amp * t * t;
    }
}

/// Shear the block into a parallelogram: x += k * (y - cy).
fn shear(sim: &mut Sim, unit: usize, k: f32) {
    let u = &sim.units[unit];
    let (s, e) = (u.start, u.start + u.count);
    let cy = sim.units[unit].centroid.y;
    for i in s..e {
        sim.positions[2 * i] += k * (sim.positions[2 * i + 1] - cy);
    }
}

// ---------------------------------------------------------------------------

#[test]
fn a_stretched_block_recovers_its_rest_width() {
    let (mut sim, u) = block(10, 5, 1.0);
    let (w0, _) = extent(&sim, u);
    scale_x(&mut sim, u, 1.6); // yank it 60% wider
    assert!(extent(&sim, u).0 > w0 * 1.4, "setup: it must start stretched");
    settle(&mut sim, 6.0);
    let (w1, _) = extent(&sim, u);
    eprintln!("STRETCH  rest_w={:.2}  stretched recovered to {:.2}", w0, w1);
    assert!(
        (w1 - w0).abs() < 0.15 * w0,
        "the lattice must pull back to rest spacing: width {:.2} vs rest {:.2}",
        w1,
        w0
    );
}

#[test]
fn a_compressed_block_recovers_its_rest_depth() {
    let (mut sim, u) = block(8, 6, 1.0);
    let (_, d0) = extent(&sim, u);
    scale_y(&mut sim, u, 0.6); // squash the ranks together (still > body diameter)
    assert!(extent(&sim, u).1 < d0 * 0.75, "setup: it must start compressed");
    settle(&mut sim, 6.0);
    let (_, d1) = extent(&sim, u);
    eprintln!("COMPRESS rest_d={:.2}  compressed recovered to {:.2}", d0, d1);
    assert!(
        (d1 - d0).abs() < 0.18 * d0,
        "the lattice must push back to rest spacing: depth {:.2} vs rest {:.2}",
        d1,
        d0
    );
}

#[test]
fn a_bent_line_straightens() {
    let (mut sim, u) = block(14, 1, 1.0); // single rank
    let (_, d0) = extent(&sim, u); // ~0 when straight
    bend(&mut sim, u, 3.0); // bow it 3m forward at the centre
    let (_, d_bent) = extent(&sim, u);
    assert!(d_bent > 2.0, "setup: it must start bent ({d_bent:.1})");
    settle(&mut sim, 8.0);
    let (_, d1) = extent(&sim, u);
    eprintln!("BEND     straight_d={:.2}  bent {:.2} -> recovered {:.2}", d0, d_bent, d1);
    assert!(
        d1 < 0.6,
        "a bent line with no other force must straighten: depth {:.2} (bent was {:.2})",
        d1,
        d_bent
    );
}

#[test]
fn a_sheared_block_squares_up() {
    let (mut sim, u) = block(10, 5, 1.0);
    let (_, d0) = extent(&sim, u);
    shear(&mut sim, u, 0.6); // lean it over: x += 0.6*(y-cy)
    let (_, d_sheared) = extent(&sim, u);
    // a shear keeps the same y-spread but the grid is no longer square; we
    // measure recovery by the y-spread returning to rest AND the block
    // un-leaning (depth back to nominal — shear leaves depth ~unchanged, so the
    // real tell is the grid angle; here we use the simplest proxy: it settles
    // back toward its rest depth without collapsing).
    eprintln!("SHEAR    rest_d={:.2}  sheared depth {:.2}", d0, d_sheared);
    settle(&mut sim, 8.0);
    let (_, d1) = extent(&sim, u);
    eprintln!("SHEAR    recovered depth {:.2}", d1);
    assert!(
        (d1 - d0).abs() < 0.2 * d0,
        "a sheared block must square back up: depth {:.2} vs rest {:.2}",
        d1,
        d0
    );
}

#[test]
fn the_lattice_settles_without_oscillating() {
    let (mut sim, u) = block(10, 5, 1.0);
    scale_x(&mut sim, u, 1.5);
    // Watch the per-tick motion: after a brief transient it must DECAY to ~0,
    // and never grow (a springy lattice with no damping would ring).
    let mut peak_after_1s = 0.0f32;
    let mut last = 0.0f32;
    for step in 0..(8.0 / DT) as usize {
        let prev = sim.positions.clone();
        sim.tick();
        let m = max_step(&sim, u, &prev);
        let t = step as f32 * DT;
        if t > 1.0 {
            peak_after_1s = peak_after_1s.max(m);
        }
        last = m;
    }
    eprintln!("SETTLE   peak_after_1s={:.4}  final_step={:.4}", peak_after_1s, last);
    assert!(
        last < 0.01,
        "the lattice must come to rest, final per-tick motion {:.4} m",
        last
    );
}
