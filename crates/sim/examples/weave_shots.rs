//! WEAVE vibe shots — a renderer dedicated to the weave tests, kept entirely
//! SEPARATE from the web/melee vibe harness (web/vibe). It reproduces the EXACT
//! setups from `tests/mechanics_weave.rs` (same-team press, invulnerable
//! armies, the T-junction, the Tier-0 perturbations) and dumps a flip-book of
//! PNGs per scenario to `web/vibe/shots/weave/<name>/`. The whole point of the
//! weave layer is to reduce variables, so it gets its own pictures — not mixed
//! in with the full-combat duel shots.
//!
//! Run:  cargo run -p sim --example weave_shots
//! Then flip through web/vibe/shots/weave/<name>/t###.png.

use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;
use std::fs::{create_dir_all, File};
use std::io::BufWriter;

const SEED: u64 = 7;
const W: u32 = 640;
const H: u32 = 640;

// --- a tiny RGB canvas -----------------------------------------------------

struct Canvas {
    buf: Vec<u8>,
}
impl Canvas {
    fn new() -> Self {
        Canvas {
            buf: vec![250u8; (W * H * 3) as usize],
        }
    }
    fn px(&mut self, x: i32, y: i32, c: [u8; 3]) {
        if x < 0 || y < 0 || x >= W as i32 || y >= H as i32 {
            return;
        }
        let i = ((y as u32 * W + x as u32) * 3) as usize;
        self.buf[i] = c[0];
        self.buf[i + 1] = c[1];
        self.buf[i + 2] = c[2];
    }
    fn disc(&mut self, cx: f32, cy: f32, r: f32, c: [u8; 3]) {
        let r = r.max(1.5);
        let ri = r.ceil() as i32;
        let (cxi, cyi) = (cx.round() as i32, cy.round() as i32);
        for dy in -ri..=ri {
            for dx in -ri..=ri {
                if (dx * dx + dy * dy) as f32 <= r * r {
                    self.px(cxi + dx, cyi + dy, c);
                }
            }
        }
    }
    fn write(&self, path: &str) {
        let file = File::create(path).unwrap();
        let mut enc = png::Encoder::new(BufWriter::new(file), W, H);
        enc.set_color(png::ColorType::Rgb);
        enc.set_depth(png::BitDepth::Eight);
        enc.write_header()
            .unwrap()
            .write_image_data(&self.buf)
            .unwrap();
    }
}

// One captured frame: every soldier's position, team and liveness.
struct Frame {
    men: Vec<(f32, f32, u32, bool)>,
}

/// Tick `sim` for `secs`, snapshotting a frame every `step` seconds, then
/// render the flip-book with a single FIXED camera (fit to the whole motion)
/// so the eye reads movement, not a jittering view.
fn shoot(name: &str, mut sim: Sim, secs: f32, step: f32) {
    let dir = format!(
        "{}/../../web/vibe/shots/weave/{}",
        env!("CARGO_MANIFEST_DIR"),
        name
    );
    create_dir_all(&dir).unwrap();
    let mut frames: Vec<Frame> = Vec::new();
    let steps = (secs / step).round() as usize;
    let per = (step / DT).round() as usize;
    for s in 0..=steps {
        let mut men = Vec::new();
        for u in sim.units.iter() {
            for i in u.start..u.start + u.count {
                let p = sim.soldier_pos(i);
                men.push((p.x, p.y, u.team, sim.alive[i] == 1));
            }
        }
        frames.push(Frame { men });
        if s < steps {
            for _ in 0..per {
                sim.tick();
            }
        }
    }
    // Fixed camera: bounds over all LIVE men across all frames.
    let (mut lo_x, mut hi_x, mut lo_y, mut hi_y) = (
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::INFINITY,
        f32::NEG_INFINITY,
    );
    for f in &frames {
        for &(x, y, _, a) in &f.men {
            if a {
                lo_x = lo_x.min(x);
                hi_x = hi_x.max(x);
                lo_y = lo_y.min(y);
                hi_y = hi_y.max(y);
            }
        }
    }
    let cx = 0.5 * (lo_x + hi_x);
    let cy = 0.5 * (lo_y + hi_y);
    let span = (hi_x - lo_x).max(hi_y - lo_y) * 1.12 + 3.0;
    let scale = W as f32 / span;
    let to_px = |x: f32, y: f32| -> (f32, f32) {
        (
            (x - cx) * scale + W as f32 * 0.5,
            // flip y so north (+y) is up
            H as f32 * 0.5 - (y - cy) * scale,
        )
    };
    let r = (0.33 * scale).max(2.0);
    let team_col = |t: u32, alive: bool| -> [u8; 3] {
        match (t, alive) {
            (0, true) => [50, 90, 210],    // team 0 blue
            (1, true) => [210, 70, 55],    // team 1 red
            (_, false) => [205, 205, 205], // a fallen man, grey
            _ => [120, 120, 120],
        }
    };
    for (s, f) in frames.iter().enumerate() {
        let mut cv = Canvas::new();
        for &(x, y, t, a) in &f.men {
            if !a {
                continue;
            }
            let (sx, sy) = to_px(x, y);
            cv.disc(sx, sy, r, team_col(t, a));
        }
        cv.write(&format!("{}/t{:03}.png", dir, s));
    }
    println!(
        "  {} → {} frames  (web/vibe/shots/weave/{}/)",
        name,
        frames.len(),
        name
    );
}

// --- scenario builders (mirror tests/mechanics_weave.rs) -------------------

fn base_tun() -> Tunables {
    let mut t = Tunables::default();
    t.micro_rough = 0.0;
    t.morale_enabled = false;
    t
}

fn spawn(
    sim: &mut Sim,
    x: f32,
    y: f32,
    face: f32,
    files: usize,
    ranks: usize,
    sp: f32,
    team: u32,
) -> usize {
    sim.spawn_unit(
        Vec2::new(x, y),
        face,
        files * ranks,
        files,
        Vec2::new(sp, sp),
        team,
        0.8,
    )
}

fn settle(sim: &mut Sim, n: usize) {
    for _ in 0..n {
        sim.tick();
    }
}

fn invuln(sim: &mut Sim) {
    for h in sim.health.iter_mut() {
        *h = 1.0e9;
    }
}

// Tier-0 perturbations (write world positions directly).
fn scale_x(sim: &mut Sim, u: usize, k: f32) {
    let cx = sim.units[u].centroid.x;
    let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
    for i in s..e {
        sim.positions[2 * i] = cx + (sim.positions[2 * i] - cx) * k;
    }
}
fn scale_y(sim: &mut Sim, u: usize, k: f32) {
    let cy = sim.units[u].centroid.y;
    let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
    for i in s..e {
        sim.positions[2 * i + 1] = cy + (sim.positions[2 * i + 1] - cy) * k;
    }
}
fn shear(sim: &mut Sim, u: usize, k: f32) {
    let cy = sim.units[u].centroid.y;
    let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
    for i in s..e {
        sim.positions[2 * i] += k * (sim.positions[2 * i + 1] - cy);
    }
}
fn bend(sim: &mut Sim, u: usize, amp: f32) {
    let cx = sim.units[u].centroid.x;
    let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
    let mut hw = 0.01f32;
    for i in s..e {
        hw = hw.max((sim.positions[2 * i] - cx).abs());
    }
    for i in s..e {
        let t = (sim.positions[2 * i] - cx) / hw;
        sim.positions[2 * i + 1] += amp * t * t;
    }
}
fn wrap_u(sim: &mut Sim, u: usize, span: f32) {
    let files = sim.units[u].files_eff.max(1);
    let sp = sim.units[u].spacing.y;
    let cx = sim.units[u].centroid.x;
    let cy = sim.units[u].centroid.y;
    let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
    let mut hw = 0.5f32;
    for i in s..e {
        hw = hw.max((sim.positions[2 * i] - cx).abs());
    }
    let radius = hw / (span * 0.5).max(0.1);
    for i in s..e {
        let slot = sim.soldier_slot[i] as usize;
        let (file, rank) = (slot % files, slot / files);
        let t = (file as f32 / (files.max(2) - 1) as f32) * 2.0 - 1.0;
        let a = t * span * 0.5;
        let rr = radius + rank as f32 * sp;
        sim.positions[2 * i] = cx + rr * a.sin();
        sim.positions[2 * i + 1] = cy + rr * (1.0 - a.cos());
    }
}
fn kill_to(sim: &mut Sim, u: usize, target: usize) {
    let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
    for i in (s..e).rev() {
        if sim.units[u].alive_count <= target {
            break;
        }
        if sim.alive[i] == 1 {
            sim.kill(i);
        }
    }
}

fn main() {
    println!("rendering weave vibe shots → web/vibe/shots/weave/");

    // HELD line (north, no order) vs a WALKING attacker (south) — does the held
    // front lean in to MEET the press (David's "holders fight back"), and is the
    // grind even, or does the holder collapse? (a_held_braced.)
    {
        let mut sim = Sim::new(base_tun(), 146);
        let atk = sim.spawn_unit(
            Vec2::new(0.0, -12.0),
            FRAC_PI_2,
            240,
            20,
            Vec2::new(1.0, 1.2),
            0,
            0.7,
        );
        let def = sim.spawn_unit(
            Vec2::new(0.0, 12.0),
            -FRAC_PI_2,
            240,
            20,
            Vec2::new(1.0, 1.2),
            1,
            0.7,
        );
        sim.units[atk].stats = sim::class_stats(UnitClassId::HeavySword);
        sim.units[def].stats = sim::class_stats(UnitClassId::HeavySword);
        sim.set_pace(atk, Pace::Walk);
        sim.set_attack_order(atk, def);
        shoot("held-vs-walk", sim, 24.0, 1.0);
    }

    // NARROW COLUMN (south, Run, ordered THROUGH and out the back) vs a WIDE HELD
    // line (north, no order). Does the held line FOLD on the breach, or does the
    // lean pull its front apart so the column splits it like a curtain?
    {
        let mut sim = Sim::new(base_tun(), 11);
        let _line = sim.spawn_class_with_files(
            Vec2::new(0.0, 13.0),
            -FRAC_PI_2,
            280,
            70,
            UnitClassId::HeavySword,
            1,
        );
        let col = sim.spawn_class_with_files(
            Vec2::new(0.0, -25.0),
            FRAC_PI_2,
            128,
            8,
            UnitClassId::HeavySword,
            0,
        );
        sim.set_pace(col, Pace::Run);
        sim.set_attack_move_order(col, Vec2::new(0.0, 60.0));
        shoot("column-vs-held", sim, 40.0, 0.6);
    }

    // --- Tier 0: one unit, perturb then let the springs restore it ----------
    let perturb_secs = 7.0;
    {
        let mut tun = base_tun();
        tun.slot_pull_hold = tun.slot_pull;
        let mut sim = Sim::new(tun, SEED);
        let u = spawn(&mut sim, 0.0, 0.0, FRAC_PI_2, 10, 5, 1.0, 0);
        settle(&mut sim, 30);
        scale_x(&mut sim, u, 1.6);
        shoot("t0-stretch", sim, perturb_secs, 0.3);
    }
    {
        let mut tun = base_tun();
        tun.slot_pull_hold = tun.slot_pull;
        let mut sim = Sim::new(tun, SEED);
        let u = spawn(&mut sim, 0.0, 0.0, FRAC_PI_2, 8, 6, 1.0, 0);
        settle(&mut sim, 30);
        scale_y(&mut sim, u, 0.6);
        shoot("t0-compress", sim, perturb_secs, 0.3);
    }
    {
        let mut tun = base_tun();
        tun.slot_pull_hold = tun.slot_pull;
        let mut sim = Sim::new(tun, SEED);
        let u = spawn(&mut sim, 0.0, 0.0, FRAC_PI_2, 24, 3, 1.0, 0);
        settle(&mut sim, 30);
        bend(&mut sim, u, 3.0);
        shoot("t0-bend", sim, perturb_secs, 0.3);
    }
    {
        let mut tun = base_tun();
        tun.slot_pull_hold = tun.slot_pull;
        let mut sim = Sim::new(tun, SEED);
        let u = spawn(&mut sim, 0.0, 0.0, FRAC_PI_2, 10, 5, 1.0, 0);
        settle(&mut sim, 30);
        shear(&mut sim, u, 1.0);
        shoot("t0-shear", sim, perturb_secs, 0.3);
    }
    {
        // A line yanked into a U springs back flat (the pivot spring).
        let mut tun = base_tun();
        tun.slot_pull_hold = tun.slot_pull;
        let mut sim = Sim::new(tun, SEED);
        let u = spawn(&mut sim, 0.0, 0.0, FRAC_PI_2, 24, 3, 1.0, 0);
        settle(&mut sim, 30);
        wrap_u(&mut sim, u, std::f32::consts::PI);
        shoot("t0-uwrap", sim, perturb_secs, 0.3);
    }
    {
        // A dying block sheds depth, then width — the 3-deep reshape.
        let mut tun = base_tun();
        tun.slot_pull_hold = tun.slot_pull;
        let mut sim = Sim::new(tun, SEED);
        let u = spawn(&mut sim, 0.0, 0.0, FRAC_PI_2, 12, 8, 1.0, 0);
        settle(&mut sim, 30);
        kill_to(&mut sim, u, 30);
        shoot("t0-death", sim, perturb_secs, 0.3);
    }

    // --- Tier 1: same-team press (compression), slide off, walk -------------
    {
        let mut tun = base_tun();
        tun.separation_slide = 0.0;
        let mut sim = Sim::new(tun, SEED);
        let a = spawn(&mut sim, 0.0, -10.0, FRAC_PI_2, 10, 10, 1.0, 0);
        let _b = spawn(&mut sim, 0.0, 2.0, FRAC_PI_2, 10, 8, 1.0, 0);
        settle(&mut sim, 30);
        sim.set_pace(a, Pace::Walk);
        sim.set_move_order(a, Vec2::new(0.0, 30.0));
        shoot("t1-press", sim, 16.0, 0.5);
    }

    // --- Tier 2: enemies, magnet, invulnerable -----------------------------
    // Attacking line WRAPS the column.
    {
        let mut sim = Sim::new(base_tun(), SEED);
        let line = spawn(&mut sim, 0.0, -8.0, FRAC_PI_2, 18, 3, 1.0, 0);
        let col = spawn(&mut sim, 0.0, 6.0, -FRAC_PI_2, 3, 18, 1.0, 1);
        settle(&mut sim, 30);
        invuln(&mut sim);
        sim.set_pace(line, Pace::Walk);
        sim.set_attack_order(line, col);
        shoot("t2-wrap-attack", sim, 14.0, 0.5);
    }
    // Same line in CONTACT but merely HOLDING — the spring-magnet glues its
    // front to the column at weapon's length, the stiff hold-slots keep its
    // grid: it touches but does NOT wrap.
    {
        let mut sim = Sim::new(base_tun(), SEED);
        let _line = spawn(&mut sim, 0.0, 0.5, FRAC_PI_2, 18, 3, 1.0, 0);
        let _col = spawn(&mut sim, 0.0, 6.0, -FRAC_PI_2, 3, 18, 1.0, 1);
        settle(&mut sim, 30);
        invuln(&mut sim);
        shoot("t2-wrap-hold", sim, 14.0, 0.5);
    }
    // Full 1v1, both attack, glue at contact (no death).
    {
        let mut sim = Sim::new(base_tun(), SEED);
        let a = spawn(&mut sim, 0.0, -8.0, FRAC_PI_2, 12, 6, 1.0, 0);
        let b = spawn(&mut sim, 0.0, 8.0, -FRAC_PI_2, 12, 6, 1.0, 1);
        settle(&mut sim, 30);
        invuln(&mut sim);
        sim.set_pace(a, Pace::Walk);
        sim.set_pace(b, Pace::Walk);
        sim.set_attack_order(a, b);
        sim.set_attack_order(b, a);
        shoot("t2-glue-1v1", sim, 16.0, 0.5);
    }
    // T-junction, stem in CONTACT but HOLDING: the spring-magnet glues its tip
    // to the bar, stiff hold-slots keep both shapes — touches, does not merge.
    {
        let mut sim = Sim::new(base_tun(), SEED);
        let _a = spawn(&mut sim, 0.0, 0.0, FRAC_PI_2, 16, 4, 1.0, 0);
        let _b = spawn(&mut sim, 0.0, 3.5, -FRAC_PI_2, 3, 12, 1.0, 1);
        settle(&mut sim, 30);
        invuln(&mut sim);
        shoot("t2-t-hold", sim, 14.0, 0.5);
    }
    // T-junction, stem ATTACKS: loose attack-slots let it drape along the bar.
    {
        let mut sim = Sim::new(base_tun(), SEED);
        let a = spawn(&mut sim, 0.0, 0.0, FRAC_PI_2, 16, 4, 1.0, 0);
        let b = spawn(&mut sim, 0.0, 6.0, -FRAC_PI_2, 3, 12, 1.0, 1);
        settle(&mut sim, 30);
        invuln(&mut sim);
        sim.set_pace(b, Pace::Walk);
        sim.set_attack_order(b, a);
        shoot("t2-t-attack", sim, 16.0, 0.5);
    }

    // --- Tier 3: the GLUE under a deep push -------------------------------
    // A deep column drives a SHALLOWER SAME-WIDTH line: the fronts must stay
    // welded (glued 1-to-1) and the line is pushed back as a body — the column
    // must NOT detach and thread through it. Both 4 files wide (the engine won't
    // hold a line thinner than 3 ranks, so the defender is 4x3, not 4x2).
    // (mechanics_weave: the_fronts_stay_welded.)
    {
        let mut sim = Sim::new(base_tun(), SEED);
        let def = spawn(&mut sim, 0.0, 6.0, -FRAC_PI_2, 4, 3, 0.9, 0);
        let col = spawn(&mut sim, 0.0, -6.0, FRAC_PI_2, 4, 8, 0.9, 1);
        settle(&mut sim, 30);
        invuln(&mut sim);
        sim.set_pace(col, Pace::Run);
        sim.set_attack_order(col, def);
        shoot("t3-deep-push-thin", sim, 16.0, 0.5);
    }
    // Two EQUAL immortal blocks both attack: they must press front-to-front and
    // HOLD their grid (only the front rank touches), not splay or blend. The
    // gate for weave_stiffness + pivot_stiffness.
    {
        let mut sim = Sim::new(base_tun(), SEED);
        let a = spawn(&mut sim, 0.0, -6.0, FRAC_PI_2, 6, 6, 1.0, 0);
        let b = spawn(&mut sim, 0.0, 6.0, -FRAC_PI_2, 6, 6, 1.0, 1);
        settle(&mut sim, 30);
        invuln(&mut sim);
        sim.set_attack_order(a, b);
        sim.set_attack_order(b, a);
        shoot("t3-equal-press", sim, 14.0, 0.5);
    }
    // The same column into a WIDE (10-file) line: it pushes the centre back
    // less, and the line's FLANKS curl in around the bulge the column digs.
    {
        let mut sim = Sim::new(base_tun(), SEED);
        let line = spawn(&mut sim, 0.0, 6.0, -FRAC_PI_2, 10, 3, 0.9, 0);
        let col = spawn(&mut sim, 0.0, -6.0, FRAC_PI_2, 4, 8, 0.9, 1);
        settle(&mut sim, 30);
        invuln(&mut sim);
        sim.set_pace(col, Pace::Run);
        sim.set_attack_order(col, line);
        shoot("t3-deep-push-wide", sim, 16.0, 0.5);
    }

    // --- Tier 3: a CAVALRY charge into a heavy block ----------------------
    // Shock cavalry (a trampler) charges a holding HeavySword block. A committed
    // charge should ride IN a few ranks (bowling men out of the weave), then bog
    // and be pinned — not bounce off a too-rigid formation.
    {
        let mut sim = Sim::new(base_tun(), SEED);
        let block = sim.spawn_class(
            Vec2::new(0.0, 0.0),
            -FRAC_PI_2,
            6 * 8,
            UnitClassId::HeavySword,
            1,
        );
        let cav = sim.spawn_class(
            Vec2::new(0.0, -32.0),
            FRAC_PI_2,
            60,
            UnitClassId::ShockCavalry,
            0,
        );
        settle(&mut sim, 30);
        sim.set_pace(cav, Pace::Run);
        sim.set_attack_order(cav, block);
        shoot("t3-cav-v-heavy", sim, 13.0, 0.4);
    }

    // WIDE thin line (70 wide, 3 deep) vs a NARROW deep block (12 wide, 10 deep):
    // does the wide line WRAP the block (flanks curl around its sides) or pour
    // straight THROUGH it? (a_wide_line_wraps_a_narrow_block.)
    {
        let mut sim = Sim::new(base_tun(), 11);
        let block = sim.spawn_class_with_files(
            Vec2::new(0.0, 13.0),
            -FRAC_PI_2,
            120,
            12,
            UnitClassId::HeavySword,
            1,
        );
        let line = sim.spawn_class_with_files(
            Vec2::new(0.0, -13.0),
            FRAC_PI_2,
            210,
            70,
            UnitClassId::HeavySword,
            0,
        );
        sim.set_pace(line, Pace::Run);
        sim.set_attack_order(line, block);
        shoot("t3-wide-wrap", sim, 60.0, 2.0);
    }

    // NARROW DEEP column (8 wide, 16 deep) ordered THROUGH a WIDE held line (70
    // wide, 4 deep): does the column BULGE the line (dimple, line holds) or PART
    // it and walk through? (a_column_bulges_a_held_line_it_does_not_part_it.)
    {
        let mut sim = Sim::new(base_tun(), 11);
        let _line = sim.spawn_class_with_files(
            Vec2::new(0.0, 13.0),
            -FRAC_PI_2,
            280,
            70,
            UnitClassId::HeavySword,
            1,
        );
        let col = sim.spawn_class_with_files(
            Vec2::new(0.0, -25.0),
            FRAC_PI_2,
            128,
            8,
            UnitClassId::HeavySword,
            0,
        );
        invuln(&mut sim);
        sim.set_pace(col, Pace::Run);
        sim.set_attack_move_order(col, Vec2::new(0.0, 60.0));
        shoot("t3-col-bulge", sim, 30.0, 1.5);
    }

    // PHALANX vs HEAVY head-on: an asymmetric matchup (long reach vs short) — does
    // it grind head-on or WHEEL 90 deg (swirl)? (phalanx_and_heavy_clash_without_swirling.)
    {
        let mut sim = Sim::new(base_tun(), 4242);
        let bot = sim.spawn_class(
            Vec2::new(0.0, -13.0),
            FRAC_PI_2,
            120,
            UnitClassId::Phalanx,
            0,
        );
        let top = sim.spawn_class(
            Vec2::new(0.0, 13.0),
            -FRAC_PI_2,
            120,
            UnitClassId::HeavySword,
            1,
        );
        sim.set_pace(bot, Pace::Run);
        sim.set_pace(top, Pace::Run);
        sim.set_attack_order(bot, top);
        sim.set_attack_order(top, bot);
        shoot("t3-phalanx-heavy", sim, 60.0, 2.0);
    }

    // TWO BRACED POLE WALLS (10-deep, blunt braced pikes) shove head-on: do they
    // HOLD at the points, or pancake/merge? (two_braced_walls_hold_a_standoff.)
    {
        let mut sim = Sim::new(base_tun(), 7);
        let pike = sim::Weapon {
            reach: 3.5,
            min_range: 1.1,
            arc: 0.08,
            attack_interval: 1.4,
            damage: 0.0,
            braced: true,
        };
        let south = sim.spawn_unit(
            Vec2::new(0.0, -25.0),
            FRAC_PI_2,
            200,
            20,
            Vec2::new(0.8, 1.0),
            0,
            0.85,
        );
        let north = sim.spawn_unit(
            Vec2::new(0.0, 25.0),
            -FRAC_PI_2,
            200,
            20,
            Vec2::new(0.8, 1.0),
            1,
            0.85,
        );
        for &u in &[south, north] {
            sim.units[u].stats.weapons = sim::class::one(pike);
        }
        sim.set_pace(south, Pace::Run);
        sim.set_pace(north, Pace::Run);
        sim.set_attack_order(south, north);
        sim.set_attack_order(north, south);
        shoot("t3-braced-walls", sim, 80.0, 3.0);
    }

    // 180-deg IN-PLACE PIVOT: a 200-man block (20x10) marching +x is reversed to
    // -x. Does it rotate as a coherent block or SMEAR? (large_turns_pivot.) Start
    // the shot AT the reversal so the flip-book is the pivot itself.
    {
        let mut sim = Sim::new(base_tun(), 42);
        let u = sim.spawn_unit(
            Vec2::new(0.0, 0.0),
            0.0,
            200,
            20,
            Vec2::new(1.0, 1.2),
            0,
            0.7,
        );
        sim.set_move_order(u, Vec2::new(40.0, 0.0));
        for _ in 0..(10.0 / DT) as usize {
            sim.tick();
        }
        sim.set_move_order(u, Vec2::new(-60.0, 0.0));
        shoot("t3-pivot-180", sim, 24.0, 1.0);
    }

    println!("done.");
}
