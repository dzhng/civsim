//! The day-boundary economy heartbeat: income, upkeep, desertion,
//! replenishment, recruiting, garrison regeneration, occupation. Plus the
//! player/AI economy orders (recruit, disband, merge, split).

use crate::mapdata::{NodeId, NodeKind, WorldMap};
use crate::pathfind;
use crate::state::*;
use crate::tunables as tun;
use contract::UnitClassId;

/// Garrison establishment by city tier: what the city regenerates toward.
pub fn garrison_establishment(tier: u8, barracks_lvl: u8) -> Vec<(UnitClassId, u32)> {
    use UnitClassId::*;
    let mut g = vec![(LightSpear, 440)];
    if tier >= 2 {
        g.push((Archers, 240));
    }
    if tier >= 3 {
        g.push((HeavySword, 640));
    }
    // Barracks deepen the establishment.
    let mult = 100 + 25 * barracks_lvl as u32;
    g.into_iter().map(|(c, n)| (c, n * mult / 100)).collect()
}

/// Which faction's territory a location lies in: owner of the nearest city
/// within a small road radius, else None (wilderness counts as hostile for
/// replenishment).
pub(crate) fn territory_of(map: &WorldMap, st: &CampaignState, loc: Loc) -> Option<FactionId> {
    let mut frontier = vec![loc];
    let mut seen = std::collections::BTreeSet::new();
    seen.insert(loc);
    for _ in 0..=8 {
        for &l in &frontier {
            if let Loc::Node(n) = l {
                if let Some(c) = st.cities.get(&n) {
                    return Some(c.owner);
                }
            }
        }
        let mut next = Vec::new();
        for &l in &frontier {
            for nb in pathfind::neighbors(map, l) {
                if matches!(nb, Loc::Edge { edge, .. } if map.edges[edge as usize].sea) {
                    continue;
                }
                if seen.insert(nb) {
                    next.push(nb);
                }
            }
        }
        frontier = next;
    }
    None
}

/// A faction's gross daily income across the cities it holds (markets included).
pub fn daily_income(map: &WorldMap, st: &CampaignState, f: FactionId) -> u32 {
    st.cities
        .iter()
        .filter(|(_, c)| c.owner == f)
        .map(|(&node, c)| {
            let tier = map.nodes[node as usize].tier.min(3) as usize;
            tun::CITY_INCOME[tier] * tun::MARKET_MULT_PCT[c.market_lvl.min(2) as usize] / 100
        })
        .sum()
}

/// A faction's daily army upkeep (per-soldier rate + per-unit base overhead).
pub fn daily_upkeep(st: &CampaignState, f: FactionId) -> u32 {
    let mut milligold: u64 = 0;
    for a in st.armies.iter().filter(|a| a.faction == f && a.alive()) {
        for r in a.roster.iter().filter(|r| r.count > 0) {
            milligold += r.count as u64 * tun::upkeep_per_soldier_milligold(r.class) as u64;
            milligold += tun::UPKEEP_UNIT_BASE as u64 * 1000;
        }
    }
    (milligold / 1000) as u32
}

/// At a friendly city node, halted?
fn at_friendly_city(st: &CampaignState, a: &Army) -> bool {
    matches!(a.loc, Loc::Node(n)
        if a.halted() && st.cities.get(&n).is_some_and(|c| c.owner == a.faction))
}

pub fn day_tick(map: &WorldMap, st: &mut CampaignState) {
    let nfactions = st.factions.len();

    // 1. Income.
    for (&node, c) in &st.cities {
        let tier = map.nodes[node as usize].tier.min(3) as usize;
        let income = tun::CITY_INCOME[tier] * tun::MARKET_MULT_PCT[c.market_lvl.min(2) as usize] / 100;
        st.factions[c.owner as usize].treasury = st.factions[c.owner as usize].treasury.saturating_add(income);
    }

    // 2. Upkeep: per-soldier rate x count + per-unit base. Paid or not —
    //    an empty treasury starts desertion and stops replenishment.
    let mut paid = vec![true; nfactions];
    for f in 0..nfactions {
        let cost = daily_upkeep(st, f as u32);
        let t = &mut st.factions[f].treasury;
        if *t >= cost {
            *t -= cost;
        } else {
            *t = 0;
            paid[f] = false;
        }
    }

    // 3. Desertion / replenishment / rally-scar recovery.
    for i in 0..st.armies.len() {
        let (faction, halted_city, terr) = {
            let a = &st.armies[i];
            if !a.alive() {
                continue;
            }
            (a.faction as usize, at_friendly_city(st, &st.armies[i]), territory_of(map, st, st.armies[i].loc))
        };
        let a = &mut st.armies[i];
        if !paid[faction] {
            for r in a.roster.iter_mut().filter(|r| r.count > 0) {
                r.count -= ((r.count as f32 * tun::DESERTION_PER_DAY).ceil() as u32).min(r.count);
            }
            continue;
        }
        let rate = if halted_city {
            tun::REPLENISH_CITY
        } else if terr == Some(a.faction) {
            tun::REPLENISH_FRIENDLY
        } else {
            tun::REPLENISH_HOSTILE
        };
        for r in a.roster.iter_mut().filter(|r| r.count > 0 && r.count < r.max) {
            r.count = (r.count + ((r.max - r.count) as f32 * rate).ceil() as u32).min(r.max);
        }
        if halted_city {
            for r in a.roster.iter_mut() {
                r.morale_cap = (r.morale_cap + tun::MORALE_CAP_REGEN).min(1.0);
            }
        }
    }

    // 4. Garrison regeneration toward the establishment.
    let nodes: Vec<NodeId> = st.cities.keys().copied().collect();
    for node in nodes {
        let tier = map.nodes[node as usize].tier;
        let c = st.cities.get_mut(&node).unwrap();
        for (class, cap) in garrison_establishment(tier, c.barracks_lvl) {
            let e = match c.garrison.iter_mut().find(|r| r.class == class) {
                Some(e) => e,
                None => {
                    c.garrison.push(RosterEntry { class, count: 0, max: cap, morale_cap: 1.0 });
                    c.garrison.last_mut().unwrap()
                }
            };
            e.max = cap;
            if e.count < cap {
                e.count = (e.count + ((cap - e.count) as f32 * tun::GARRISON_REGEN).ceil() as u32).min(cap);
            }
        }
    }

    // 5. Recruit queues (time was prepaid; soldiers appear when done).
    let nodes: Vec<NodeId> = st.cities.keys().copied().collect();
    for node in nodes {
        let owner = st.cities[&node].owner;
        let Some(job) = st.cities.get_mut(&node).unwrap().recruit_queue.first_mut() else {
            continue;
        };
        job.ticks_left = job.ticks_left.saturating_sub(tun::TICKS_PER_DAY);
        if job.ticks_left > 0 {
            continue;
        }
        let job = st.cities.get_mut(&node).unwrap().recruit_queue.remove(0);
        deliver_recruits(st, node, owner, job.class, job.count);
    }

    // 6. Construction sites.
    for c in st.cities.values_mut() {
        let Some(job) = &mut c.build_job else { continue };
        job.ticks_left = job.ticks_left.saturating_sub(tun::TICKS_PER_DAY);
        if job.ticks_left > 0 {
            continue;
        }
        match job.kind {
            BuildKind::Market => c.market_lvl += 1,
            BuildKind::Barracks => c.barracks_lvl += 1,
        }
        c.build_job = None;
    }
}

/// Finished recruits join a halted friendly field army at the node, or found
/// a new one (or reinforce the garrison if the node is blocked).
fn deliver_recruits(st: &mut CampaignState, node: NodeId, owner: FactionId, class: UnitClassId, count: u32) {
    let at_node = st
        .armies
        .iter()
        .position(|a| a.alive() && a.faction == owner && a.halted() && a.loc == Loc::Node(node) && a.garrison_of.is_none());
    if let Some(i) = at_node {
        add_to_roster(&mut st.armies[i].roster, class, count);
        return;
    }
    let node_free = !st.armies.iter().any(|a| a.alive() && a.halted() && a.loc == Loc::Node(node));
    if node_free {
        let id = st.armies.len() as ArmyId;
        st.armies.push(Army {
            id,
            faction: owner,
            garrison_of: None,
            roster: vec![RosterEntry { class, count, max: count, morale_cap: 1.0 }],
            loc: Loc::Node(node),
            path: Vec::new(),
            path_idx: 0,
            progress: 0.0,
            stance: Stance::Hold,
            encounter: None,
            embark_ticks_left: 0,
        });
    } else {
        let c = st.cities.get_mut(&node).unwrap();
        add_to_roster(&mut c.garrison, class, count);
    }
}

pub fn add_to_roster(roster: &mut Vec<RosterEntry>, class: UnitClassId, count: u32) {
    match roster.iter_mut().find(|r| r.class == class) {
        Some(r) => {
            r.count += count;
            r.max = r.max.max(r.count);
        }
        None => roster.push(RosterEntry { class, count, max: count, morale_cap: 1.0 }),
    }
}

// ---- orders ----------------------------------------------------------------

/// Queue recruitment at an owned city. Cost is paid up front; rejects when
/// the treasury can't cover it.
pub fn recruit(map: &WorldMap, st: &mut CampaignState, node: NodeId, class: UnitClassId, count: u32) -> bool {
    let Some(c) = st.cities.get(&node) else { return false };
    let owner = c.owner;
    let cost = (count as u64 * tun::recruit_cost_milligold(class) as u64 / 1000) as u32;
    if st.factions[owner as usize].treasury < cost {
        return false;
    }
    let barracks = c.barracks_lvl.min(2) as u32;
    let ticks = count * tun::recruit_ticks_per_soldier(class) * (100 - 25 * barracks) / 100;
    st.factions[owner as usize].treasury -= cost;
    st.cities.get_mut(&node).unwrap().recruit_queue.push(RecruitJob { class, count, ticks_left: ticks.max(1) });
    let _ = map;
    true
}

/// Disband a roster entry. At a friendly city, half the men join the
/// garrison pool; elsewhere they just go home.
pub fn disband(st: &mut CampaignState, army: ArmyId, entry: usize) -> bool {
    let Some(a) = st.armies.get(army as usize) else { return false };
    if !a.alive() || a.encounter.is_some() || entry >= a.roster.len() {
        return false;
    }
    let (class, count, faction, loc, halted) =
        (a.roster[entry].class, a.roster[entry].count, a.faction, a.loc, a.halted());
    if let Loc::Node(n) = loc {
        if halted && st.cities.get(&n).is_some_and(|c| c.owner == faction) {
            add_to_roster(&mut st.cities.get_mut(&n).unwrap().garrison, class, count / 2);
        }
    }
    let a = &mut st.armies[army as usize];
    a.roster[entry].count = 0;
    a.roster[entry].max = 0;
    true
}

/// Merge `src` into `dst`: both halted, same faction, same or adjacent tile.
/// `src` is tombstoned; `dst` absorbs the roster (count-weighted morale).
pub fn merge(map: &WorldMap, st: &mut CampaignState, src: ArmyId, dst: ArmyId) -> bool {
    let (Some(s), Some(d)) = (st.armies.get(src as usize), st.armies.get(dst as usize)) else {
        return false;
    };
    if src == dst
        || !s.alive()
        || !d.alive()
        || s.faction != d.faction
        || !s.halted()
        || !d.halted()
        || s.encounter.is_some()
        || d.encounter.is_some()
        || s.garrison_of.is_some()
        || d.garrison_of.is_some()
        || !pathfind::in_contact(map, s.loc, d.loc)
    {
        return false;
    }
    let src_roster = std::mem::take(&mut st.armies[src as usize].roster);
    let d = &mut st.armies[dst as usize];
    for r in src_roster {
        if r.count == 0 {
            continue;
        }
        match d.roster.iter_mut().find(|x| x.class == r.class) {
            Some(x) => {
                let total = x.count + r.count;
                x.morale_cap = (x.morale_cap * x.count as f32 + r.morale_cap * r.count as f32) / total.max(1) as f32;
                x.count = total;
                x.max += r.max;
            }
            None => d.roster.push(r),
        }
    }
    true
}

/// Start a road upgrade: one level step, paid up front, paced by length.
/// Valid when the faction holds territory at either endpoint.
pub fn upgrade_road(map: &WorldMap, st: &mut CampaignState, edge: u32, f: FactionId) -> bool {
    let Some(e) = map.edges.get(edge as usize) else { return false };
    if e.sea || st.road_jobs.contains_key(&edge) {
        return false;
    }
    let lvl = st.road_level(edge);
    if lvl >= tun::ROAD_MAX_LEVEL {
        return false;
    }
    let owned = [e.a, e.b]
        .iter()
        .any(|&n| territory_of(map, st, Loc::Node(n)) == Some(f));
    if !owned {
        return false;
    }
    let tiles = e.tiles.len() as u32;
    let cost = tun::ROAD_COST_PER_TILE * tiles;
    let fac = &mut st.factions[f as usize];
    if fac.treasury < cost {
        return false;
    }
    fac.treasury -= cost;
    st.road_jobs.insert(
        edge,
        RoadJob { to_level: lvl + 1, ticks_left: tun::ROAD_BUILD_TICKS_PER_TILE * tiles },
    );
    true
}

/// Start a building at an owned city: one site at a time, paid up front.
pub fn build(st: &mut CampaignState, node: NodeId, kind: BuildKind, f: FactionId) -> bool {
    let Some(c) = st.cities.get(&node) else { return false };
    if c.owner != f || c.build_job.is_some() {
        return false;
    }
    let lvl = match kind {
        BuildKind::Market => c.market_lvl,
        BuildKind::Barracks => c.barracks_lvl,
    };
    if lvl >= 2 {
        return false;
    }
    let cost = match kind {
        BuildKind::Market => tun::BUILD_MARKET_COST[lvl as usize],
        BuildKind::Barracks => tun::BUILD_BARRACKS_COST[lvl as usize],
    };
    let fac = &mut st.factions[f as usize];
    if fac.treasury < cost {
        return false;
    }
    fac.treasury -= cost;
    st.cities.get_mut(&node).unwrap().build_job =
        Some(BuildJob { kind, ticks_left: tun::BUILD_TICKS });
    true
}

/// Raise a watchtower on a junction in friendly territory. Paid up front.
pub fn build_outpost(map: &WorldMap, st: &mut CampaignState, node: NodeId, f: FactionId) -> bool {
    let Some(n) = map.nodes.get(node as usize) else { return false };
    if n.kind != NodeKind::Junction || st.outposts.contains_key(&node) {
        return false;
    }
    if territory_of(map, st, Loc::Node(node)) != Some(f) {
        return false;
    }
    let fac = &mut st.factions[f as usize];
    if fac.treasury < tun::OUTPOST_COST {
        return false;
    }
    fac.treasury -= tun::OUTPOST_COST;
    st.outposts.insert(node, Outpost { owner: f, build_ticks_left: tun::OUTPOST_BUILD_TICKS });
    true
}

/// Split entries out of an army onto a free adjacent tile.
pub fn split(map: &WorldMap, st: &mut CampaignState, army: ArmyId, entries: &[usize]) -> bool {
    let Some(a) = st.armies.get(army as usize) else { return false };
    if !a.alive() || !a.halted() || a.encounter.is_some() || a.garrison_of.is_some() {
        return false;
    }
    if entries.iter().any(|&e| e >= a.roster.len() || a.roster[e].count == 0) {
        return false;
    }
    if entries.len() >= a.roster.iter().filter(|r| r.count > 0).count() {
        return false; // would empty the source
    }
    // First free adjacent land tile.
    let standing: std::collections::BTreeSet<Loc> =
        st.armies.iter().filter(|o| o.alive() && o.halted()).map(|o| o.loc).collect();
    let spot = pathfind::neighbors(map, a.loc).into_iter().find(|&l| {
        !standing.contains(&l)
            && !matches!(l, Loc::Edge { edge, .. } if map.edges[edge as usize].sea)
    });
    let Some(spot) = spot else { return false };

    let faction = a.faction;
    let mut roster: Vec<RosterEntry> = Vec::new();
    for &e in entries {
        let r = &mut st.armies[army as usize].roster[e];
        roster.push(r.clone());
        r.count = 0;
        r.max = 0;
    }
    let id = st.armies.len() as ArmyId;
    st.armies.push(Army {
        id,
        faction,
        garrison_of: None,
        roster,
        loc: spot,
        path: Vec::new(),
        path_idx: 0,
        progress: 0.0,
        stance: Stance::Hold,
        encounter: None,
        embark_ticks_left: 0,
    });
    true
}

/// A garrisoned city challenged by a nearby hostile fields its garrison as a
/// temporary army on the city node (blocking it), so the ordinary encounter
/// machinery fights the assault. It folds back into the city afterward.
/// V1 cut: if a friendly field army already stands on the node, it alone
/// defends — the garrison joins the defense in a later milestone.
pub fn garrison_sorties(map: &WorldMap, st: &mut CampaignState) {
    // Which garrisoned cities have a hostile in contact? Scan armies → the nodes
    // each one stands on or touches (cheap), instead of every city × every army
    // every tick. `occupied` mirrors the old node-taken test; `threatened` is a
    // BTreeSet so the sortie loop below runs in node order — same deterministic
    // army-id assignment as the old city-major scan.
    let mut occupied: std::collections::BTreeSet<NodeId> = std::collections::BTreeSet::new();
    let mut threatened: std::collections::BTreeSet<NodeId> = std::collections::BTreeSet::new();
    for a in &st.armies {
        if !a.alive() {
            continue;
        }
        if let Loc::Node(n) = a.loc {
            occupied.insert(n); // any standing army claims its node
        }
        if matches!(a.stance, Stance::Routed { .. } | Stance::AtSea) {
            continue; // routed / embarked armies threaten nothing
        }
        for nbr in std::iter::once(a.loc).chain(pathfind::neighbors(map, a.loc)) {
            let Loc::Node(n) = nbr else { continue };
            if let Some(c) = st.cities.get(&n) {
                if st.at_war(c.owner, a.faction) && c.garrison.iter().any(|r| r.count > 0) {
                    threatened.insert(n);
                }
            }
        }
    }
    for node in threatened {
        if occupied.contains(&node) {
            continue;
        }
        let owner = st.cities[&node].owner;
        let garrison = std::mem::take(&mut st.cities.get_mut(&node).unwrap().garrison);
        let id = st.armies.len() as ArmyId;
        st.armies.push(Army {
            id,
            faction: owner,
            garrison_of: Some(node),
            roster: garrison,
            loc: Loc::Node(node),
            path: Vec::new(),
            path_idx: 0,
            progress: 0.0,
            stance: Stance::Hold,
            encounter: None,
            embark_ticks_left: 0,
        });
    }
}

/// Fold surviving garrison armies back into their cities once the threat is
/// gone (no encounter, no hostile in contact). Runs every tick.
pub fn garrison_returns(map: &WorldMap, st: &mut CampaignState) {
    for i in 0..st.armies.len() {
        let a = &st.armies[i];
        let Some(node) = a.garrison_of else { continue };
        if a.encounter.is_some() || !a.alive() {
            continue;
        }
        let threatened = st.armies.iter().any(|o| {
            o.alive()
                && st.at_war(o.faction, a.faction)
                && !matches!(o.stance, Stance::Routed { .. } | Stance::AtSea)
                && pathfind::in_contact(map, o.loc, a.loc)
        });
        if threatened {
            continue;
        }
        let roster = std::mem::take(&mut st.armies[i].roster);
        let c = st.cities.get_mut(&node).unwrap();
        for r in roster {
            if r.count > 0 {
                match c.garrison.iter_mut().find(|x| x.class == r.class) {
                    Some(x) => x.count += r.count,
                    None => c.garrison.push(r),
                }
            }
        }
    }
}

/// Occupation: a halted army on a hostile city node with no garrison and no
/// battle begins occupying; finishing flips ownership. A hostile in contact
/// interrupts. Called every tick from the pipeline.
pub fn occupations(map: &WorldMap, st: &mut CampaignState) {
    for i in 0..st.armies.len() {
        let a = &st.armies[i];
        if !a.alive() || a.encounter.is_some() {
            continue;
        }
        match a.stance {
            Stance::Occupying { city, ticks_left } => {
                let hostile_near = st.armies.iter().any(|o| {
                    o.alive()
                        && st.at_war(o.faction, a.faction)
                        && !matches!(o.stance, Stance::Routed { .. } | Stance::AtSea)
                        && pathfind::in_contact(map, o.loc, a.loc)
                });
                let a = &mut st.armies[i];
                if hostile_near {
                    a.stance = Stance::Hold;
                } else if ticks_left == 0 {
                    st.cities.get_mut(&city).unwrap().owner = a.faction;
                    a.stance = Stance::Hold;
                } else {
                    a.stance = Stance::Occupying { city, ticks_left: ticks_left - 1 };
                }
            }
            Stance::Hold | Stance::March => {
                let Loc::Node(n) = a.loc else { continue };
                if !a.halted() || map.nodes[n as usize].kind != NodeKind::City {
                    continue;
                }
                let Some(c) = st.cities.get(&n) else { continue };
                let garrisoned = c.garrison.iter().any(|r| r.count > 0);
                if st.at_war(c.owner, a.faction) && !garrisoned {
                    let a = &mut st.armies[i];
                    a.stance = Stance::Occupying { city: n, ticks_left: tun::OCCUPY_TICKS };
                }
            }
            _ => {}
        }
    }
}
