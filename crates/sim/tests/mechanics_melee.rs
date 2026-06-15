//! MECHANICS tests for the melee — first-principles physics properties that
//! must hold no matter how the units are *balanced*. They never assert who
//! wins (that flips as stats are retuned); they pin values close to the physics
//! — cohesion and centroid positions — using IDENTICAL units so there is zero
//! stat variability to muddy the signal. They are the fast first layer: green
//! here only means "nothing is obviously broken"; the real check is still
//! eyeballing every frame of the vibe shots.
//!
//! See the `tweak-mechanics` skill for the workflow these encode.

use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// Two IDENTICAL blocks, facing each other along y, both ordered to attack.
/// Bottom unit (index 0) spawns south facing +y; top unit (index 1) spawns
/// north facing -y. A parade-ground field removes terrain noise so the only
/// thing the test sees is the melee itself.
fn head_on_clash(class: UnitClassId, seed: u64) -> Sim {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    let mut sim = Sim::new(tun, seed);
    let bot = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, 240, class, 0);
    let top = sim.spawn_class(Vec2::new(0.0, 40.0), -FRAC_PI_2, 240, class, 1);
    assert_eq!((bot, top), (0, 1));
    sim.set_pace(bot, Pace::Run);
    sim.set_pace(top, Pace::Run);
    sim.set_attack_order(bot, top);
    sim.set_attack_order(top, bot);
    sim
}

struct ClashTrace {
    /// Lowest cohesion either unit reached BEFORE the first one broke.
    min_cohesion_pre_rout: f32,
    /// Smallest (top.y - bottom.y) over the whole fight; <= 0 means the
    /// centroids crossed (pass-through OR swirl — both swap top/bottom).
    min_centroid_gap_y: f32,
    /// Time (s) of the first crossing, or -1 if they never crossed.
    crossed_at: f32,
    /// For the first unit to break: how far its centroid travelled along its
    /// HOME direction between breaking and the end (+ = fled the right way).
    rout_flee_home: Option<f32>,
    bot_loss: usize,
    top_loss: usize,
}

fn trace_clash(class: UnitClassId, seed: u64, secs: f32) -> ClashTrace {
    let mut sim = head_on_clash(class, seed);
    let (bot, top) = (0usize, 1usize);
    let (bot0, top0) = (240usize, 240usize);
    let mut min_coh = 1.0f32;
    let mut min_gap = f32::INFINITY;
    let mut crossed_at = -1.0f32;
    // home_dir: bottom flees toward -y, top toward +y.
    let mut rout_unit: Option<(usize, f32, f32)> = None; // (idx, home_sign, y_at_break)

    for step in 0..(secs / DT) as usize {
        sim.tick();
        let t = step as f32 * DT;
        let (tu, bu) = (&sim.units[top], &sim.units[bot]);
        let any_rout = tu.routing || bu.routing;

        if !any_rout && tu.alive_count > 5 && bu.alive_count > 5 {
            min_coh = min_coh.min(tu.cohesion.min(bu.cohesion));
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
                "t={:5.1}  topY={:7.1} botY={:7.1} gap={:7.1}  coh t/b={:.2}/{:.2}  alive t/b={}/{}  rout t/b={}/{}",
                t, tu.centroid.y, bu.centroid.y, gap, tu.cohesion, bu.cohesion,
                tu.alive_count, bu.alive_count, tu.routing, bu.routing,
            );
        }
    }

    let rout_flee_home = rout_unit.map(|(idx, home, y0)| {
        (sim.units[idx].centroid.y - y0) * home // >0 if it fled toward its own edge
    });
    ClashTrace {
        min_cohesion_pre_rout: min_coh,
        min_centroid_gap_y: min_gap,
        crossed_at,
        rout_flee_home,
        bot_loss: bot0 - sim.units[bot].alive_count,
        top_loss: top0 - sim.units[top].alive_count,
    }
}

/// THE headline mechanics property for two lines that meet: they stay coherent,
/// they never pass through each other, and the loser routs the right way.
/// Balance-free — both sides are the same unit, so neither "should" win.
#[test]
fn heavy_lines_hold_cohesion_and_never_cross() {
    let tr = trace_clash(UnitClassId::HeavySword, 4242, 300.0);
    eprintln!(
        "min_coh={:.2}  min_gap_y={:.1}m  crossed_at={}  flee_home={:?}  losses bot/top={}/{}",
        tr.min_cohesion_pre_rout, tr.min_centroid_gap_y, tr.crossed_at, tr.rout_flee_home,
        tr.bot_loss, tr.top_loss,
    );
    // (1) the lines hold formation through the grind, until one actually breaks.
    assert!(
        tr.min_cohesion_pre_rout > 0.8,
        "lines lost cohesion before any rout: min cohesion {:.2} (want > 0.8) — \
         a coherent battle line should grind, not dissolve",
        tr.min_cohesion_pre_rout,
    );
    // (2) two bodies cannot occupy the same ground: the top unit's centroid must
    // stay north of the bottom unit's for the WHOLE fight. A crossing is a
    // pass-through or a swirl (orbiting also swaps top/bottom).
    assert!(
        tr.crossed_at < 0.0,
        "centroids crossed at t={:.1}s (min gap {:.1}m) — the lines passed through \
         each other or swirled",
        tr.crossed_at, tr.min_centroid_gap_y,
    );
    // (3) a broken unit flees toward its OWN side of the field, not into/through
    // the enemy.
    if let Some(flee) = tr.rout_flee_home {
        assert!(flee > 0.0, "the broken unit routed the WRONG way ({flee:.1}m toward the enemy)");
    }
}

/// Identical units in a symmetric clash must take comparable losses — a large
/// asymmetry with no stat difference would mean a MECHANICAL bias (e.g. the
/// unit that gets its order a tick earlier steamrolls). Not a balance claim:
/// the units are the same, so the only thing under test is the mechanic's
/// even-handedness. Generous tolerance — a deterministic clash is never a
/// perfect mirror, but it must not be lopsided.
#[test]
fn symmetric_clash_is_even_handed() {
    let tr = trace_clash(UnitClassId::HeavySword, 4242, 300.0);
    let (a, b) = (tr.bot_loss as f32, tr.top_loss as f32);
    let hi = a.max(b).max(1.0);
    let lo = a.min(b);
    eprintln!("losses bot/top = {}/{} (ratio {:.2})", tr.bot_loss, tr.top_loss, lo / hi);
    assert!(
        lo / hi > 0.5,
        "identical units took lopsided losses {}/{} — a mechanical bias, not balance",
        tr.bot_loss, tr.top_loss,
    );
}
