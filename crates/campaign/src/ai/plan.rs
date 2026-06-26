//! The offensive commitments a faction's lookahead chooses between. A `Plan`
//! is a small set of "this army marches there" orders; `candidates` proposes a
//! few sensible ones, reusing the same target-finding the rule-based commander
//! used. The search clones the state, applies a plan's orders, rolls forward,
//! and scores the result — so this module only *reads* state and proposes; it
//! never issues orders itself.

use super::{free_army, road_dist, strength};
use crate::mapdata::{NodeId, WorldMap};
use crate::pathfind;
use crate::state::*;
use crate::tunables as tun;

/// One imagined commitment: where each committed army marches. An empty order
/// set is "hold" — make no offensive move this cycle.
#[derive(Clone, Debug, PartialEq)]
pub struct Plan {
    pub orders: Vec<(ArmyId, Loc)>,
    pub label: &'static str,
}

/// A few sensible offensive plans for `f`, always including "hold". Mirrors the
/// rule-based commander's options so search ranks the *same* moves it used to
/// take blindly:
///   - "focus": mass every attacker on the diplo-target's weakest reachable city
///   - "nearest-beatable": each attacker → the nearest city it outmatches
///   - "nearest-any": each attacker → the nearest enemy city, beatable or not
///
/// Identical order sets are de-duplicated, keeping the higher-priority label.
pub fn candidates(
    map: &WorldMap,
    st: &CampaignState,
    f: FactionId,
    bfs: &mut pathfind::Visited,
) -> Vec<Plan> {
    let mut plans = vec![Plan {
        orders: Vec::new(),
        label: "hold",
    }];

    let visible = st.visible.get(f as usize).cloned().unwrap_or_default();
    let hostiles: Vec<(Loc, u64)> = st
        .armies
        .iter()
        .filter(|a| a.alive() && st.at_war(f, a.faction) && visible.contains(&a.id))
        .map(|a| (a.loc, strength(map, st, a.faction, &a.roster)))
        .collect();

    let mut attackers: Vec<(ArmyId, Loc, u64)> = st
        .armies
        .iter()
        .filter(|a| a.faction == f && free_army(a))
        .map(|a| (a.id, a.loc, strength(map, st, a.faction, &a.roster)))
        .collect();
    if attackers.is_empty() {
        return plans;
    }
    attackers.sort_by_key(|&(_, _, s)| std::cmp::Reverse(s));
    attackers.truncate(tun::AI_ATTACKERS);

    // "focus": concentrate everyone on the diplomatic objective's soft point.
    if let Some(fc) = focus_city(map, st, f, &attackers) {
        let orders = attackers.iter().map(|&(a, ..)| (a, Loc::Node(fc))).collect();
        push_unique(&mut plans, Plan { orders, label: "focus" });
    }

    // Per-attacker nearest target, split into "any" and "beatable" variants.
    let mut any: Vec<(ArmyId, Loc)> = Vec::new();
    let mut beatable: Vec<(ArmyId, Loc)> = Vec::new();
    for &(army, aloc, astr) in &attackers {
        let nearest = pathfind::nearest_targets(
            map,
            &st.road_levels,
            aloc,
            false,
            |n| st.cities.get(&n).is_some_and(|c| st.at_war(f, c.owner)),
            tun::AI_TARGET_CANDIDATES,
        );
        let Some(&(closest, _)) = nearest.first() else {
            continue;
        };
        any.push((army, Loc::Node(closest)));

        // The nearest city this army clearly outmatches (garrison + nearby
        // visible field armies); else fall back to the closest.
        let mut pick = closest;
        for &(n, _) in &nearest {
            let cloc = Loc::Node(n);
            let defenders = strength(map, st, st.cities[&n].owner, &st.cities[&n].garrison)
                + hostiles
                    .iter()
                    .filter(|(l, _)| road_dist(map, bfs, *l, cloc, tun::AI_THREAT_RADIUS).is_some())
                    .map(|(_, s)| *s)
                    .sum::<u64>();
            if astr > defenders * 13 / 10 {
                pick = n;
                break;
            }
        }
        beatable.push((army, Loc::Node(pick)));
    }
    if !any.is_empty() {
        push_unique(
            &mut plans,
            Plan {
                orders: any,
                label: "nearest-any",
            },
        );
    }
    if !beatable.is_empty() {
        push_unique(
            &mut plans,
            Plan {
                orders: beatable,
                label: "nearest-beatable",
            },
        );
    }

    plans
}

/// Issue a plan's marches for real — the only mutation in this module. Used by
/// the search to apply a candidate to a sandbox before rolling it forward, and
/// by `think` to commit the plan it finally chooses.
pub fn apply(map: &WorldMap, st: &mut CampaignState, plan: &Plan) {
    for &(army, loc) in &plan.orders {
        crate::sim::try_move(map, st, army, loc, true);
    }
}

/// The diplo-target's weakest city reachable from the lead attacker, if any —
/// the point where massing manufactures local superiority (mirrors `think`).
fn focus_city(
    map: &WorldMap,
    st: &CampaignState,
    f: FactionId,
    attackers: &[(ArmyId, Loc, u64)],
) -> Option<NodeId> {
    let tgt = st.diplo_target.get(&f).copied()?;
    let from = attackers.first().map(|&(_, l, _)| l)?;
    let costs = pathfind::costs_from(map, &st.road_levels, from, false);
    st.cities
        .iter()
        .filter(|(_, c)| c.owner == tgt)
        .filter(|(n, _)| costs.contains_key(n))
        .min_by_key(|(&n, c)| (strength(map, st, c.owner, &c.garrison), costs[&n] as u64))
        .map(|(&n, _)| n)
}

/// Add a plan unless an existing one issues the same orders (order-insensitive).
fn push_unique(plans: &mut Vec<Plan>, plan: Plan) {
    let mut want = plan.orders.clone();
    want.sort();
    let dup = plans.iter().any(|p| {
        let mut have = p.orders.clone();
        have.sort();
        have == want
    });
    if !dup {
        plans.push(plan);
    }
}
