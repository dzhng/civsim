//! Campaign faction commanders. Same doctrine as the battle AI: issues only
//! orders a player could issue, thinks on a cadence, sees only through its
//! own fog of war — which is what keeps player ambushes meaningful. Simple
//! and credible, not clever.

use crate::economy;
use crate::mapdata::{NodeId, WorldMap};
use crate::pathfind;
use crate::state::*;
use crate::tunables as tun;
use contract::UnitClassId;
use std::collections::BTreeSet;

/// Cost-weighted value of a roster (upkeep rate doubles as unit value).
fn strength(roster: &[RosterEntry]) -> u64 {
    roster
        .iter()
        .map(|r| r.count as u64 * tun::upkeep_per_soldier_milligold(r.class) as u64)
        .sum()
}

fn free_army(a: &Army) -> bool {
    a.alive()
        && a.encounter.is_none()
        && a.garrison_of.is_none()
        && !matches!(a.stance, Stance::Routed { .. } | Stance::AtSea | Stance::Occupying { .. })
}

/// Road distance between two locs, capped (None beyond the cap).
fn road_dist(map: &WorldMap, from: Loc, to: Loc, cap: u32) -> Option<u32> {
    if from == to {
        return Some(0);
    }
    let mut seen: BTreeSet<Loc> = BTreeSet::new();
    seen.insert(from);
    let mut frontier = vec![from];
    for depth in 1..=cap {
        let mut next = Vec::new();
        for &l in &frontier {
            for n in pathfind::neighbors(map, l) {
                if n == to {
                    return Some(depth);
                }
                if seen.insert(n) {
                    next.push(n);
                }
            }
        }
        frontier = next;
    }
    None
}

pub fn commanders(map: &WorldMap, st: &mut CampaignState) {
    for f in 0..st.factions.len() as u32 {
        if !st.factions[f as usize].ai {
            continue;
        }
        // Independents garrison but never campaign.
        if map.factions[f as usize].id == "independents" {
            continue;
        }
        think(map, st, f);
    }
}

fn think(map: &WorldMap, st: &mut CampaignState, f: FactionId) {
    let my_cities: Vec<NodeId> =
        st.cities.iter().filter(|(_, c)| c.owner == f).map(|(&n, _)| n).collect();
    if my_cities.is_empty() {
        return; // landless: hold what armies remain
    }
    let visible = st.visible.get(f as usize).cloned().unwrap_or_default();
    let hostiles: Vec<(ArmyId, Loc, u64)> = st
        .armies
        .iter()
        .filter(|a| a.alive() && a.faction != f && visible.contains(&a.id))
        .map(|a| (a.id, a.loc, strength(&a.roster)))
        .collect();
    let my_free: Vec<(ArmyId, Loc, u64)> = st
        .armies
        .iter()
        .filter(|a| a.faction == f && free_army(a))
        .map(|a| (a.id, a.loc, strength(&a.roster)))
        .collect();

    // 1. Defend: a city with a visible hostile bearing down on it pulls the
    //    nearest free army home if the garrison alone is outmatched.
    for &city in &my_cities {
        let cloc = Loc::Node(city);
        let threat: u64 = hostiles
            .iter()
            .filter(|(_, l, _)| road_dist(map, *l, cloc, 10).is_some())
            .map(|(_, _, s)| *s)
            .sum();
        if threat == 0 {
            continue;
        }
        let garrison = strength(&st.cities[&city].garrison);
        let defender_near = my_free
            .iter()
            .any(|(_, l, _)| road_dist(map, *l, cloc, 2).is_some());
        if garrison >= threat || defender_near {
            continue;
        }
        // Nearest free army with meaningful strength marches home.
        if let Some(&(id, ..)) = my_free
            .iter()
            .filter(|(_, _, s)| *s * 4 >= threat)
            .min_by_key(|(_, l, _)| road_dist(map, *l, cloc, 60).unwrap_or(u32::MAX))
        {
            crate::sim::try_move(map, st, id, cloc, true);
        }
    }

    // 2. Spend: keep a day's reserve, recruit toward a 50/25/25 mix at the
    //    best owned city.
    let treasury = st.factions[f as usize].treasury;
    if treasury > 400 {
        let depot = *my_cities
            .iter()
            .max_by_key(|&&n| map.nodes[n as usize].tier)
            .unwrap();
        let mut line = 0u64;
        let mut ranged = 0u64;
        let mut cav = 0u64;
        for a in st.armies.iter().filter(|a| a.faction == f && a.alive()) {
            for r in &a.roster {
                use UnitClassId::*;
                match r.class {
                    HeavyInfantry | Phalanx | LongSwords | LightInfantry => line += r.count as u64,
                    Archers | Skirmishers | ArtilleryCrew => ranged += r.count as u64,
                    ShockCavalry | HorseArchers => cav += r.count as u64,
                }
            }
        }
        let total = (line + ranged + cav).max(1);
        let (class, count) = if line * 100 / total < 50 {
            (UnitClassId::LightInfantry, 440)
        } else if ranged * 100 / total < 25 {
            (UnitClassId::Archers, 240)
        } else {
            (UnitClassId::ShockCavalry, 140)
        };
        economy::recruit(map, st, depot, class, count);
    }

    // 3. Attack: when clearly stronger locally, march the strongest free army
    //    at the weakest reachable enemy city.
    let my_total: u64 = my_free.iter().map(|(_, _, s)| *s).sum();
    let visible_total: u64 = hostiles.iter().map(|(_, _, s)| *s).sum();
    if my_total * 10 > visible_total * 13 {
        if let Some(&(army, aloc, astr)) = my_free.iter().max_by_key(|(_, _, s)| *s) {
            let target = st
                .cities
                .iter()
                .filter(|(_, c)| c.owner != f)
                .filter_map(|(&n, c)| {
                    road_dist(map, aloc, Loc::Node(n), 40).map(|d| (n, strength(&c.garrison), d))
                })
                .min_by_key(|&(_, g, d)| g + d as u64 * 100);
            if let Some((city, gstr, _)) = target {
                if astr > gstr * 13 / 10 {
                    crate::sim::try_move(map, st, army, Loc::Node(city), true);
                }
            }
        }
    }

    // 4. Consolidate: idle small armies drift home and merge up.
    let mean = my_total / my_free.len().max(1) as u64;
    for &(id, loc, s) in &my_free {
        let a = &st.armies[id as usize];
        if a.marching() || s * 10 >= mean * 6 {
            continue;
        }
        // Merge with an adjacent bigger friend, or walk to the nearest city.
        let buddy = my_free
            .iter()
            .find(|&&(oid, oloc, os)| oid != id && os > s && pathfind::in_contact(map, loc, oloc));
        if let Some(&(oid, ..)) = buddy {
            economy::merge(map, st, id, oid);
        } else if let Some(&home) = my_cities
            .iter()
            .min_by_key(|&&n| road_dist(map, loc, Loc::Node(n), 60).unwrap_or(u32::MAX))
        {
            crate::sim::try_move(map, st, id, Loc::Node(home), true);
        }
    }
}
