//! The class balance matrix and counter-web. Both are *balance* tests
//! (performance vs price), generated from `ALL_CLASSES` and run through the
//! shared seed-set harness (`sim::balance`) — not hand-listed duels.

use sim::balance::{run_once, run_over_seeds, Scenario};
use sim::{unit_cost, Sim, Tunables, UnitClassId, Vec2, ALL_CLASSES, DT, SEEDS};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 146;

fn short(c: UnitClassId) -> &'static str {
    match c {
        UnitClassId::HeavySword => "HSD",
        UnitClassId::LightSpear => "LSP",
        UnitClassId::LongSwords => "LSW",
        UnitClassId::Phalanx => "PIK",
        UnitClassId::Archers => "ARC",
        UnitClassId::Skirmishers => "SKR",
        UnitClassId::ShockCavalry => "CAV",
        UnitClassId::HorseArchers => "HAR",
        UnitClassId::ArtilleryCrew => "ART",
        UnitClassId::Peasant => "PEA",
        UnitClassId::LightSword => "LSD",
        UnitClassId::HeavySpear => "HSP",
    }
}

/// The full `ALL_CLASSES²` board, generated and golden-pinned. Each cell is a
/// 1v1 at duel strength over the seed set; the row reports the seed-median
/// outcome plus the **gold lens** (`unit_cost` per side) so a reader can judge
/// price fairness: CAV beating HVY is fine if it cost more, suspect if it
/// didn't. (Slot lens is 1/1 for every 1v1 cell; it matters in the N-v-M
/// scenarios — see `balance_harness.rs`.) Survivor% is banded to 25% so seed
/// jitter never churns the golden.
///
/// `#[ignore]`d because it runs 144 cells × the seed set (~minutes) — a
/// measurement and a deliberate regression, not an every-session gate (the
/// counter-web below is the fast always-on net). Bless after an intended
/// balance change and read the diff AS the balance review:
///   UPDATE_BALANCE=1 cargo test -p sim --test balance_matrix \
///     golden_balance_matrix -- --ignored --nocapture
#[test]
#[ignore = "full N-seed matrix (~minutes); run on demand / when tuning"]
fn golden_balance_matrix() {
    let base = sim::BalanceConfig::default();
    let tun = Tunables::default();
    let band = |x: f32| (((x * 100.0) / 25.0).round() * 25.0) as i32;

    let mut out = String::new();
    out.push_str("# Balance matrix — 1v1 at duel strength, seed-median, morale on.\n");
    out.push_str("# RES: A = row (attacker) wins, B = col (defender) wins, . = no verdict.\n");
    out.push_str("# survA/survB banded to 25%; gold = unit_cost per side (the price lens).\n");
    out.push_str(&format!(
        "{:<4} {:<4} {:>3} {:>5} {:>5} {:>5} {:>6} {:>6}\n",
        "ATK", "DEF", "RES", "survA", "survB", "t", "goldA", "goldB"
    ));
    for &a in &ALL_CLASSES {
        for &b in &ALL_CLASSES {
            let mut scn = Scenario::duel(a, b);
            scn.dur_secs = 300.0; // cap standoffs (kiters vs slow melee)
            let agg = run_over_seeds(&scn, &base, &tun, &SEEDS);
            let res = match agg.winner() {
                Some(0) => "A",
                Some(1) => "B",
                _ => ".",
            };
            out.push_str(&format!(
                "{:<4} {:<4} {:>3} {:>4}% {:>4}% {:>4.0}s {:>6} {:>6}\n",
                short(a),
                short(b),
                res,
                band(agg.surv[0].median),
                band(agg.surv[1].median),
                agg.secs_median,
                unit_cost(a),
                unit_cost(b),
            ));
        }
    }

    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/golden/balance-matrix.txt");
    if std::env::var("UPDATE_BALANCE").is_ok() || !std::path::Path::new(path).exists() {
        std::fs::create_dir_all(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/golden")).unwrap();
        std::fs::write(path, &out).unwrap();
        println!("blessed balance matrix:\n{out}");
    } else {
        let want = std::fs::read_to_string(path).unwrap();
        assert_eq!(
            out, want,
            "balance matrix moved — if intended, re-bless with UPDATE_BALANCE=1 \
             and read the diff as a balance review"
        );
    }
}

/// The counter-web: the matchups history has opinions about, asserted through
/// the same harness runner as the matrix (single seed for speed — this is the
/// fast always-on directional gate; the golden matrix is the seed-robust
/// board). These are *derived* from the matrix, not a separate bench.
#[test]
fn the_counter_web_holds() {
    use UnitClassId::*;
    let base = sim::BalanceConfig::default();
    let tun = Tunables::default();
    // (attacker, defender, expected winner: 0 = attacker)
    let expect = [
        (HeavySword, LightSpear, 0, "armor beats numbers' class"),
        (LightSpear, HeavySword, 1, "...from either bench"),
        (HeavySword, Phalanx, 1, "a sword line cannot out-front a sarissa hedge"),
        (Phalanx, HeavySword, 0, "the hedge advances over swords"),
        (ShockCavalry, Phalanx, 1, "POINTS STOP HORSE (frontally)"),
        (Phalanx, ShockCavalry, 0, "and the hedge can walk horse off a field"),
        // ShockCavalry vs HeavySword — "horse rides over swords" — is a CLOSE
        // matchup (the cav wins ~3/4 of seeds, not all), so a single-seed verdict
        // here is a coin that lands either way. It lives on the seed-set harness
        // instead (cavalry_usually_rides_over_heavy_swords in balance_harness).
        (ShockCavalry, HorseArchers, 0, "lancers catch the bow-horse"),
        (HorseArchers, HeavySword, 0, "unsupported foot loses to the kite"),
        // HorseArchers vs Phalanx is split into its two real mechanics — the
        // quiver-vs-shield-wall kite (a_phalanx_outlasts_the_quiver...) and the
        // frontal charge (a_frontal_charge_into_pikes...) — because the head-on
        // duel here is neither: the bow-horse closes to melee and the quiver
        // never empties, so a single verdict mislabels the matchup.
        (ShockCavalry, Archers, 0, "horse eats archers"),
        (ArtilleryCrew, Skirmishers, 1, "a crew alone loses to anyone"),
    ];
    for (a, d, want, why) in expect {
        let o = run_once(&Scenario::duel(a, d), &base, &tun, SEED);
        assert_eq!(
            o.victor, want,
            "{a:?} vs {d:?}: {why} (got verdict {}, {:.0}%/{:.0}% at {:.0}s)",
            o.victor,
            o.surv[0] * 100.0,
            o.surv[1] * 100.0,
            o.secs
        );
    }
}

/// The defender's edge: an equal unit that HOLDS its ground (braced, fresh)
/// beats one that charges into it head-on. Charging a set line frontally
/// without support is a losing proposition — you want the flank, the
/// fatigue, or the numbers, not a fair frontal clash against a braced foe.
#[test]
fn a_held_braced_line_beats_an_equal_frontal_attacker() {
    let outcome = |atk_pace: sim::Pace| -> (u32, usize, usize) {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let atk = sim.spawn_class(Vec2::new(0.0, -60.0), FRAC_PI_2, 240, UnitClassId::HeavySword, 0);
        let def = sim.spawn_class(Vec2::new(0.0, 60.0), -FRAC_PI_2, 240, UnitClassId::HeavySword, 1);
        sim.set_pace(atk, atk_pace);
        sim.set_attack_order(atk, def); // the defender HOLDS — no order, braced
        let mut verdict = None;
        for _ in 0..(600.0 / DT) as usize {
            sim.tick();
            if verdict.is_none() {
                verdict = sim.victor();
            }
        }
        (
            verdict.unwrap_or(9),
            sim.units[atk].alive_count,
            sim.units[def].alive_count,
        )
    };
    for pace in [sim::Pace::Walk, sim::Pace::Run] {
        let (v, atk_left, def_left) = outcome(pace);
        println!("{pace:?} attacker {atk_left}/240 vs held def {def_left}/240, verdict {v}");
        assert_eq!(v, 1, "the held braced line must win against a frontal {pace:?} attack");
        assert!(
            def_left > atk_left,
            "and stand thicker than the attacker it broke: def {def_left} vs atk {atk_left}"
        );
    }
}
