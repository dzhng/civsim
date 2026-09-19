//! TARGET SELECTION mechanics: a soldier targets the foe
//! it can bring its wielded weapon to bear on SOONEST — turn-to-edge + travel —
//! not the nearest body. A mounted sabre reaches only its FLANK lobes (blind over
//! the horse's head), so cost-based targeting prefers a foe already in the flank
//! lobe over a nearer one stuck in the blind front.
//!
//! Foot is unaffected by construction (a man on foot pivots freely → turn cost 0
//! → cost is pure distance → targeting is exactly nearest); these tests pin the
//! MOUNTED behavior.

use sim::{Sim, Tunables, UnitClassId, Vec2};
use std::f32::consts::{FRAC_PI_2, PI};

/// First soldier index of a unit (a 1-man unit IS that soldier).
fn first(sim: &Sim, unit: usize) -> usize {
    sim.units[unit].start
}

/// A lone mounted sabreur facing east (+x), a foe dead-AHEAD in its blind front,
/// and a foe at 90° (north) sitting squarely in its left flank lobe but a little
/// FARTHER away. The arc-aware rider must pick the flank foe — the one it can
/// actually cut — over the nearer one it would have to wheel onto.
#[test]
fn a_mounted_sabreur_targets_the_foe_in_its_flank_not_the_nearer_one_in_its_blind_front() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, 7);

    // Rider at origin facing east. A wide sabre is blind ~±40° over the horse's
    // head, so a foe due east is unreachable without a wheel.
    let rider = sim.spawn_class(Vec2::new(0.0, 0.0), 0.0, 1, UnitClassId::ShockCavalry, 0);

    // Dead-ahead foe (east), the NEARER body — in the blind front.
    let ahead = sim.spawn_class(Vec2::new(3.0, 0.0), FRAC_PI_2, 1, UnitClassId::Peasant, 1);
    // Flank foe (north), a little FARTHER — in the left flank lobe (~90° off).
    let flank = sim.spawn_class(Vec2::new(0.0, 3.8), FRAC_PI_2, 1, UnitClassId::Peasant, 1);

    let r = first(&sim, rider);
    let ahead_s = first(&sim, ahead);
    let flank_s = first(&sim, flank);

    // A few ticks so targeting settles (it runs every tick; the rider barely
    // moves with both foes already in awareness range).
    for _ in 0..5 {
        sim.tick();
    }

    let t = sim.target[r];
    eprintln!(
        "MOUNTED-TARGET rider→{t} (ahead={ahead_s} dist 3.0 in blind front, flank={flank_s} dist 3.8 in lobe)"
    );
    assert_eq!(
        t, flank_s as i32,
        "a mounted sabreur must target the foe in its flank lobe (s{flank_s}, can cut it now), \
         not the nearer one in its blind front (s{ahead_s}, would have to wheel onto it)"
    );
}

/// The control: the SAME geometry on FOOT. A foot soldier pivots freely (no blind
/// front, turn cost 0), so its targeting is pure nearest — it picks the closer
/// dead-ahead foe, exactly as before the spine. This pins that the arc cost is a
/// mounted-only distinction and foot targeting is unchanged.
#[test]
fn a_foot_soldier_still_targets_the_nearest_body() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, 7);

    let me = sim.spawn_class(Vec2::new(0.0, 0.0), 0.0, 1, UnitClassId::HeavySword, 0);
    let ahead = sim.spawn_class(Vec2::new(3.0, 0.0), FRAC_PI_2, 1, UnitClassId::Peasant, 1);
    let flank = sim.spawn_class(Vec2::new(0.0, 3.8), FRAC_PI_2, 1, UnitClassId::Peasant, 1);

    let m = first(&sim, me);
    let ahead_s = first(&sim, ahead);
    let flank_s = first(&sim, flank);

    for _ in 0..5 {
        sim.tick();
    }

    let t = sim.target[m];
    eprintln!("FOOT-TARGET soldier→{t} (ahead={ahead_s} dist 3.0, flank={flank_s} dist 3.8)");
    assert_eq!(
        t, ahead_s as i32,
        "a foot soldier targets the nearest body (s{ahead_s} at 3.0), not the farther flank foe (s{flank_s} at 3.8)"
    );
}

/// A search that finds NO foe reads NOTHING off the comrades it scanned. Two
/// dense blocks 30m apart are inside the coarse unit gate (the scan runs), and
/// every man has comrades a metre away (the scan records them), but no enemy is
/// within engage range — so each search returns before a single friend is
/// consumed, and the derived state those friends feed (awareness, the frontage
/// flag) stays untouched. This is what lets the search discard that set whole.
#[test]
fn a_search_with_no_target_reads_nothing_off_its_comrades() {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, 11);

    let spacing = Vec2::new(0.9, 1.1);
    sim.spawn_unit(Vec2::new(-15.0, 0.0), 0.0, 40, 10, spacing, 0, 0.7);
    sim.spawn_unit(Vec2::new(15.0, 0.0), PI, 40, 10, spacing, 1, 0.7);

    // Targeting visits a third of the soldiers per tick; three ticks is one
    // full pass, and nobody has closed the 25m gap in that time.
    for _ in 0..3 {
        sim.tick();
    }

    for i in 0..sim.alive.len() {
        assert_eq!(sim.target[i], -1, "s{i} has no foe in engage range");
        assert_eq!(
            sim.awareness[i], 1.0,
            "s{i} awareness moved off its default: a targetless search consumed its comrades"
        );
        assert_eq!(sim.front_clear[i], 1, "s{i} frontage flag moved");
    }
}
