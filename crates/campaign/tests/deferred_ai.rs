//! The off-thread AI contract, exercised inline. In `external_ai` mode the host
//! computes each faction's Decision against the snapshot at a dispatch tick and
//! applies it a fixed delay later — the lockstep-with-input-delay scheme. Apply
//! ticks are fixed, so the outcome can't depend on *when* the work finished:
//! same seed replays identically, and the AI still drives a real war.

use campaign::ai::{apply_decision, commander_decisions, Decision};
use campaign::tunables as tun;
use campaign::Campaign;
use std::collections::BTreeMap;

fn real_map() -> String {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../web/public/data/campaign-map.json"
    );
    std::fs::read_to_string(path).expect("real campaign map should be present")
}

struct Report {
    campaign: Campaign,
    battles: u32,
}

/// Drive the map with the AI external: dispatch decisions on the snapshot every
/// `AI_DISPATCH_EVERY` ticks, apply them `AI_LATENCY` ticks later. The sim's
/// inline AI is off (`external_ai`), so the war is driven entirely by the
/// deferred decisions — the worker's exact model, computed inline here.
fn run_deferred(map_json: &str, seed: u64, ticks: u32) -> Report {
    let mut c = Campaign::new(map_json, seed, 0);
    for f in &mut c.state.factions {
        f.ai = true;
    }

    let mut pending: BTreeMap<u64, Vec<Decision>> = BTreeMap::new();
    let mut battles = 0;
    for _ in 0..ticks {
        c.tick();
        let now = c.state.tick;
        // Apply everything scheduled for this exact tick (fixed delay).
        if let Some(due) = pending.remove(&now) {
            for d in &due {
                apply_decision(&c.map, &mut c.state, d);
            }
        }
        // Dispatch a fresh snapshot's decisions, to land AI_LATENCY ticks hence.
        if now % tun::AI_DISPATCH_EVERY == 0 {
            let decisions = commander_decisions(&c.map, &c.state);
            pending.entry(now + tun::AI_LATENCY).or_default().extend(decisions);
        }
        // Resolve any battle the cheap way so the war can progress.
        if let Some(eid) = c.state.battle_ready {
            match c.battle_setup(eid) {
                Some(setup) => {
                    let r = campaign::resolve::estimate(&c.map, &setup);
                    c.apply_outcome(eid, &r);
                    battles += 1;
                }
                None => c.state.battle_ready = None,
            }
        }
    }
    Report { campaign: c, battles }
}

#[test]
fn deferred_ai_replays_identically() {
    let map = real_map();
    let a = run_deferred(&map, 7, 2500);
    let b = run_deferred(&map, 7, 2500);
    assert_eq!(
        serde_json::to_string(&a.campaign.state).unwrap(),
        serde_json::to_string(&b.campaign.state).unwrap(),
        "fixed apply ticks must make the deferred AI replay byte-for-byte",
    );
}

#[test]
fn deferred_ai_drives_a_real_war() {
    // With the inline AI off, the only thing that can issue orders is the
    // deferred decision stream — so battles happening proves it drives the game.
    let r = run_deferred(&real_map(), 7, 4000);
    assert!(
        r.battles > 0,
        "the off-thread AI never started a fight — its decisions aren't driving the war",
    );
}
