//! Slice 5 — the commander's nerve. Bravado (a drifting mood) and a softmax
//! over plan scores make the AI play like a person, not a solver. The contract
//! is twofold and in tension: the play must *vary* (different seeds → different
//! wars) yet stay perfectly *deterministic* (a fixed seed replays identically),
//! because every random draw comes from the in-state RNG. Plus: the mood is
//! sticky, not white noise.

use campaign::tunables as tun;
use campaign::Campaign;

fn real_map() -> String {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../web/public/data/campaign-map.json"
    );
    std::fs::read_to_string(path).expect("real campaign map should be present")
}

/// Drive the whole map AI-vs-AI, resolving battles with the cheap estimate so
/// the run is fast and self-contained (no player to click through fights).
fn run(map_json: &str, seed: u64, ticks: u32) -> Campaign {
    let mut c = Campaign::new(map_json, seed, 0);
    for fac in &mut c.state.factions {
        fac.ai = true;
    }
    for _ in 0..ticks {
        c.tick();
        if c.state.tick % 60 == 0 {
            c.drive_ai();
        }
        if let Some(eid) = c.state.battle_ready {
            match c.battle_setup(eid) {
                Some(setup) => {
                    let r = campaign::resolve::estimate(&c.map, &setup);
                    c.apply_outcome(eid, &r);
                }
                None => c.state.battle_ready = None,
            }
        }
    }
    c
}

#[test]
fn same_seed_replays_identically() {
    let map = real_map();
    let a = run(&map, 7, 2500);
    let b = run(&map, 7, 2500);
    assert_eq!(
        serde_json::to_string(&a.state).unwrap(),
        serde_json::to_string(&b.state).unwrap(),
        "a fixed seed must replay identically — bravado + softmax draw only from st.rng",
    );
}

#[test]
fn different_seeds_diverge() {
    let map = real_map();
    let a = run(&map, 7, 2500);
    let b = run(&map, 99, 2500);
    assert_ne!(
        serde_json::to_string(&a.state).unwrap(),
        serde_json::to_string(&b.state).unwrap(),
        "different seeds should produce different wars — the AI is not on rails",
    );
}

#[test]
fn bravado_is_sticky_and_bounded() {
    let map = real_map();
    let mut c = Campaign::new(&map, 7, 0);
    for fac in &mut c.state.factions {
        fac.ai = true;
    }

    // Sample one campaigning faction's mood once per drift cadence.
    let mut samples = Vec::new();
    let steps = 30u32;
    for _ in 0..steps {
        for _ in 0..tun::AI_SEARCH_EVERY {
            c.tick();
            if c.state.tick % 60 == 0 {
                c.drive_ai();
            }
            if let Some(eid) = c.state.battle_ready {
                match c.battle_setup(eid) {
                    Some(setup) => {
                        let r = campaign::resolve::estimate(&c.map, &setup);
                        c.apply_outcome(eid, &r);
                    }
                    None => c.state.battle_ready = None,
                }
            }
        }
        samples.push(c.state.factions[0].bravado);
    }

    // Bounded.
    for &b in &samples {
        assert!(
            (tun::AI_BRAVADO_MIN..=tun::AI_BRAVADO_MAX).contains(&b),
            "bravado {b} escaped its band",
        );
    }
    // Sticky: each cadence moves the mood by at most one drift step (no jumps).
    for w in samples.windows(2) {
        let delta = (w[1] - w[0]).abs();
        assert!(
            delta <= tun::AI_BRAVADO_DRIFT + 1e-4,
            "bravado jumped {delta} in one step (drift is {})",
            tun::AI_BRAVADO_DRIFT,
        );
    }
    // But it actually moves — a mood that never drifts is just a constant.
    let moved = samples.windows(2).any(|w| w[0] != w[1]);
    assert!(moved, "bravado never drifted; the mood is dead");
}
