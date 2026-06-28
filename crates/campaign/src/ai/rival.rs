//! Rivalry — a persistent nemesis a faction fixates on, beyond cold strategy.
//! A relationship, not a persona: any faction can carry one. It's seeded from
//! the map (historic rivalries) or formed in play when attacked, escalates
//! toward the strongest aggressor that hates it back, and dissolves once the
//! two are too far apart in power. The grudge then *biases* (never dictates) the
//! commander's search toward the rival's cities — see `plan::candidates`.

use super::strength;
use crate::mapdata::{NodeId, WorldMap};
use crate::state::*;
use crate::tunables as tun;

/// Total cost-weighted military strength of a faction — field armies plus
/// garrisons — the yardstick rivalry is judged on.
pub fn faction_strength(map: &WorldMap, st: &CampaignState, g: FactionId) -> u64 {
    let field: u64 = st
        .armies
        .iter()
        .filter(|a| a.faction == g && a.alive())
        .map(|a| strength(map, st, g, &a.roster))
        .sum();
    let garrisons: u64 = st
        .cities
        .values()
        .filter(|c| c.owner == g)
        .map(|c| strength(map, st, g, &c.garrison))
        .sum();
    field + garrisons
}

/// Whether `g` still exists as a power: holds a city or fields an army.
fn alive_power(st: &CampaignState, g: FactionId) -> bool {
    st.cities.values().any(|c| c.owner == g) || st.armies.iter().any(|a| a.faction == g && a.alive())
}

/// Factions actively bearing down on `f`: at war with it and either locked in
/// an encounter with one of its armies or standing on one of its city nodes
/// (besieging). These are the candidates a fresh or escalating grudge draws on.
fn aggressors(st: &CampaignState, f: FactionId) -> std::collections::BTreeSet<FactionId> {
    let mut out = std::collections::BTreeSet::new();
    for e in &st.encounters {
        let (a, d) = (
            st.armies[e.attacker as usize].faction,
            st.armies[e.defender as usize].faction,
        );
        if a == f && st.at_war(f, d) {
            out.insert(d);
        }
        if d == f && st.at_war(f, a) {
            out.insert(a);
        }
    }
    let mine: std::collections::BTreeSet<NodeId> = st
        .cities
        .iter()
        .filter(|(_, c)| c.owner == f)
        .map(|(&n, _)| n)
        .collect();
    for a in &st.armies {
        if a.alive() && a.faction != f && st.at_war(f, a.faction) {
            if let Loc::Node(n) = a.loc {
                if mine.contains(&n) {
                    out.insert(a.faction);
                }
            }
        }
    }
    out
}

/// Re-evaluate `f`'s rival. Pure but for writing `factions[f].rival`. Reads only
/// strengths, relations, and where armies stand — no RNG — so it's deterministic.
pub fn update(map: &WorldMap, st: &mut CampaignState, f: FactionId) {
    let me = faction_strength(map, st, f);

    // Dissolve a rivalry that has run its course: the rival was eliminated, made
    // peace, or the gap in power grew lopsided enough that the grudge is absurd.
    if let Some(r) = st.factions[f as usize].rival {
        let rs = faction_strength(map, st, r);
        let gap = me.max(rs) >= tun::AI_RIVAL_DISSOLVE_RATIO * me.min(rs).max(1);
        if !alive_power(st, r) || !st.at_war(f, r) || gap {
            st.factions[f as usize].rival = None;
        }
    }

    let aggs = aggressors(st, f);
    if aggs.is_empty() {
        return; // nobody's attacking; keep any seeded/standing rival as is
    }

    // The worthiest nemesis among the aggressors: prefer one that already counts
    // `f` as *its* rival (a true, mutual grudge), then sheer strength. Ties break
    // on id so the choice is deterministic.
    let pick = aggs
        .iter()
        .copied()
        .max_by_key(|&g| {
            let mutual = st.factions[g as usize].rival == Some(f);
            (mutual, faction_strength(map, st, g), g)
        })
        .unwrap();
    let pick_str = faction_strength(map, st, pick);

    match st.factions[f as usize].rival {
        None => st.factions[f as usize].rival = Some(pick),
        Some(cur) if cur != pick => {
            // Switch only if the current rival has stopped attacking, or the new
            // candidate clearly out-powers it (hysteresis stops flip-flopping).
            let cur_str = faction_strength(map, st, cur);
            let clearly_stronger = pick_str * 100 >= cur_str * tun::AI_RIVAL_SWITCH_MARGIN;
            if !aggs.contains(&cur) || clearly_stronger {
                st.factions[f as usize].rival = Some(pick);
            }
        }
        _ => {} // already fixated on the right enemy
    }
}
