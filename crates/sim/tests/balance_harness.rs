//! Exercises the N-seed balance harness (`sim::balance`). These are *balance*
//! tests — performance-vs-price characterisations over a seed set, not single-
//! seed physics claims. Aggregates print their spread so a coin-flip matchup is
//! visible as variance rather than a flapping pass.

use sim::balance::{duel_strength, report, run_over_seeds, Scenario};
use sim::{BalanceConfig, Tunables, UnitClassId, SEEDS};

fn run(scn: &Scenario) -> sim::Aggregate {
    run_over_seeds(scn, &BalanceConfig::default(), &Tunables::default(), &SEEDS)
}

/// Armor beats numbers head-on, and it does so reliably across seeds — the
/// edge is real, not a seed accident. (The price premium that makes this fair
/// is the slot/gold lens, measured by the matrix; here we pin the combat fact.)
#[test]
fn heavy_beats_light_across_seeds() {
    let agg = run(&Scenario::duel(
        UnitClassId::HeavyInfantry,
        UnitClassId::LightInfantry,
    ));
    println!(
        "{}: win {:?} draw {:.2} survA {:.2}±{:.2} survB {:.2}±{:.2} @{:.0}s",
        agg.name,
        agg.win_rate,
        agg.draw_rate,
        agg.surv[0].mean,
        agg.surv[0].stdev,
        agg.surv[1].mean,
        agg.surv[1].stdev,
        agg.secs_median,
    );
    assert_eq!(agg.winner(), Some(0), "the heavy unit must win the duel");
    assert!(
        agg.win_rate[0] >= 7.0 / 8.0,
        "and reliably: heavy won only {:.0}% of seeds",
        agg.win_rate[0] * 100.0
    );
}

/// David's slot-efficiency anchor as a beyond-1v1 scenario: one heavy unit
/// solos TWO light units head-on. The heavy costs ~3x the gold but takes one
/// army slot to the lights' two — winning here is *correct* balance, and it
/// must hold across seeds. Exercises the runner with N-v-M forces.
#[test]
fn one_heavy_solos_two_lights() {
    let scn = Scenario {
        name: "1xHeavy_vs_2xLight".into(),
        sides: [
            vec![(UnitClassId::HeavyInfantry, duel_strength(UnitClassId::HeavyInfantry))],
            vec![
                (UnitClassId::LightInfantry, 220),
                (UnitClassId::LightInfantry, 220),
            ],
        ],
        run: true,
        dur_secs: 600.0,
    };
    let agg = run(&scn);
    println!(
        "{}: win {:?} survHeavy {:.2}±{:.2} @{:.0}s",
        agg.name, agg.win_rate, agg.surv[0].mean, agg.surv[0].stdev, agg.secs_median,
    );
    assert_eq!(agg.winner(), Some(0), "armor beats numbers: the heavy must win");
    assert!(
        agg.surv[0].mean > 0.2,
        "and live to tell it: only {:.0}% left",
        agg.surv[0].mean * 100.0
    );
}

/// The agent loop, end-to-end: tune one number in a candidate config and the
/// report shows the shift — proving a tuned `BalanceConfig` actually flows into
/// combat (the whole point of lifting stats to runtime). A beefier heavy must
/// leave more men standing in the duel it already wins.
#[test]
fn tuning_a_candidate_config_moves_the_matchup() {
    let mut candidate = BalanceConfig::default();
    let mut hv = candidate.get(UnitClassId::HeavyInfantry);
    hv.health *= 1.4; // thicker armor
    candidate.set(UnitClassId::HeavyInfantry, hv);

    let scn = Scenario::duel(UnitClassId::HeavyInfantry, UnitClassId::LightInfantry);
    let rows = report(&candidate, std::slice::from_ref(&scn), &SEEDS[..3]);
    let r = &rows[0];
    println!(
        "baseline survHeavy {:.2} -> candidate {:.2} (win delta {:+.2})",
        r.baseline.surv[0].mean,
        r.candidate.surv[0].mean,
        r.win_delta()
    );
    assert!(
        r.candidate.surv[0].mean > r.baseline.surv[0].mean + 0.01,
        "tougher heavy must survive more: {:.2} -> {:.2}",
        r.baseline.surv[0].mean,
        r.candidate.surv[0].mean
    );
}

/// The harness must cover every class — the matrix dimension is the registry,
/// not a hand-list. If a class is added to `ALL_CLASSES`, a duel scenario must
/// exist for it (and this asserts the count moved deliberately).
#[test]
fn duel_scenario_exists_for_every_class() {
    assert_eq!(
        sim::ALL_CLASSES.len(),
        10,
        "class count changed — regenerate the balance matrix golden, then bump this"
    );
    for &a in &sim::ALL_CLASSES {
        for &b in &sim::ALL_CLASSES {
            let scn = Scenario::duel(a, b);
            assert_eq!(scn.sides[0][0].0, a);
            assert_eq!(scn.sides[1][0].0, b);
        }
    }
}
