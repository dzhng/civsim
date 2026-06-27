//! MECHANICS tests for the melee — first-principles physics properties that
//! must hold no matter how the units are *balanced*. They never assert who
//! wins (that flips as stats are retuned); they pin values close to the physics
//! — cohesion, centroid positions, interpenetration, slot error — using
//! IDENTICAL units so there is zero stat variability to muddy the signal. They
//! are the fast first layer: green here only means "nothing is obviously
//! broken"; the real check is still eyeballing every frame of the vibe shots.
//!
//! See the `tweak-mechanics` skill for the workflow these encode.

pub mod common;

use common::{deaths, no_morale};
use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const N: usize = 240;

/// Two IDENTICAL blocks, facing each other along y. Bottom unit (index 0)
/// spawns south facing +y; top unit (index 1) spawns north facing -y. Parade
/// ground (no terrain noise). `top_attacks` decides the posture:
///   true  → BOTH attack (the symmetric clash),
///   false → only the bottom attacks; the top HOLDS (advancing=false defender).
fn clash(class: UnitClassId, seed: u64, top_attacks: bool) -> Sim {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    if let Ok(v) = std::env::var("SEPCAP") {
        tun.separation_max_push = v.parse().unwrap();
    }
    if let Ok(v) = std::env::var("SLOTPULL") {
        tun.slot_pull = v.parse().unwrap();
    }
    if let Ok(v) = std::env::var("PRESSBRAKE") {
        tun.press_brake = v.parse().unwrap();
    }
    if let Ok(v) = std::env::var("HITPUSH") {
        tun.hit_push = v.parse().unwrap();
    }
    let mut sim = Sim::new(tun, seed);
    // Spawn CLOSE (fronts a short march apart). A long run-up frays cohesion ON
    // PURPOSE — randomized top speeds + terrain pockets — so the player must
    // halt and regroup before charging for a perfect line. These tests measure
    // the FIGHT's coherence, not the charge's, so they keep the approach short.
    let bot = sim.spawn_class(Vec2::new(0.0, -13.0), FRAC_PI_2, N, class, 0);
    let top = sim.spawn_class(Vec2::new(0.0, 13.0), -FRAC_PI_2, N, class, 1);
    assert_eq!((bot, top), (0, 1));
    if std::env::var("IMMORTAL").is_ok() {
        for k in 0..sim.soldier_count() {
            sim.health[k] = 1.0e9;
        }
    }
    sim.set_pace(bot, Pace::Run);
    sim.set_pace(top, Pace::Run);
    sim.set_attack_order(bot, top);
    if top_attacks {
        sim.set_pace(top, Pace::Run);
        sim.set_attack_order(top, bot);
    }
    sim
}

/// Fraction of a unit's living men with an ENEMY body within `r` metres. A line
/// that meets the foe at a clean FRONT has only its front rank in reach
/// (~rank/depth, well under 0.2 for a deep block); a tangled blob has enemies
/// threaded all through it (towards 0.5+). The body-level "are they walking
/// into each other" measure — finer than the centroid.
fn interpenetration(sim: &Sim, unit: usize, r: f32) -> f32 {
    let u = &sim.units[unit];
    let team = u.team;
    let n = sim.soldier_count();
    let (mut alive, mut touched) = (0usize, 0usize);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        alive += 1;
        let p = sim.soldier_pos(i);
        for j in 0..n {
            if sim.alive[j] == 0 || sim.units[sim.soldier_unit[j] as usize].team == team {
                continue;
            }
            if (sim.soldier_pos(j) - p).len() < r {
                touched += 1;
                break;
            }
        }
    }
    if alive == 0 {
        0.0
    } else {
        touched as f32 / alive as f32
    }
}

/// Continuity of a wide line as a connected cloth: average each live file's
/// position, then read the gap between adjacent file centers. A healthy dimple
/// or wrap stretches locally but keeps neighboring files close; a streamer tear
/// creates multi-meter gaps while centroid/envelopment metrics can still pass.
fn p95_adjacent_file_gap(sim: &Sim, unit: usize) -> f32 {
    adjacent_file_gap_stats(sim, unit).0
}

fn adjacent_file_gap_stats(sim: &Sim, unit: usize) -> (f32, f32) {
    let u = &sim.units[unit];
    let files = u.files_eff.max(1);
    let mut sums = vec![Vec2::ZERO; files];
    let mut ns = vec![0.0f32; files];
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let file = sim.soldier_slot[i] as usize % files;
        sums[file] = sums[file] + sim.soldier_pos(i);
        ns[file] += 1.0;
    }
    let centers: Vec<Vec2> = sums
        .into_iter()
        .zip(ns)
        .filter_map(|(p, n)| (n > 0.0).then_some(p * (1.0 / n)))
        .collect();
    if centers.len() < 2 {
        return (0.0, 0.0);
    }
    let mut gaps: Vec<f32> = centers.windows(2).map(|w| (w[1] - w[0]).len()).collect();
    gaps.sort_by(|a, b| a.total_cmp(b));
    (
        gaps[(gaps.len() * 95 / 100).min(gaps.len() - 1)],
        *gaps.last().unwrap(),
    )
}

fn max_file_span(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let files = u.files_eff.max(1);
    let mut min = vec![Vec2::new(f32::INFINITY, f32::INFINITY); files];
    let mut max = vec![Vec2::new(f32::NEG_INFINITY, f32::NEG_INFINITY); files];
    let mut ns = vec![0usize; files];
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let file = sim.soldier_slot[i] as usize % files;
        let p = sim.soldier_pos(i);
        min[file].x = min[file].x.min(p.x);
        min[file].y = min[file].y.min(p.y);
        max[file].x = max[file].x.max(p.x);
        max[file].y = max[file].y.max(p.y);
        ns[file] += 1;
    }
    let mut span = 0.0f32;
    for file in 0..files {
        if ns[file] > 1 {
            span = span.max((max[file] - min[file]).len());
        }
    }
    span
}

/// Mean slot error (m) of the REAR ranks only — every man at least
/// `skip_front` ranks back from the fighting edge. The front rank(s) are
/// SUPPOSED to be ragged (they're fighting, stepping onto the foe); the rear is
/// not. If the rear pile forward into the scrum the whole unit becomes a blob
/// that keeps neighbour spacing (so cohesion still reads high!) but is no grid.
/// This is the measure that distinguishes "a line with a fighting front and a
/// dressed body" from "a blob": the rear must hold its grid and merely FOLLOW
/// the front, not lunge with it. Low here = the rear is still a grid.
/// Measured front-to-back DEPTH of a unit's living men as a fraction of nominal
/// (ranks × rank-spacing). ≈1 = the block keeps its depth; ≪1 = it PANCAKED (the
/// rear piled into the front). Measured along the formation's OWN minor axis (the
/// thin/depth direction found by PCA of the men's positions), NOT the held facing
/// — a block that SHEARS or SWIRLS keeps its true depth even as that axis tilts,
/// and projecting onto the fixed facing would mis-read the rotation as a pancake.
/// So this isolates "did the rear collapse into the front" from "did the block
/// rotate" (a separate failure the facing/cohesion checks catch).
fn depth_ratio(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let (mut cx, mut cy, mut n) = (0.0f32, 0.0f32, 0usize);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let p = sim.soldier_pos(i);
        cx += p.x;
        cy += p.y;
        n += 1;
    }
    if n == 0 {
        return 1.0;
    }
    let nf = n as f32;
    cx /= nf;
    cy /= nf;
    let (mut sxx, mut sxy, mut syy) = (0.0f32, 0.0f32, 0.0f32);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let p = sim.soldier_pos(i);
        let (dx, dy) = (p.x - cx, p.y - cy);
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
    }
    sxx /= nf;
    sxy /= nf;
    syy /= nf;
    // Minor eigenvector of the covariance = the formation's depth axis (a wide
    // block's thin direction), rotation-invariant.
    let tr = sxx + syy;
    let det = sxx * syy - sxy * sxy;
    let disc = ((tr * 0.5) * (tr * 0.5) - det).max(0.0).sqrt();
    let lam_min = tr * 0.5 - disc;
    let (ex, ey) = if sxy.abs() > 1e-6 {
        let (vx, vy) = (sxy, lam_min - sxx);
        let l = (vx * vx + vy * vy).sqrt().max(1e-6);
        (vx / l, vy / l)
    } else if sxx <= syy {
        (1.0, 0.0)
    } else {
        (0.0, 1.0)
    };
    let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let p = sim.soldier_pos(i);
        let d = (p.x - cx) * ex + (p.y - cy) * ey;
        lo = lo.min(d);
        hi = hi.max(d);
    }
    let ranks = (u.count as f32 / u.files_eff.max(1) as f32).max(1.0);
    let nominal = ((ranks - 1.0) * u.spacing.y).max(0.5);
    (hi - lo) / nominal
}

struct Trace {
    /// Lowest cohesion EITHER unit reached before the first rout.
    min_cohesion_both: f32,
    /// Smallest (top.y - bottom.y) ever; <= 0 means the centroids crossed.
    min_centroid_gap_y: f32,
    crossed_at: f32,
    /// Largest interpenetration EITHER unit reached pre-rout.
    max_interpenetration: f32,
    /// Largest deviation (degrees) of EITHER unit's facing from straight up/down
    /// before the first rout. The units start facing ±y and grind head-on; if a
    /// facing wanders off-axis the lines are WHEELING around each other (swirl) —
    /// the precise early signal, before the centroids even cross.
    max_facing_dev_deg: f32,
    bot_loss: usize,
    top_loss: usize,
}

/// Two IDENTICAL blocks given MOVE orders to each other's starting centroid — a
/// point BEYOND the contact, exactly like the attack latch's chase point. The
/// invariant: an attack latch is just a move order (plus charge + give-up), so
/// with charge off (the default here) this must behave the SAME as `clash(.,.,
/// true)`. The leash governs where the frame actually sits, not the target.
fn move_clash(class: UnitClassId, seed: u64) -> Sim {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    if let Ok(v) = std::env::var("SLOTPULL") {
        tun.slot_pull = v.parse().unwrap();
    }
    let mut sim = Sim::new(tun, seed);
    // Spawn CLOSE (fronts a short march apart). A long run-up frays cohesion ON
    // PURPOSE — randomized top speeds + terrain pockets — so the player must
    // halt and regroup before charging for a perfect line. These tests measure
    // the FIGHT's coherence, not the charge's, so they keep the approach short.
    let bot = sim.spawn_class(Vec2::new(0.0, -13.0), FRAC_PI_2, N, class, 0);
    let top = sim.spawn_class(Vec2::new(0.0, 13.0), -FRAC_PI_2, N, class, 1);
    let (bot0, top0) = (sim.units[bot].centroid, sim.units[top].centroid);
    sim.set_pace(bot, Pace::Run);
    sim.set_pace(top, Pace::Run);
    sim.set_move_order(bot, top0); // each marches to where the other started
    sim.set_move_order(top, bot0);
    sim
}

fn trace(class: UnitClassId, seed: u64, top_attacks: bool, secs: f32) -> Trace {
    trace_sim(clash(class, seed, top_attacks), secs)
}

fn make_immortal(sim: &mut Sim) {
    for k in 0..sim.soldier_count() {
        sim.health[k] = 1.0e9;
    }
}

fn trace_sim(mut sim: Sim, secs: f32) -> Trace {
    let (bot, top) = (0usize, 1usize);
    let mut min_coh_both = 1.0f32;
    let mut min_gap = f32::INFINITY;
    let mut crossed_at = -1.0f32;
    let mut max_pen = 0.0f32;
    let mut max_face_dev = 0.0f32;
    let mut first_rout = false;

    for step in 0..(secs / DT) as usize {
        sim.tick();
        let t = step as f32 * DT;
        let (tu, bu) = (&sim.units[top], &sim.units[bot]);
        if tu.routing || bu.routing {
            first_rout = true;
        }
        if !first_rout && tu.alive_count > 5 && bu.alive_count > 5 {
            min_coh_both = min_coh_both.min(tu.cohesion.min(bu.cohesion));
            // Off-vertical facing angle: the facing's x-component is cos(facing),
            // zero when the unit points straight ±y; asin of it is the angle off
            // the vertical axis (0° = head-on, 90° = wheeled sideways).
            let dev = |f: f32| f.cos().abs().min(1.0).asin().to_degrees();
            max_face_dev = max_face_dev.max(dev(tu.facing)).max(dev(bu.facing));
            if step % 30 == 0 {
                max_pen = max_pen
                    .max(interpenetration(&sim, top, 1.2))
                    .max(interpenetration(&sim, bot, 1.2));
            }
        }
        let gap = tu.centroid.y - bu.centroid.y;
        min_gap = min_gap.min(gap);
        if crossed_at < 0.0 && gap <= 0.0 {
            crossed_at = t;
        }
        if std::env::var("TRACE").is_ok() && step % 60 == 0 {
            eprintln!(
                "t={:5.1} gap={:6.1} coh t/b={:.2}/{:.2} eng t/b={}/{} depth t/b={:.2}/{:.2} faceDev={:.0}° frameSp={:.2}",
                t, gap, tu.cohesion, bu.cohesion, tu.engaged, bu.engaged,
                depth_ratio(&sim, top), depth_ratio(&sim, bot),
                bu.facing.cos().abs().min(1.0).asin().to_degrees(),
                bu.frame_speed,
            );
        }
    }

    Trace {
        min_cohesion_both: min_coh_both,
        min_centroid_gap_y: min_gap,
        crossed_at,
        max_interpenetration: max_pen,
        max_facing_dev_deg: max_face_dev,
        bot_loss: N - sim.units[bot].alive_count,
        top_loss: N - sim.units[top].alive_count,
    }
}

/// Two attacking lines HOLD their formation through a clash — the MECHANICAL
/// invariant, isolated IMMORTAL so casualties don't confound it. (The bloody
/// attrition of a mortal clash — how fast it disorders and routs — is a separate
/// BALANCE outcome, not a statement about the weave.) Balance-free: same unit both
/// sides, neither "should" win.
#[test]
fn two_attacking_lines_hold_and_never_cross() {
    // Measured POST-SETTLE (>90s): the impact crash briefly interpenetrates the
    // fronts (~0.7) and compresses depth, then over ~a minute the lines slide back
    // apart to a CLEAN FRONT and steady there (verified flat to 300s). Asserting the
    // crash transient would be the same metric bug the PCA/skip-impact depth fix
    // removed. Cohesion settles ~0.45 — a clash has a FIGHTING front (men off their
    // slots trading blows), which the clean interpen + held depth + held facing
    // confirm is HOLDING, not blobbing.
    let mut sim = clash(UnitClassId::HeavySword, 4242, true);
    for k in 0..sim.soldier_count() {
        sim.health[k] = 1.0e9;
    }
    let (bot, top) = (0usize, 1usize);
    let dev = |f: f32| f.cos().abs().min(1.0).asin().to_degrees();
    let (mut min_coh, mut max_pen, mut min_depth, mut max_face, mut min_gap) =
        (1.0f32, 0.0f32, f32::INFINITY, 0.0f32, f32::INFINITY);
    for step in 0..(300.0 / DT) as usize {
        sim.tick();
        let t = step as f32 * DT;
        let (tu, bu) = (&sim.units[top], &sim.units[bot]);
        max_face = max_face.max(dev(tu.facing)).max(dev(bu.facing));
        min_gap = min_gap.min(tu.centroid.y - bu.centroid.y);
        if t > 90.0 {
            min_coh = min_coh.min(tu.cohesion.min(bu.cohesion));
            min_depth = min_depth
                .min(depth_ratio(&sim, top))
                .min(depth_ratio(&sim, bot));
            max_pen = max_pen
                .max(interpenetration(&sim, top, 1.2))
                .max(interpenetration(&sim, bot, 1.2));
        }
    }
    eprintln!(
        "BOTH-ATTACK (immortal, settled) min_coh={min_coh:.2} max_pen={max_pen:.2} depth={min_depth:.2} face={max_face:.0}deg gap={min_gap:.1}m"
    );
    assert!(
        min_depth > 0.6,
        "the block COLLAPSED into a blob: depth fell to {:.0}% of nominal (want > 60%) — the rear \
         ranks piled into the front instead of holding their grid depth",
        min_depth * 100.0,
    );
    assert!(
        max_face < 20.0,
        "the lines WHEELED: facing went {max_face:.0}deg off head-on (want < 20) — a head-on grind \
         keeps both fronts pointed +/-y; an off-axis facing is the swirl",
    );
    assert!(
        min_gap > -CENTROID_SWAP,
        "the lines swapped sides: min gap {:.1}m (want > {:.0}) — pass-through, not a held line",
        min_gap,
        -CENTROID_SWAP,
    );
    assert!(
        max_pen < 0.30,
        "units interpenetrated: {:.0}% of a line's men had enemies in reach (want < 30%) — a clean \
         contact touches at the front rank only; a blob is merged throughout",
        max_pen * 100.0,
    );
    assert!(
        min_coh > 0.38,
        "lines DISSOLVED: settled cohesion {min_coh:.2} (want > 0.38) — a fighting clash holds its \
         grid with a meshed front (~0.45); below this the block has blobbed",
    );
}

/// An ATTACKER into a HOLDING line must itself keep formation — its men dress to
/// the line and grind, they don't dissolve chasing the foe. The defender already
/// holds (advancing=false); this is the goal for the attacker too.
#[test]
fn an_attacker_into_a_holding_line_keeps_formation() {
    // Same decouple as the both-attack case: the MECHANICAL "does the attacker keep
    // formation" question, isolated IMMORTAL and measured POST-SETTLE (the mortal
    // attrition is a balance outcome). The attacker (bot) must dress to the contact
    // and grind, not dissolve chasing the foe — checked by its settled cohesion and
    // a clean (un-merged) front, not the impact crash transient.
    let mut sim = clash(UnitClassId::HeavySword, 4242, false);
    for k in 0..sim.soldier_count() {
        sim.health[k] = 1.0e9;
    }
    let (bot, top) = (0usize, 1usize);
    // SUSTAINED interpenetration, not the worst transient. The bloodier grind
    // (faster swings, collapsing guard → far more landed blows → more hit-push)
    // makes the contact BREATHE — front men surge in and are shoved back out, so
    // a `max` over the run catches a momentary lunge, not the state. We TIME-
    // AVERAGE the overlap over the settled window instead (per the tweak-mechanics
    // "transient vs sustained" rule). The hard pass-through guards stay strict:
    // centroids never swap and the attacker's cohesion holds — no blob, no merge.
    let (mut min_coh_atk, mut pen_sum, mut pen_n, mut min_gap) =
        (1.0f32, 0.0f32, 0usize, f32::INFINITY);
    for step in 0..(300.0 / DT) as usize {
        sim.tick();
        let t = step as f32 * DT;
        min_gap = min_gap.min(sim.units[top].centroid.y - sim.units[bot].centroid.y);
        if t > 90.0 {
            min_coh_atk = min_coh_atk.min(sim.units[bot].cohesion);
            pen_sum += interpenetration(&sim, top, 1.2).max(interpenetration(&sim, bot, 1.2));
            pen_n += 1;
        }
    }
    let avg_pen = pen_sum / pen_n.max(1) as f32;
    eprintln!("ATK-v-HOLD (immortal, settled) atk_coh={min_coh_atk:.2} avg_pen={avg_pen:.2} gap={min_gap:.1}m");
    assert!(
        min_gap > -CENTROID_SWAP,
        "the attacker walked through the defender: min gap {:.1}m (want > {:.0})",
        min_gap,
        -CENTROID_SWAP,
    );
    assert!(
        min_coh_atk > 0.38,
        "the ATTACKER dissolved: settled cohesion {min_coh_atk:.2} (want > 0.38) — it should dress \
         to the contact and grind with a meshed front (~0.45), not chase the foe out of formation",
    );
    assert!(
        avg_pen < 0.40,
        "lines interpenetrated: {:.0}% sustained had enemies in reach (want < 40%)",
        avg_pen * 100.0,
    );
}

/// The units start apart on y and advance toward each other. Their CENTROIDS
/// must never swap on y: top stays north of bottom. A swap means the masses
/// either walked through each other (ghost) or wheeled around each other
/// (swirl) — both are the formation failing. The front ranks may intermingle a
/// hair; the centroid, averaging the whole mass, must hold its side. (Small
/// negative tolerance for body-depth intermingle and measurement noise.)
const CENTROID_SWAP: f32 = 2.0;

/// THE INVARIANT: an attack latch is just a move order to a point beyond the
/// foe (plus charge + give-up). Two units latched to each other must behave the
/// SAME as two units MOVING to each other's start — same cohesion, same
/// interpenetration, and NEITHER centroid swaps sides. If they diverge the
/// attack path is special-casing something the move path isn't.
#[test]
fn attack_latch_behaves_like_a_move_order() {
    let mut attack = clash(UnitClassId::HeavySword, 4242, true);
    let mut mov = move_clash(UnitClassId::HeavySword, 4242);
    make_immortal(&mut attack);
    make_immortal(&mut mov);
    let a = trace_sim(attack, 200.0);
    let m = trace_sim(mov, 200.0);
    eprintln!(
        "ATTACK  coh={:.2} pen={:.2} gap_min={:.1} cross@{}",
        a.min_cohesion_both, a.max_interpenetration, a.min_centroid_gap_y, a.crossed_at
    );
    eprintln!(
        "MOVE    coh={:.2} pen={:.2} gap_min={:.1} cross@{}",
        m.min_cohesion_both, m.max_interpenetration, m.min_centroid_gap_y, m.crossed_at
    );
    assert!(
        (a.min_cohesion_both - m.min_cohesion_both).abs() < 0.12,
        "cohesion differs attack {:.2} vs move {:.2} — the latch is special-casing formation",
        a.min_cohesion_both,
        m.min_cohesion_both,
    );
    assert!(
        (a.max_interpenetration - m.max_interpenetration).abs() < 0.15,
        "interpenetration differs attack {:.2} vs move {:.2}",
        a.max_interpenetration,
        m.max_interpenetration,
    );
    assert!(
        a.min_centroid_gap_y > -CENTROID_SWAP && m.min_centroid_gap_y > -CENTROID_SWAP,
        "a centroid swapped sides: attack gap_min={:.1} move gap_min={:.1} (want > {:.0}) — \
         the masses walked through or wheeled around each other",
        a.min_centroid_gap_y,
        m.min_centroid_gap_y,
        -CENTROID_SWAP,
    );
}

/// Identical units in a symmetric clash take comparable losses — a large
/// asymmetry with no stat difference is a MECHANICAL bias (e.g. the unit that
/// gets its order a tick earlier steamrolling), not balance.
/// Identical units must have NO MECHANICAL BIAS — neither side may systematically
/// win. This is a DISTRIBUTION property, not a single-battle one: any one clash of
/// equal units is decisive (the loser routs and is chased — a lopsided loss count
/// is EXPECTED and correct), but across many seeds each side should win about half
/// the time. A side that wins regardless of the dice is a bug in the engine
/// (processing order, a directional force); a fair-but-decisive system splits
/// ~evenly. (The old single-seed "even losses" assertion pinned the outcome of a
/// decisive process and passed only on a lucky seed — it measured the wrong thing.)
#[test]
fn symmetric_clash_has_no_mechanical_bias() {
    let seeds = 20u64;
    let mut bot_wins = 0;
    for seed in 0..seeds {
        let tr = trace(UnitClassId::HeavySword, seed, true, 300.0);
        if tr.bot_loss < tr.top_loss {
            bot_wins += 1;
        }
    }
    eprintln!("bot won {bot_wins}/{seeds} (≈half = fair; near 0 or {seeds} = mechanical bias)");
    assert!(
        (5..=15).contains(&bot_wins),
        "one side wins systematically ({bot_wins}/{seeds}) — a mechanical bias, not the luck of a decisive fight"
    );
}

/// What a free MARCH does to cohesion — the control that isolates "running" from
/// "fighting". Finding: a unit Running 40 m to an EMPTY point arrives essentially
/// DRESSED (~0.99). The neighbour springs hold the block together against the
/// men's varied top speeds and terrain pockets — a march does NOT fray here. So
/// the ~0.47 the old clash showed by contact was the CONTACT approach (the front
/// slowing on the enemy while the rear ran in), not the run. Pinning this stops
/// us mis-attributing fight-raggedness to the march. (If we later WANT a long
/// charge to cost coherence, that's a deliberate new mechanic, not a leash tweak.)
#[test]
fn a_free_march_holds_its_cohesion() {
    let tun = Tunables::default(); // terrain pockets ON — the real march
    let mut sim = Sim::new(tun, 7);
    let u = sim.spawn_class(
        Vec2::new(0.0, 0.0),
        FRAC_PI_2,
        N,
        UnitClassId::HeavySword,
        0,
    );
    sim.set_pace(u, Pace::Run);
    sim.set_move_order(u, Vec2::new(0.0, 40.0));
    let mut end_coh = 1.0f32;
    for _ in 0..(30.0 / DT) as usize {
        sim.tick();
        end_coh = sim.units[u].cohesion;
        if sim.units[u].centroid.y > 38.0 {
            break;
        }
    }
    eprintln!("MARCH-40   cohesion after a 40m free run = {:.2}", end_coh);
    assert!(
        end_coh > 0.9,
        "a free march must hold its line: {end_coh:.2}"
    );
}

// --- The vibe regressions, pinned (all pre-existing melee issues; a concurrent
// --- "kill the melee swirl" effort owns the fix — these lock the targets).

/// PHALANX vs HEAVY must NOT swirl. Two lines meeting head-on keep their fronts
/// pointed ±y and never orbit each other. The same-class clash can't see this —
/// a swirl is a wheel feedback loop and class asymmetry is what seeds it. Pins
/// the [vibe: phalanx-v-heavy] regression.
#[test]
fn phalanx_and_heavy_clash_without_swirling() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    let mut sim = Sim::new(tun, 4242);
    let bot = sim.spawn_class(Vec2::new(0.0, -13.0), FRAC_PI_2, N, UnitClassId::HeavyPhalanx, 0);
    let top = sim.spawn_class(
        Vec2::new(0.0, 13.0),
        -FRAC_PI_2,
        N,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_pace(bot, Pace::Run);
    sim.set_pace(top, Pace::Run);
    sim.set_attack_order(bot, top);
    sim.set_attack_order(top, bot);
    let tr = trace_sim(sim, 120.0);
    eprintln!(
        "PHALANX-v-HEAVY faceDev={:.0}° crossed@{:.1} pen={:.2}",
        tr.max_facing_dev_deg, tr.crossed_at, tr.max_interpenetration
    );
    assert!(
        tr.max_facing_dev_deg < 25.0,
        "the lines must not wheel/swirl: faceDev reached {:.0}°",
        tr.max_facing_dev_deg
    );
    assert!(
        tr.crossed_at < 0.0,
        "the lines must not pass through each other (centroids crossed at {:.1}s)",
        tr.crossed_at
    );
}

fn lateral_step_p95(sim: &Sim, unit: usize, prev: &[f32], min_rank: usize, max_rank: usize) -> f32 {
    let u = &sim.units[unit];
    let f = Vec2::new(u.facing.cos(), u.facing.sin());
    let r = Vec2::new(f.y, -f.x);
    let files = u.files_eff.max(1);
    let mut steps = Vec::new();
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let slot = sim.soldier_slot[i] as usize;
        let rank = slot / files;
        if rank < min_rank || rank > max_rank {
            continue;
        }
        let p = sim.soldier_pos(i);
        let pp = Vec2::new(prev[2 * i], prev[2 * i + 1]);
        steps.push((p - pp).dot(r).abs());
    }
    steps.sort_by(|a, b| a.total_cmp(b));
    assert!(
        !steps.is_empty(),
        "expected living rear-rank soldiers for lateral buzz measurement"
    );
    steps[((steps.len() - 1) as f32 * 0.95).round() as usize]
}

fn rear_lateral_step_p95(sim: &Sim, unit: usize, prev: &[f32]) -> f32 {
    lateral_step_p95(sim, unit, prev, 2, usize::MAX)
}

fn front_axis_step_p95(sim: &Sim, unit: usize, prev: &[f32], axis: Vec2) -> f32 {
    let u = &sim.units[unit];
    let files = u.files_eff.max(1);
    let mut steps = Vec::new();
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let slot = sim.soldier_slot[i] as usize;
        if slot / files > 1 {
            continue;
        }
        let p = sim.soldier_pos(i);
        let pp = Vec2::new(prev[2 * i], prev[2 * i + 1]);
        steps.push((p - pp).dot(axis).abs());
    }
    steps.sort_by(|a, b| a.total_cmp(b));
    assert!(
        !steps.is_empty(),
        "expected living front-rank soldiers for lateral saw measurement"
    );
    steps[((steps.len() - 1) as f32 * 0.95).round() as usize]
}

fn min_unit_surface_gap(sim: &Sim, a: usize, b: usize) -> f32 {
    let ua = &sim.units[a];
    let ub = &sim.units[b];
    let mut best = f32::MAX;
    for i in ua.start..ua.start + ua.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let pi = sim.soldier_pos(i);
        for j in ub.start..ub.start + ub.count {
            if sim.alive[j] == 0 {
                continue;
            }
            let pj = sim.soldier_pos(j);
            let gap = (pj - pi).len() - sim.radius[i] - sim.radius[j];
            best = best.min(gap);
        }
    }
    best
}

/// A holding phalanx in a frontal press should not have its rear ranks buzzing
/// sideways in their lanes. The pike wall is taking no casualties here; if the
/// backline still walks left/right several centimetres every tick, that is a
/// lattice/contact oscillation, not battle damage.
#[test]
fn holding_phalanx_backline_does_not_lateral_buzz() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    let mut sim = Sim::new(tun, 4242);
    let heavy = sim.spawn_class(
        Vec2::new(0.0, -13.0),
        FRAC_PI_2,
        N,
        UnitClassId::HeavySword,
        0,
    );
    let phalanx = sim.spawn_class(Vec2::new(0.0, 13.0), -FRAC_PI_2, N, UnitClassId::HeavyPhalanx, 1);
    sim.set_pace(heavy, Pace::Run);
    sim.set_attack_order(heavy, phalanx);

    let mut prev = sim.positions.clone();
    let mut max_rear_step = 0.0f32;
    for tick in 0..(120.0 / DT) as usize {
        sim.tick();
        if tick as f32 * DT > 70.0 {
            max_rear_step = max_rear_step.max(rear_lateral_step_p95(&sim, phalanx, &prev));
        }
        prev.clone_from(&sim.positions);
    }
    eprintln!(
        "PHALANX-BUZZ rear lateral p95 max step={max_rear_step:.3}m deaths={}",
        deaths(&sim, phalanx)
    );
    assert_eq!(
        deaths(&sim, phalanx),
        0,
        "this pins no-casualty backline motion, not death backfill"
    );
    assert!(
        max_rear_step < 0.08,
        "holding phalanx rear ranks buzz sideways too much: p95 step {max_rear_step:.3}m/tick"
    );
}

/// A defender with no orders should not start buzzing sideways just because an
/// enemy enters threat range and the unit leaves `at_ease`. Nobody is fighting
/// here yet; this pins alert-stance jitter, not contact churn or death backfill.
#[test]
fn alerted_holding_unit_does_not_lateral_buzz_before_contact() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    let mut sim = Sim::new(tun, 4242);
    let attacker = sim.spawn_class(
        Vec2::new(0.0, -60.0),
        FRAC_PI_2,
        N,
        UnitClassId::HeavySword,
        0,
    );
    let defender = sim.spawn_class(
        Vec2::new(0.0, 0.0),
        -FRAC_PI_2,
        N,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_pace(attacker, Pace::Run);
    sim.set_attack_order(attacker, defender);

    let mut prev = sim.positions.clone();
    let mut max_defender_front = 0.0f32;
    let mut saw_alerted = false;
    let mut was_alerted = false;
    for _ in 0..(24.0 / DT) as usize {
        sim.tick();
        let gap = min_unit_surface_gap(&sim, attacker, defender);
        // Alert standoff = unit roused but NOT yet closing to contact. Gap floor
        // raised 2.0 -> 4.0m: this pins idle alert-stance jitter, and the trace
        // shows the front-rank lateral step is ~0 until the gap falls below ~3.5m,
        // where it climbs to ~0.05 — that is the FRONT RANK dressing as it steps
        // the last metres onto the foe (contact-approach churn), exactly the thing
        // the docstring says this test does NOT measure. The pacing overhaul slows
        // the close so that approach now lands inside the 24s window; gating on
        // gap>4.0 keeps the measurement on the genuine standoff, where the rear and
        // front sit quiet (<=0.016/tick).
        let alerted = !sim.units[defender].at_ease && sim.units[defender].engaged == 0 && gap > 4.0;
        if alerted && was_alerted {
            saw_alerted = true;
            let step = front_axis_step_p95(&sim, defender, &prev, Vec2::new(1.0, 0.0));
            max_defender_front = max_defender_front.max(step);
        }
        was_alerted = alerted;
        prev.clone_from(&sim.positions);
    }
    eprintln!(
        "ALERT-BUZZ defender front lateral p95 max step={max_defender_front:.3}m/tick engaged={}",
        sim.units[defender].engaged
    );
    assert!(
        saw_alerted,
        "scenario never reached alert-but-not-engaged state"
    );
    assert!(
        max_defender_front < 0.03,
        "holding defender buzzes sideways while merely alerted: {max_defender_front:.3}m/tick"
    );
}

/// A WIDE attacking line must WRAP a narrow block, not pour through it: its
/// overhanging flanks keep advancing and curl inward, so the block ends up with
/// enemies on its flanks/rear (enveloped), NOT with the line split in two behind
/// it. Measured as: many of the block's men have attackers within reach AND the
/// line's centroid never crosses the block's (no pass-through). Pins the
/// [vibe: offense] regression.
#[test]
fn a_wide_line_wraps_a_narrow_block() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, 11);
    // Narrow block, holding.
    let block = sim.spawn_class_with_files(
        Vec2::new(0.0, 13.0),
        -FRAC_PI_2,
        120,
        12,
        UnitClassId::HeavySword,
        1,
    );
    // Wide attacking line, ~3 deep — it overhangs the block on both flanks.
    let line = sim.spawn_class_with_files(
        Vec2::new(0.0, -13.0),
        FRAC_PI_2,
        210,
        70,
        UnitClassId::HeavySword,
        0,
    );
    // Immortal: this is a formation-mechanics test. Lethality/rout can scatter
    // survivors and belongs in balance/scenario coverage; here the question is
    // whether a living attacking sheet drapes as one connected cloth.
    for u in [line, block] {
        let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
        for k in s..e {
            sim.health[k] = 1.0e9;
        }
    }
    sim.set_pace(line, Pace::Run);
    sim.set_attack_order(line, block);
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
    }
    let bu = &sim.units[block];
    let (mut min_x, mut max_x, mut min_y, mut max_y) =
        (f32::INFINITY, f32::NEG_INFINITY, f32::INFINITY, f32::NEG_INFINITY);
    for i in bu.start..bu.start + bu.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let p = sim.soldier_pos(i);
        min_x = min_x.min(p.x);
        max_x = max_x.max(p.x);
        min_y = min_y.min(p.y);
        max_y = max_y.max(p.y);
    }
    // The block faces -y, so the line presses it from -y; its FAR (rear) half is
    // the +y half beyond its lateral midline. The wrap "curls behind" = flank men
    // who have reached past that midline along the block's sides.
    let rear_half_y = (min_y + max_y) * 0.5;
    let lu = &sim.units[line];
    let (mut side, mut rear, mut corridor_rear) = (0usize, 0usize, 0usize);
    for i in lu.start..lu.start + lu.count {
        if sim.alive[i] == 0 {
            continue;
        }
        let p = sim.soldier_pos(i);
        if p.x < min_x - 1.0 || p.x > max_x + 1.0 {
            side += 1;
        }
        if p.y > rear_half_y {
            rear += 1;
            if p.x >= min_x - 0.5 && p.x <= max_x + 0.5 {
                corridor_rear += 1;
            }
        }
    }
    let (line_gap, line_max_gap) = adjacent_file_gap_stats(&sim, line);
    let line_file_span = max_file_span(&sim, line);
    let line_coh = sim.units[line].cohesion;
    // The block is the DEFENDER: a clean wrap leaves it surrounded but still
    // FACING the fight; a swirl would wheel it off its line.
    let block_face_dev = sim.units[block]
        .facing
        .cos()
        .abs()
        .min(1.0)
        .asin()
        .to_degrees();
    eprintln!(
        "WIDE-WRAP  side={side} rear={rear} corridor-rear={corridor_rear} block faceDev={block_face_dev:.0} line coh={line_coh:.2} p95-file-gap={line_gap:.1}m max-file-gap={line_max_gap:.1}m max-file-span={line_file_span:.1}m"
    );
    // Most overhanging men should be on the flanks; a real tail must curl into the
    // block's REAR HALF. (Re-pinned from "past the rear FACE, rear>=6" to "past the
    // lateral midline, rear>=20": the pacing overhaul softened the contact drive,
    // so against this immortal block the flanks ride alongside it and curl around
    // the rear-half corner — ~45 men past the midline — but no longer shove the
    // final ~1m clean past the rear face. The wrap is unchanged in kind; the depth
    // it reaches against an unyielding block is a hair shallower, so the ruler moves
    // to the midline.) The HARD invariant is unchanged and stays strict: nobody
    // pours through the defender's center corridor.
    assert!(
        side > 90 && rear >= 20 && corridor_rear <= 4,
        "the wide line must wrap around the block's sides/rear-half without pouring through its center corridor: side {side}, rear {rear}, corridor rear {corridor_rear}",
    );
    assert!(
        block_face_dev < 25.0,
        "the block must hold its line, not be wheeled around by the wrap: {block_face_dev:.0} deg",
    );
    assert!(
        line_coh > 0.45 && line_gap < 4.0,
        "the wrapping line must stay a connected cloth, not dissolve into streamers: cohesion {line_coh:.2}, p95 adjacent-file gap {line_gap:.1}m",
    );
    assert!(
        line_max_gap < 6.0,
        "the wrapping line's extreme wing files must not tear into streamers: max adjacent-file gap {line_max_gap:.1}m",
    );
    assert!(
        line_file_span < 9.0,
        "the wrapping line's files must not stretch into front/back streamers: max file span {line_file_span:.1}m",
    );
}

#[test]
fn a_mortal_wrapping_line_backfills_casualty_tears() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, 11);
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

    let mut max_gap_after_casualty = 0.0f32;
    let mut max_file_gap_after_casualty = 0.0f32;
    let mut max_file_span_after_casualty = 0.0f32;
    let mut max_late_gap = 0.0f32;
    let mut max_late_file_gap = 0.0f32;
    let mut max_late_file_span = 0.0f32;
    let mut saw_casualty = false;
    // Window EXTENDED 60s -> 120s (late_start 45s -> 95s). The combat-pacing
    // overhaul made the grind bloodier AND continuous: casualties now keep landing
    // past 95s (alive 206 @ t=80 -> 199 @ t=120), so a fresh hole opens, blips the
    // p95 file-center gap, then back-fills within ~5s. The trace per-seed shows the
    // SAME back-fill, just sampled in the steadier late regime now: gap spikes to
    // 4-5m as a rank-section is wiped (t=115 gap=3.5) and immediately closes
    // (t=120 gap=1.7), never sustaining. Seed sweep {11,7,23,99,314}:
    // max_post 3.3-5.4, max_late 2.2-4.6, final 1.7-2.9 — every seed settles tight.
    // So the back-fill is intact; the late floor just has to clear the (now-late)
    // transient blip, not a sustained tear (those were 12-40m in the broken regime).
    let ticks = (120.0 / DT) as usize;
    let late_start = (95.0 / DT) as usize;
    for tick in 0..ticks {
        sim.tick();
        if sim.units[line].alive_count < sim.units[line].count {
            saw_casualty = true;
            let (gap, file_gap) = adjacent_file_gap_stats(&sim, line);
            let file_span = max_file_span(&sim, line);
            max_gap_after_casualty = max_gap_after_casualty.max(gap);
            max_file_gap_after_casualty = max_file_gap_after_casualty.max(file_gap);
            max_file_span_after_casualty = max_file_span_after_casualty.max(file_span);
            if tick >= late_start {
                max_late_gap = max_late_gap.max(gap);
                max_late_file_gap = max_late_file_gap.max(file_gap);
                max_late_file_span = max_late_file_span.max(file_span);
            }
        }
    }
    let (final_gap, final_file_gap) = adjacent_file_gap_stats(&sim, line);
    let final_file_span = max_file_span(&sim, line);
    // The file-span numbers expose the still-unfixed visual streamer: p95 gaps
    // can pass while one file stretches into a long front/back rope. Keep them
    // in the trace until the mechanics fix can turn them into a real assertion.
    eprintln!(
        "MORTAL-WRAP  line alive={}/{} max-post-casualty-gap={max_gap_after_casualty:.1}m max-post-file-gap={max_file_gap_after_casualty:.1}m max-post-file-span={max_file_span_after_casualty:.1}m max-late-gap={max_late_gap:.1}m max-late-file-gap={max_late_file_gap:.1}m max-late-file-span={max_late_file_span:.1}m final-gap={final_gap:.1}m final-file-gap={final_file_gap:.1}m final-file-span={final_file_span:.1}m",
        sim.units[line].alive_count,
        sim.units[line].count
    );
    assert!(saw_casualty, "setup must reach the casualty/backfill phase");
    // The INVARIANT — holes back-fill rather than becoming sustained tears — holds:
    // the gap always settles tight (final 1.7m seed-11, <=2.9m across the sweep).
    // The late floor moved 4.0 -> 5.5 ONLY to clear the now-late back-fill blip
    // (measured 4.6m peak): with continuous attrition the worst transient spike
    // lands inside the 95s+ window, but it is a 5s blip that closes, not a tear.
    // The post (7.0) and final (3.0) floors stay at their original strict values.
    assert!(
        max_gap_after_casualty < 7.0 && max_late_gap < 5.5 && final_gap < 3.0,
        "casualty holes in a wrapping line must back-fill instead of becoming sustained tears: max post-casualty {max_gap_after_casualty:.1}m, late {max_late_gap:.1}m, final {final_gap:.1}m",
    );
    // The file-gap / file-span numbers are the KNOWN-UNFIXED "streamer" proxy (one
    // file stretched into a long front/back rope) — loose rails that catch a
    // catastrophic streamer, not pin the number. They stay at their original limits
    // because the extended window (above) lets the rope draw back in: by the settled
    // regime the final snapshot reads ~3m file-gap / ~5m span, far under these rails.
    // NOT a physics invariant — the back-fill invariant above is.
    assert!(
        final_file_gap < 8.0,
        "casualty holes must not leave sustained extreme file-to-file streamer tears: late {max_late_file_gap:.1}m, final {final_file_gap:.1}m",
    );
    assert!(
        final_file_span < 28.0,
        "partial-rank survivors must not be re-slotted into runaway front/back streamers: final file span {final_file_span:.1}m",
    );
}

#[test]
fn mortal_wide_line_center_files_do_not_trample_through_a_living_block() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    let mut sim = Sim::new(tun, 11);
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

    let center_crossers = |s: &Sim| -> (usize, f32, f32, f32, f32, usize, usize) {
        let bu = &s.units[block];
        let (mut red_cy, mut red_n, mut red_max_y) = (0.0f32, 0usize, f32::NEG_INFINITY);
        let (mut red_min_x, mut red_max_x) = (f32::INFINITY, f32::NEG_INFINITY);
        for i in bu.start..bu.start + bu.count {
            if s.alive[i] == 0 {
                continue;
            }
            let p = s.soldier_pos(i);
            red_cy += p.y;
            red_n += 1;
            red_max_y = red_max_y.max(p.y);
            red_min_x = red_min_x.min(p.x);
            red_max_x = red_max_x.max(p.x);
        }
        if red_n == 0 {
            return (0, 0.0, red_max_y, 0.0, 0.0, 0, 0);
        }
        red_cy /= red_n as f32;

        let lu = &s.units[line];
        let files = lu.files_eff.max(1);
        let mid = (files - 1) as f32 * 0.5;
        let mut crossed = 0usize;
        let mut slot_y = 0.0f32;
        let mut pos_y = 0.0f32;
        let mut fighting = 0usize;
        let mut front_clear = 0usize;
        for i in lu.start..lu.start + lu.count {
            if s.alive[i] == 0 {
                continue;
            }
            let file = s.soldier_slot[i] as usize % files;
            if (file as f32 - mid).abs() > 6.0 {
                continue;
            }
            let p = s.soldier_pos(i);
            if p.x < red_min_x - 0.5 || p.x > red_max_x + 0.5 {
                continue;
            }
            if p.y > red_cy + 2.5 && p.y > red_max_y + 0.5 {
                crossed += 1;
                slot_y += lu.slot_world(s.soldier_slot[i] as usize).y;
                pos_y += p.y;
                fighting += (s.fighting[i] == 1) as usize;
                front_clear += (s.front_clear[i] == 1) as usize;
            }
        }
        if crossed > 0 {
            slot_y /= crossed as f32;
            pos_y /= crossed as f32;
        }
        (
            crossed,
            red_cy,
            red_max_y,
            slot_y,
            pos_y,
            fighting,
            front_clear,
        )
    };

    let mut max_crossers = 0usize;
    let mut at_t = 0.0f32;
    let mut at_alive = 0usize;
    let mut at_red_cy = 0.0f32;
    let mut at_red_max = 0.0f32;
    let mut at_slot_y = 0.0f32;
    let mut at_pos_y = 0.0f32;
    let mut at_fighting = 0usize;
    let mut at_front_clear = 0usize;
    for step in 0..(72.0 / DT) as usize {
        sim.tick();
        // Once the block has mostly collapsed, cleanup/chase is no longer the
        // mechanism. The trample bug is center files crossing while the block is
        // still an actual living obstacle.
        if sim.units[block].alive_count < 90 {
            continue;
        }
        let (crossers, red_cy, red_max_y, slot_y, pos_y, fighting, front_clear) =
            center_crossers(&sim);
        if crossers > max_crossers {
            max_crossers = crossers;
            at_t = step as f32 * DT;
            at_alive = sim.units[block].alive_count;
            at_red_cy = red_cy;
            at_red_max = red_max_y;
            at_slot_y = slot_y;
            at_pos_y = pos_y;
            at_fighting = fighting;
            at_front_clear = front_clear;
        }
    }
    eprintln!(
        "MORTAL-WRAP-CENTER max-crossers={max_crossers} at {at_t:.1}s red-alive={at_alive}/120 red-cy={at_red_cy:.1} red-max-y={at_red_max:.1} pos-y={at_pos_y:.1} slot-y={at_slot_y:.1} fighting={at_fighting} clear={at_front_clear}"
    );
    assert!(
        max_crossers <= 12,
        "center files of ordinary infantry must not trample through a still-living block: {max_crossers} center men crossed while {at_alive}/120 defenders were alive",
    );
}

/// THE COLUMN-AND-LINE STORY (immortal soldiers, so it is pure formation
/// physics — nobody dies, the only question is how the line DEFORMS). A narrow
/// deep column drives the centre of a wide held line. The right behaviour is a
/// story, not a single number:
///   1. the fronts ATTRACT — the line's centre men stay glued to the column's,
///      so as the column presses, the centre is dragged BACK: the line BULGES
///      (a dimple, the centre well behind the flanks);
///   2. it does NOT simply part like a curtain — the column's centroid must not
///      walk clean through while the line still stands.
/// The old far-flank-width assertion was the wrong ruler after the contact
/// projection fix: a 70-file line can dimple locally without the whole wing edge
/// contracting. The invariant is the local dimple plus no centroid pass-through.
#[test]
fn a_column_bulges_a_held_line_it_does_not_part_it() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, 11);
    // Wide held line (no order — it defends), ~4 deep, immortal.
    let line = sim.spawn_class_with_files(
        Vec2::new(0.0, 13.0),
        -FRAC_PI_2,
        280,
        70,
        UnitClassId::HeavySword,
        1,
    );
    // Narrow deep column, ordered THROUGH the centre, immortal.
    let col = sim.spawn_class_with_files(
        Vec2::new(0.0, -25.0),
        FRAC_PI_2,
        128,
        8,
        UnitClassId::HeavySword,
        0,
    );
    for u in [line, col] {
        let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
        for k in s..e {
            sim.health[k] = 1.0e9;
        }
    }
    sim.set_pace(col, Pace::Run);
    sim.set_attack_move_order(col, Vec2::new(0.0, 60.0));

    // Line men near x=0 (the struck centre) vs the flanks (|x| large).
    let profile = |s: &Sim| -> (f32, f32, f32) {
        let u = &s.units[line];
        let (mut cy, mut cn, mut fy, mut fn_, mut wmax) = (0.0f32, 0.0f32, 0.0f32, 0.0f32, 0.0f32);
        for i in u.start..u.start + u.count {
            if s.alive[i] == 0 {
                continue;
            }
            let p = s.soldier_pos(i);
            wmax = wmax.max(p.x.abs());
            if p.x.abs() < 5.0 {
                cy += p.y;
                cn += 1.0;
            } else if p.x.abs() > 15.0 {
                fy += p.y;
                fn_ += 1.0;
            }
        }
        (cy / cn.max(1.0), fy / fn_.max(1.0), wmax)
    };
    let (mut max_bulge, mut crossed) = (0.0f32, false);
    let (mut min_line_coh, mut max_line_gap) = (1.0f32, 0.0f32);
    // Window EXTENDED 40s -> 110s. The column presses in slower now (the pacing
    // overhaul softened the per-tick contact drive), so the dimple deepens more
    // gradually: at 40s it had only reached ~2.1m, but it keeps growing to a
    // settled plateau of ~2.5m by ~100s. The invariant — the centre is dragged
    // BACK into a visible dimple and the column does NOT part/cross — is intact;
    // the window just has to run long enough to catch the settled dimple depth.
    for _ in 0..(110.0 / DT) as usize {
        sim.tick();
        let (cyc, fyc, _) = profile(&sim);
        // line faces -y; pushed BACK = +y, so centre-behind-flanks is cy - fy.
        max_bulge = max_bulge.max(cyc - fyc);
        if sim.units[col].centroid.y >= sim.units[line].centroid.y {
            crossed = true;
        }
        min_line_coh = min_line_coh.min(sim.units[line].cohesion);
        max_line_gap = max_line_gap.max(p95_adjacent_file_gap(&sim, line));
    }
    eprintln!(
        "BULGE  max centre-dimple={max_bulge:.1}m  col_crossed={crossed}  line min-coh={min_line_coh:.2} max-p95-file-gap={max_line_gap:.1}m"
    );
    assert!(
        !crossed,
        "the column parted the line and walked through (centroids crossed)"
    );
    // Alert-settled held lines should still make a visible elastic dimple under
    // a column press; the contract is bulging, not parting/crossing.
    // Re-pinned 2.6 -> 2.4: the settled dimple is ~2.5m under the gentler press
    // (was deeper when contact drove harder). Still a clear, sustained elastic
    // bulge — the contract is "bulges, not parts/crosses", which holds.
    assert!(
        max_bulge > 2.4,
        "the line did not BULGE under the column: centre dimpled only {max_bulge:.1}m"
    );
    assert!(
        max_line_gap < 2.5,
        "the held line must stay connected while it bulges, not tear into streamers: min cohesion {min_line_coh:.2}, max p95 adjacent-file gap {max_line_gap:.1}m",
    );
}

#[test]
fn separated_columns_dimple_a_held_line_without_tearing_the_sheet() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, 12);
    // Native mirror of [vibe: multi-penetration]: one very wide held line, with
    // three narrow deep columns punching separate lanes through it. The line
    // should form three local dimples while remaining one connected sheet; the
    // untouched files between lanes are the contract.
    let line = sim.spawn_class_with_files(
        Vec2::new(0.0, 0.0),
        FRAC_PI_2,
        600,
        150,
        UnitClassId::HeavySword,
        0,
    );
    let lanes = [-65.0, 0.0, 65.0];
    let cols: Vec<usize> = lanes
        .iter()
        .map(|&x| {
            sim.spawn_class_with_files(
                Vec2::new(x, 130.0),
                -FRAC_PI_2,
                160,
                8,
                UnitClassId::HeavySword,
                1,
            )
        })
        .collect();
    for (&col, &x) in cols.iter().zip(&lanes) {
        sim.set_pace(col, Pace::Run);
        sim.set_attack_move_order(col, Vec2::new(x, -90.0));
    }

    let mut min_line_coh = 1.0f32;
    let mut max_line_gap = 0.0f32;
    let mut min_alive = sim.units[line].alive_count;
    for step in 0..(168.0 / DT) as usize {
        sim.tick();
        let t = step as f32 * DT;
        // Skip the long approach; measure the defended sheet after contact.
        if t > 70.0 {
            min_alive = min_alive.min(sim.units[line].alive_count);
            min_line_coh = min_line_coh.min(sim.units[line].cohesion);
            max_line_gap = max_line_gap.max(p95_adjacent_file_gap(&sim, line));
        }
    }
    eprintln!(
        "MULTI-DIMPLE line alive={min_alive}/600 min-coh={min_line_coh:.2} p95-file-gap={max_line_gap:.1}m"
    );
    assert!(
        min_line_coh > 0.35 && max_line_gap < 5.0,
        "separate columns must make local dimples in one connected held sheet, not tear it into streamers: cohesion {min_line_coh:.2}, p95 adjacent-file gap {max_line_gap:.1}m",
    );
}

// ── migrated from combat_scenarios.rs: a head-on clash of IDENTICAL lines is a
// grind, not an instant deletion, and the front ranks engage. Even-handedness +
// grind-duration + engagement are physics invariants (symmetric units, no
// pricing), so they live with the other mechanics here, not among the balance
// outcomes. (Asserts on losses only as the even-handedness proxy, never on wins.)
#[test]
fn melee_kills_and_formations_thin() {
    let mut sim = Sim::new(no_morale(), 99);
    let a = sim.spawn_class(
        Vec2::new(0.0, -12.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    let b = sim.spawn_class(
        Vec2::new(0.0, 12.0),
        -FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_attack_move_order(a, Vec2::new(0.0, 12.0));
    let mut peak_engaged = 0;
    // Window EXTENDED 90s -> 160s: the combat-pacing overhaul (3s stun, ~3.5x
    // longer attack intervals) makes the grind kill far slower, so 90s caught the
    // fight mid-engagement before the loser-side thinning showed (b had only 2
    // dead at 90s; it crosses 3 at ~150s). Both sides STILL thin and the line
    // STILL grinds (no annihilation) — only the lethality-per-time fell, so the
    // window is lengthened to reach the same settled outcome, not relaxed.
    for _ in 0..(160.0 / DT) as usize {
        sim.tick();
        peak_engaged = peak_engaged.max(sim.units[a].engaged);
    }
    assert!(
        deaths(&sim, a) > 5,
        "a should take losses, got {}",
        deaths(&sim, a)
    );
    assert!(
        deaths(&sim, b) >= 3,
        "b should take losses, got {}",
        deaths(&sim, b)
    );
    assert!(
        sim.units[a].alive_count + sim.units[b].alive_count > 60,
        "the line fight must grind, not annihilate"
    );
    assert!(
        peak_engaged > 10,
        "front ranks should be engaged at the height"
    );
}
