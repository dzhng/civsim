//! DISENGAGE / EXTRACT-FROM-GRIND mechanics.
//!
//! A unit pinned in a grind (charge spent, badly disordered) and ordered to
//! DISENGAGE must PEEL OFF and run — in ANY direction — wheeling onto its escape
//! heading WHILE it moves, never halting to do a drilled about-face. Two ways the
//! old code stranded it, both fixed and pinned here:
//!
//!   1. the GATHER (re-seat on a clean grid, walk until re-formed) fired even
//!      while still engaged, where a unit CANNOT re-form — it just walked in
//!      place getting chewed. The gather is for a FREE blob (a trampler pulled
//!      out of a dive), so it now requires `engaged == 0`.
//!   2. the about-face HALTED then rotated at a COHESION-throttled rate, so a
//!      disordered unit (cohesion ~0, which it stays while engaged) turned at a
//!      crawl AND coasted its charge momentum straight into the foe before it
//!      could rotate. Disengage now drifts toward the escape point while wheeling
//!      at the full geometric rate — cohesion no longer throttles any turn.
//!
//! Immortal units so nobody dies — pure extraction physics, no balance. The foe
//! is a DEEP braced wall so the charge stalls into a real grind (a shallow line
//! the immortal horse would simply ride through).

mod common;

use common::{ref_spear, spawn_cav};
use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// Grind an immortal cav block head-on into an immortal deep braced wall until
/// the cav is well disordered, then DISENGAGE toward `escape`. Returns (distance
/// the cav travelled TOWARD the escape point over the window, cohesion at the
/// moment the order was given). A clean peel-off = large toward-escape distance;
/// pinned/strangled = ~0 (or negative, driven the wrong way into the foe).
fn disengage_progress(escape: Vec2) -> (f32, f32) {
    let mut tun = Tunables::default();
    tun.morale_enabled = false;
    tun.micro_rough = 0.0;
    let mut sim = Sim::new(tun, 7);

    let cu = spawn_cav(&mut sim, Vec2::new(0.0, -22.0), FRAC_PI_2, 120, 0);
    // 200 men, 10 files = 20 ranks: deep enough that the charge STALLS into a
    // grind instead of the immortal horse riding clean through.
    let fu = sim.spawn(sim::SpawnSpec {
        anchor: Vec2::new(0.0, 8.0),
        facing: -FRAC_PI_2,
        count: 200,
        files: Some(10),
        class: UnitClassId::HeavySpear,
        stats: ref_spear(2.4, 0.5, true),
        look: UnitClassId::HeavySpear as u32,
        team: 1,
    });
    for u in [cu, fu] {
        let (s, e) = (sim.units[u].start, sim.units[u].start + sim.units[u].count);
        for k in s..e {
            sim.health[k] = 1.0e9;
        }
    }
    sim.set_attack_order(cu, fu);
    sim.set_attack_order(fu, cu);

    let mut coh_at_order = 1.0;
    for _ in 0..(12.0 / DT) as usize {
        sim.tick();
        coh_at_order = sim.units[cu].cohesion;
        if coh_at_order < 0.5 && sim.units[cu].engaged > 10 {
            break;
        }
    }

    let dir = {
        let d = escape - sim.units[cu].centroid;
        d * (1.0 / d.len())
    };
    let start = sim.units[cu].centroid;
    sim.set_disengage_order(cu, escape);
    for _ in 0..(16.0 / DT) as usize {
        sim.tick();
    }
    // Progress measured ALONG the escape bearing, so the test is direction-agnostic.
    ((sim.units[cu].centroid - start).dot(dir), coh_at_order)
}

/// Disengaging straight back (the classic "click behind to pull the cav out")
/// peels the cav clear of the grind — it does not gather/pivot in place.
#[test]
fn disengage_backward_peels_off() {
    let (progress, coh) = disengage_progress(Vec2::new(0.0, -200.0));
    eprintln!("DISENGAGE back  cohesion {coh:.2} | progress {progress:.1}m");
    assert!(
        coh < 0.75,
        "test must exercise a contact-disordered path, not a clean parade formation (cohesion {coh:.2} < 0.75)"
    );
    assert!(
        progress > 12.0,
        "a disengaged cav must peel out of the grind, not stall in it: {progress:.1}m toward escape"
    );
}

/// The peel-off is not special to "backward": ordered away on a DIAGONAL the cav
/// wheels and runs there just the same — extraction is about being engaged and
/// told to flee, not about a specific heading.
#[test]
fn disengage_sideways_peels_off() {
    let (progress, _) = disengage_progress(Vec2::new(140.0, -140.0));
    eprintln!("DISENGAGE diag  progress {progress:.1}m");
    // Diagonal extraction keeps scraping along the enemy frontage longer than a
    // straight backward pull. The invariant is that it makes a real peel-off,
    // not that it matches the easier straight-back distance metre for metre.
    assert!(
        progress > 8.0,
        "a cav disengaged on a diagonal must wheel and run there too: {progress:.1}m toward escape"
    );
}
