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

pub mod eval;
pub mod persona;
pub mod plan;
pub mod select;

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
        // Nudge the combat mood on the search cadence: a small sticky walk, so a
        // faction stays brave or cautious for a stretch instead of re-rolling.
        if st.tick % tun::AI_SEARCH_EVERY == 0 {
            let step = st.rng.range_f32(-tun::AI_BRAVADO_DRIFT, tun::AI_BRAVADO_DRIFT);
            let b = &mut st.factions[f as usize].bravado;
            *b = (*b + step).clamp(tun::AI_BRAVADO_MIN, tun::AI_BRAVADO_MAX);
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
                    | HeavySpear | MediumInfantry | MediumSpear => line += r.count as u64,
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

    // 2b. A market is an investment in income.
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

    // 3. Offensive — chosen by lookahead. Enumerate a few candidate
    //    commitments (mass on the diplo-target, hit the nearest beatable city,
    //    advance on the nearest enemy, or hold), roll each forward with the
    //    cheap battle estimate, and march on the one that leaves the strongest
    //    position. The "hold" candidate is the floor: if nothing pays off, make
    //    no offensive move rather than wandering into a fight. Argmax for now —
    //    randomness and personas weight the choice in later slices.
    let my_total: u64 = my_free.iter().map(|(_, _, s)| *s).sum();

    // Only deliberate when there's an uncommitted army to direct. An army
    // already marching on its objective doesn't need a fresh search every hour —
    // and the search (cloning the world and rolling each candidate forward) is
    // the expensive part, so gating it to once per offensive leg is what keeps
    // the lookahead affordable. Once the force arrives or falls idle, the next
    // pass re-plans; urgent mid-march redirects come from the event-triggered
    // re-think, not from re-searching every tick.
    let have_idle = my_free
        .iter()
        .any(|&(id, ..)| st.armies[id as usize].halted());
    if have_idle && st.tick % tun::AI_SEARCH_EVERY == 0 {
        // The persona sets the dials: what to value, how clear an edge to demand
        // before attacking, and how cold or erratic to choose.
        let profile = persona::profile(map.factions[f as usize].ai_persona);
        let plans = plan::candidates(map, st, f, profile.gate, bfs);
        // Bravado biases the cold score: a brave faction adds value to any plan
        // that commits to a fight (an offensive march), a cautious one docks it,
        // so the mood — not just the math — colours the choice. "Hold" (no
        // orders) is never an offensive, so it carries no bias.
        let bravado = st.factions[f as usize].bravado as f64;
        let scores: Vec<f64> = plans
            .iter()
            .map(|p| {
                let mut sandbox = st.clone();
                crate::rollout::forward_plan(
                    map,
                    &mut sandbox,
                    &p.orders,
                    tun::AI_ROLLOUT_HORIZON,
                    tun::AI_ROLLOUT_CAP,
                );
                let s = eval::score(map, &sandbox, f, &profile.weights);
                let aggro = if p.orders.is_empty() { 0.0 } else { 1.0 };
                s + (bravado - 1.0) * profile.bravado_aggro * aggro
            })
            .collect();
        // Sample rather than argmax: among comparable plans the AI won't always
        // take the textbook-best one, which is what stops it reading as a solver.
        let pick = select::pick_softmax(&scores, profile.select_scale, &mut st.rng);
        plan::apply(map, st, &plans[pick]);
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
