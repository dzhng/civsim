//! MECHANICAL invariants of CONTACT PRESSURE and GROUND, built from the base up.
//! These are first-principles physics that must hold no matter how classes are
//! balanced — they are the foundation the balance (defender's edge, frontline vs
//! flank roles) rests on. They use IDENTICAL units so there is zero stat noise.
//!
//! The contract (David's design):
//!  1. Two EQUAL engaged units feel EQUAL pressure — whether both attack or one
//!     holds. Order intent must not create a pressure asymmetry between equals.
//!  2. Two EQUAL units do NOT give ground — the brace cancels othismos for
//!     equals, so neither centroid is walked back, attack-vs-hold or attack-vs-
//!     attack alike.
//!  3. A FLANKING unit feels LESS pressure than one in the frontline (a 2v1: the
//!     frontal presser drives into a braced front; the flanker hits an open
//!     side). This gap is the lever `press_sensitivity` tunes a class onto — a
//!     frontline holder vs a flank striker.

use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 146;
const N: usize = 240;

/// Mean pressure over a unit's living, FIGHTING men (the contact line) — the
/// honest "how crushed is this unit where it meets the enemy".
fn front_pressure(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let (mut sum, mut n) = (0.0f32, 0usize);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 1 && sim.fighting[i] == 1 {
            sum += sim.pressure[i];
            n += 1;
        }
    }
    sum / n.max(1) as f32
}

/// Mean y of a unit's REARMOST ranks (back third, by slot). "Giving ground" is
/// the BACKLINE moving — the attacker pressing the FRONTLINE back is expected (the
/// front compresses), but a holding line keeps its REAR planted under the press.
fn backline_y(sim: &Sim, unit: usize) -> f32 {
    let u = &sim.units[unit];
    let files = u.files_eff.max(1);
    let ranks = (u.count / files).max(1);
    let rear_from = ranks * 2 / 3;
    let (mut sum, mut n) = (0.0f32, 0usize);
    for i in u.start..u.start + u.count {
        if sim.alive[i] == 1 && (sim.soldier_slot[i] as usize / files) >= rear_from {
            sum += sim.soldier_pos(i).y;
            n += 1;
        }
    }
    sum / n.max(1) as f32
}

/// Mean pressure + centroid-y, averaged over the steady grind (t_lo..t_hi),
/// skipping the impact transient. Two HeavySword blocks meet head-on; `def_holds`
/// makes the north unit hold (no order) while the south attacks.
fn clash_metrics(def_holds: bool) -> (f32, f32, f32, f32) {
    let mut sim = Sim::new(Tunables { micro_rough: 0.0, ..Tunables::default() }, SEED);
    let s = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, N, UnitClassId::HeavySword, 0);
    let n = sim.spawn_class(Vec2::new(0.0, 12.0), -FRAC_PI_2, N, UnitClassId::HeavySword, 1);
    sim.set_pace(s, Pace::Walk);
    sim.set_attack_order(s, n);
    if !def_holds {
        sim.set_pace(n, Pace::Walk);
        sim.set_attack_order(n, s);
    }
    // Ground is the BACKLINE under the PRESS — sampled mid-grind (t8..28) while
    // both still fight cohesively, NOT after one collapses (a beaten unit gives
    // ground because it LOST, which is balance, not the press-holds-ground physics
    // this invariant pins). Track the worst backward give of each rear.
    let (sy0, ny0) = (backline_y(&sim, s), backline_y(&sim, n));
    let (mut ps, mut pn, mut samples) = (0.0f32, 0.0f32, 0usize);
    let (mut s_back, mut n_back) = (0.0f32, 0.0f32); // worst backward give in-window
    for step in 0..(40.0 / DT) as usize {
        sim.tick();
        let t = step as f32 * DT;
        if (8.0..28.0).contains(&t) {
            s_back = s_back.min(backline_y(&sim, s) - sy0); // south's rear backward = -y
            n_back = n_back.max(backline_y(&sim, n) - ny0); // north's rear backward = +y
            if step % 15 == 0 {
                ps += front_pressure(&sim, s);
                pn += front_pressure(&sim, n);
                samples += 1;
            }
        }
    }
    let k = samples.max(1) as f32;
    (ps / k, pn / k, s_back, n_back)
}

/// INVARIANT 1: two equal engaged units feel equal pressure — attack-vs-hold and
/// attack-vs-attack alike. Order intent is not a pressure advantage.
#[test]
fn equal_units_feel_equal_pressure_attack_or_hold() {
    for def_holds in [false, true] {
        let (ps, pn, _, _) = clash_metrics(def_holds);
        let label = if def_holds { "attack-vs-HOLD" } else { "attack-vs-attack" };
        eprintln!("{label}: south press {ps:.2}  north press {pn:.2}  ratio {:.2}", ps / pn.max(1e-3));
        let (lo, hi) = (ps.min(pn), ps.max(pn));
        assert!(
            hi < lo * 1.25 + 0.3,
            "{label}: equal units must feel ~equal pressure, got {ps:.2} vs {pn:.2}"
        );
    }
}

/// INVARIANT 2: two equal units do not give ground at the BACKLINE under the
/// press — the brace cancels the othismos drive for equals, so neither rear is
/// walked back while both still fight (attack-vs-hold and attack-vs-attack). The
/// FRONT compresses (expected); the REAR holds. (A unit that later collapses and
/// gives ground because it LOST the fight is a balance question, not this one.)
#[test]
fn equal_units_do_not_give_ground() {
    for def_holds in [false, true] {
        let (_, _, s_back, n_back) = clash_metrics(def_holds);
        let label = if def_holds { "attack-vs-HOLD" } else { "attack-vs-attack" };
        eprintln!("{label}: south rear gave {s_back:+.1}m  north rear gave {n_back:+.1}m (backward)");
        assert!(
            s_back > -2.0 && n_back < 2.0,
            "{label}: equal units must hold their REAR under the press: south {s_back:+.1} north {n_back:+.1}"
        );
    }
}

/// INVARIANT 3: a FLANKING unit feels less pressure than a FRONTLINE one. 2v1:
/// the defender (north) is pinned frontally by one attacker and hit on the flank
/// by a second. The frontal presser drives a braced front; the flanker hits an
/// open side — so the flanker's pressure is the lower of the two.
#[test]
fn a_flanker_feels_less_pressure_than_the_frontline() {
    let mut sim = Sim::new(Tunables { micro_rough: 0.0, ..Tunables::default() }, SEED);
    let def = sim.spawn_class(Vec2::new(0.0, 12.0), -FRAC_PI_2, N, UnitClassId::HeavySword, 1);
    let front = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, N, UnitClassId::HeavySword, 0);
    // The flank attacker comes in from the defender's RIGHT (+x), facing -x.
    let flank = sim.spawn_class(Vec2::new(24.0, 12.0), std::f32::consts::PI, N, UnitClassId::HeavySword, 0);
    sim.set_pace(front, Pace::Walk);
    sim.set_attack_order(front, def);
    sim.set_pace(flank, Pace::Walk);
    sim.set_attack_order(flank, def);
    let (mut pf, mut pl, mut samples) = (0.0f32, 0.0f32, 0usize);
    for step in 0..(40.0 / DT) as usize {
        sim.tick();
        let t = step as f32 * DT;
        if (12.0..34.0).contains(&t) && step % 15 == 0 {
            pf += front_pressure(&sim, front);
            pl += front_pressure(&sim, flank);
            samples += 1;
        }
    }
    let k = samples.max(1) as f32;
    let (pf, pl) = (pf / k, pl / k);
    eprintln!("frontline press {pf:.2}  flanker press {pl:.2}  ratio {:.2}", pl / pf.max(1e-3));
    assert!(
        pl < pf * 0.85,
        "a flanking unit must feel LESS pressure than the frontline presser: flank {pl:.2} vs front {pf:.2}"
    );
}
