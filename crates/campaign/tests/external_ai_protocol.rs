//! The host-driven worker protocol (`advance_external` + `ack_dispatch` +
//! `submit_decisions`), exercised inline with a synchronous fake worker.
//! The decisive property: because decisions apply on fixed ticks, the outcome
//! is independent of how the host batches ticks per frame — so a varying frame
//! rate can't change the game. Same seed, any batch size → the same war.

use campaign::tunables as tun;
use campaign::Campaign;

mod common;

use common::real_map;

struct Out {
    state_json: String,
    battles: u32,
}

/// Drive the campaign exactly as the browser host would, ticking in frames of
/// `batch` ticks. A synchronous "worker" stands in: on a dispatch boundary we
/// snapshot via save, load it as a fresh Campaign (the worker's world), compute
/// its decisions, and submit them — the real worker just does this on another
/// thread.
fn run(map_json: &str, seed: u64, total: u32, batch: u32) -> Out {
    let mut c = Campaign::new(map_json, seed, 0);
    for f in &mut c.state.factions {
        f.ai = true;
    }

    let mut battles = 0;
    let mut produced = 0u32;
    while produced < total {
        let mut remaining = batch.min(total - produced);
        while remaining > 0 {
            let (adv, reason, tick) = c.advance_external(remaining);
            produced += adv;
            remaining -= adv;
            match reason {
                1 => {
                    // Dispatch boundary: the "worker" computes on the snapshot.
                    let snap = c.save();
                    let worker = Campaign::load(map_json, &snap).unwrap();
                    let decisions = worker.commander_decisions();
                    c.submit_decisions(tick + tun::AI_LATENCY, decisions);
                    c.ack_dispatch();
                }
                2 => break, // never stalls with a synchronous worker
                _ => {
                    if c.state.battle_ready.is_some() {
                        let eid = c.state.battle_ready.unwrap();
                        match c.battle_setup(eid) {
                            Some(setup) => {
                                let r = campaign::resolve::estimate(&c.map, &setup);
                                c.apply_outcome(eid, &r);
                                battles += 1;
                            }
                            None => c.state.battle_ready = None,
                        }
                    } else {
                        break; // budget exhausted for this frame
                    }
                }
            }
        }
    }
    Out {
        state_json: serde_json::to_string(&c.state).unwrap(),
        battles,
    }
}

#[test]
fn frame_batching_does_not_change_the_game() {
    // The killer property: the same seed produces the same war whether the host
    // ticks 10 or 37 at a time — frame rate can't perturb a deterministic sim.
    let map = real_map();
    let slow = run(&map, 7, 3000, 10);
    let fast = run(&map, 7, 3000, 37);
    assert_eq!(
        slow.state_json, fast.state_json,
        "different tick batch sizes diverged — the deferred apply isn't frame-rate independent",
    );
}

#[test]
fn same_seed_replays_identically() {
    let map = real_map();
    let a = run(&map, 7, 2500, 16);
    let b = run(&map, 7, 2500, 16);
    assert_eq!(
        a.state_json, b.state_json,
        "a fixed seed must replay byte-for-byte"
    );
}

#[test]
fn the_protocol_drives_a_real_war() {
    let out = run(&real_map(), 7, 4000, 12);
    assert!(
        out.battles > 0,
        "the host-driven off-thread AI never started a fight",
    );
}
