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
pub mod orders;
pub mod persona;
pub mod plan;
pub mod rival;
pub mod select;

pub use orders::Order;

/// Apply an order on behalf of `f`, recording it in `log` only if it took
/// effect — so the log is exactly the orders that mattered, replayable on the
/// live state. The single chokepoint every commander mutation goes through.
fn issue(map: &WorldMap, st: &mut CampaignState, f: FactionId, log: &mut Vec<Order>, o: Order) {
    if orders::apply(map, st, f, &o) {
        log.push(o);
    }
}

/// A commander's whole turn computed against a snapshot, ready to apply on a
/// fixed delay: the orders it issues plus the AI bookkeeping it updated (its
/// mood and its rival). This is the off-thread / strategy-swap unit — a worker
/// computes it on a posted snapshot and ships it back; the host applies it with
/// `apply_decision` at a deterministic later tick.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Decision {
    pub faction: FactionId,
    pub orders: Vec<Order>,
    pub bravado: f32,
    pub rival: Option<FactionId>,
}

/// One faction's commander turn: drift its mood on the search cadence, then
/// think — recording orders into `log` and applying them to `st`. Shared by the
/// inline pass and the snapshot-based decision so the two can't drift apart.
fn commander_turn(
    map: &WorldMap,
    st: &mut CampaignState,
    f: FactionId,
    bfs: &mut pathfind::Visited,
    log: &mut Vec<Order>,
) {
    if st.tick % tun::AI_SEARCH_EVERY == 0 {
        let step = st.rng.range_f32(-tun::AI_BRAVADO_DRIFT, tun::AI_BRAVADO_DRIFT);
        let b = &mut st.factions[f as usize].bravado;
        *b = (*b + step).clamp(tun::AI_BRAVADO_MIN, tun::AI_BRAVADO_MAX);
    }
    think(map, st, f, bfs, log);
}

/// Compute one faction's `Decision` against `st` without touching it — runs the
/// commander turn on a clone and reads back the orders and updated AI state.
pub fn commander_decision(map: &WorldMap, st: &CampaignState, f: FactionId) -> Decision {
    let mut clone = st.clone();
    let mut bfs = pathfind::Visited::new(map);
    let mut orders = Vec::new();
    commander_turn(map, &mut clone, f, &mut bfs, &mut orders);
    Decision {
        faction: f,
        orders,
        bravado: clone.factions[f as usize].bravado,
        rival: clone.factions[f as usize].rival,
    }
}

/// Decisions for every campaigning AI faction against the current snapshot —
/// what the host computes (off-thread) at a dispatch tick to apply on a delay.
pub fn commander_decisions(map: &WorldMap, st: &CampaignState) -> Vec<Decision> {
    (0..st.factions.len() as FactionId)
        .filter(|&f| st.factions[f as usize].ai && map.factions[f as usize].ai_persona.campaigns())
        .map(|f| commander_decision(map, st, f))
        .collect()
}

/// Apply a decision the host computed earlier: replay its orders through the
/// command surface, then commit the AI bookkeeping (mood, rival) and stamp the
/// debounce. Applied to the *current* live state at the scheduled tick — the
/// few ticks of staleness are harmless because armies crawl.
pub fn apply_decision(map: &WorldMap, st: &mut CampaignState, d: &Decision) {
    for o in &d.orders {
        orders::apply(map, st, d.faction, o);
    }
    let fac = &mut st.factions[d.faction as usize];
    fac.bravado = d.bravado;
    fac.rival = d.rival;
    st.last_think.insert(d.faction, st.tick);
}

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

/// The inline (synchronous, deterministic) commander pass: every campaigning AI
/// faction takes its turn against the live state. The off-thread path computes
/// the same turns as `Decision`s instead (see `commander_decisions`). Diplomacy
/// is global and runs in `sim::tick` so both paths share it.
pub fn commanders(map: &WorldMap, st: &mut CampaignState) {
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
        // Skip the hourly think if an event already re-thought this faction this
        // very tick (debounce).
        if st.last_think.get(&f) != Some(&st.tick) {
            commander_turn(map, st, f, &mut bfs, &mut Vec::new());
            st.last_think.insert(f, st.tick);
        }
    }
}

/// React to things that just happened *to* a faction — a fresh contact or siege
/// — by running its commander at once instead of making it wait for its hourly
/// turn. `enc_since` is the encounter-id watermark from the start of the tick:
/// any encounter at or above it formed this tick, so its two sides were just
/// drawn into a fight. Debounced (and id-ordered) so a multi-army collision
/// can't fire a re-think storm. The offensive search stays gated to its own
/// cadence, so an event re-think does the cheap reactive work (pull a defender
/// home, raise troops) — exactly what a sudden threat calls for.
pub fn event_rethink(map: &WorldMap, st: &mut CampaignState, enc_since: EncounterId) {
    let mut dirty: std::collections::BTreeSet<FactionId> = std::collections::BTreeSet::new();
    for e in &st.encounters {
        if e.id >= enc_since {
            dirty.insert(st.armies[e.attacker as usize].faction);
            dirty.insert(st.armies[e.defender as usize].faction);
        }
    }
    if dirty.is_empty() {
        return;
    }
    let mut bfs = pathfind::Visited::new(map);
    for f in dirty {
        if !st.factions[f as usize].ai || !map.factions[f as usize].ai_persona.campaigns() {
            continue;
        }
        let recent = st
            .last_think
            .get(&f)
            .is_some_and(|&t| st.tick - t < tun::AI_RETHINK_DEBOUNCE);
        if !recent {
            think(map, st, f, &mut bfs, &mut Vec::new());
            st.last_think.insert(f, st.tick);
        }
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

fn think(
    map: &WorldMap,
    st: &mut CampaignState,
    f: FactionId,
    bfs: &mut pathfind::Visited,
    log: &mut Vec<Order>,
) {
    // Refresh the grudge before planning: adopt an attacker, escalate to a
    // worthier nemesis, or let a lopsided rivalry dissolve. The offensive search
    // below then weighs a march on the rival among its candidates.
    rival::update(map, st, f);

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
            issue(map, st, f, log, Order::Move { army: id, dest: cloc });
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
        issue(map, st, f, log, Order::Recruit { node: depot, class, count });
    }

    // 2b. A market is an investment in income.
    if solvent(st) {
        let richest = my_cities
            .iter()
            .copied()
            .filter(|&n| st.cities[&n].market_lvl < 2 && st.cities[&n].build_job.is_none())
            .max_by_key(|&n| map.nodes[n as usize].tier);
        if let Some(n) = richest {
            issue(map, st, f, log, Order::Build { node: n, kind: BuildKind::Market });
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
        for &(army, dest) in &plans[pick].orders {
            issue(map, st, f, log, Order::Move { army, dest });
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
            issue(map, st, f, log, Order::Merge { src: id, dst: oid });
        } else if let Some(&home) = my_cities
            .iter()
            .min_by_key(|&&n| road_dist(map, bfs, loc, Loc::Node(n), 60).unwrap_or(u32::MAX))
        {
            issue(map, st, f, log, Order::Move { army: id, dest: Loc::Node(home) });
        }
    }
}
