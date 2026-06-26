//! The search sandbox: roll a *cloned* campaign state forward, resolving any
//! battle the cheap way (`resolve::estimate`) instead of blocking for a
//! player-driven fight. This is the substrate the commander's lookahead runs
//! on — clone the live state, `forward` it under a candidate set of orders,
//! then score the result.
//!
//! Two invariants make it safe to imagine the future:
//!   - The caller clones first; `forward` mutates only the sandbox, never the
//!     live game (and a clone never advances the live RNG stream).
//!   - The sandbox's `in_rollout` flag suppresses the hourly AI pass, so a
//!     commander's lookahead can't recurse into itself. The other factions
//!     keep marching on the orders they already hold; they just don't re-think.

use crate::mapdata::WorldMap;
use crate::resolve;
use crate::state::CampaignState;

/// Tick `st` forward `ticks` campaign minutes, auto-resolving any battle that
/// comes due via `resolve::estimate`. `st` must already be a clone of the live
/// state — `forward` is destructive. On return the rollout flag is cleared so
/// the sandbox can be inspected as an ordinary (paused) state.
pub fn forward(map: &WorldMap, st: &mut CampaignState, ticks: u32) {
    let was = st.in_rollout;
    st.in_rollout = true;
    for _ in 0..ticks {
        crate::sim::tick(map, st);
        resolve_pending(map, st);
    }
    st.in_rollout = was;
}

/// Drain every battle the tick left ready. Normally at most one, but resolving
/// one can free armies that immediately make contact, so loop until quiet.
/// Mirrors the campaign→battle→campaign handoff the real loop drives, with the
/// estimate standing in for the physics sim.
fn resolve_pending(map: &WorldMap, st: &mut CampaignState) {
    let pf = st.player_faction;
    while let Some(eid) = st.battle_ready {
        match resolve::battle_setup_for(map, st, eid, pf) {
            Some(setup) => {
                let result = resolve::estimate(map, &setup);
                resolve::apply_battle_outcome(map, st, eid, &result, pf);
            }
            // A pending encounter that won't set up would otherwise spin
            // forever — drop the flag and move on (matches the live harness).
            None => st.battle_ready = None,
        }
    }
}
