//! MINIMAL repro of the symmetric-clash directional bias (see
//! specs/directional-bias.md). A head-on clash of IDENTICAL units is symmetric
//! under a 180° rotation, so over many seeds neither POSITION may systematically
//! win. The bias is a deterministic positional preference, seeded by a sub-ULP FP
//! asymmetry (`cos` is even, so `dir(+π/2)` and `dir(−π/2)` share an x-residue
//! that breaks the mirror) and amplified by the combat equilibrium's instability.
//! Its SIGN FLIPS with scale: at 1v1 the north (+y) unit wins, at army scale the
//! south unit wins (crossover ~n=16–30).
//!
//! These are the smallest repros — a 1v1 has TWO soldiers; every event is
//! traceable. They are RED until the combat equilibrium is stabilized (do NOT
//! repin them green — they correctly catch a real engine instability).

use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// Over `seeds`, how often does the SOUTH unit (at −y, facing +y) win an n-vs-n
/// head-on clash of identical HeavySword units? Fair ⇒ about half.
///
/// Morale is OFF: these tests measure the COMBAT/positional bias, and morale is a
/// confound — at small n the ≤9-man guaranteed-break rule (a unit ground to ≤9 men
/// is finished — the intended design) routs BOTH 1v1/3v3 units on the first beat
/// for zero deaths, so the death-count winner is structurally 0 (0 < 0 is false).
/// With morale off the duel actually resolves, so the win-count reflects the combat
/// fairness the test is about.
fn south_win_count(n: usize, seeds: u64) -> u64 {
    let files = (n as f32).sqrt().ceil() as usize;
    (0..seeds)
        .filter(|&seed| {
            let mut sim = Sim::new(
                Tunables { micro_rough: 0.0, morale_enabled: false, ..Tunables::default() },
                seed,
            );
            let s = sim.spawn_class(Vec2::new(0.0, -8.0), FRAC_PI_2, n, UnitClassId::HeavySword, 0);
            let no = sim.spawn_class(Vec2::new(0.0, 8.0), -FRAC_PI_2, n, UnitClassId::HeavySword, 1);
            sim.set_files(s, files);
            sim.set_files(no, files);
            sim.set_pace(s, Pace::Run);
            sim.set_pace(no, Pace::Run);
            sim.set_attack_order(s, no);
            sim.set_attack_order(no, s);
            for _ in 0..(120.0 / DT) as usize {
                sim.tick();
            }
            (n - sim.units[s].alive_count) < (n - sim.units[no].alive_count)
        })
        .count() as u64
}

/// THE minimal repro: a 1v1 (two soldiers). Identical units, mirrored placement —
/// neither side may win every time. With morale off the duel resolves to a death
/// each (one winner per seed); over 24 seeds it sits inside the fair band (a real
/// decisive fight is expected to be lopsided, but no SIDE may win systematically).
#[test]
fn a_one_on_one_duel_is_a_coin_flip_not_a_fixed_winner() {
    let sw = south_win_count(1, 24);
    eprintln!("1v1: south won {sw}/24 (≈12 = fair; 0 or 24 = a fixed-winner bias)");
    assert!(
        (6..=18).contains(&sw),
        "a 1v1 of identical units has a FIXED winner ({sw}/24) — a deterministic \
         directional bias, not the luck of a decisive fight (see specs/directional-bias.md)"
    );
}

/// The bias FLIPS sign with scale — pinned so the fix must make BOTH ends fair,
/// not just shift the crossover. Currently RED at both ends (1v1 north, army south).
#[test]
fn the_clash_winner_does_not_depend_on_unit_size() {
    let small = south_win_count(3, 16); // small: north favored
    let large = south_win_count(120, 16); // army: south favored
    eprintln!("south wins: n=3 → {small}/16,  n=120 → {large}/16 (both ≈8 = fair, scale-independent)");
    assert!(
        (3..=13).contains(&small) && (3..=13).contains(&large),
        "the winner depends on UNIT SIZE (n=3: {small}/16, n=120: {large}/16) — the \
         directional bias flips sign with scale; a fair engine is scale-independent"
    );
}
