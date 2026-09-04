//! The economy. Two cadences: a daily operational heartbeat (`day_tick` —
//! desertion, replenishment, garrison regen, recruit-queue progress) and a
//! monthly settlement (`month_tick` — income, heavy upkeep, population growth,
//! development, the loyalty gradient + revolts). Plus the player/AI economy
//! orders (recruit from the population pool, set city policy, sack-vs-hold a
//! capture, disband, merge, split) and the garrison sortie/occupation glue.

use crate::mapdata::{NodeId, NodeKind, WorldMap};
use crate::pathfind;
use crate::state::*;
use crate::tunables as tun;
use crate::units;
use contract::{UnitClassId, UnitTypeId};

/// Garrison establishment by city tier: what the city regenerates toward.
/// Military development deepens it — a fortress-town stands a heavier garrison.
/// At `mil_dev` 0 this is the raw tier garrison; at 1.0 it is doubled.
pub fn garrison_establishment(tier: u8, mil_dev: f32) -> Vec<(UnitClassId, u32)> {
    use UnitClassId::*;
    let mut g = vec![(LightSpear, 440)];
    if tier >= 2 {
        g.push((Archers, 240));
    }
    if tier >= 3 {
        g.push((HeavySword, 640));
    }
    let mult = 1.0 + mil_dev.clamp(0.0, 1.0);
    g.into_iter()
        .map(|(c, n)| (c, (n as f32 * mult) as u32))
        .collect()
}

/// Which faction's territory a location lies in: owner of the nearest city
/// within a small road radius, else None (wilderness counts as hostile for
/// replenishment).
pub(crate) fn territory_of(
    map: &WorldMap,
    st: &CampaignState,
    visited: &mut pathfind::Visited,
    loc: Loc,
) -> Option<FactionId> {
    let mut owner = None;
    visited.flood(
        map,
        loc,
        8,
        |nb| !matches!(nb, Loc::Edge { edge, .. } if map.edges[edge as usize].sea),
        |l, _, _| {
            if let Loc::Node(n) = l {
                if let Some(c) = st.cities.get(&n) {
                    owner = Some(c.owner);
                    return pathfind::Flow::Stop;
                }
            }
            pathfind::Flow::Continue
        },
    );
    owner
}

/// One city's monthly gold: population × economic development × throttle, dragged
/// by low loyalty. The whole income model lives in one place.
pub fn city_monthly_income(c: &CityState) -> u32 {
    tun::city_monthly_income(c.population, c.econ_dev, c.throttle, c.loyalty)
}

/// A faction's gross monthly income across the cities it holds.
pub fn faction_monthly_income(st: &CampaignState, f: FactionId) -> u32 {
    st.cities
        .values()
        .filter(|c| c.owner == f)
        .map(city_monthly_income)
        .sum()
}

/// A faction's monthly army upkeep (per-soldier rate × count). Heavy: half a
/// unit's raise cost every month. Garrisons are the city's own and aren't billed.
pub fn faction_monthly_upkeep(map: &WorldMap, st: &CampaignState, f: FactionId) -> u32 {
    let mut milligold: u64 = 0;
    for a in st.armies.iter().filter(|a| a.faction == f && a.alive()) {
        for r in a.roster.iter().filter(|r| r.count > 0) {
            milligold += r.count as u64 * upkeep_per_soldier_milligold(map, st, f, r.class) as u64;
        }
    }
    (milligold / 1000) as u32
}

pub fn cost_per_soldier_milligold(
    map: &WorldMap,
    st: &CampaignState,
    f: FactionId,
    class: UnitClassId,
) -> u32 {
    let id = units::selected_unit_type(st, f, class);
    per_soldier_milligold(map, Some(id), class, Cost::Recruit)
}

pub fn upkeep_per_soldier_milligold(
    map: &WorldMap,
    st: &CampaignState,
    f: FactionId,
    class: UnitClassId,
) -> u32 {
    let id = units::selected_unit_type(st, f, class);
    per_soldier_milligold(map, Some(id), class, Cost::Upkeep)
}

/// The AI's *value* yardstick for a soldier — how much an army is worth when the
/// commander weighs a fight or sizes up a rival. Deliberately decoupled from the
/// monthly economic upkeep (which is heavy, half the raise cost): the AI's score
/// weights, the battle estimate, and diplomacy are all calibrated against this
/// stable per-soldier scale, so changing the upkeep cadence doesn't silently
/// rescale how the AI values armies vs. territory. ≈ raise-cost / 50.
pub fn value_per_soldier_milligold(
    map: &WorldMap,
    st: &CampaignState,
    f: FactionId,
    class: UnitClassId,
) -> u32 {
    let id = units::selected_unit_type(st, f, class);
    per_soldier_milligold(map, Some(id), class, Cost::Value)
}

pub(crate) enum Cost {
    Recruit,
    Upkeep,
    Value,
}

pub(crate) fn per_soldier_milligold(
    map: &WorldMap,
    unit_type: Option<UnitTypeId>,
    class: UnitClassId,
    kind: Cost,
) -> u32 {
    let unit_type = unit_type.and_then(|id| units::unit_type_by_id(map, id));
    match kind {
        Cost::Recruit => unit_type
            .map(|unit| unit.cost_per_soldier_milligold)
            .unwrap_or_else(|| tun::recruit_cost_milligold(class)),
        Cost::Upkeep => unit_type
            .map(|unit| unit.upkeep_per_soldier_milligold)
            .unwrap_or_else(|| tun::upkeep_per_soldier_milligold(class)),
        Cost::Value => (unit_type
            .map(|unit| unit.cost_per_soldier_milligold)
            .unwrap_or_else(|| tun::recruit_cost_milligold(class))
            / 50)
            .max(1),
    }
}

/// At a friendly city node, halted?
fn at_friendly_city(st: &CampaignState, a: &Army) -> bool {
    matches!(a.loc, Loc::Node(n)
        if a.halted() && st.cities.get(&n).is_some_and(|c| c.owner == a.faction))
}

/// The daily operational heartbeat: desertion (when broke), paid replenishment,
/// rally-scar recovery, garrison regeneration, and recruit-queue progress. The
/// *economy* — income, heavy upkeep, population, development, loyalty — settles
/// monthly in `month_tick`; between settlements a broke realm still bleeds daily.
pub fn day_tick(map: &WorldMap, st: &mut CampaignState, visited: &mut pathfind::Visited) {
    let nfactions = st.factions.len();

    // A faction whose treasury is empty can't pay its troops: desertion starts
    // and paid replenishment stops. (Upkeep itself is charged at the monthly
    // settlement; between settlements a broke realm just bleeds.)
    let paid: Vec<bool> = (0..nfactions)
        .map(|f| st.factions[f].treasury > 0)
        .collect();

    // 3. Desertion / replenishment / rally-scar recovery.
    for i in 0..st.armies.len() {
        let (faction, halted_city, terr) = {
            let a = &st.armies[i];
            if !a.alive() {
                continue;
            }
            (
                a.faction as usize,
                at_friendly_city(st, &st.armies[i]),
                territory_of(map, st, visited, st.armies[i].loc),
            )
        };
        let unit_costs: Vec<u32> = contract::ALL_CLASSES
            .iter()
            .map(|&class| cost_per_soldier_milligold(map, st, faction as u32, class))
            .collect();
        let a = &mut st.armies[i];
        if !paid[faction] {
            for r in a.roster.iter_mut().filter(|r| r.count > 0) {
                r.count -= ((r.count as f32 * tun::DESERTION_PER_DAY).ceil() as u32).min(r.count);
            }
            continue;
        }
        let rate = if !a.auto_replenish {
            0.0
        } else if halted_city {
            tun::REPLENISH_CITY
        } else if terr == Some(a.faction) {
            tun::REPLENISH_FRIENDLY
        } else {
            0.0
        };
        if rate > 0.0 {
            let treasury = &mut st.factions[faction].treasury;
            for r in a
                .roster
                .iter_mut()
                .filter(|r| r.count > 0 && r.count < r.max)
            {
                let wanted = ((r.max - r.count) as f32 * rate).ceil() as u32;
                let price = unit_costs[r.class as usize].max(1);
                let affordable = ((*treasury as u64 * 1000) / price as u64) as u32;
                let add = wanted.min(affordable).min(r.max - r.count);
                if add == 0 {
                    break;
                }
                *treasury -= ((add as u64 * price as u64).div_ceil(1000)) as u32;
                r.count += add;
            }
        }
        if halted_city {
            for r in a.roster.iter_mut() {
                r.morale_cap = (r.morale_cap + tun::MORALE_CAP_REGEN).min(1.0);
            }
        }
    }

    // 4. Garrison regeneration toward the establishment — but only while the
    //    city's territory is clear: no enemy army within GARRISON_SAFE_TILES. A
    //    realm rebuilds its walls in peace, not under invasion. The besieged
    //    case is the one that bites hardest: without it a siege lets the
    //    garrison regrow mid-assault — the besieger wins the fight, a
    //    freshly-regrown garrison immediately sorties into a new siege, and the
    //    city can never actually be taken (the attacker just bleeds out).
    let threatened: std::collections::BTreeSet<NodeId> = st
        .cities
        .keys()
        .copied()
        .filter(|&node| {
            let owner = st.cities[&node].owner;
            st.armies.iter().any(|a| {
                a.alive()
                    && st.at_war(a.faction, owner)
                    && !matches!(a.stance, Stance::Routed { .. } | Stance::AtSea)
                    && visited
                        .flood(
                            map,
                            a.loc,
                            tun::GARRISON_SAFE_TILES,
                            |_| true,
                            |loc, _, _| {
                                if loc == Loc::Node(node) {
                                    pathfind::Flow::Stop
                                } else {
                                    pathfind::Flow::Continue
                                }
                            },
                        )
                        .is_some()
            })
        })
        .collect();
    let nodes: Vec<NodeId> = st.cities.keys().copied().collect();
    for node in nodes {
        if threatened.contains(&node) {
            continue;
        }
        let tier = map.nodes[node as usize].tier;
        let c = st.cities.get_mut(&node).unwrap();
        for (class, cap) in garrison_establishment(tier, c.mil_dev) {
            let e = match c.garrison.iter_mut().find(|r| r.class == class) {
                Some(e) => e,
                None => {
                    c.garrison.push(RosterEntry {
                        class,
                        count: 0,
                        max: cap,
                        morale_cap: 1.0,
                    });
                    c.garrison.last_mut().unwrap()
                }
            };
            e.max = cap;
            if e.count < cap {
                e.count = (e.count + ((cap - e.count) as f32 * tun::GARRISON_REGEN).ceil() as u32)
                    .min(cap);
            }
        }
    }

    // 5. Recruit queues (time was prepaid; soldiers appear when done). A
    //    besieged/invaded city can't complete a muster — the job waits out the
    //    threat. (Without this the besieged faction's recruits fall back into
    //    the blockaded city's garrison via `deliver_recruits`, re-arming the
    //    walls mid-siege exactly like regen would — the other half of the
    //    "a besieged city can't be taken" bug.)
    let nodes: Vec<NodeId> = st.cities.keys().copied().collect();
    for node in nodes {
        if threatened.contains(&node) {
            continue;
        }
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
}

/// The monthly economic pulse: the realm settles its whole book once a game-month
/// in one legible step — income in, heavy upkeep out, population and development
/// and loyalty advance. Everything here is expressed per month; the daily
/// `day_tick` only handles the operational trickle (desertion, replenishment,
/// garrison regen, recruit progress).
pub fn month_tick(map: &WorldMap, st: &mut CampaignState) {
    let nfactions = st.factions.len();

    // 1. Settle the books: gross income in, heavy army upkeep out, net to the
    //    treasury in one step. An unaffordable bill empties the treasury (and the
    //    daily desertion that follows bleeds the unpaid army until income returns).
    for f in 0..nfactions {
        let income = faction_monthly_income(st, f as u32);
        let upkeep = faction_monthly_upkeep(map, st, f as u32);
        let t = &mut st.factions[f].treasury;
        *t = t.saturating_add(income);
        *t = t.saturating_sub(upkeep);
    }

    // 2. Development ramps toward each city's focus target and decays off-axis —
    //    "set a direction and walk away" — and population grows logistically,
    //    invested or extracted by the throttle and dragged by low loyalty.
    let nodes: Vec<NodeId> = st.cities.keys().copied().collect();
    for node in nodes {
        let cap = tun::city_pop_cap(map.nodes[node as usize].tier);
        let c = st.cities.get_mut(&node).unwrap();

        let econ_t = tun::econ_target(c.focus);
        let mil_t = tun::mil_target(c.focus);
        c.econ_dev = (c.econ_dev + (econ_t - c.econ_dev) * tun::DEV_RAMP).clamp(0.0, 1.0);
        c.mil_dev = (c.mil_dev + (mil_t - c.mil_dev) * tun::DEV_RAMP).clamp(0.0, 1.0);

        let pop = c.population as f32;
        let room = (1.0 - pop / cap.max(1) as f32).max(0.0);
        let grow_mult = (1.0 - c.throttle.clamp(0.0, 1.0)) * tun::output_loyalty_mult(c.loyalty);
        let grow = pop * tun::POP_GROWTH * room * grow_mult;
        let drain = pop * tun::POP_EXPLOIT_DRAIN * c.throttle.clamp(0.0, 1.0);
        c.population = (pop + grow - drain).clamp(0.0, cap as f32) as u32;
    }

    // 3. Loyalty drifts by the balance of friendly vs enemy connected territory,
    //    then over-low cities revolt. This is the overextension brake.
    loyalty_month(map, st);
}

/// Finished recruits join a halted friendly field army at the node, or found
/// a new one (or reinforce the garrison if the node is blocked).
fn deliver_recruits(
    st: &mut CampaignState,
    node: NodeId,
    owner: FactionId,
    class: UnitClassId,
    count: u32,
) {
    let at_node = st.armies.iter().position(|a| {
        a.alive()
            && a.faction == owner
            && a.halted()
            && a.loc == Loc::Node(node)
            && a.garrison_of.is_none()
    });
    if let Some(i) = at_node {
        add_to_roster(&mut st.armies[i].roster, class, count);
        return;
    }
    let node_free = !st
        .armies
        .iter()
        .any(|a| a.alive() && a.halted() && a.loc == Loc::Node(node));
    if node_free {
        let id = st.armies.len() as ArmyId;
        st.armies.push(Army::new(
            id,
            owner,
            vec![RosterEntry {
                class,
                count,
                max: count,
                morale_cap: 1.0,
            }],
            Loc::Node(node),
        ));
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
        None => roster.push(RosterEntry {
            class,
            count,
            max: count,
            morale_cap: 1.0,
        }),
    }
}

// ---- orders ----------------------------------------------------------------

/// Queue recruitment at an owned city. Recruiting invests the city's *people*:
/// gold is paid up front AND population is spent from the pool (so the recruits
/// are real inhabitants, and an army lost is population lost). Rejected when the
/// treasury can't cover it, the pool is too shallow, or the city's military
/// development hasn't unlocked the chosen unit option.
pub fn recruit(
    map: &WorldMap,
    st: &mut CampaignState,
    node: NodeId,
    class: UnitClassId,
    count: u32,
) -> bool {
    let Some(c) = st.cities.get(&node) else {
        return false;
    };
    let owner = c.owner;
    // The pool: recruits are drawn from population and can't exceed it.
    if count == 0 || count > c.population {
        return false;
    }
    let unit_type = units::selected_unit_type(st, owner, class);
    let Some(unit) = units::unit_type_by_id(map, unit_type) else {
        return false;
    };
    // City-gated unlock: a deeper class option needs a militarised city.
    if c.mil_dev < units::option_mil_dev_req(unit.option) {
        return false;
    }
    let cost = (count as u64 * unit.cost_per_soldier_milligold as u64 / 1000) as u32;
    if st.factions[owner as usize].treasury < cost {
        return false;
    }
    // recruit_ticks_per_soldier is calibrated in game-minutes; convert to the
    // current tick scale so a recruit keeps its length in game-days rather than
    // ballooning when a tick covers more minutes.
    let minutes = count * unit.recruit_ticks_per_soldier;
    let ticks = (minutes / tun::MINUTES_PER_TICK).max(1);
    st.factions[owner as usize].treasury -= cost;
    let c = st.cities.get_mut(&node).unwrap();
    c.population -= count;
    c.recruit_queue.push(RecruitJob {
        class,
        count,
        ticks_left: ticks.max(1),
    });
    true
}

pub fn field_living_soldiers(st: &CampaignState, faction: FactionId, class: UnitClassId) -> u32 {
    st.armies
        .iter()
        .filter(|a| a.faction == faction && a.garrison_of.is_none() && a.alive())
        .flat_map(|a| &a.roster)
        .filter(|r| r.class == class)
        .map(|r| r.count)
        .sum()
}

fn selected_slot_mut(
    st: &mut CampaignState,
    faction: FactionId,
    class: UnitClassId,
) -> Option<&mut DoctrineSlot> {
    st.doctrines
        .get_mut(faction as usize)?
        .slots
        .iter_mut()
        .find(|s| s.class == class)
}

pub fn class_doctrine_cost(
    map: &WorldMap,
    st: &CampaignState,
    faction: FactionId,
    class: UnitClassId,
    unit_type: UnitTypeId,
    size_mult: u8,
) -> Option<u32> {
    if !matches!(size_mult, 1 | 2 | 3) {
        return None;
    }
    let (uf, uc, _) = units::decode_unit_type(unit_type)?;
    if uf != faction || uc != class {
        return None;
    }
    let slot = st
        .doctrines
        .get(faction as usize)?
        .slots
        .iter()
        .find(|s| s.class == class)?;
    if slot.cooldown_until > st.tick {
        return None;
    }
    if slot.selected == unit_type && slot.size_mult == size_mult {
        return Some(0);
    }
    let current = units::unit_type_by_id(map, slot.selected)?;
    let next = units::unit_type_by_id(map, unit_type)?;
    let living = field_living_soldiers(st, faction, class) as u64;
    let delta = next
        .cost_per_soldier_milligold
        .saturating_sub(current.cost_per_soldier_milligold) as u64;
    let upgrade = (delta * living + 999) / 1000;
    Some(tun::CLASS_SWITCH_FEE + upgrade as u32)
}

pub fn set_class_doctrine(
    map: &WorldMap,
    st: &mut CampaignState,
    faction: FactionId,
    class: UnitClassId,
    unit_type: UnitTypeId,
    size_mult: u8,
) -> bool {
    let Some(cost) = class_doctrine_cost(map, st, faction, class, unit_type, size_mult) else {
        return false;
    };
    if cost == 0 {
        return true;
    }
    if st.factions[faction as usize].treasury < cost {
        return false;
    }
    let new_cap = contract::unit_size(class) * size_mult as u32;
    if st
        .armies
        .iter()
        .filter(|a| a.faction == faction && a.garrison_of.is_none())
        .flat_map(|a| &a.roster)
        .any(|r| r.class == class && r.count > new_cap)
    {
        return false;
    }
    st.factions[faction as usize].treasury -= cost;
    let now = st.tick;
    let Some(slot) = selected_slot_mut(st, faction, class) else {
        return false;
    };
    slot.selected = unit_type;
    slot.size_mult = size_mult;
    slot.cooldown_until = now + tun::CLASS_SWITCH_COOLDOWN_TICKS;
    for a in st
        .armies
        .iter_mut()
        .filter(|a| a.faction == faction && a.garrison_of.is_none())
    {
        for r in a.roster.iter_mut().filter(|r| r.class == class) {
            r.max = new_cap;
        }
    }
    true
}

pub fn set_auto_replenish(st: &mut CampaignState, army: ArmyId, on: bool) -> bool {
    let Some(a) = st.armies.get_mut(army as usize) else {
        return false;
    };
    if !a.alive() || a.garrison_of.is_some() {
        return false;
    }
    a.auto_replenish = on;
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
                x.morale_cap = (x.morale_cap * x.count as f32 + r.morale_cap * r.count as f32)
                    / total.max(1) as f32;
                x.count = total;
                x.max += r.max;
            }
            None => d.roster.push(r),
        }
    }
    true
}

/// Set an owned city's policy dials. Focus (−1 Economy … +1 Military) and
/// throttle (0 Grow … 1 Exploit) are the player's whole city interaction — the
/// city auto-develops from them on the monthly pulse. Replaces the build menu.
pub fn set_city_policy(
    st: &mut CampaignState,
    node: NodeId,
    f: FactionId,
    focus: f32,
    throttle: f32,
) -> bool {
    let Some(c) = st.cities.get_mut(&node) else {
        return false;
    };
    if c.owner != f {
        return false;
    }
    c.focus = focus.clamp(-1.0, 1.0);
    c.throttle = throttle.clamp(0.0, 1.0);
    true
}

/// Resolve a city falling to a new owner — sack or hold. Owned by the capture
/// itself, not left to later AI timing (the lesson from the siege work).
/// - **Sack**: convert the populace to instant plunder (gold to the taker),
///   raze most of the population, and hold the gutted town at low loyalty.
/// - **Hold**: keep the population, flip at a little starting loyalty, pacify
///   over months. The conquest is a real asset, slow to settle.
pub fn resolve_capture(st: &mut CampaignState, node: NodeId, new_owner: FactionId, sack: bool) {
    let Some(c) = st.cities.get_mut(&node) else {
        return;
    };
    c.owner = new_owner;
    c.loyalty = tun::CONQUEST_LOYALTY;
    c.recruit_queue.clear();
    if sack {
        let plunder = (c.population as u64 * tun::SACK_GOLD_PER_POP_MILLIGOLD as u64 / 1000) as u32;
        c.population = (c.population as f32 * tun::SACK_POP_REMAINING) as u32;
        let t = &mut st.factions[new_owner as usize].treasury;
        *t = t.saturating_add(plunder);
    }
}

/// The monthly loyalty gradient + revolts. Each city drifts by the signed balance
/// of friendly vs enemy *connected territory* — neighbouring cities weighted by
/// their own loyalty (so allegiance propagates outward from a loyal core), plus
/// armies, which act like a city when they hold ≥`ANCHOR_MIN_UNITS` and scale
/// down below. More enemy-connected than own → it falls; a city dragged to zero
/// throws off its ruler and turns independent. Snapshot-then-apply, cities in id
/// order — determinism.
fn loyalty_month(map: &WorldMap, st: &mut CampaignState) {
    use std::collections::BTreeMap;
    let owners: BTreeMap<NodeId, FactionId> =
        st.cities.iter().map(|(&n, c)| (n, c.owner)).collect();
    let loyalties: BTreeMap<NodeId, f32> = st.cities.iter().map(|(&n, c)| (n, c.loyalty)).collect();

    // Army anchors: (faction, weight∈0..1, loc) for live, in-play armies. An army
    // is a *source* of presence (it doesn't hold loyalty itself); weight scales
    // with unit count up to a full anchor at ANCHOR_MIN_UNITS.
    let anchors: Vec<(FactionId, f32, Loc)> = st
        .armies
        .iter()
        .filter(|a| a.alive() && !matches!(a.stance, Stance::Routed { .. } | Stance::AtSea))
        .map(|a| {
            let units = a.roster.iter().filter(|r| r.count > 0).count() as f32;
            let w = (units / tun::ANCHOR_MIN_UNITS as f32).min(1.0);
            (a.faction, w, a.loc)
        })
        .collect();

    let nodes: Vec<NodeId> = st.cities.keys().copied().collect();
    let mut drift: BTreeMap<NodeId, f32> = BTreeMap::new();
    for &node in &nodes {
        let owner = owners[&node];
        let mut friendly = 0.0f32;
        let mut enemy = 0.0f32;
        for &nb in map.city_neighbors(node) {
            let Some(&nbo) = owners.get(&nb) else {
                continue;
            };
            if nbo == owner {
                friendly += loyalties[&nb]; // gradient: a barely-loyal neighbour lends little
            } else if st.at_war(owner, nbo) {
                enemy += tun::LOYALTY_ENEMY_CITY;
            }
        }
        let cloc = Loc::Node(node);
        for &(af, w, aloc) in &anchors {
            if !pathfind::in_contact(map, aloc, cloc) {
                continue;
            }
            if af == owner {
                friendly += tun::LOYALTY_ARMY_WEIGHT * w;
            } else if st.at_war(owner, af) {
                enemy += tun::LOYALTY_ARMY_WEIGHT * w;
            }
        }
        // Over-exploitation makes the populace restive.
        enemy += tun::LOYALTY_EXPLOIT_DRAG * st.cities[&node].throttle.clamp(0.0, 1.0);
        drift.insert(node, (friendly - enemy) * tun::LOYALTY_DRIFT);
    }

    let independents = map.independents();
    for &node in &nodes {
        let c = st.cities.get_mut(&node).unwrap();
        c.loyalty = (c.loyalty + drift[&node]).clamp(0.0, 1.0);
        if c.loyalty <= tun::LOYALTY_REVOLT && c.owner != independents {
            // The city revolts — independents man the walls (the garrison stays),
            // and it holds itself loosely until reconquered. The trailing power's
            // comeback: a sprawling empire is a frontier it must garrison or lose.
            c.owner = independents;
            c.loyalty = tun::CONQUEST_LOYALTY;
        }
    }
}

/// Split entries out of an army onto a free adjacent tile.
pub fn split(map: &WorldMap, st: &mut CampaignState, army: ArmyId, entries: &[usize]) -> bool {
    let Some(a) = st.armies.get(army as usize) else {
        return false;
    };
    if !a.alive() || !a.halted() || a.encounter.is_some() || a.garrison_of.is_some() {
        return false;
    }
    if entries
        .iter()
        .any(|&e| e >= a.roster.len() || a.roster[e].count == 0)
    {
        return false;
    }
    if entries.len() >= a.roster.iter().filter(|r| r.count > 0).count() {
        return false; // would empty the source
    }
    // First free adjacent land tile.
    let standing: std::collections::BTreeSet<Loc> = st
        .armies
        .iter()
        .filter(|o| o.alive() && o.halted())
        .map(|o| o.loc)
        .collect();
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
    st.armies.push(Army::new(id, faction, roster, spot));
    true
}

/// A garrisoned city challenged by a nearby hostile fields its garrison as a
/// field army on the city node (blocking it), so the ordinary encounter
/// machinery fights the assault. It folds back into the city afterward. If a
/// friendly field army already stands on the node, that field army blocks the
/// sortie.
pub fn garrison_sorties(map: &WorldMap, st: &mut CampaignState) {
    // Which garrisoned cities have a hostile in contact? Scan armies → the nodes
    // each one stands on or touches (cheap), instead of every city × every army
    // every tick. `threatened` is a BTreeSet so sortie army ids are assigned in
    // deterministic node order.
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
        st.armies
            .push(Army::new(id, owner, garrison, Loc::Node(node)).garrisoned(node));
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
                if hostile_near {
                    st.armies[i].stance = Stance::Hold;
                } else if ticks_left == 0 {
                    // The city falls: sack or hold, owned by the capture itself.
                    let (fac, sack) = (st.armies[i].faction, st.armies[i].sack_intent);
                    resolve_capture(st, city, fac, sack);
                    st.armies[i].stance = Stance::Hold;
                } else {
                    let a = &mut st.armies[i];
                    a.stance = Stance::Occupying {
                        city,
                        ticks_left: ticks_left - 1,
                    };
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
                    a.stance = Stance::Occupying {
                        city: n,
                        ticks_left: tun::OCCUPY_TICKS,
                    };
                }
            }
            _ => {}
        }
    }
}
