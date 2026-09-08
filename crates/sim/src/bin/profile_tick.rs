//! Native tick-cost probe: the browser's `?map=gen&seed=N` battle, ticked
//! headless so a sampling profiler can name the hot passes, ending in a state
//! hash so a perf change can prove it is bit-identical.
//! `cargo run --release -p sim --bin profile_tick -- [seed] [ticks] [ai]`
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
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
}
