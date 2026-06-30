//! The search sandbox: roll a *cloned* campaign state forward, resolving any
//! battle the cheap way (`resolve::estimate`) instead of blocking for a
//! player-driven fight. This is the substrate the commander's lookahead runs
//! on — clone the live state, `forward` it under a candidate set of orders,
//! then score the result.
//!
//! Two invariants make it safe to imagine the future:
//!   - The caller clones first; `forward` mutates only the sandbox, never the
//!     live game (and a clone never advances the live RNG stream).
//!   - The sandbox's `in_rollout` flag skips fog recompute and diplomacy, so the
//!     rollout is cheap. The other factions keep marching on the orders they
//!     already hold; nothing re-plans inside a sandbox.

use crate::mapdata::WorldMap;
use crate::resolve;
use crate::state::{ArmyId, CampaignState, Loc, Stance};

/// Tick `st` forward `ticks` campaign minutes, auto-resolving any battle that
/// comes due via `resolve::estimate`. Whatever orders armies already hold carry
/// on, but nothing is re-issued (use `forward_plan` to keep a plan committed).
/// `st` must already be a clone of the live state — `forward` is destructive.
/// On return the rollout flag is cleared so the sandbox reads as a paused state.
pub fn forward(map: &WorldMap, st: &mut CampaignState, ticks: u32) {
    let was = st.in_rollout;
    st.in_rollout = true;
    for _ in 0..ticks {
        crate::sim::tick(map, st);
        resolve_pending(map, st);
    }
    st.in_rollout = was;
}

/// Roll a committed plan forward only until its consequences are clear: stop as
/// soon as every ordered army has *settled* (reached its target and is neither
/// marching, occupying, nor fighting), but never before `min_ticks` (so even
/// "hold" sees a stretch of the enemy's moves) and never past `cap`. The
/// horizon thus scales to what the plan attempts — a neighbouring conquest
/// resolves in a day or two, a march across the map runs to the cap — which is
/// what lets the lookahead see value in a long offensive a fixed short window
/// would miss. Returns the number of ticks actually rolled.
pub fn forward_plan(
    map: &WorldMap,
    st: &mut CampaignState,
    orders: &[(ArmyId, Loc)],
    min_ticks: u32,
    cap: u32,
) -> u32 {
    let was = st.in_rollout;
    st.in_rollout = true;
    let mut t = 0;
    while t < cap {
        reissue(map, st, orders);
        crate::sim::tick(map, st);
        resolve_pending(map, st);
        t += 1;
        if t >= min_ticks && settled(st, orders) {
            break;
        }
    }
    st.in_rollout = was;
    t
}

/// Has every ordered army finished what it was told to do — reached its target
/// node and gone quiet (not marching, occupying, routing, or fighting), or
/// died trying? A dead/blocked army still counts as settled so the cap, not a
/// doomed pursuit, bounds the rollout.
fn settled(st: &CampaignState, orders: &[(ArmyId, Loc)]) -> bool {
    if st.battle_ready.is_some() {
        return false;
    }
    orders
        .iter()
        .all(|&(army, dest)| match st.armies.get(army as usize) {
            None => true,
            Some(a) => {
                !a.alive()
                    || (a.loc == dest
                        && a.halted()
                        && a.encounter.is_none()
                        && !matches!(a.stance, Stance::Occupying { .. } | Stance::Routed { .. }))
            }
        })
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
