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

/// Cost-weighted value of a roster (upkeep rate doubles as unit value).
fn strength(map: &WorldMap, st: &CampaignState, faction: FactionId, roster: &[RosterEntry]) -> u64 {
    roster
        .iter()
        .map(|r| {
            r.count as u64 * economy::upkeep_per_soldier_milligold(map, st, faction, r.class) as u64
        })
        .sum()
}

fn free_army(a: &Army) -> bool {
    a.alive()
        && a.encounter.is_none()
        && a.garrison_of.is_none()
        && !matches!(
            a.stance,
            Stance::Routed { .. } | Stance::AtSea | Stance::Occupying { .. }
        )
}

/// Road distance between two locs, capped (None beyond the cap). Uses the
/// shared visited-buffer so the AI's many distance probes don't each allocate.
fn road_dist(
    map: &WorldMap,
    bfs: &mut pathfind::Visited,
    from: Loc,
    to: Loc,
    cap: u32,
) -> Option<u32> {
    bfs.within(map, from, cap, |l| l == to)
}

pub fn commanders(map: &WorldMap, st: &mut CampaignState) {
    if st.tick % tun::DIPLOMACY_EVERY as u64 == 0 {
        diplomacy(map, st);
    }
    let mut bfs = pathfind::Visited::new(map);
    for f in 0..st.factions.len() as u32 {
        if !st.factions[f as usize].ai {
            continue;
        }
        // Neutral personas (minor leagues, independents) garrison but never
        // march out; only campaigning personas get a commander's turn.
        if !map.factions[f as usize].ai_persona.campaigns() {
            continue;
        }
        think(map, st, f, &mut bfs);
    }
}

/// Re-draw the diplomatic map. Each active power focuses war on the weakest
/// rival it can actually reach, makes peace with the rest to mass its army on
/// that one front, and allies with anyone who shares its victim. The weakest
/// powers get ganged up on and eaten, a new weakest emerges, and the six-power
/// standoff resolves instead of freezing at parity. Independents are left at the
/// default War — neutral ground everyone is free to conquer.
pub fn diplomacy(map: &WorldMap, st: &mut CampaignState) {
    use crate::state::Relation;
    // The player runs their own foreign policy — the AI never rewrites treaties
    // that involve the player, only those among the other powers.
    let player = st.player_faction;
    let powers: Vec<FactionId> = (0..map.factions.len() as FactionId)
        .filter(|&f| f != player && map.factions[f as usize].playable)
        .filter(|&f| st.cities.values().any(|c| c.owner == f))
        .collect();
    if powers.len() <= 1 {
        return;
    }

    // Rank powers by cost-weighted army plus a per-city weight (a wide realm is
    // a real power even if thinly garrisoned).
    let strengths: std::collections::BTreeMap<FactionId, u64> = powers
        .iter()
        .map(|&f| {
            let army: u64 = st
                .armies
                .iter()
                .filter(|a| a.faction == f && a.alive())
                .map(|a| strength(map, st, f, &a.roster))
                .sum();
            let cities = st.cities.values().filter(|c| c.owner == f).count() as u64;
            (f, army + cities * tun::DIPLO_CITY_WEIGHT)
        })
        .collect();

    // Each power hunts the weakest rival — the easiest meal and, when several
    // pick the same victim, the seed of a coalition. Re-chosen each cycle so the
    // war follows the shifting balance of power (sticky targeting consolidated
    // more cleanly but then froze when a victim drifted out of reach). Whether
    // armies can actually march there is settled by the offensive's own land
    // flood; gating reachability here only silenced the whole map into peace.
    let mut target: std::collections::BTreeMap<FactionId, FactionId> =
        std::collections::BTreeMap::new();
    for &f in &powers {
        if let Some(&victim) = powers
            .iter()
            .filter(|&&g| g != f)
            .min_by_key(|&&g| (strengths[&g], g))
        {
            target.insert(f, victim);
        }
    }

    // Treaties (playable pairs only): war if either is hunting the other; an
    // alliance if they share a victim; peace otherwise.
    for i in 0..powers.len() {
        for j in i + 1..powers.len() {
            let (a, b) = (powers[i], powers[j]);
            let (at, bt) = (target.get(&a).copied(), target.get(&b).copied());
            let rel = if at == Some(b) || bt == Some(a) {
                Relation::War
            } else if at.is_some() && at == bt {
                Relation::Alliance
            } else {
                Relation::Peace
            };
            st.set_relation(a, b, rel);
        }
    }

    // Hand the commander each power's objective so it can mass on one front.
    st.diplo_target = target;
}

fn think(map: &WorldMap, st: &mut CampaignState, f: FactionId, bfs: &mut pathfind::Visited) {
    let my_cities: Vec<NodeId> = st
        .cities
        .iter()
        .filter(|(_, c)| c.owner == f)
        .map(|(&n, _)| n)
        .collect();
    if my_cities.is_empty() {
        return; // landless: hold what armies remain
    }
    let visible = st.visible.get(f as usize).cloned().unwrap_or_default();
    let hostiles: Vec<(ArmyId, Loc, u64)> = st
        .armies
        .iter()
        .filter(|a| a.alive() && st.at_war(f, a.faction) && visible.contains(&a.id))
        .map(|a| (a.id, a.loc, strength(map, st, a.faction, &a.roster)))
        .collect();
    let my_free: Vec<(ArmyId, Loc, u64)> = st
        .armies
        .iter()
        .filter(|a| a.faction == f && free_army(a))
        .map(|a| (a.id, a.loc, strength(map, st, a.faction, &a.roster)))
        .collect();

    // 1. Defend: a city with a visible hostile bearing down on it pulls the
    //    nearest free army home if the garrison alone is outmatched.
    for &city in &my_cities {
        let cloc = Loc::Node(city);
        let threat: u64 = hostiles
            .iter()
            .filter(|(_, l, _)| road_dist(map, bfs, *l, cloc, 10).is_some())
            .map(|(_, _, s)| *s)
            .sum();
        if threat == 0 {
            continue;
        }
        let garrison = strength(map, st, st.cities[&city].owner, &st.cities[&city].garrison);
        let defender_near = my_free
            .iter()
            .any(|(_, l, _)| road_dist(map, bfs, *l, cloc, 2).is_some());
        if garrison >= threat || defender_near {
            continue;
        }
        // Nearest free army with meaningful strength marches home.
        if let Some(&(id, ..)) = my_free
            .iter()
            .filter(|(_, _, s)| *s * 4 >= threat)
            .min_by_key(|(_, l, _)| road_dist(map, bfs, *l, cloc, 60).unwrap_or(u32::MAX))
        {
            crate::sim::try_move(map, st, id, cloc, true);
        }
    }

    // 2. Spend, but stay solvent and supplied. Keep a war chest of several
    //    days' income, and cap the field army at what the territory can supply
    //    (cities × ceiling) — so force size settles instead of ballooning to
    //    bankruptcy, and the way to field a bigger army is to conquer cities.
    let income = economy::daily_income(map, st, f);
    let reserve = income.saturating_mul(tun::AI_RESERVE_DAYS);
    let solvent = |st: &CampaignState| st.factions[f as usize].treasury > reserve;
    let field_soldiers: u32 = st
        .armies
        .iter()
        .filter(|a| a.faction == f && a.alive() && a.garrison_of.is_none())
        .map(|a| a.soldiers())
        .sum();
    let supply_cap = my_cities.len() as u32 * tun::AI_SOLDIERS_PER_CITY;

    if solvent(st) && field_soldiers < supply_cap {
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
                    HeavySword | Phalanx | LongSwords | LightSpear | Peasant | LightSword
                    | HeavySpear => line += r.count as u64,
                    Archers | Skirmishers | ArtilleryCrew => ranged += r.count as u64,
                    ShockCavalry | HorseArchers => cav += r.count as u64,
                }
            }
        }
        let total = (line + ranged + cav).max(1);
        let (class, count) = if line * 100 / total < 50 {
            (UnitClassId::LightSpear, 440)
        } else if ranged * 100 / total < 25 {
            (UnitClassId::Archers, 240)
        } else {
            (UnitClassId::ShockCavalry, 140)
        };
        economy::recruit(map, st, depot, class, count);
    }

    // 2b. A market is an investment in income, so build it before paving roads.
    if solvent(st) {
        let richest = my_cities
            .iter()
            .copied()
            .filter(|&n| st.cities[&n].market_lvl < 2 && st.cities[&n].build_job.is_none())
            .max_by_key(|&n| map.nodes[n as usize].tier);
        if let Some(n) = richest {
            economy::build(st, n, BuildKind::Market, f);
        }
    }

    // 2c. Public works: with the war chest still intact, pave the worst road at
    //     the capital (busiest-corridor targeting is a stretch goal).
    if solvent(st) {
        let capital = *my_cities
            .iter()
            .max_by_key(|&&n| map.nodes[n as usize].tier)
            .unwrap();
        let worst = map.nodes[capital as usize]
            .edges
            .iter()
            .copied()
            .filter(|&e| !map.edges[e as usize].sea && !st.road_jobs.contains_key(&e))
            .filter(|&e| st.road_level(e) < tun::ROAD_MAX_LEVEL)
            .min_by_key(|&e| st.road_level(e));
        if let Some(e) = worst {
            economy::upgrade_road(map, st, e, f);
        }
    }

    // 3. Offensive (mass + advance to contact): the strongest few free armies
    //    each march on the nearest enemy city they can beat — and if none
    //    nearby is beatable, advance on the nearest one anyway. Committing more
    //    than one army keeps a front pressed (so a beaten enemy is run down by
    //    the next army rather than regrouping unmolested) and stops the freeze
    //    where one lone army won a fight then wandered off while the front held.
    let my_total: u64 = my_free.iter().map(|(_, _, s)| *s).sum();
    let mut attackers: Vec<(ArmyId, Loc, u64)> = my_free.clone();
    attackers.sort_by_key(|&(_, _, s)| std::cmp::Reverse(s));

    // Diplomatic focus: if we have a war objective whose cities we can reach,
    // mass every attacker on its weakest one. Concentrating force on a single
    // point is what manufactures the local superiority a parity border denies —
    // it's the move that finally breaks the six-power standoff.
    let focus_city: Option<NodeId> = st.diplo_target.get(&f).copied().and_then(|tgt| {
        let from = attackers.first().map(|&(_, l, _)| l)?;
        let costs = pathfind::costs_from(map, &st.road_levels, from, false);
        st.cities
            .iter()
            .filter(|(_, c)| c.owner == tgt)
            .filter(|(n, _)| costs.contains_key(n))
            .min_by_key(|(&n, c)| (strength(map, st, c.owner, &c.garrison), costs[&n] as u64))
            .map(|(&n, _)| n)
    });

    for &(army, aloc, astr) in attackers.iter().take(tun::AI_ATTACKERS) {
        if let Some(fc) = focus_city {
            crate::sim::try_move(map, st, army, Loc::Node(fc), true);
            continue;
        }
        // Flood out from the army only until the nearest handful of enemy cities
        // turn up — no radius cap (a target across an independent buffer is still
        // found), but it stops early instead of mapping the whole graph.
        let nearest = pathfind::nearest_targets(
            map,
            &st.road_levels,
            aloc,
            false,
            |n| st.cities.get(&n).is_some_and(|c| st.at_war(f, c.owner)),
            tun::AI_TARGET_CANDIDATES,
        );
        // Assault the nearest one we clearly outmatch (garrison + visible enemy
        // field armies near it); else just advance on the nearest enemy city.
        let mut beatable: Option<NodeId> = None;
        for &(n, _) in &nearest {
            let cloc = Loc::Node(n);
            let defenders: u64 = strength(map, st, st.cities[&n].owner, &st.cities[&n].garrison)
                + hostiles
                    .iter()
                    .filter(|(_, l, _)| {
                        road_dist(map, bfs, *l, cloc, tun::AI_THREAT_RADIUS).is_some()
                    })
                    .map(|(_, _, s)| *s)
                    .sum::<u64>();
            if astr > defenders * 13 / 10 {
                beatable = Some(n);
                break;
            }
        }
        if let Some(city) = beatable.or_else(|| nearest.first().map(|&(n, _)| n)) {
            crate::sim::try_move(map, st, army, Loc::Node(city), true);
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
            .min_by_key(|&&n| road_dist(map, bfs, loc, Loc::Node(n), 60).unwrap_or(u32::MAX))
        {
            crate::sim::try_move(map, st, id, Loc::Node(home), true);
        }
    }
}
