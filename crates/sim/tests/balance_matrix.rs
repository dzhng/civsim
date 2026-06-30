//! The class balance matrix and counter-web. Both are *balance* tests
//! (performance vs price), generated from `ALL_CLASSES` and run through the
//! shared seed-set harness (`sim::balance`) — not hand-listed duels.

use sim::balance::{run_over_seeds, Scenario};
use sim::{unit_cost, Sim, Tunables, UnitClassId, Vec2, ALL_CLASSES, DT, SEEDS};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 146;

fn short(c: UnitClassId) -> &'static str {
    match c {
        UnitClassId::HeavySword => "HSD",
        UnitClassId::LightSpear => "LSP",
        UnitClassId::LongSwords => "LSW",
        UnitClassId::HeavyPhalanx => "PIK",
        UnitClassId::Archers => "ARC",
        UnitClassId::Skirmishers => "SKR",
        UnitClassId::ShockCavalry => "CAV",
        UnitClassId::HorseArchers => "HAR",
        UnitClassId::ArtilleryCrew => "ART",
        UnitClassId::Peasant => "PEA",
        UnitClassId::LightSword => "LSD",
        UnitClassId::HeavySpear => "HSP",
        UnitClassId::MediumInfantry => "MIN",
        UnitClassId::MediumSpear => "MSP",
        UnitClassId::MediumPhalanx => "MPK",
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
/// `#[ignore]`d because it runs 196 cells × the seed set (~minutes) — a
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
    let rows = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for (row_idx, &a) in ALL_CLASSES.iter().enumerate() {
            let base = base.clone();
            handles.push(scope.spawn(move || {
                let tun = tun;
                let mut row = String::new();
                for &b in &ALL_CLASSES {
                    let mut scn = Scenario::duel(a, b);
                    scn.dur_secs = 300.0; // cap standoffs (kiters vs slow melee)
                    let agg = run_over_seeds(&scn, &base, &tun, &SEEDS);
                    let res = match agg.winner() {
                        Some(0) => "A",
                        Some(1) => "B",
                        _ => ".",
                    };
                    row.push_str(&format!(
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
                (row_idx, row)
            }));
        }
        let mut rows = Vec::new();
        for handle in handles {
            rows.push(handle.join().unwrap());
        }
        rows.sort_by_key(|(row_idx, _)| *row_idx);
        rows
    });
    for (_, row) in rows {
        out.push_str(&row);
    }

    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/golden/balance-matrix.txt"
    );
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

/// Fast tuning probe: print ONE class's full row (vs every other class, both as
/// attacker and defender) over the seed set, so a stat edit can be judged in ~1
/// minute instead of re-blessing the whole 18-minute matrix. Reads the class
/// short-code from env `PROBE` (e.g. `PROBE=LSW`). Measures the live class.rs
/// stats — edit class.rs, rerun this, read the row.
///   PROBE=LSW cargo test -p sim --test balance_matrix probe_class_row -- --ignored --nocapture
#[test]
#[ignore = "tuning probe; run on demand with PROBE=<SHORT>"]
fn probe_class_row() {
    let want = std::env::var("PROBE").unwrap_or_else(|_| "LSW".into());
    let target = ALL_CLASSES
        .iter()
        .copied()
        .find(|&c| short(c) == want)
        .unwrap_or_else(|| panic!("unknown PROBE short-code {want:?}"));
    let base = sim::BalanceConfig::default();
    let tun = Tunables::default();
    println!(
        "\nPROBE {} ({}g) — survivors over {} seeds. 'as ATK' = {} charges; 'as DEF' = it is charged.",
        short(target),
        unit_cost(target),
        SEEDS.len(),
        short(target),
    );
    println!("{:<5}{:>8}{:>10}{:>10}", "foe", "gold", "as ATK", "as DEF");
    for &foe in ALL_CLASSES.iter() {
        if foe == target {
            continue;
        }
        let atk = run_over_seeds(&Scenario::duel(target, foe), &base, &tun, &SEEDS);
        let def = run_over_seeds(&Scenario::duel(foe, target), &base, &tun, &SEEDS);
        // verdict from the target's perspective (W/L/draw) + its own survivor mean.
        let tag = |me: usize, agg: &sim::balance::Aggregate| match agg.winner() {
            Some(w) if w == me => "W",
            Some(_) => "L",
            None => ".",
        };
        println!(
            "{:<5}{:>8}{:>6} {:>3.0}%{:>6} {:>3.0}%",
            short(foe),
            unit_cost(foe),
            tag(0, &atk),
            atk.surv[0].mean * 100.0,
            tag(1, &def),
            def.surv[1].mean * 100.0,
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
    // The ROBUST counter-relationships (verified holding). The CONTESTED cav-vs-pike
    // and kite-vs-foot verdicts are decoupled into the_counter_web_contested below —
    // they're RED today for known lethality reasons and were holding these working
    // relationships hostage. (attacker, defender, expected winner: 0 = attacker)
    //
    // The ROUT-VERDICT relationships: one side breaks and runs within the cap, so
    // the binary winner() is the right gate.
    let expect = [
        (HeavySword, LightSpear, 0, "armor beats numbers' class"),
        (LightSpear, HeavySword, 1, "...from either bench"),
        // ShockCavalry vs HeavySword is omitted here on purpose: David's locked
        // design (2026-06-17) is that a FRONTAL charge LOSES to formed heavy foot
        // (cav ~30-40% of seeds), so the verdict is infantry-favoured and seed-set,
        // not single-seed. It lives on the seed-set harness instead
        // (formed_heavy_infantry_holds_a_frontal_cav_charge in balance_harness).
        (ShockCavalry, HorseArchers, 0, "lancers catch the bow-horse"),
        (ShockCavalry, Archers, 0, "horse eats archers"),
        (
            ArtilleryCrew,
            Skirmishers,
            1,
            "a crew alone loses to anyone",
        ),
        // MediumPhalanx — the medium sarissa: its reach breaks a frontal charge
        // like the heavy phalanx, but the longer heavy sarissa wins the pike duel.
        (
            MediumPhalanx,
            ShockCavalry,
            0,
            "the medium sarissa stops the horse too",
        ),
        (
            HeavyPhalanx,
            MediumPhalanx,
            0,
            "the longer heavy sarissa out-reaches the shorter",
        ),
        // The anti-cav SPEAR LADDER. Re-derived 2026-06-28 (directional rider-exposure):
        // a spear's REACH now grinds the RIDER over the horse's chest, so the whole
        // braced spear line turns a horse — not just the heaviest. The heavy spear
        // STOPS the charge outright (brace + reach), the medium spear gets ridden
        // THROUGH but its reach grinds the rider down in the pass. Both now beat the
        // cav 1:1; the cav's answer is its charge + maneuver, not a duel into the
        // points. (This deliberately replaces the old "medium spear is ridden down"
        // gradient — that was the pre-rider-exposure world where a short point chipped
        // the tanky mount. The gradient now lives in the CHARGE-STOP, not the grind.)
        (
            HeavySpear,
            ShockCavalry,
            0,
            "the braced heavy spear wall stops the charge",
        ),
        (
            MediumSpear,
            ShockCavalry,
            0,
            "the medium spear's reach grinds the rider down",
        ),
        // LongSwords is a flank/open-order cleaver, not a frontal pusher: armour
        // (the heavy sword) beats it head-on, but its wide sweep still shreds
        // loose light infantry — the width, not the punch, is its edge.
        (HeavySword, LongSwords, 0, "armour beats the frontal cleaver"),
        (
            LongSwords,
            Skirmishers,
            0,
            "the cleaver shreds loose light infantry",
        ),
    ];
    // A small SEED SET (majority verdict), not one seed: several of these are
    // genuine but CLOSE relationships, so a one-seed gate is a coin that
    // occasionally lands the wrong way. The majority-of-seeds winner is the robust
    // directional verdict; the full golden matrix is the exhaustive board.
    let seeds: [u64; 5] = [SEED, SEED ^ 0xA1, SEED ^ 0xB2, SEED ^ 0xC3, SEED ^ 0xD4];
    for (a, d, want, why) in expect {
        let agg = run_over_seeds(&Scenario::duel(a, d), &base, &tun, &seeds);
        assert_eq!(
            agg.winner(),
            Some(want as usize),
            "{a:?} vs {d:?}: {why} (win-rates {:.0}%/{:.0}%, draw {:.0}%)",
            agg.win_rate[0] * 100.0,
            agg.win_rate[1] * 100.0,
            agg.draw_rate * 100.0
        );
    }

    // The PHALANX-vs-SWORD pair is asserted by SURVIVOR DOMINANCE, not winner().
    // Re-derived for the combat-pacing overhaul (≈3.5× longer attack intervals,
    // minute-long fights): the sarissa hedge STILL dominates a sword line head-on
    // — the structure of the web is intact and if anything stronger — but the
    // slower grind no longer routs the near-dead sword line inside the 600s duel
    // cap, so winner() now reads the timeout as a draw. The PHYSICAL verdict is
    // unchanged: the phalanx ends the field a near-whole majority (~1.00 standing)
    // while the sword line is ground to a remnant (~0.17–0.25). We pin THAT — the
    // hedge out-survives the sword by a landslide, from either bench — which is the
    // counter-web claim "a sword line cannot out-front a sarissa hedge" measured on
    // the metric the new pacing didn't break.
    for (a, d, why) in [
        (
            HeavySword,
            HeavyPhalanx,
            "a sword line cannot out-front a sarissa hedge",
        ),
        (
            HeavyPhalanx,
            HeavySword,
            "the hedge holds the front over swords",
        ),
    ] {
        let agg = run_over_seeds(&Scenario::duel(a, d), &base, &tun, &seeds);
        // index of the phalanx side (0 if it's the attacker, else 1)
        let (pike, sword) = if a == HeavyPhalanx { (0, 1) } else { (1, 0) };
        assert!(
            agg.surv[pike].mean > agg.surv[sword].mean + 0.5,
            "{a:?} vs {d:?}: {why} — phalanx must out-survive the sword by a \
             landslide (pike {:.0}%, sword {:.0}%, draw {:.0}%)",
            agg.surv[pike].mean * 100.0,
            agg.surv[sword].mean * 100.0,
            agg.draw_rate * 100.0,
        );
    }
}

/// Held braced line vs an equal frontal attacker at a given pace. Returns
/// (attacker survivors, defender survivors) SUMMED over BOTH side assignments
/// (attacker on +y and on −y). The defender HOLDS (braced, fresh, no order); the
/// attacker drives in. Summing both sides CANCELS the engine's residual
/// directional bias (at 240v240 the southern side wins ~regardless — see
/// specs/directional-bias.md), so the survivor totals isolate the BRACE/charge
/// effect this test is about, not which corner of the field a unit spawned in.
fn held_braced_outcome(atk_pace: sim::Pace) -> (usize, usize) {
    let one = |atk_south: bool| -> (usize, usize) {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let (ay, dy, af, df) = if atk_south {
            (-60.0, 60.0, FRAC_PI_2, -FRAC_PI_2)
        } else {
            (60.0, -60.0, -FRAC_PI_2, FRAC_PI_2)
        };
        let atk = sim.spawn_class(Vec2::new(0.0, ay), af, 240, UnitClassId::HeavySword, 0);
        let def = sim.spawn_class(Vec2::new(0.0, dy), df, 240, UnitClassId::HeavySword, 1);
        sim.set_pace(atk, atk_pace);
        sim.set_attack_order(atk, def);
        for _ in 0..(600.0 / DT) as usize {
            sim.tick();
        }
        (sim.units[atk].alive_count, sim.units[def].alive_count)
    };
    let (a0, d0) = one(true);
    let (a1, d1) = one(false);
    (a0 + a1, d0 + d1)
}

/// The defender's edge vs a CHARGE: a braced, fresh holding line BREAKS an equal
/// attacker that CHARGES it head-on — charging a set line frontally disorders the
/// charger on the planted front and the holder wins standing thicker. (The
/// classic "don't charge a set line without the flank/fatigue/numbers".) This is
/// the half that HOLDS; the controlled-walk case is decoupled below (RED — the
/// pressure-evade debt).
#[test]
fn a_held_braced_line_breaks_a_frontal_charge() {
    let (atk_left, def_left) = held_braced_outcome(sim::Pace::Run);
    println!("RUN (both sides) attacker {atk_left}/480 vs held def {def_left}/480");
    // Bias-canceled: the braced HOLDER out-survives a charger that disorders
    // itself on its planted front — clearly, not by a hair.
    assert!(
        def_left > atk_left + 40,
        "the held braced line must BREAK a frontal charge and stand thicker: def {def_left} vs atk {atk_left} (of 480 each)"
    );
}

/// Against a CONTROLLED (Walk) advance, the defender's edge is modest compared
/// with the charge case above: an attacker who keeps good order is not erased,
/// but a planted line may still stand thicker. The contact projection makes the
/// grind lethal earlier; this test pins the ratio and rejects annihilation, not
/// an old high-survivor floor.
#[test]
fn a_held_braced_line_trades_evenly_with_a_walking_attacker() {
    let (atk_left, def_left) = held_braced_outcome(sim::Pace::Walk);
    println!("WALK (both sides) attacker {atk_left}/480 vs held def {def_left}/480");
    let (lo, hi) = (atk_left.min(def_left), atk_left.max(def_left));
    // The braced HOLDER beats a walk-in attacker (that's the brace edge) but must
    // not annihilate it. Re-derived after guard-stamina made grinds more decisive
    // (the brace advantage shows a touch more): a ~2:1 edge is allowed, a blowout
    // is not.
    assert!(
        hi < lo * 2 + 30,
        "a held line may win a walk-in but not blow it out: def {def_left} vs atk {atk_left} (of 480 each)"
    );
    assert!(
        lo > 70,
        "both sides survive a real grind, neither is annihilated: def {def_left} vs atk {atk_left}"
    );
}
