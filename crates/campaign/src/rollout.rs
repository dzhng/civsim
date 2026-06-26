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
use crate::state::{ArmyId, CampaignState, Loc};

/// Tick `st` forward `ticks` campaign minutes, auto-resolving any battle that
/// comes due via `resolve::estimate`. `st` must already be a clone of the live
/// state — `forward` is destructive. On return the rollout flag is cleared so
/// the sandbox can be inspected as an ordinary (paused) state.
pub fn forward(map: &WorldMap, st: &mut CampaignState, ticks: u32) {
    forward_committed(map, st, ticks, &[]);
}

/// Like `forward`, but the faction stays *committed* to a set of march orders
/// for the whole horizon: any ordered army that falls idle short of its target
/// is sent on again. This models "if I commit to this plan, what unfolds?" —
/// winning a field battle clears an army's path (`apply_battle_outcome`), and
/// without the hourly AI (suppressed in a rollout) to re-order it, it would
/// otherwise stop one step short of occupying the city it just won. Re-issuing
/// keeps the offensive moving exactly as a committed commander would.
pub fn forward_committed(
    map: &WorldMap,
    st: &mut CampaignState,
    ticks: u32,
    orders: &[(ArmyId, Loc)],
) {
    let was = st.in_rollout;
    st.in_rollout = true;
    for _ in 0..ticks {
        reissue(map, st, orders);
        crate::sim::tick(map, st);
        resolve_pending(map, st);
    }
    st.in_rollout = was;
}

/// Send any committed army that's idle, alive, free, and not yet at its target
/// on its way again. `try_move` rejects armies that can't take orders (routed,
/// occupying, in an encounter), so this is a no-op for them until they recover.
fn reissue(map: &WorldMap, st: &mut CampaignState, orders: &[(ArmyId, Loc)]) {
    for &(army, dest) in orders {
        let Some(a) = st.armies.get(army as usize) else {
            continue;
        };
        if a.alive() && a.encounter.is_none() && a.halted() && a.loc != dest {
            crate::sim::try_move(map, st, army, dest, true);
        }
    }
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
