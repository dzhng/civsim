//! Native tick-cost probe: the browser's `?map=gen&seed=N` battle, ticked
//! headless so a sampling profiler can name the hot passes, ending in a state
//! hash so a perf change can prove it is bit-identical.
//! `cargo run --release -p sim --bin profile_tick -- [seed] [ticks] [ai]`
//! `cargo run --release -p sim --bin profile_tick -- fighting [soldiers] [earliest_tick]`
//! `fighting [soldier-target]` measures persistent melee; `gate` enforces the
//! native budget. Add `--features perf_timing` for exclusive stage diagnostics;
//! instrumentation overhead is deliberately excluded from the budget build.
use sim::{setup_battle_generated, MapRecipe, Sim, Tunables};
use std::time::Instant;

/// Fold one battle's fingerprint into the run's combined hash.
fn fold(combined: &mut u64, h: u64) {
    *combined = (*combined ^ h)
        .wrapping_mul(0x9e3779b97f4a7c15)
        .rotate_left(17);
}

/// Every class pair in the canonical duel bench plus the four sandboxes: a
/// small, fast field where the lines actually meet, so a change to the contact
/// physics is proven bit-identical in melee, not only on the approach.
fn duels(ticks: usize) {
    use contract::ALL_CLASSES;
    let start = Instant::now();
    let mut combined = 0xcbf29ce484222325u64;
    for &a in &ALL_CLASSES {
        for &b in &ALL_CLASSES {
            let mut sim = Sim::new(Tunables::default(), 11);
            sim::setup_duel(&mut sim, a, b);
            for _ in 0..ticks {
                sim.tick();
            }
            let h = sim.state_hash();
            fold(&mut combined, h);
            println!(
                "duel {a:?} v {b:?}  alive {}  hash {h:#018x}",
                sim.alive.iter().filter(|&&x| x == 1).count()
            );
        }
    }
    for kind in 0..4 {
        let mut sim = Sim::new(Tunables::default(), 11);
        sim::setup_sandbox(&mut sim, kind);
        for _ in 0..ticks {
            sim.tick();
        }
        let h = sim.state_hash();
        fold(&mut combined, h);
        println!("sandbox {kind}  hash {h:#018x}");
    }
    println!(
        "duels ticks {ticks}  combined hash {combined:#018x}  {:.1}s",
        start.elapsed().as_secs_f64()
    );
}

/// Grow through the exact 500-man, 28-file grid used by battle-perf-30k.
fn fighting_battle(target: usize) -> sim::Battle {
    let mut sim = Sim::new(Tunables::default(), 7);
    setup_battle_generated(
        &mut sim,
        &MapRecipe {
            seed: 7,
            ..MapRecipe::default()
        },
    );
    let need = target.saturating_sub(sim.soldier_count()).div_ceil(500);
    for i in 0..need {
        let row = i / 10;
        let col = i % 10;
        let class = contract::ALL_CLASSES[0];
        sim.spawn(sim::SpawnSpec {
            anchor: sim::math::Vec2::new(-540.0 + col as f32 * 120.0, -400.0 + row as f32 * 90.0),
            facing: std::f32::consts::FRAC_PI_2,
            count: 500,
            files: Some(28),
            class,
            stats: sim.balance.get(class),
            look: class as u32,
            team: (row % 2) as u32,
        });
    }
    let mut battle = sim::Battle::from_sim(sim);
    battle.set_ai(0, true);
    battle.set_ai(1, true);
    battle
}

fn fighting_count(sim: &Sim) -> usize {
    sim.fighting
        .iter()
        .zip(&sim.alive)
        .filter(|&(fighting, alive)| *fighting != 0 && *alive == 1)
        .count()
}

struct TickMeasurement {
    median_ms: f64,
    min_alive: usize,
}

fn fighting(target: usize, earliest_tick: u64) -> TickMeasurement {
    let mut repeats = Vec::new();
    let mut expected_hash = None;
    let mut min_alive = usize::MAX;
    for repeat in 1..=2 {
        let mut battle = fighting_battle(target);
        // Bound preparation: a broken fixture must fail rather than time an approach forever.
        while fighting_count(&battle.sim) == 0 && battle.sim.tick_count < 18_000 {
            battle.tick();
        }
        assert!(
            fighting_count(&battle.sim) > 0,
            "no melee contact within 18,000 ticks"
        );
        let contact = battle.sim.tick_count;
        for _ in 0..60 {
            battle.tick();
        }
        while battle.sim.tick_count < earliest_tick {
            battle.tick();
        }
        let start_tick = battle.sim.tick_count;
        let alive_start = battle.sim.alive.iter().filter(|&&v| v == 1).count();
        let mut min_fighting = usize::MAX;
        let mut samples = Vec::with_capacity(300);
        #[cfg(feature = "perf_timing")]
        sim::perf_timing::reset();
        for _ in 0..300 {
            let start = Instant::now();
            battle.tick();
            samples.push(start.elapsed().as_secs_f64() * 1000.0);
            min_fighting = min_fighting.min(fighting_count(&battle.sim));
        }
        assert!(
            min_fighting > 0,
            "melee did not persist throughout the measured window"
        );
        let hash = battle.sim.state_hash();
        if let Some(expected) = expected_hash {
            assert_eq!(hash, expected, "repeat diverged");
        }
        expected_hash = Some(hash);
        let ms = samples.iter().sum::<f64>() / samples.len() as f64;
        let stddev = (samples
            .iter()
            .map(|sample| (sample - ms).powi(2))
            .sum::<f64>()
            / samples.len() as f64)
            .sqrt();
        repeats.push(ms);
        let alive_end = battle.sim.alive.iter().filter(|&&v| v == 1).count();
        min_alive = min_alive.min(alive_end);
        println!("fighting target {target} repeat {repeat} soldiers {} contact {contact} window {start_tick}..{} alive {alive_start}->{alive_end} min_fighting {min_fighting} mean_ms {ms:.3} stddev_ms {stddev:.3} hash {hash:#018x}", battle.sim.soldier_count(), battle.sim.tick_count);
        #[cfg(feature = "perf_timing")]
        sim::perf_timing::report(300);
    }
    // For two repetitions the median is the midpoint of their measured tick means.
    let median = (repeats[0] + repeats[1]) / 2.0;
    println!(
        "fighting target {target} median_repeat_mean_ms {median:.3} earliest_tick {earliest_tick}"
    );
    TickMeasurement {
        median_ms: median,
        min_alive,
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).is_some_and(|s| s == "fighting") {
        let target = args.get(2).map(|s| {
            s.parse::<usize>()
                .expect("soldier target must be an integer")
        });
        let earliest_tick = args
            .get(3)
            .map(|s| s.parse::<u64>().expect("earliest tick must be an integer"))
            .unwrap_or(0);
        if let Some(target) = target {
            fighting(target, earliest_tick);
        } else {
            for target in [15_500, 30_500, 60_000] {
                fighting(target, earliest_tick);
            }
        }
        return;
    }
    if args.get(1).is_some_and(|s| s == "gate") {
        let thirty = fighting(30_500, 0);
        let developed = fighting(30_500, 1_500);
        let sixty = fighting(60_000, 0);
        let passes = thirty.median_ms <= 25.0
            && developed.median_ms <= 25.0
            && developed.min_alive >= 30_000;
        println!(
            "early 30k -> 60k ratio {:.3}; early/developed 30k budget 25 ms (developed min alive {}): {}",
            sixty.median_ms / thirty.median_ms,
            developed.min_alive,
            if passes { "PASS" } else { "FAIL" }
        );
        if !passes {
            std::process::exit(1);
        }
        return;
    }
    if args.get(1).map_or(false, |s| s == "duels") {
        duels(args.get(2).and_then(|s| s.parse().ok()).unwrap_or(1200));
        return;
    }
    let seed: u64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(7);
    let ticks: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(600);
    let ai = args.get(3).map_or(false, |s| s == "ai");
    let mut sim = Sim::new(Tunables::default(), seed);
    setup_battle_generated(
        &mut sim,
        &MapRecipe {
            seed,
            ..MapRecipe::default()
        },
    );
    let n = sim.soldier_count();
    let mut battle = sim::Battle::from_sim(sim);
    if ai {
        battle.set_ai(0, true);
        battle.set_ai(1, true);
    }
    let start = Instant::now();
    let mut acc = 0.0f64;
    for t in 0..ticks {
        let t0 = Instant::now();
        battle.tick();
        acc += t0.elapsed().as_secs_f64() * 1000.0;
        if (t + 1) % 500 == 0 {
            let alive = battle.sim.alive.iter().filter(|&&a| a == 1).count();
            eprintln!(
                "ticks {:>5}  soldiers {n}  alive {alive}  {:.2} ms/tick (last 500)  hash {:#018x}",
                t + 1,
                acc / 500.0,
                battle.sim.state_hash()
            );
            acc = 0.0;
        }
    }
    println!(
        "seed {seed} ticks {ticks} ai {ai} soldiers {n}  {:.2} ms/tick avg  final hash {:#018x}",
        start.elapsed().as_secs_f64() * 1000.0 / ticks as f64,
        battle.sim.state_hash()
    );
    #[cfg(feature = "perf_timing")]
    sim::perf_timing::report(ticks);
}
