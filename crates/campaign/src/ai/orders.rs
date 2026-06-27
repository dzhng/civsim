//! The AI's output vocabulary. A commander doesn't reach into the game state —
//! it emits `Order`s, the same player-legal commands the order surface exposes,
//! and they're applied through the very same functions. This is the seam that
//! lets the AI run somewhere else (a worker) and feed its decisions back as a
//! list, and lets a different strategy be dropped in behind the same interface.

use crate::mapdata::{NodeId, WorldMap};
use crate::state::*;
use contract::UnitClassId;
use serde::{Deserialize, Serialize};

/// One thing a commander decided to do this turn. Mirrors the player order API.
/// Serializable so a worker can ship its decisions back across the thread.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Order {
    /// March (or pursue-by-tile) an army to a destination.
    Move { army: ArmyId, dest: Loc },
    /// Raise troops of a class at an owned city (draws from its population pool).
    Recruit {
        node: NodeId,
        class: UnitClassId,
        count: u32,
    },
    /// Steer an owned city's development: focus (−1 Economy … +1 Military) and
    /// throttle (0 Grow … 1 Exploit). The city auto-develops from there.
    SetPolicy {
        node: NodeId,
        focus: f32,
        throttle: f32,
    },
    /// Set whether an army sacks (vs holds) the next city it takes.
    Sack { army: ArmyId, on: bool },
    /// Fold one army into another.
    Merge { src: ArmyId, dst: ArmyId },
}

/// Apply one order on behalf of faction `f`, dispatching to the same functions
/// the player's order surface uses. Returns whether it took effect (a rejected
/// order — bad army, no route, can't afford it — is simply dropped).
pub fn apply(map: &WorldMap, st: &mut CampaignState, f: FactionId, order: &Order) -> bool {
    match *order {
        Order::Move { army, dest } => crate::sim::try_move(map, st, army, dest, true),
        Order::Recruit { node, class, count } => crate::economy::recruit(map, st, node, class, count),
        Order::SetPolicy { node, focus, throttle } => {
            crate::economy::set_city_policy(st, node, f, focus, throttle)
        }
        Order::Sack { army, on } => set_sack_intent(st, f, army, on),
        Order::Merge { src, dst } => crate::economy::merge(map, st, src, dst),
    }
}

/// Flag/clear an army's intent to sack its next conquest (own armies only).
fn set_sack_intent(st: &mut CampaignState, f: FactionId, army: ArmyId, on: bool) -> bool {
    let Some(a) = st.armies.get_mut(army as usize) else {
        return false;
    };
    if !a.alive() || a.faction != f || a.garrison_of.is_some() {
        return false;
    }
    a.sack_intent = on;
    true
}
