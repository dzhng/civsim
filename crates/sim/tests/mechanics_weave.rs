//! WEAVE tests — the formation as a mass-spring lattice, in isolation.
//!
//! Tier 0: ONE unit, no enemy, no order. Perturb the lattice (stretch,
//! compress, bend, shear) and let it settle. The springs must restore the rest
//! grid, and do it WITHOUT oscillating. These are the cleanest possible
//! formation tests — they exercise only the neighbour springs, decoupled from
//! combat, the magnet, and orders. Nail these before anything touches an enemy.
//!
//! Tier 1: TWO units, SAME team (so there is zero combat — no magnet, no kills,
//! no swirl), one pressing into the other. This is the weave under EXTERNAL
//! load: the only thing that stops two lattices interpenetrating is body
//! collision, and the only thing that keeps each lattice from crushing into a
//! blob is its own compression spring. A press must compress BOTH the pusher
//! (its front stalls on the obstacle, its rear keeps coming) and the pushed
//! (its front is driven back into its own ranks) — and neither may collapse to
//! nothing, nor pour straight through the other.
//!
//! Facing is fixed NORTH (+y) so the unit's right-axis is +x and its
//! forward-axis is +y; "width" is the x-spread, "depth" is the y-spread.

use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 7;

/// The STEADY-STATE run speed a formed unit of `class` actually sustains on open
/// ground (after spending its acceleration), measured at the centroid.
fn terminal_run_speed(class: UnitClassId) -> f32 {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, SEED);
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 60, class, 0);
    for _ in 0..30 {
        sim.tick();
    }
    sim.set_pace(u, Pace::Run);
    sim.set_move_order(u, Vec2::new(0.0, 500.0));
    // Spend the acceleration ramp first, then time the steady state.
    for _ in 0..(8.0 / DT) as usize {
        sim.tick();
    }
    let y0 = sim.units[u].centroid.y;
    for _ in 0..(6.0 / DT) as usize {
        sim.tick();
    }
    (sim.units[u].centroid.y - y0) / 6.0
}

/// CHARACTERIZATION: the run speed each class ACTUALLY reaches. These numbers are
/// well below the classes' `run_speed` stat (light/heavy 3.4, cav higher): a
/// FORMED unit never sprints at an individual's leg speed because it is a coupled
/// loop — the frame advances toward run_speed, the men chase their formation
/// slots through a weak first-order lag, and the LEASH caps how far the frame may
/// lead them, pinning the unit's net pace below the stat. (Naive fixes — driving
/// the men forward, or loosening the leash — destabilise the loop and make it
/// SLOWER; reaching the stat needs a feed-forward redesign of frame-tracking.)
/// This is a tracked golden, NOT an endorsement of the values: if a change here
/// moves a number, that is a real side effect on movement — confirm it is wanted
/// and update the golden, don't just widen the tolerance.
#[test]
fn run_speed_per_class_is_tracked() {
    let light = terminal_run_speed(UnitClassId::LightSword);
    let heavy = terminal_run_speed(UnitClassId::HeavySword);
    let cav = terminal_run_speed(UnitClassId::ShockCavalry);
    eprintln!("RUN-SPEED  light={light:.2}  heavy={heavy:.2}  cav={cav:.2} (m/s)");
    let near = |got: f32, want: f32| (got - want).abs() < 0.25;
    assert!(near(light, LIGHT_RUN) && near(heavy, HEAVY_RUN) && near(cav, CAV_RUN),
        "run speeds drifted: light {light:.2} (was {LIGHT_RUN}), heavy {heavy:.2} (was {HEAVY_RUN}), cav {cav:.2} (was {CAV_RUN}) — a movement side effect; confirm it's wanted, then update the golden",
    );
}
// Golden values (m/s), captured 2026-06-16. All sit below the run_speed stat
// (light/heavy 3.4) because a formed unit is a coupled loop (the frame advances
// toward run_speed; the men chase formation slots through a weak lag; the leash
// caps the frame's lead). LIGHT reaches a stable MOVING equilibrium: its frame
// recedes faster (speed_mult 1.1 -> pace 3.74) than its men, so the men always
// have a gap to chase and sustain ~2.56. HEAVY collapses: pace 3.06 (speed_mult
// 0.9) and a deeper block, so when the lag hits its (bigger) leash the leash
// PINS the anchor to the men -> the slots stop advancing -> the men catch up and
// stall -> the unit locks near a walk (the "leashed frame re-walks the same
// meter" deadlock; frame_speed still reads ~pace, mass_advance is the honest
// measure). That heavy crash is a real bug in the frame<->men coupling, not a
// stat — it is TRACKED here, awaiting a feed-forward frame-tracking redesign.
const LIGHT_RUN: f32 = 2.56;
const HEAVY_RUN: f32 = 1.00;
const CAV_RUN: f32 = 3.86;

/// A clean rectangular block, facing north, on a parade ground.
fn block(files: usize, ranks: usize, spacing: f32) -> (Sim, usize) {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    // Tier 0 isolates the SPRINGS: give a holding unit the same (low) slot pull
    // as an attacking one, so these tests read the lattice restoring force, not
    // the hold-vs-attack slot-stiffness policy (a Tier 1/2 concern).
    tun.slot_pull_hold = tun.slot_pull;
    if let Ok(v) = std::env::var("SLOTPULL") {
        tun.slot_pull = v.parse().unwrap();
        tun.slot_pull_hold = tun.slot_pull;
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

/// Mean-x of the back half minus the front half — the block's LEAN (0 when
/// square, large when sheared into a parallelogram). Facing is north (+y), so
/// "back" is the high-y half.
fn lean(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let mut ys: Vec<(f32, f32)> = (u.start..u.start + u.count)
        .filter(|&i| sim.alive[i] == 1)
        .map(|i| (sim.soldier_pos(i).y, sim.soldier_pos(i).x))
        .collect();
    ys.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    let h = ys.len() / 2;
    let front_x: f32 = ys[..h].iter().map(|p| p.1).sum::<f32>() / h.max(1) as f32;
    let back_x: f32 = ys[h..].iter().map(|p| p.1).sum::<f32>() / (ys.len() - h).max(1) as f32;
    back_x - front_x
}

/// Kill men (from the rear) until the unit is down to `target` alive.
fn kill_to(sim: &mut Sim, unit: usize, target: usize) {
    let (s, e) = (sim.units[unit].start, sim.units[unit].start + sim.units[unit].count);
    for i in (s..e).rev() {
        if sim.units[unit].alive_count <= target {
            break;
        }
        if sim.alive[i] == 1 {
            sim.kill(i);
        }
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

/// Wrap the block into a U (semicircle opening forward): map each man's x to an
/// arc angle and place him on a circle, ranks stacked radially. A 180° span is a
/// full U around a column.
fn wrap_u(sim: &mut Sim, unit: usize, span_rad: f32) {
    let u = &sim.units[unit];
    let (s, e, files, sp) = (u.start, u.start + u.count, u.files_eff.max(1), u.spacing.y);
    let cx = sim.units[unit].centroid.x;
    let cy = sim.units[unit].centroid.y;
    let hw = (extent(sim, unit).0 * 0.5).max(0.5);
    let radius = hw / (span_rad * 0.5).max(0.1);
    for i in s..e {
        // recover (file, rank) from the live slot
        let slot = sim.soldier_slot[i] as usize;
        let (file, rank) = (slot % files, slot / files);
        let t = (file as f32 / (files.max(2) - 1) as f32) * 2.0 - 1.0; // -1..1
        let a = t * span_rad * 0.5;
        let rr = radius + rank as f32 * sp;
        sim.positions[2 * i] = cx + rr * a.sin();
        sim.positions[2 * i + 1] = cy + rr * (1.0 - a.cos());
    }
}

// --- Tier 1: two same-team blocks, one pressing the other ------------------

/// Two blocks on a parade ground, SAME team — so there is NO combat at all (no
/// magnet, no kills, no swirl). The only thing that stops the two lattices
/// interpenetrating is body collision; the only thing that keeps each from
/// crushing into a blob is its own compression spring. This is the weave under
/// pure mechanical load, every combat variable removed. Both face north (+y);
/// `a` sits south, `b` north. The presser must use WALK pace: the separation
/// solver relieves overlap up to `separation_max_push` (0.1 m) per tick, which
/// exceeds a walk step (~0.057 m) but not a run — so a walk presses cleanly
/// while a run would outrun the solver and leak through. Returns (sim, a, b).
fn two_blocks(
    a_files: usize,
    a_ranks: usize,
    a_y: f32,
    b_files: usize,
    b_ranks: usize,
    b_y: f32,
    spacing: f32,
) -> (Sim, usize, usize) {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    // Friendly bodies normally SLIDE around each other (funnelling); zero it so
    // a head-on press deadlocks instead, isolating compression from the
    // tangential funnel — one fewer variable in the weave-only picture.
    tun.separation_slide = 0.0;
    let mut sim = Sim::new(tun, SEED);
    let a = sim.spawn_unit(
        Vec2::new(0.0, a_y),
        FRAC_PI_2,
        a_files * a_ranks,
        a_files,
        Vec2::new(spacing, spacing),
        0,
        0.8,
    );
    let b = sim.spawn_unit(
        Vec2::new(0.0, b_y),
        FRAC_PI_2,
        b_files * b_ranks,
        b_files,
        Vec2::new(spacing, spacing),
        0,
        0.8,
    );
    for _ in 0..30 {
        sim.tick();
    }
    (sim, a, b)
}

/// Mean nearest-neighbour distance among a unit's living men — the weave's
/// PACKING. At rest it is the file spacing; a compressed lattice reads less, a
/// stretched one more. Robust to a ragged front (unlike the y-extent).
fn pack(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let men: Vec<Vec2> = (u.start..u.start + u.count)
        .filter(|&i| sim.alive[i] == 1)
        .map(|i| sim.soldier_pos(i))
        .collect();
    let (mut sum, mut n) = (0.0f32, 0.0f32);
    for (k, &p) in men.iter().enumerate() {
        let mut best = f32::INFINITY;
        for (l, &q) in men.iter().enumerate() {
            if k != l {
                best = best.min((p - q).len());
            }
        }
        if best.is_finite() {
            sum += best;
            n += 1.0;
        }
    }
    sum / n.max(1.0)
}

/// Fraction of unit `a`'s living men with an ENEMY (other-team) body within
/// `0.8` m — the body-level "are the two sides intermingled" measure. A clean
/// glued front has only the front rank in contact (small); a blender threads
/// enemies all through the block (large).
fn intermix(sim: &Sim, a: usize, b: usize) -> f32 {
    let ua = &sim.units[a];
    let ub = &sim.units[b];
    let bmen: Vec<Vec2> = (ub.start..ub.start + ub.count)
        .filter(|&i| sim.alive[i] == 1)
        .map(|i| sim.soldier_pos(i))
        .collect();
    let (mut touched, mut n) = (0.0f32, 0.0f32);
    for i in ua.start..ua.start + ua.count {
        if sim.alive[i] == 0 {
            continue;
        }
        n += 1.0;
        let p = sim.soldier_pos(i);
        if bmen.iter().any(|&q| (p - q).len() < 0.8) {
            touched += 1.0;
        }
    }
    touched / n.max(1.0)
}

/// Mean y of a unit's living men.
fn mean_y(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let (mut sum, mut n) = (0.0f32, 0.0f32);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 1 {
            sum += sim.soldier_pos(i).y;
            n += 1.0;
        }
    }
    sum / n.max(1.0)
}

#[test]
fn an_advancing_block_compresses_both_itself_and_the_one_it_presses() {
    // A walks north into B (SAME team — pure weave, no combat). The press must
    // compress BOTH lattices: A's front stalls on B while A's rear keeps
    // coming (A packs hard), and B is driven into its own ranks (B packs).
    // Neither may crush to a body-contact blob — the exponential compression
    // spring holds the spacing. (Whether the press HOLDS or A eventually wedges
    // through is a COMBAT-tier question: without the enemy magnet gluing front
    // to front and the enemy collision wall, friendly bodies have nothing to
    // hold the contact, so this test asserts compression only, not the hold.)
    let (mut sim, a, b) = two_blocks(10, 10, -10.0, 10, 8, 2.0, 1.0);
    let a_rest = pack(&sim, a);
    let b_rest = pack(&sim, b);
    let b_y0 = mean_y(&sim, b);
    sim.set_pace(a, Pace::Walk); // walk: the separation solver can fully relieve a walk step
    sim.set_move_order(a, Vec2::new(0.0, 30.0)); // drive clean through where B stands

    let (mut a_min, mut b_min) = (f32::INFINITY, f32::INFINITY);
    for step in 0..(18.0 / DT) as usize {
        sim.tick();
        a_min = a_min.min(pack(&sim, a));
        b_min = b_min.min(pack(&sim, b));
        if std::env::var("TRACE").is_ok() && step % 30 == 0 {
            eprintln!(
                "  t={:.1} A_y={:.1} pack={:.2} | B_y={:.1} pack={:.2}",
                step as f32 * DT,
                mean_y(&sim, a), pack(&sim, a),
                mean_y(&sim, b), pack(&sim, b),
            );
        }
    }
    let _ = b_y0;
    eprintln!(
        "PRESS  A pack {:.2}->min {:.2}  B pack {:.2}->min {:.2}",
        a_rest, a_min, b_rest, b_min
    );
    // Both lattices packed tighter than rest spacing (~1.0) — the advance
    // compressed itself AND the block it pressed.
    assert!(a_min < 0.85, "the pusher's own lattice must compress: {a_min:.2}");
    assert!(b_min < 0.97, "the pressed lattice must compress: {b_min:.2}");
    // Neither crushed to a body-contact blob (~0.66 = 2×radius). The
    // exponential compression spring holds the spacing well above it.
    assert!(a_min > 0.66, "the pusher must not crush to a blob: {a_min:.2}");
    assert!(b_min > 0.66, "the pressed block must not crush to a blob: {b_min:.2}");
}

/// Mean (pressure, vice) over a unit's living men whose y is in [lo, hi].
fn crush_band(sim: &Sim, unit: usize, lo: f32, hi: f32) -> (f32, f32) {
    let u = &sim.units[unit];
    let (mut p, mut v, mut n) = (0.0f32, 0.0f32, 0.0f32);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let y = sim.soldier_pos(i).y;
        if y >= lo && y <= hi {
            p += sim.pressure[i];
            v += sim.soldier_vice(i);
            n += 1.0;
        }
    }
    (p / n.max(1.0), v / n.max(1.0))
}

#[test]
fn a_two_sided_squeeze_reads_as_a_vice_a_one_sided_shove_does_not() {
    // The pressure READOUT in isolation: take one block and crush it in y to a
    // known packing, then read the springs. An INTERIOR man has a neighbour
    // ahead AND behind, both driven inside rest — two large OPPOSED loads: high
    // scalar pressure, near-zero net vector = a VICE. An EDGE man (front or back
    // rank) has a neighbour on ONE side only: one load, so pressure ~= |net| and
    // almost no vice, even though he is pressed just as hard. This is exactly
    // what combat reads to pin a wedged man's arms while sparing the man merely
    // shoved from one side — and it now comes straight off the weave springs.
    let (mut sim, u) = block(6, 8, 1.0); // 6 wide, 8 deep, facing +y
    scale_y(&mut sim, u, 0.55); // crush the depth: every rank driven inside rest
    // A few ticks for the spring loads to register in the EMA; the block barely
    // relaxes in that time (full recovery takes ~1.5 s).
    for _ in 0..6 {
        sim.tick();
    }
    let cy = sim.units[u].centroid.y;
    let (_, half_d) = extent(&sim, u);
    let edge = half_d * 0.5 - 0.6; // beyond this from centre = front/back rank
    // Interior = the middle ranks (|y-cy| small); edge = front+back ranks.
    let (p_in, v_in) = crush_band(&sim, u, cy - 0.6, cy + 0.6);
    let mut p_edge = 0.0f32;
    let mut v_edge = 0.0f32;
    let mut ne = 0.0f32;
    for i in sim.units[u].start..sim.units[u].start + sim.units[u].count {
        if sim.alive[i] == 1 && (sim.soldier_pos(i).y - cy).abs() > edge {
            p_edge += sim.pressure[i];
            v_edge += sim.soldier_vice(i);
            ne += 1.0;
        }
    }
    p_edge /= ne.max(1.0);
    v_edge /= ne.max(1.0);
    eprintln!(
        "VICE  interior: press {p_in:.2} vice {v_in:.2}  |  edge: press {p_edge:.2} vice {v_edge:.2}"
    );
    // The interior is genuinely crushed.
    assert!(p_in > 0.3, "interior must feel real pressure: {p_in:.2}");
    // ...and it reads as a VICE: opposing loads cancel, so vice is most of it.
    assert!(v_in > 0.6 * p_in, "two-sided crush must read as a vice: vice {v_in:.2} of press {p_in:.2}");
    // The edge ranks are pressed too, but one-sided — scalar ~= vector, so they
    // carry far less vice than the interior for the same crush.
    assert!(
        v_edge / p_edge.max(1e-3) < 0.5 * (v_in / p_in.max(1e-3)),
        "one-sided edge must read far less vice-per-crush than two-sided interior: edge {:.2} vs interior {:.2}",
        v_edge / p_edge.max(1e-3),
        v_in / p_in.max(1e-3),
    );
}

// --- Tier 2: enemies, with the MAGNET, made invulnerable (no death) --------
//
// One variable at a time: Tier 1 added a second unit (collision + springs);
// Tier 2 now adds the enemy MAGNET and the front-line glue, but keeps death
// switched OFF (invulnerable) so the geometry is not muddied by attrition. The
// clash mechanics — glue, wrap, the hold-vs-attack slot stiffness — show in
// isolation.

/// Two blocks, OPPOSING teams, facing each other (a north, b south), made
/// INVULNERABLE after settling so the magnet glues and bodies block but nobody
/// dies. Returns (sim, a, b).
fn two_armies(
    a_files: usize,
    a_ranks: usize,
    a_y: f32,
    b_files: usize,
    b_ranks: usize,
    b_y: f32,
    spacing: f32,
) -> (Sim, usize, usize) {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, SEED);
    let a = sim.spawn_unit(
        Vec2::new(0.0, a_y),
        FRAC_PI_2,
        a_files * a_ranks,
        a_files,
        Vec2::new(spacing, spacing),
        0,
        0.8,
    );
    let b = sim.spawn_unit(
        Vec2::new(0.0, b_y),
        -FRAC_PI_2,
        b_files * b_ranks,
        b_files,
        Vec2::new(spacing, spacing),
        1,
        0.8,
    );
    for _ in 0..30 {
        sim.tick();
    }
    for h in sim.health.iter_mut() {
        *h = 1.0e9;
    }
    (sim, a, b)
}

/// Two opposing blocks of equal WIDTH, head-on, both attacking, invulnerable.
/// `a` (south, faces north) has `a_ranks` depth; `b` (north) has `b_ranks`.
/// Returns the MIDLINE drift north over `secs`: positive = the contact line was
/// walked toward b's side, i.e. a out-pushed b.
fn depth_contest(a_ranks: usize, b_ranks: usize, secs: f32) -> f32 {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, SEED);
    let w = 6;
    let a = sim.spawn_unit(Vec2::new(0.0, -6.0), FRAC_PI_2, w * a_ranks, w, Vec2::new(1.0, 1.0), 0, 0.8);
    let b = sim.spawn_unit(Vec2::new(0.0, 6.0), -FRAC_PI_2, w * b_ranks, w, Vec2::new(1.0, 1.0), 1, 0.8);
    for _ in 0..30 {
        sim.tick();
    }
    for h in sim.health.iter_mut() {
        *h = 1.0e9;
    }
    let mid0 = (mean_y(&sim, a) + mean_y(&sim, b)) * 0.5;
    sim.set_pace(a, Pace::Walk);
    sim.set_pace(b, Pace::Walk);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    for _ in 0..(secs / DT) as usize {
        sim.tick();
    }
    (mean_y(&sim, a) + mean_y(&sim, b)) * 0.5 - mid0
}

#[test]
fn a_deep_column_walks_a_thin_line_back_equal_depths_hold() {
    // Othismos, emergent from the weave alone (no force-conduction term). Two
    // invulnerable blocks of equal width shove head-on. When one is far deeper,
    // its extra ranks each add a compression spring driving the rank ahead, so
    // the column walks the thin line back — the contact MIDLINE drifts toward
    // the thin side. Equal depths have equal spring chains: the line holds, the
    // midline barely moves. This is the transmission that `press_drive` used to
    // bolt onto the collision solver; the springs do it on their own now.
    let deep = depth_contest(14, 3, 12.0);
    let even = depth_contest(8, 8, 12.0);
    eprintln!("DEPTH  deep-vs-thin midline drift {deep:+.2}m  |  equal-vs-equal {even:+.2}m");
    assert!(deep > 2.5, "a deep column must walk a thin line back: {deep:+.2}m");
    assert!(even.abs() < 1.0, "equal depths must hold a steady contact line: {even:+.2}m");
    assert!(deep > 3.0 * even.abs() + 1.0, "depth must decide it, not noise: deep {deep:+.2} vs equal {even:+.2}");
}

#[test]
fn an_attacking_line_wraps_a_deep_column_a_holding_one_does_not() {
    // A wide LINE meets a narrow deep COLUMN head-on (invulnerable, no death).
    // ATTACKING, the line's overhanging flanks have open shots to the column's
    // sides — the magnet curls them in and the loose attack-slots let the sheet
    // drape, so the line WRAPS the column (deep bow, cohesion shed). The same
    // line merely HOLDING (no order, stiff slots) must NOT wrap: a corner
    // touch can't drag the rigid grid out to envelop.
    for (attacking, expect_wrap) in [(true, true), (false, false)] {
        let (mut sim, line, col) = two_armies(18, 3, -8.0, 3, 18, 6.0, 1.0);
        let coh_flat = sim.units[line].cohesion;
        let (_, line_d0) = extent(&sim, line);
        if attacking {
            sim.set_pace(line, Pace::Walk);
            sim.set_attack_order(line, col);
        }
        // the column just holds (no order) in both cases
        let mut line_depth_max: f32 = 0.0;
        let mut coh_min = f32::INFINITY;
        for _ in 0..(14.0 / DT) as usize {
            sim.tick();
            line_depth_max = line_depth_max.max(extent(&sim, line).1);
            coh_min = coh_min.min(sim.units[line].cohesion);
        }
        let bow = line_depth_max - line_d0;
        eprintln!(
            "WRAP[{}]  line depth {:.1}->{:.1} (bow {:.1})  cohesion {:.2}->min {:.2}",
            if attacking { "attack" } else { "hold" },
            line_d0, line_depth_max, bow, coh_flat, coh_min
        );
        if expect_wrap {
            // The spring-magnet holds the front at weapon's length, so the
            // attacker forms a CLEAN CUP around the column (it doesn't pile
            // through it as the old constant-pull magnet did) — a smaller, more
            // honest bow. What matters is the contrast with the holding line.
            assert!(bow > 2.0, "the attacking line must wrap the column: bow {bow:.1}");
            assert!(coh_min < coh_flat - 0.05, "the wrap must shed cohesion: {coh_flat:.2}->{coh_min:.2}");
        } else {
            assert!(bow < 1.5, "a holding line must NOT wrap on a corner touch: bow {bow:.1}");
        }
    }
}

#[test]
fn two_invulnerable_lines_glue_at_contact_and_hold_a_clean_front() {
    // Full 1v1 with the magnet, death OFF. Two equal lines attack each other.
    // The front ranks GLUE at contact (a single touching front, not a tangled
    // intermix) and the blocks meet near the midline — neither pours through.
    let (mut sim, a, b) = two_armies(12, 6, -8.0, 12, 6, 8.0, 1.0);
    sim.set_pace(a, Pace::Walk);
    sim.set_pace(b, Pace::Walk);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    let mut max_intermix = 0.0f32;
    for _ in 0..(16.0 / DT) as usize {
        sim.tick();
        max_intermix = max_intermix.max(intermix(&sim, a, b));
    }
    let gap = mean_y(&sim, b) - mean_y(&sim, a); // b is north, a south: stays positive
    eprintln!("GLUE   centroid_gap={:.1}  max_intermix={:.2}", gap, max_intermix);
    // The two centroids did not swap sides (no walk-through).
    assert!(gap > 0.0, "the lines walked through each other: gap {gap:.1}");
    // Contact stayed a front, not a blender: only a fraction of each line ever
    // has an enemy body intermingled among its own men.
    assert!(max_intermix < 0.5, "the front turned into a blob/intermix: {max_intermix:.2}");
}

/// A T-junction setup: a wide BAR (16x4, along x, facing north, team 0) and a
/// narrow STEM (3x12, along y, facing south, team 1) whose tip overlaps the
/// bar's centre. Invulnerable, no death. Returns (sim, stem, bar).
fn t_junction() -> (Sim, usize, usize) {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, SEED);
    let bar = sim.spawn_unit(Vec2::new(0.0, 0.0), FRAC_PI_2, 64, 16, Vec2::new(1.0, 1.0), 0, 0.8);
    let stem = sim.spawn_unit(Vec2::new(0.0, 6.0), -FRAC_PI_2, 36, 3, Vec2::new(1.0, 1.0), 1, 0.8);
    for _ in 0..30 {
        sim.tick();
    }
    for h in sim.health.iter_mut() {
        *h = 1.0e9;
    }
    (sim, stem, bar)
}

#[test]
fn a_holding_stem_does_not_merge_into_the_bar() {
    // Stem and bar both HOLD (no order). The magnet glues the touching men;
    // left loose they would reel together into one blob. Stiff hold-slots stop
    // it: the stem keeps its narrow column and the bar keeps its width — they
    // meet at the junction without either dissolving into the other.
    let (mut sim, stem, bar) = t_junction();
    let (stem_w0, _) = extent(&sim, stem);
    let (bar_w0, _) = extent(&sim, bar);
    let (mut stem_w_max, mut bar_w_max) = (stem_w0, bar_w0);
    for _ in 0..(14.0 / DT) as usize {
        sim.tick();
        stem_w_max = stem_w_max.max(extent(&sim, stem).0);
        bar_w_max = bar_w_max.max(extent(&sim, bar).0);
    }
    eprintln!(
        "T-HOLD   stem width {:.1}->max {:.1}  bar width {:.1}->max {:.1}",
        stem_w0, stem_w_max, bar_w0, bar_w_max
    );
    // The holding stem stays a narrow stem — it is NOT reeled out along the bar.
    assert!(stem_w_max < stem_w0 + 3.0, "the holding stem splayed along the bar: {stem_w0:.1}->{stem_w_max:.1}");
    assert!(bar_w_max < bar_w0 + 3.0, "the holding bar splayed at the junction: {bar_w0:.1}->{bar_w_max:.1}");
}

#[test]
fn an_attacking_stem_drapes_along_the_bar() {
    // The mirror case: the stem ATTACKS the bar. Because it is attacking (loose
    // slots + the magnet pulling its men onto open enemies along the line), it
    // does NOT keep its column — its men fan out and DRAPE along the bar's face
    // (the attacker wraps). Its width grows well past its narrow rest.
    let (mut sim, stem, bar) = t_junction();
    let (stem_w0, _) = extent(&sim, stem);
    sim.set_pace(stem, Pace::Walk);
    sim.set_attack_order(stem, bar);
    let mut stem_w_max = stem_w0;
    for _ in 0..(16.0 / DT) as usize {
        sim.tick();
        stem_w_max = stem_w_max.max(extent(&sim, stem).0);
    }
    eprintln!("T-ATTACK stem width {:.1}->max {:.1}", stem_w0, stem_w_max);
    // Attacking, the stem drapes wider than its rest along the bar (clearly more
    // than a HOLDING stem, which stays ~+2 — see the hold test). The tight
    // engaged leash keeps the drape modest; the contrast is what matters.
    assert!(
        stem_w_max > stem_w0 + 2.8,
        "the attacking stem must drape along the bar: width {stem_w0:.1}->{stem_w_max:.1}"
    );
}

// ---------------------------------------------------------------------------

#[test]
fn a_u_wrapped_line_loses_about_20_percent_cohesion() {
    let (mut sim, u) = block(24, 3, 1.0);
    let coh_flat = sim.units[u].cohesion;
    // Hold the U (re-impose it each tick) so cohesion settles to the wrapped
    // shape rather than springing flat — this isolates the cohesion MEASURE.
    for _ in 0..150 {
        sim.tick();
        wrap_u(&mut sim, u, std::f32::consts::PI); // full 180° U
    }
    let coh_u = sim.units[u].cohesion;
    eprintln!("U-WRAP   cohesion flat={:.2}  wrapped={:.2}  (loss {:.0}%)", coh_flat, coh_u, (1.0 - coh_u / coh_flat) * 100.0);
    assert!(
        (coh_u - 0.8).abs() < 0.08,
        "a line wrapped into a U should shed ~20% cohesion: got {:.2} (flat {:.2})",
        coh_u,
        coh_flat
    );
}

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
fn a_bent_block_straightens() {
    // A LEGAL block (>=3 deep, so the 3-deep rule doesn't reshape it). Bow the
    // whole thing forward into a banana; with no other force it must straighten
    // back to its rest depth.
    let (mut sim, u) = block(24, 3, 1.0);
    let (_, d0) = extent(&sim, u); // rest depth ~2 (3 ranks)
    bend(&mut sim, u, 3.0); // wings bowed 3m forward of the centre
    let (_, d_bent) = extent(&sim, u);
    assert!(d_bent > d0 + 2.0, "setup: it must start bent ({d_bent:.1} vs rest {d0:.1})");
    settle(&mut sim, 8.0);
    let (_, d1) = extent(&sim, u);
    eprintln!("BEND     rest_d={:.2}  bent {:.2} -> recovered {:.2}", d0, d_bent, d1);
    assert!(
        d1 < d0 + 0.6,
        "a bent block with no other force must straighten: depth {:.2} (rest {:.2}, bent was {:.2})",
        d1,
        d0,
        d_bent
    );
}

#[test]
fn a_sheared_block_squares_up() {
    let (mut sim, u) = block(10, 5, 1.0);
    shear(&mut sim, u, 1.0); // lean it over hard: x += 1.0*(y-cy)
    let lean0 = lean(&sim, u);
    assert!(lean0 > 1.5, "setup: it must start leaned ({lean0:.1})");
    settle(&mut sim, 8.0);
    let lean1 = lean(&sim, u);
    eprintln!("SHEAR    lean {:.2} -> recovered {:.2}", lean0, lean1);
    assert!(
        lean1.abs() < 0.4,
        "a sheared block must square back up: lean {:.2} (was {:.2})",
        lean1,
        lean0
    );
}

#[test]
fn a_dying_block_sheds_depth_then_width() {
    // The 3-deep rule: as men die the block gets SHALLOWER at full width until
    // it would drop below 3 ranks, then it closes up and sheds WIDTH instead.
    let (mut sim, u) = block(12, 8, 1.0); // 96 men, 12 wide × 8 deep
    let w0 = sim.units[u].files_eff;
    assert_eq!(w0, 12, "setup: starts 12 wide");
    // Down to half: alive/3 = 16 > 12, so width holds and DEPTH sheds (to ~4).
    kill_to(&mut sim, u, 48);
    settle(&mut sim, 5.0);
    let w_half = sim.units[u].files_eff;
    eprintln!("DEATH    96->48: width {} -> {} (depth ~{})", w0, w_half, 48 / w_half.max(1));
    assert!(w_half >= 11, "at half strength it sheds DEPTH, keeps width: {w_half}");
    // Down to 24: alive/3 = 8 < 12, so it must now shed WIDTH, never below 3 deep.
    kill_to(&mut sim, u, 24);
    settle(&mut sim, 6.0);
    let w_q = sim.units[u].files_eff;
    let ranks = 24 / w_q.max(1);
    eprintln!("DEATH    48->24: width {} (depth ~{})", w_q, ranks);
    assert!(w_q < 11, "now it must shed WIDTH: {w_q}");
    assert!(ranks >= 3, "but never thinner than 3 deep: {ranks} ranks");
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

// --- Tier 3: the braced-pole wall -----------------------------------------
//
// A leveled pike is a body: an enemy can no more walk through the wall of
// POINTS at weapon's length than through the torsos behind it. This was the
// pike "trample" bug — the soft enemy-magnet stopped a front man at reach, but
// a deep block's rear ranks out-shoved one front rank's spring, squashed it
// across the empty reach-gap, and the two lattices slid clean through each
// other (then turned and did it again, an oscillation that looked like cavalry
// trampling). A short weapon never showed it: its standoff sits at body
// contact, where the body wall already catches it.
//
// FAKE units: a plain block given one fixed braced weapon, so the test pins the
// MECHANIC (a hard standoff at reach) and never drifts when a real class is
// rebalanced. Both walls attack head-on; the invariant is that their centroids
// NEVER cross — neither block ends up on the far side of the other.

/// Mean-y of a unit's living men (its centroid along the clash axis).
fn centroid_y(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let mut sum = 0.0f32;
    let mut n = 0.0f32;
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 1 {
            sum += sim.soldier_pos(i).y;
            n += 1.0;
        }
    }
    sum / n.max(1.0)
}

/// (front-most y, rear-most y) of a unit's living men.
fn y_span(sim: &Sim, unit: usize) -> (f32, f32) {
    let u = &sim.units[unit];
    let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 1 {
            let y = sim.soldier_pos(i).y;
            lo = lo.min(y);
            hi = hi.max(y);
        }
    }
    (lo, hi)
}

#[test]
fn two_braced_walls_hold_a_standoff_neither_centroid_crosses() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false; // isolate the mechanic from routing
    let mut sim = Sim::new(tun, SEED);

    // A fixed sarissa: long, braced, and BLUNT (zero damage). Every value is
    // pinned here, not read from any class table, so a future rebalance can't
    // move this test — and the blunt point makes it a pure SHOVING contest: no
    // deaths, no attrition, so the only question left is the mechanical one —
    // do two deep blocks driving into each other HOLD at weapon's length, or
    // pour through (the old pike "trample")?
    let pike = sim::Weapon {
        reach: 3.5,
        min_range: 1.1,
        arc: 0.08,
        attack_interval: 1.4,
        damage: 0.0,
        braced: true,
    };

    // Two deep blocks (10 ranks of rear-rank shove — the exact load that broke
    // the soft magnet), facing each other 50 m apart on the y-axis.
    let south = sim.spawn_unit(Vec2::new(0.0, -25.0), FRAC_PI_2, 200, 20, Vec2::new(0.8, 1.0), 0, 0.85);
    let north = sim.spawn_unit(Vec2::new(0.0, 25.0), -FRAC_PI_2, 200, 20, Vec2::new(0.8, 1.0), 1, 0.85);
    for &u in &[south, north] {
        sim.units[u].stats.weapons = sim::class::one(pike);
    }
    sim.set_pace(south, Pace::Run);
    sim.set_pace(north, Pace::Run);
    sim.set_attack_order(south, north);
    sim.set_attack_order(north, south);

    // Centroids start 59 m apart (anchor 25 + half a 10-rank block). Held at the
    // points, the blocks settle ~12 m apart (reach + two half-depths); a pass-
    // through would collapse that gap through zero. min_front is the closest any
    // two opposing men get — staggered columns let a front man jitter a hair
    // past, but a real interpenetration would plunge it deeply negative.
    let (mut min_centroid_gap, mut min_front, mut closed) = (f32::INFINITY, f32::INFINITY, false);
    for _ in 0..(80.0 / DT) as usize {
        sim.tick();
        let (cs, cn) = (centroid_y(&sim, south), centroid_y(&sim, north));
        // THE INVARIANT: south stays south of north — they never trade sides.
        assert!(
            cs < cn,
            "centroids crossed: south {cs:.2} >= north {cn:.2} (the blocks ran through each other)",
        );
        let (_, south_front) = y_span(&sim, south); // south advances +y
        let (north_front, _) = y_span(&sim, north); // north advances -y
        if cn - cs < 50.0 {
            closed = true; // they actually met (not a trivial pass)
            min_centroid_gap = min_centroid_gap.min(cn - cs);
            min_front = min_front.min(north_front - south_front);
        }
    }
    eprintln!("POLE-WALL  closed={closed}  min centroid gap={min_centroid_gap:.2} m  min front gap={min_front:.2} m");
    assert!(closed, "the walls never closed to contact — test is vacuous");
    // The blocks held well clear of a pass-through. Under constant shoving each
    // block compresses against the standoff (so the gap sits below the ~12 m a
    // static standoff would show), but the old trample collapsed it through zero.
    assert!(
        min_centroid_gap > 4.0,
        "blocks collapsed to {min_centroid_gap:.2} m centroid gap — the braced pole fence did not hold the standoff",
    );
    // Fronts never deeply interpenetrated (a hair of column-stagger jitter aside).
    assert!(
        min_front > -1.0,
        "fronts interpenetrated to {min_front:.2} m — the braced pole fence did not hold (reach 3.5)",
    );
}

// --- Column-and-line, built one behaviour at a time (immortal soldiers = pure
// --- weave physics; compound these, don't solve all at once). ---------------

/// A deep narrow block immortal-pushes a thin same-width defender straight back.
/// (lhs y-extent half is `depth*spacing/2`.) Returns, over the run, the largest
/// amount the PUSHER's front got PAST the defender's front — i.e. how far the
/// glue let go. 0 = the fronts stayed welded (the pusher only ever drove the
/// defender back); large = the pusher detached and walked through.
fn front_detach(pusher_deep: usize, def_deep: usize) -> f32 {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, SEED);
    let files = 4usize;
    // defender at +y facing -y (south); pusher at -y facing +y, attacks.
    let def = sim.spawn_unit(Vec2::new(0.0, 6.0), -FRAC_PI_2, files * def_deep, files, Vec2::new(0.9, 1.0), 1, 0.8);
    let push = sim.spawn_unit(Vec2::new(0.0, -6.0), FRAC_PI_2, files * pusher_deep, files, Vec2::new(0.9, 1.0), 0, 0.8);
    for u in [def, push] {
        let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
        for k in s..e {
            sim.health[k] = 1.0e9;
        }
    }
    sim.set_pace(push, Pace::Run);
    sim.set_attack_order(push, def);
    let front = |s: &Sim, u: usize, sign: f32| {
        (s.units[u].start..s.units[u].start + s.units[u].count)
            .filter(|&i| s.alive[i] == 1)
            .map(|i| s.soldier_pos(i).y * sign)
            .fold(f32::MIN, f32::max)
            * sign
    };
    let mut max_detach = 0.0f32;
    for _ in 0..(30.0 / DT) as usize {
        sim.tick();
        // pusher faces +y so its front is its MAX y; defender's front is its MIN y.
        let pf = front(&sim, push, 1.0);
        let df = front(&sim, def, -1.0);
        max_detach = max_detach.max(pf - df); // pusher front past defender front
    }
    max_detach
}

/// BEHAVIOUR 1 — the FRONT-GLUE. The fronts attract, so a pusher can drive a
/// SHALLOWER defender BACK but cannot DETACH from it and walk into a gap: its
/// front man stays welded to the defender's front man. Both blocks are the SAME
/// WIDTH (4 files) so they meet front-to-front 1-to-1 — the column has no spare
/// file to walk past the defender's flank. The defender is 3 deep, not 2: the
/// formation engine never holds a block thinner than 3 ranks (it auto-narrows a
/// 2-deep line into a 2-wide×4-deep string — `files_eff` casualty cap), so a
/// "4-wide×2-deep" line is really a 2-wide one the wider column trivially flanks.
#[test]
fn the_fronts_stay_welded_a_pusher_drives_not_detaches() {
    let detach = front_detach(8, 3);
    eprintln!("FRONT-GLUE  pusher front got {detach:.1}m past the defender front (0 = welded)");
    assert!(
        detach < 1.0,
        "the pusher detached and walked through the defender: {detach:.1}m past its front (the fronts must stay welded)",
    );
}

/// BEHAVIOUR 2 — A HOLDING BLOCK DOESN'T DEFORM under a press. Immortal (no
/// deaths). The crisp-grid claim is for a block that HOLDS, not one that pushes:
/// block `a` holds (no order), block `b` ATTACKS into it. `a`'s grid must stay
/// rectangular (only its front rank touches), driven back as a body, not
/// pancaked — it isn't pushing, so nothing squeezes its front. (Two ATTACKERS
/// both push and the mutual front-SQUEEZE splays them — a collision-geometry
/// blob the stiff weave does NOT fix, so that is a separate problem, not what
/// this pins.) Measures the worst over the run: intermix (fronts blended) and
/// the HOLDER's width spread from rest frontage.
fn equal_press_deform(secs: f32) -> (f32, f32, f32) {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, SEED);
    let w = 6usize;
    let sp = 1.0f32;
    let a = sim.spawn_unit(Vec2::new(0.0, -6.0), FRAC_PI_2, w * w, w, Vec2::new(sp, sp), 0, 0.8);
    let b = sim.spawn_unit(Vec2::new(0.0, 6.0), -FRAC_PI_2, w * w, w, Vec2::new(sp, sp), 1, 0.8);
    for u in [a, b] {
        let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
        for k in s..e {
            sim.health[k] = 1.0e9;
        }
    }
    // A HOLDS (no order) — it sets its feet and braces, the high-willingness
    // defender whose grid must stay crisp. B ATTACKS into it. (Two ATTACKING
    // blocks would both be low-willingness and churn at the contact, which is
    // correct — so the no-deform claim is only meaningful for a BRACED block.)
    sim.set_attack_order(b, a);
    let rest_w = (w as f32 - 1.0) * sp; // nominal frontage
    let (mut max_mix, mut max_spread) = (0.0f32, 0.0f32);
    let mut min_gap = f32::INFINITY;
    for step in 0..(secs / DT) as usize {
        sim.tick();
        // The fronts must actually MEET — closest enemy-pair distance. A stiff
        // weave that freezes the units short of contact would otherwise "pass"
        // (no contact = no deform), the textbook false-positive: assert contact.
        min_gap = min_gap.min(closest_pair(&sim, a, b));
        // skip the approach; measure deform once they are in contact.
        if step < (3.0 / DT) as usize {
            continue;
        }
        max_mix = max_mix.max(intermix(&sim, a, b));
        // The HOLDER (a) is the one whose grid must hold.
        let (wx, _) = extent(&sim, a);
        max_spread = max_spread.max(wx - rest_w);
    }
    (max_mix, max_spread, min_gap)
}

/// Smallest distance between any living man of `a` and any of `b`.
fn closest_pair(sim: &Sim, a: usize, b: usize) -> f32 {
    let ua = &sim.units[a];
    let ub = &sim.units[b];
    let bmen: Vec<Vec2> = (ub.start..ub.start + ub.count)
        .filter(|&i| sim.alive[i] == 1)
        .map(|i| sim.soldier_pos(i))
        .collect();
    let mut best = f32::INFINITY;
    for i in ua.start..ua.start + ua.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let p = sim.soldier_pos(i);
        for &q in &bmen {
            best = best.min((p - q).len());
        }
    }
    best
}

#[test]
fn a_braced_block_holds_its_grid_under_a_press() {
    let (mix, spread, gap) = equal_press_deform(14.0);
    eprintln!("BRACED-HOLD  intermix={mix:.2} (0=only fronts touch)  holder_spread={spread:.1}m (0=holds frontage)  min_gap={gap:.1}m (must close to fight)");
    assert!(
        gap < 1.2,
        "the blocks never MET (closest pair {gap:.1}m): a weave so stiff it freezes the advance short of contact is not a pass — the magnet must still close the frontline",
    );
    assert!(
        mix < 0.35 && spread < 2.0,
        "the BRACED holder deformed: intermix {mix:.2} (want <0.35), width spread {spread:.1}m (want <2.0) — a set, willing block must keep its grid under a press",
    );
}
