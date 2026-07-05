//! Battle handoff and outcome application: Pending encounter → `BattleSetup`,
//! `BattleResult` → casualties, routs, and annihilations on the map.

use crate::battlegen;
use crate::mapdata::{NodeKind, WorldMap};
use crate::pathfind;
use crate::state::*;
use crate::tunables as tun;
use contract::{BattleResult, BattleSetup, Deployment, Reinforcement, RosterUnit, UnitResult};
use std::collections::BTreeSet;

/// Campaign roster entry identity inside a battle: army id in the high bits,
/// roster index in the low byte.
fn unit_id(army: ArmyId, entry: usize) -> u64 {
    ((army as u64) << 8) | entry as u64
}

fn roster_units(st: &CampaignState, a: &Army) -> Vec<RosterUnit> {
    a.roster
        .iter()
        .enumerate()
        .filter(|(_, r)| r.count > 0)
        .map(|(i, r)| RosterUnit {
            id: unit_id(a.id, i),
            class: r.class,
            unit_type: Some(crate::units::selected_unit_type(st, a.faction, r.class)),
            count: r.count,
            training: 0.6,
            morale_cap: r.morale_cap,
        })
        .collect()
}

fn world_bearing(map: &WorldMap, from: Loc, to: Loc) -> f32 {
    let (f, t) = (crate::sim::loc_pos(map, from), crate::sim::loc_pos(map, to));
    (t[1] - f[1]).atan2(t[0] - f[0])
}

/// BFS over road tiles (land only) up to `radius`, returning (loc, depth).
fn tiles_within(map: &WorldMap, start: Loc, radius: u32) -> Vec<(Loc, u32)> {
    let mut out = vec![(start, 0)];
    let mut seen: BTreeSet<Loc> = BTreeSet::new();
    seen.insert(start);
    let mut frontier = vec![start];
    for depth in 1..=radius {
        let mut next = Vec::new();
        for &l in &frontier {
            for n in pathfind::neighbors(map, l) {
                if matches!(n, Loc::Edge { edge, .. } if map.edges[edge as usize].sea) {
                    continue;
                }
                if seen.insert(n) {
                    out.push((n, depth));
                    next.push(n);
                }
            }
        }
        frontier = next;
    }
    out
}

/// Armies eligible to join the battle (id, arrival delay, approach bearing).
/// Read-only: the initiation screen shows this before anything is frozen.
pub fn eligible_reinforcements(
    map: &WorldMap,
    st: &CampaignState,
    eid: EncounterId,
) -> Vec<(ArmyId, f32, f32)> {
    let Some(e) = st.encounters.iter().find(|e| e.id == eid) else {
        return Vec::new();
    };
    let (att, def) = (
        &st.armies[e.attacker as usize],
        &st.armies[e.defender as usize],
    );
    let factions = [att.faction, def.faction];
    let site = def.loc;
    let att_bearing = world_bearing(map, site, att.loc);
    let near = tiles_within(map, site, tun::REINFORCE_RADIUS_TILES);

    let mut committed: Vec<(ArmyId, f32, f32)> = Vec::new();
    for a in &st.armies {
        if a.id == e.attacker
            || a.id == e.defender
            || !a.alive()
            || a.encounter.is_some()
            || !factions.contains(&a.faction)
            || matches!(a.stance, Stance::Routed { .. } | Stance::AtSea)
        {
            continue;
        }
        let Some(&(_, dist)) = near.iter().find(|(l, _)| *l == a.loc) else {
            continue;
        };
        // March time to the field, compressed into battle seconds.
        let slowest = a
            .roster
            .iter()
            .filter(|r| r.count > 0)
            .map(|r| tun::march_mult(r.class))
            .fold(f32::INFINITY, f32::min);
        let ticks_per_tile = 1.0 / (tun::BASE_TILES_PER_TICK * slowest);
        // ticks → game-hours uses the current tick scale (ticks per game-hour),
        // not a hardcoded 60, so reinforcement timing holds under a time rescale.
        let ticks_per_hour = tun::TICKS_PER_DAY as f32 / 24.0;
        let hours = dist as f32 * ticks_per_tile / ticks_per_hour;
        let delay = (hours * tun::REINFORCE_SECS_PER_HOUR).min(tun::REINFORCE_MAX_DELAY_SECS);
        // Approach bearing in battle space: the attacker's direction is south.
        let bearing = world_bearing(map, site, a.loc) - att_bearing - std::f32::consts::FRAC_PI_2;
        committed.push((a.id, delay, bearing));
    }
    committed
}

/// Commit the eligible armies: freeze them by tagging with the encounter id.
fn commit_reinforcements(map: &WorldMap, st: &mut CampaignState, eid: EncounterId) {
    let committed = eligible_reinforcements(map, st, eid);
    for &(id, ..) in &committed {
        st.armies[id as usize].encounter = Some(eid);
    }
    let e = st.encounters.iter_mut().find(|e| e.id == eid).unwrap();
    e.reinforcements = committed;
}

/// Can this army retreat: a friendly city or `ROUT_TILES` of road reachable
/// without crossing a tile any other faction's army stands on or moves in?
fn rout_path(map: &WorldMap, st: &CampaignState, army: &Army) -> Option<Vec<Loc>> {
    let blocked: BTreeSet<Loc> = st
        .armies
        .iter()
        .filter(|o| o.alive() && st.at_war(o.faction, army.faction) && o.id != army.id)
        .map(|o| o.loc)
        .collect();
    let friendly_city = |l: Loc| match l {
        Loc::Node(n) => {
            map.nodes[n as usize].kind == NodeKind::City
                && st.cities.get(&n).is_some_and(|c| c.owner == army.faction)
        }
        _ => false,
    };

    let mut seen: BTreeSet<Loc> = BTreeSet::new();
    seen.insert(army.loc);
    let mut parents: Vec<(Loc, Option<usize>)> = vec![(army.loc, None)];
    let mut frontier: Vec<usize> = vec![0];
    let mut deep: Option<usize> = None; // first index reached at full depth
    for depth in 1..=tun::ROUT_TILES as u32 {
        let mut next = Vec::new();
        for &pi in &frontier {
            let l = parents[pi].0;
            for n in pathfind::neighbors(map, l) {
                if blocked.contains(&n)
                    || matches!(n, Loc::Edge { edge, .. } if map.edges[edge as usize].sea)
                    || !seen.insert(n)
                {
                    continue;
                }
                parents.push((n, Some(pi)));
                let ni = parents.len() - 1;
                if friendly_city(n) || depth == tun::ROUT_TILES as u32 {
                    deep.get_or_insert(ni);
                    if friendly_city(n) {
                        deep = Some(ni); // a city beats raw distance
                    }
                }
                next.push(ni);
            }
        }
        if let Some(g) = deep {
            if friendly_city(parents[g].0) || depth == tun::ROUT_TILES as u32 {
                let mut path = Vec::new();
                let mut cur = Some(g);
                while let Some(i) = cur {
                    path.push(parents[i].0);
                    cur = parents[i].1;
                }
                path.pop(); // drop the start loc
                path.reverse();
                return Some(path);
            }
        }
        frontier = next;
    }
    None
}

/// Promote a Pending encounter into a `BattleSetup`. `player_faction` gets
/// team 0 when involved (the battle UI's home side); otherwise the attacker.
/// Also computes reinforcements and retreat viability (the initiation screen
/// reads `Encounter::no_retreat`).
pub fn battle_setup_for(
    map: &WorldMap,
    st: &mut CampaignState,
    eid: EncounterId,
    player_faction: FactionId,
) -> Option<BattleSetup> {
    commit_reinforcements(map, st, eid);
    let e = st
        .encounters
        .iter()
        .find(|e| e.id == eid && e.phase == EncounterPhase::Pending)?
        .clone();
    let att = &st.armies[e.attacker as usize];
    let def = &st.armies[e.defender as usize];
    let att_team = if def.faction == player_faction { 1 } else { 0 };
    let def_team = 1 - att_team;

    let no_retreat = [
        rout_path(map, st, att).is_none(),
        rout_path(map, st, def).is_none(),
    ];

    let deployments = vec![
        Deployment {
            team: att_team,
            units: roster_units(st, att),
            center: battlegen::attacker_center(),
            facing: std::f32::consts::FRAC_PI_2,
            column: att.marching(),
        },
        Deployment {
            team: def_team,
            units: roster_units(st, def),
            center: battlegen::defender_center(),
            facing: -std::f32::consts::FRAC_PI_2,
            column: def.marching() && !e.ambush,
        },
    ];
    let reinforcements = e
        .reinforcements
        .iter()
        .map(|&(id, delay, bearing)| {
            let a = &st.armies[id as usize];
            let (entry, facing) = battlegen::entry_point(bearing);
            Reinforcement {
                team: if a.faction == att.faction {
                    att_team
                } else {
                    def_team
                },
                units: roster_units(st, a),
                entry,
                facing,
                delay_secs: delay,
            }
        })
        .collect();

    let site = def.loc;
    let terrain = battlegen::terrain_source(map, site, st.campaign_seed, e.seed);
    let em = st.encounters.iter_mut().find(|e| e.id == eid).unwrap();
    em.no_retreat = no_retreat;
    em.phase = EncounterPhase::Fighting;
    st.battle_ready = None;
    Some(BattleSetup {
        seed: e.seed,
        terrain,
        deployments,
        reinforcements,
    })
}

/// Write a battle's outcome back onto the map: casualties per roster entry,
/// rally scars, routs (or annihilation when no road out exists), tombstones.
pub fn apply_battle_outcome(
    map: &WorldMap,
    st: &mut CampaignState,
    eid: EncounterId,
    result: &BattleResult,
    player_faction: FactionId,
) {
    let Some(e) = st.encounters.iter().find(|e| e.id == eid).cloned() else {
        return;
    };
    let att = &st.armies[e.attacker as usize];
    let def = &st.armies[e.defender as usize];
    let att_team: u32 = if def.faction == player_faction { 1 } else { 0 };
    let (att_faction, def_faction) = (att.faction, def.faction);
    // A city assault: the defender is the city's garrison. If the attacker wins,
    // it has breached the walls and must seize the prize, not be left standing
    // beside an undefended city for the AI to wander off from (the bet was the
    // siege; the capture is its payoff).
    let assault_city = def.garrison_of;

    // Casualties and rally scars.
    for u in &result.units {
        let (army, entry) = ((u.id >> 8) as usize, (u.id & 0xFF) as usize);
        let Some(r) = st
            .armies
            .get_mut(army)
            .and_then(|a| a.roster.get_mut(entry))
        else {
            continue;
        };
        if u.deployed {
            r.count = u.survivors.min(r.count);
            r.morale_cap = u.morale_cap.clamp(0.2, 1.0);
        }
    }

    // Sort armies into winners and losers.
    let involved: Vec<ArmyId> = [e.attacker, e.defender]
        .into_iter()
        .chain(e.reinforcements.iter().map(|&(id, ..)| id))
        .collect();
    let winner_faction = if result.victor == att_team {
        att_faction
    } else {
        def_faction
    };
    // The force a beaten army must break away from: the main army on the
    // winning side. Every other hostile can still run it down mid-flight.
    let victor_army = if att_faction == winner_faction {
        e.attacker
    } else {
        e.defender
    };

    for id in involved {
        let a = &mut st.armies[id as usize];
        a.encounter = None;
        a.path.clear();
        a.path_idx = 0;
        a.progress = 0.0;
        if !a.alive() {
            continue; // tombstone: wiped out in the fighting
        }
        if a.faction == winner_faction {
            // A victorious assault marches into the breach and occupies the city
            // it just took — pinned there (Occupying rejects move orders) until
            // it flips, so a won siege reliably becomes a capture regardless of
            // siege length or the commander's next whim. Relief arriving during
            // the occupation still interrupts it (occupations: hostile in contact).
            if id == e.attacker {
                if let Some(node) = assault_city {
                    a.loc = Loc::Node(node);
                    a.stance = Stance::Occupying {
                        city: node,
                        ticks_left: tun::OCCUPY_TICKS,
                    };
                    continue;
                }
            }
            a.stance = Stance::Hold;
            continue; // garrison winners fold back via garrison_returns
        }
        if a.garrison_of.is_some() {
            // A beaten garrison has no road out of its own walls.
            for r in &mut a.roster {
                r.count = 0;
            }
            continue;
        }
        // A field army beaten while defending one of its own cities is overrun
        // with the walls — no clean retreat, it's destroyed like a garrison.
        // This is what makes a massed assault actually take the city instead of
        // the defender routing off and marching straight back.
        let a = &st.armies[id as usize];
        let defending_city = std::iter::once(a.loc)
            .chain(pathfind::neighbors(map, a.loc))
            .any(|l| matches!(l, Loc::Node(n) if st.cities.get(&n).is_some_and(|c| c.owner == a.faction)));
        if defending_city {
            let a = &mut st.armies[id as usize];
            for r in &mut a.roster {
                r.count = 0;
            }
            continue;
        }
        // Otherwise rout along a hostile-free road, or be annihilated.
        let a = &st.armies[id as usize];
        match rout_path(map, st, a) {
            Some(path) => {
                let a = &mut st.armies[id as usize];
                let tiles = path.len() as u16;
                a.path = path;
                a.stance = Stance::Routed {
                    tiles_left: tiles,
                    regroup_ticks_left: tun::ROUT_REGROUP_TICKS,
                    by: victor_army,
                };
            }
            None => {
                // Nowhere to regroup: captured and wiped.
                let a = &mut st.armies[id as usize];
                for r in &mut a.roster {
                    r.count = 0;
                }
            }
        }
    }

    st.encounters.retain(|x| x.id != eid);
    if st.battle_ready == Some(eid) {
        st.battle_ready = None;
    }
}

/// Cost-weighted strength model of a battle's outcome: the heavier side wins,
/// both bleed in proportion to the strength gap. Deterministic, O(units) — no
/// dice. This is the AI's *imagination only* (the `rollout` sandbox and the
/// commander's lookahead): the live, player-facing battle still runs the full
/// physics sim. Never resolve a real encounter through this.
///
/// Strength uses the same yardstick as the AI's `ai::strength` — a stable
/// per-soldier value derived from the unit's raise cost (`≈ cost / 50`), not the
/// heavy monthly upkeep — so the estimate agrees with how the AI sizes up armies.
pub fn estimate(map: &WorldMap, setup: &BattleSetup) -> BattleResult {
    let weight = |u: &RosterUnit| -> u64 {
        u.unit_type
            .and_then(|id| crate::units::unit_type_by_id(map, id))
            .map(|t| (t.cost_per_soldier_milligold / 50).max(1))
            .unwrap_or_else(|| (tun::recruit_cost_milligold(u.class) / 50).max(1)) as u64
    };

    // Both sides' rosters tagged with their team, deployments + reinforcements.
    let units: Vec<(u32, &RosterUnit)> = setup
        .deployments
        .iter()
        .flat_map(|d| d.units.iter().map(move |u| (d.team, u)))
        .chain(
            setup
                .reinforcements
                .iter()
                .flat_map(|r| r.units.iter().map(move |u| (r.team, u))),
        )
        .collect();

    let mut team_str = [0u64, 0u64];
    for &(team, u) in &units {
        team_str[team as usize] += u.count as u64 * weight(u);
    }
    let victor = if team_str[0] >= team_str[1] { 0 } else { 1 };
    let (ws, ls) = (
        team_str[victor as usize].max(1),
        team_str[1 - victor as usize].max(1),
    );
    let ratio = ls as f64 / ws as f64; // 0..1, how close the loser was
    let winner_surv = (1.0 - 0.45 * ratio).clamp(0.5, 1.0);
    let loser_surv = (0.45 * ratio).clamp(0.0, 0.5);

    let units = units
        .iter()
        .map(|&(team, u)| {
            let won = team == victor;
            let frac = if won { winner_surv } else { loser_surv };
            UnitResult {
                id: u.id,
                team,
                survivors: (u.count as f64 * frac) as u32,
                routed: !won,
                morale_cap: if won { 0.9 } else { 0.6 },
                deployed: true,
            }
        })
        .collect();
    BattleResult { victor, units }
}
