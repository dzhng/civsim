//! MECHANICS tests for the melee — first-principles physics properties that
//! must hold no matter how the units are *balanced*. They never assert who
//! wins (that flips as stats are retuned); they pin values close to the physics
//! — cohesion, centroid positions, interpenetration, slot error — using
//! IDENTICAL units so there is zero stat variability to muddy the signal. They
//! are the fast first layer: green here only means "nothing is obviously
//! broken"; the real check is still eyeballing every frame of the vibe shots.
//!
//! See the `tweak-mechanics` skill for the workflow these encode.

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
    let mut sim = Sim::new(tun, seed);
    let bot = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, N, class, 0);
    let top = sim.spawn_class(Vec2::new(0.0, 40.0), -FRAC_PI_2, N, class, 1);
    assert_eq!((bot, top), (0, 1));
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

/// Mean distance (m) of a unit's living men from their ideal formation slots —
/// the rawest "is the shape holding" number, the input cohesion is derived from.
fn mean_slot_error(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let (mut sum, mut n) = (0.0f32, 0usize);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 1 {
            sum += sim.slot_error(i);
            n += 1;
        }
    }
    if n == 0 {
        0.0
    } else {
        sum / n as f32
    }
}

struct Trace {
    /// Lowest cohesion EITHER unit reached before the first rout.
    min_cohesion_both: f32,
    /// Lowest cohesion the BOTTOM (always-attacking) unit reached pre-rout.
    min_cohesion_attacker: f32,
    /// Smallest (top.y - bottom.y) ever; <= 0 means the centroids crossed.
    min_centroid_gap_y: f32,
    crossed_at: f32,
    /// Largest interpenetration EITHER unit reached pre-rout.
    max_interpenetration: f32,
    /// For the first unit to break: metres travelled along its HOME direction
    /// from break to end (+ = fled toward its own edge).
    rout_flee_home: Option<f32>,
    bot_loss: usize,
    top_loss: usize,
}

fn trace(class: UnitClassId, seed: u64, top_attacks: bool, secs: f32) -> Trace {
    let mut sim = clash(class, seed, top_attacks);
    let (bot, top) = (0usize, 1usize);
    let mut min_coh_both = 1.0f32;
    let mut min_coh_atk = 1.0f32;
    let mut min_gap = f32::INFINITY;
    let mut crossed_at = -1.0f32;
    let mut max_pen = 0.0f32;
    let mut first_rout = false;
    let mut rout_unit: Option<(usize, f32, f32)> = None; // (idx, home_sign, y_at_break)

    for step in 0..(secs / DT) as usize {
        sim.tick();
        let t = step as f32 * DT;
        let (tu, bu) = (&sim.units[top], &sim.units[bot]);
        let any_rout = tu.routing || bu.routing;
        if any_rout {
            first_rout = true;
        }
        if !first_rout && tu.alive_count > 5 && bu.alive_count > 5 {
            min_coh_both = min_coh_both.min(tu.cohesion.min(bu.cohesion));
            min_coh_atk = min_coh_atk.min(bu.cohesion);
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
        if rout_unit.is_none() {
            if bu.routing {
                rout_unit = Some((bot, -1.0, bu.centroid.y));
            } else if tu.routing {
                rout_unit = Some((top, 1.0, tu.centroid.y));
            }
        }
        if std::env::var("TRACE").is_ok() && step % 60 == 0 {
            eprintln!(
                "t={:5.1} gap={:6.1} coh t/b={:.2}/{:.2} pen t/b={:.2}/{:.2} slotErr t/b={:.1}/{:.1} alive t/b={}/{}",
                t, gap, tu.cohesion, bu.cohesion,
                interpenetration(&sim, top, 1.2), interpenetration(&sim, bot, 1.2),
                mean_slot_error(&sim, top), mean_slot_error(&sim, bot),
                tu.alive_count, bu.alive_count,
            );
        }
    }

    let rout_flee_home = rout_unit.map(|(idx, home, y0)| (sim.units[idx].centroid.y - y0) * home);
    Trace {
        min_cohesion_both: min_coh_both,
        min_cohesion_attacker: min_coh_atk,
        min_centroid_gap_y: min_gap,
        crossed_at,
        max_interpenetration: max_pen,
        rout_flee_home,
        bot_loss: N - sim.units[bot].alive_count,
        top_loss: N - sim.units[top].alive_count,
    }
}

/// Two attacking lines: hold cohesion, never pass through each other, rout the
/// right way. Balance-free — same unit both sides, so neither "should" win.
#[test]
fn two_attacking_lines_hold_and_never_cross() {
    let tr = trace(UnitClassId::HeavySword, 4242, true, 300.0);
    eprintln!(
        "BOTH-ATTACK  min_coh={:.2}  gap_min={:.1}m crossed@{}  pen_max={:.2}  flee={:?}  loss b/t={}/{}",
        tr.min_cohesion_both, tr.min_centroid_gap_y, tr.crossed_at, tr.max_interpenetration,
        tr.rout_flee_home, tr.bot_loss, tr.top_loss,
    );
    assert!(
        tr.min_cohesion_both > 0.8,
        "lines lost cohesion before any rout: {:.2} (want > 0.8) — a battle line should grind, not dissolve",
        tr.min_cohesion_both,
    );
    assert!(
        tr.crossed_at < 0.0,
        "centroids crossed at t={:.1}s (min gap {:.1}m) — pass-through or swirl",
        tr.crossed_at, tr.min_centroid_gap_y,
    );
    assert!(
        tr.max_interpenetration < 0.30,
        "units interpenetrated: {:.0}% of a line's men had enemies in reach (want < 30%) — \
         a clean contact touches at the front rank only, not throughout",
        tr.max_interpenetration * 100.0,
    );
    if let Some(flee) = tr.rout_flee_home {
        assert!(flee > 0.0, "the broken unit routed the WRONG way ({flee:.1}m toward the enemy)");
    }
}

/// An ATTACKER into a HOLDING line must itself keep formation — its men dress to
/// the line and grind, they don't dissolve chasing the foe. The defender already
/// holds (advancing=false); this is the goal for the attacker too.
#[test]
fn an_attacker_into_a_holding_line_keeps_formation() {
    let tr = trace(UnitClassId::HeavySword, 4242, false, 300.0);
    eprintln!(
        "ATK-v-HOLD   atk_coh_min={:.2}  gap_min={:.1}m crossed@{}  pen_max={:.2}  loss b/t={}/{}",
        tr.min_cohesion_attacker, tr.min_centroid_gap_y, tr.crossed_at, tr.max_interpenetration,
        tr.bot_loss, tr.top_loss,
    );
    assert!(
        tr.crossed_at < 0.0,
        "centroids crossed at t={:.1}s — the attacker walked through the defender",
        tr.crossed_at,
    );
    assert!(
        tr.min_cohesion_attacker > 0.8,
        "the ATTACKER dissolved: cohesion fell to {:.2} (want > 0.8) — it should dress to the \
         contact and grind, like the defender, not chase the foe out of formation",
        tr.min_cohesion_attacker,
    );
    assert!(
        tr.max_interpenetration < 0.30,
        "lines interpenetrated: {:.0}% had enemies in reach (want < 30%)",
        tr.max_interpenetration * 100.0,
    );
}

/// Identical units in a symmetric clash take comparable losses — a large
/// asymmetry with no stat difference is a MECHANICAL bias (e.g. the unit that
/// gets its order a tick earlier steamrolling), not balance.
#[test]
fn symmetric_clash_is_even_handed() {
    let tr = trace(UnitClassId::HeavySword, 4242, true, 300.0);
    let (a, b) = (tr.bot_loss as f32, tr.top_loss as f32);
    let (hi, lo) = (a.max(b).max(1.0), a.min(b));
    eprintln!("losses bot/top = {}/{} (ratio {:.2})", tr.bot_loss, tr.top_loss, lo / hi);
    assert!(
        lo / hi > 0.5,
        "identical units took lopsided losses {}/{} — a mechanical bias, not balance",
        tr.bot_loss, tr.top_loss,
    );
}
