//! Battle handoff and outcome application: Pending encounter → `BattleSetup`,
//! `BattleResult` → casualties, routs, and annihilations on the map.

use crate::battlegen;
use crate::mapdata::{NodeKind, WorldMap};
use crate::pathfind;
use crate::state::*;
use crate::tunables as tun;
use contract::{BattleResult, BattleSetup, Deployment, Reinforcement, RosterUnit};
use std::collections::BTreeSet;

/// Campaign roster entry identity inside a battle: army id in the high bits,
/// roster index in the low byte.
fn unit_id(army: ArmyId, entry: usize) -> u64 {
    ((army as u64) << 8) | entry as u64
}

fn roster_units(a: &Army) -> Vec<RosterUnit> {
    a.roster
        .iter()
        .enumerate()
        .filter(|(_, r)| r.count > 0)
        .map(|(i, r)| RosterUnit {
            id: unit_id(a.id, i),
            class: r.class,
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

/// Commit nearby friendly armies of both combatant factions as battle
/// reinforcements; freeze them by tagging them with the encounter id.
fn commit_reinforcements(map: &WorldMap, st: &mut CampaignState, eid: EncounterId) {
    let e = st.encounters.iter().find(|e| e.id == eid).unwrap().clone();
    let (att, def) = (&st.armies[e.attacker as usize], &st.armies[e.defender as usize]);
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
        let Some(&(_, dist)) = near.iter().find(|(l, _)| *l == a.loc) else { continue };
        // March time to the field, compressed into battle seconds.
        let slowest = a
            .roster
            .iter()
            .filter(|r| r.count > 0)
            .map(|r| tun::march_mult(r.class))
            .fold(f32::INFINITY, f32::min);
        let ticks_per_tile = 1.0 / (tun::BASE_TILES_PER_TICK * slowest);
        let hours = dist as f32 * ticks_per_tile / 60.0;
        let delay = (hours * tun::REINFORCE_SECS_PER_HOUR).min(tun::REINFORCE_MAX_DELAY_SECS);
        // Approach bearing in battle space: the attacker's direction is south.
        let bearing = world_bearing(map, site, a.loc) - att_bearing - std::f32::consts::FRAC_PI_2;
        committed.push((a.id, delay, bearing));
    }
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
        .filter(|o| o.alive() && o.faction != army.faction && o.id != army.id)
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
    let e = st.encounters.iter().find(|e| e.id == eid && e.phase == EncounterPhase::Pending)?.clone();
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
            units: roster_units(att),
            center: battlegen::attacker_center(),
            facing: std::f32::consts::FRAC_PI_2,
            column: att.marching(),
        },
        Deployment {
            team: def_team,
            units: roster_units(def),
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
                team: if a.faction == att.faction { att_team } else { def_team },
                units: roster_units(a),
                entry,
                facing,
                delay_secs: delay,
            }
        })
        .collect();

    let site = def.loc;
    let terrain = battlegen::generate(map, site, e.seed);
    let em = st.encounters.iter_mut().find(|e| e.id == eid).unwrap();
    em.no_retreat = no_retreat;
    em.phase = EncounterPhase::Fighting;
    st.battle_ready = None;
    Some(BattleSetup { seed: e.seed, terrain, deployments, reinforcements })
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
    let Some(e) = st.encounters.iter().find(|e| e.id == eid).cloned() else { return };
    let att = &st.armies[e.attacker as usize];
    let def = &st.armies[e.defender as usize];
    let att_team: u32 = if def.faction == player_faction { 1 } else { 0 };
    let (att_faction, def_faction) = (att.faction, def.faction);

    // Casualties and rally scars.
    for u in &result.units {
        let (army, entry) = ((u.id >> 8) as usize, (u.id & 0xFF) as usize);
        let Some(r) = st.armies.get_mut(army).and_then(|a| a.roster.get_mut(entry)) else {
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
    let winner_faction = if result.victor == att_team { att_faction } else { def_faction };

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
        // Loser: rout along a hostile-free road, or be annihilated.
        let a = &st.armies[id as usize];
        match rout_path(map, st, a) {
            Some(path) => {
                let a = &mut st.armies[id as usize];
                let tiles = path.len() as u16;
                a.path = path;
                a.stance = Stance::Routed { tiles_left: tiles, daze_ticks_left: tun::ROUT_DAZE_TICKS };
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
