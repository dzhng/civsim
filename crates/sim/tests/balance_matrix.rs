//! The 1v1 matchup matrix: every class pair at duel strength, head-on,
//! morale on. The measurement base for game balance — run with
//! --nocapture to see the full board.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 146;

pub const ALL: [UnitClassId; 9] = [
    UnitClassId::HeavyInfantry,
    UnitClassId::LightInfantry,
    UnitClassId::LongSwords,
    UnitClassId::Phalanx,
    UnitClassId::Archers,
    UnitClassId::Skirmishers,
    UnitClassId::ShockCavalry,
    UnitClassId::HorseArchers,
    UnitClassId::ArtilleryCrew,
];

fn short(c: UnitClassId) -> &'static str {
    match c {
        UnitClassId::HeavyInfantry => "HVY",
        UnitClassId::LightInfantry => "LGT",
        UnitClassId::LongSwords => "LSW",
        UnitClassId::Phalanx => "PIK",
        UnitClassId::Archers => "ARC",
        UnitClassId::Skirmishers => "SKR",
        UnitClassId::ShockCavalry => "CAV",
        UnitClassId::HorseArchers => "HAR",
        UnitClassId::ArtilleryCrew => "ART",
    }
}

/// Head-on duel at setup_duel strengths. Returns (verdict, a_left_frac,
/// b_left_frac, seconds). verdict: 0 = a wins, 1 = b wins, 2 = no verdict
/// in the window (a standoff is a real outcome: kiters vs slow melee).
pub fn duel(a: UnitClassId, b: UnitClassId, seed: u64) -> (u32, f32, f32, f32) {
    let mut sim = Sim::new(Tunables::default(), seed);
    sim::setup_duel(&mut sim, a, b);
    sim.set_attack_order(0, 1);
    sim.set_attack_order(1, 0);
    let (na, nb) = (sim.units[0].count as f32, sim.units[1].count as f32);
    for step in 0..(600.0 / DT) as usize {
        sim.tick();
        if let Some(v) = sim.victor() {
            return (
                v,
                sim.units[0].alive_count as f32 / na,
                sim.units[1].alive_count as f32 / nb,
                step as f32 * DT,
            );
        }
    }
    (
        2,
        sim.units[0].alive_count as f32 / na,
        sim.units[1].alive_count as f32 / nb,
        600.0,
    )
}

#[test]
fn measure_the_matrix() {
    println!("\n      defender →");
    print!("atk ↓ ");
    for d in ALL {
        print!("{:>14}", short(d));
    }
    println!();
    for a in ALL {
        print!("{:>5} ", short(a));
        for d in ALL {
            let (v, fa, fb, t) = duel(a, d, SEED);
            let cell = match v {
                0 => format!("W {:>3.0}%@{:>3.0}s", fa * 100.0, t),
                1 => format!("L {:>3.0}%@{:>3.0}s", fb * 100.0, t),
                _ => format!("draw {:>2.0}/{:>2.0}%", fa * 100.0, fb * 100.0),
            };
            print!("{cell:>14}");
        }
        println!();
    }
}

/// David's anchor: one heavy unit solos TWO light units, all head-on.
#[test]
fn one_heavy_solos_two_lights_head_on() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let hv = sim.spawn_class(Vec2::new(0.0, -60.0), FRAC_PI_2, 240, UnitClassId::HeavyInfantry, 0);
    let l1 = sim.spawn_class(Vec2::new(-25.0, 60.0), -FRAC_PI_2, 220, UnitClassId::LightInfantry, 1);
    let l2 = sim.spawn_class(Vec2::new(25.0, 60.0), -FRAC_PI_2, 220, UnitClassId::LightInfantry, 1);
    sim.set_attack_order(l1, hv);
    sim.set_attack_order(l2, hv);
    sim.set_attack_order(hv, l1);
    let mut verdict = None;
    for _ in 0..(600.0 / DT) as usize {
        sim.tick();
        verdict = sim.victor();
        if verdict.is_some() {
            break;
        }
    }
    println!(
        "heavy {}/240 vs lights {}+{}/440, verdict {:?}",
        sim.units[hv].alive_count, sim.units[l1].alive_count, sim.units[l2].alive_count, verdict
    );
    assert_eq!(verdict, Some(0), "armor beats numbers head-on: the heavy unit must win");
    assert!(
        sim.units[hv].alive_count > 60,
        "and live to tell it: {}/240",
        sim.units[hv].alive_count
    );
}

/// The counter web, pinned from the measured matrix (run measure_the_matrix
/// --nocapture for the live board). Every class pair RUNS in that board;
/// these are the matchups history has opinions about.
#[test]
fn the_counter_web_holds() {
    use UnitClassId::*;
    // (attacker, defender, expected winner: 0 = attacker)
    let expect = [
        (HeavyInfantry, LightInfantry, 0, "armor beats numbers' class"),
        (LightInfantry, HeavyInfantry, 1, "...from either bench"),
        (HeavyInfantry, Phalanx, 1, "a sword line cannot out-front a sarissa hedge"),
        (Phalanx, HeavyInfantry, 0, "the hedge advances over swords"),
        (ShockCavalry, Phalanx, 1, "POINTS STOP HORSE (frontally)"),
        (Phalanx, ShockCavalry, 0, "and the hedge can walk horse off a field"),
        (ShockCavalry, HeavyInfantry, 0, "horse rides over swords"),
        (ShockCavalry, HorseArchers, 0, "lancers catch the bow-horse"),
        (HorseArchers, HeavyInfantry, 0, "unsupported foot loses to the kite"),
        (HorseArchers, Phalanx, 1, "but a patient wall outlasts the quiver"),
        (ShockCavalry, Archers, 0, "horse eats archers"),
        (ArtilleryCrew, Skirmishers, 1, "a crew alone loses to anyone"),
    ];
    for (a, d, want, why) in expect {
        let (v, fa, fb, t) = duel(a, d, SEED);
        assert_eq!(
            v, want,
            "{a:?} vs {d:?}: {why} (got verdict {v}, {:.0}%/{:.0}% at {t:.0}s)",
            fa * 100.0,
            fb * 100.0
        );
    }
}
