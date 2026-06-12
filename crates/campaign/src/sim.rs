//! The campaign tick pipeline, in fixed phase order (mirrors the battle sim):
//!   1. economy (day boundary)        [M4]
//!   2. faction AI (hourly)           [M5]
//!   3. movement: progress, tile steps, occupancy, pass-through, embark
//!   4. encounters: contact detection, range-gated prep, Pending transitions
//!   5. routs & timers                [M3+]
//!   6. recovery                      [M4]
//!   7. visibility                    [M5]
//! One tick = one campaign minute.

use crate::mapdata::{NodeKind, WorldMap};
use crate::pathfind;
use crate::state::*;
use crate::tunables as tun;

pub fn tick(map: &WorldMap, st: &mut CampaignState) {
    st.tick += 1;
    if st.tick % tun::TICKS_PER_DAY as u64 == 0 {
        crate::economy::day_tick(map, st);
    }
    movement(map, st);
    crate::economy::garrison_sorties(map, st);
    ambush_triggers(map, st);
    encounters(map, st);
    crate::economy::garrison_returns(map, st);
    crate::economy::occupations(map, st);
    timers(st);
    if st.tick % crate::visibility::VIS_EVERY == 0 {
        crate::visibility::recompute(map, st);
    }
    if st.tick % 60 == 0 {
        crate::ai::commanders(map, st);
    }
}

/// A settled ambusher springs on the first hostile that enters its trigger
/// tile: the victim is locked mid-march (column, long prep), the ambusher is
/// already formed (zero prep). Expressed entirely through the ordinary
/// encounter, flagged ambush.
fn ambush_triggers(map: &WorldMap, st: &mut CampaignState) {
    let n = st.armies.len();
    for i in 0..n {
        let Stance::Ambush { spot, settle_ticks_left: 0 } = st.armies[i].stance else { continue };
        if st.armies[i].encounter.is_some() || !st.armies[i].alive() {
            continue;
        }
        let sp = &map.ambush_spots[spot as usize];
        let trigger = Loc::Edge { edge: sp.edge, tile: sp.tile };
        let victim = (0..n).find(|&j| {
            let v = &st.armies[j];
            v.alive()
                && v.faction != st.armies[i].faction
                && v.encounter.is_none()
                && v.loc == trigger
                // A camped army is halted and watchful — never ambush bait,
                // even when its tents stand on the trigger tile.
                && !matches!(v.stance, Stance::Routed { .. } | Stance::AtSea | Stance::Camp { .. })
        });
        let Some(j) = victim else { continue };
        let id = st.next_encounter_id;
        let seed = ((st.rng.next_u32() as u64) << 32) | st.rng.next_u32() as u64;
        st.encounters.push(Encounter {
            id,
            attacker: st.armies[j].id, // the victim walked into it
            defender: st.armies[i].id, // the ambusher holds the ground
            prep_attacker: tun::PREP_SURPRISED_TICKS,
            prep_defender: 0,
            phase: EncounterPhase::Preparing,
            ambush: true,
            seed,
            reinforcements: Vec::new(),
            no_retreat: [false, false],
        });
        st.next_encounter_id += 1;
        st.armies[i].encounter = Some(id);
        st.armies[j].encounter = Some(id);
        // Sprung: the ambusher is revealed and the victim is pinned.
        let v = &mut st.armies[j];
        v.path.clear();
        v.path_idx = 0;
        v.progress = 0.0;
    }
}

/// Base pace, before the prep slowdown — used both for movement and for the
/// escape rule's "who is faster" comparison.
fn army_base_speed(map: &WorldMap, a: &Army) -> f32 {
    let on_sea = matches!(a.loc, Loc::Edge { edge, .. } if map.edges[edge as usize].sea);
    if on_sea {
        return tun::SEA_TILES_PER_TICK;
    }
    let slowest = a
        .roster
        .iter()
        .filter(|r| r.count > 0)
        .map(|r| tun::march_mult(r.class))
        .fold(f32::INFINITY, f32::min);
    let feature = match a.loc {
        Loc::Edge { edge, tile } => tun::feature_mult(map.edges[edge as usize].tiles[tile as usize]),
        Loc::Node(_) => 1.0,
    };
    tun::BASE_TILES_PER_TICK * slowest * feature
}

pub fn loc_pos(map: &WorldMap, loc: Loc) -> [f32; 2] {
    match loc {
        Loc::Node(n) => map.nodes[n as usize].pos,
        Loc::Edge { edge, tile } => map.tile_pos(edge, tile),
    }
}

fn eucl(a: [f32; 2], b: [f32; 2]) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

/// Is this army's next step taking it away from / toward `from`?
fn moving_away(map: &WorldMap, a: &Army, from: Loc) -> bool {
    if !a.marching() {
        return false;
    }
    let f = loc_pos(map, from);
    eucl(loc_pos(map, a.path[a.path_idx]), f) > eucl(loc_pos(map, a.loc), f) + 0.01
}

fn moving_toward(map: &WorldMap, a: &Army, to: Loc) -> bool {
    if !a.marching() {
        return false;
    }
    let t = loc_pos(map, to);
    eucl(loc_pos(map, a.path[a.path_idx]), t) < eucl(loc_pos(map, a.loc), t) - 0.01
}

fn army_speed(map: &WorldMap, _st: &CampaignState, a: &Army) -> f32 {
    let mut speed = army_base_speed(map, a);
    if a.encounter.is_some() {
        speed *= tun::PREP_SPEED_MULT; // forming up while marching
    }
    if matches!(a.stance, Stance::Routed { .. }) {
        speed *= tun::ROUT_SPEED_MULT;
    }
    speed
}

fn is_sea_tile(map: &WorldMap, loc: Loc) -> bool {
    matches!(loc, Loc::Edge { edge, .. } if map.edges[edge as usize].sea)
}

fn movement(map: &WorldMap, st: &mut CampaignState) {
    // Standing claims: halted armies block; marchers are transient.
    // (Truth is army.loc; this index is rebuilt every tick.)
    let halted: Vec<(Loc, ArmyId, FactionId)> = st
        .armies
        .iter()
        .filter(|a| a.alive() && a.halted() && !matches!(a.stance, Stance::Ambush { .. }))
        .map(|a| (a.loc, a.id, a.faction))
        .collect();
    let standing = |loc: Loc| halted.iter().find(|(l, ..)| *l == loc);

    // Positions of every live army (hostiles block transit too, halted or
    // not) — except hidden ambushers, who are off the road entirely.
    let positions: Vec<(Loc, ArmyId, FactionId)> = st
        .armies
        .iter()
        .filter(|a| a.alive() && !matches!(a.stance, Stance::Ambush { .. }))
        .map(|a| (a.loc, a.id, a.faction))
        .collect();

    for i in 0..st.armies.len() {
        let a = &st.armies[i];
        if !a.alive() || !a.marching() {
            continue;
        }
        // Frozen: battle imminent/underway, or mid-embark.
        if let Some(eid) = a.encounter {
            let ph = st.encounters.iter().find(|e| e.id == eid).map(|e| e.phase);
            if ph != Some(EncounterPhase::Preparing) {
                continue;
            }
        }
        if a.embark_ticks_left > 0 {
            continue;
        }
        if matches!(a.stance, Stance::Occupying { .. } | Stance::Camp { .. }) {
            continue;
        }

        let speed = army_speed(map, st, a);
        let a = &mut st.armies[i];
        a.progress = (a.progress + speed).min(1.0);
        if a.progress < 1.0 {
            continue;
        }

        let next = a.path[a.path_idx];
        let (id, faction) = (a.id, a.faction);

        // A hostile standing on (or marching in) the next tile is a wall —
        // the encounter machinery decides what happens, not the mover.
        if positions.iter().any(|&(l, oid, of)| l == next && of != faction && oid != id) {
            continue; // hold at the boundary, fully wound up
        }
        // May not END a move on any standing army's tile: halt short.
        let last_step = a.path_idx + 1 == a.path.len();
        if last_step {
            if let Some(&(_, oid, _)) = standing(next) {
                if oid != id {
                    a.path.truncate(a.path_idx); // arrived as close as possible
                    a.progress = 0.0;
                    continue;
                }
            }
        }

        // Step. Crossing the land/sea boundary costs an embark/disembark stop.
        let was_sea = is_sea_tile(map, a.loc);
        let now_sea = is_sea_tile(map, next);
        a.loc = next;
        a.path_idx += 1;
        a.progress = 0.0;
        if was_sea != now_sea {
            a.embark_ticks_left = tun::EMBARK_TICKS;
            a.stance = if now_sea { Stance::AtSea } else { Stance::March };
        }
        if a.path_idx == a.path.len() {
            a.path.clear();
            a.path_idx = 0;
        }
    }
}

fn encounters(map: &WorldMap, st: &mut CampaignState) {
    // Tick existing encounters: dissolve on lost contact, count down prep,
    // promote to Pending when both sides are formed.
    let mut dissolved: Vec<EncounterId> = Vec::new();
    let mut st_no_rematch: Vec<((ArmyId, ArmyId), u64)> = Vec::new();
    let st_tick = st.tick;
    for e in &mut st.encounters {
        if e.phase != EncounterPhase::Preparing {
            continue;
        }
        let (att, def) = (e.attacker as usize, e.defender as usize);
        let (la, ld) = (st.armies[att].loc, st.armies[def].loc);
        if !st.armies[att].alive() || !st.armies[def].alive() {
            dissolved.push(e.id);
            continue;
        }
        // Ambushes are sprung at point blank: nobody walks away during prep.
        if e.ambush {
            e.prep_attacker = e.prep_attacker.saturating_sub(1);
            e.prep_defender = e.prep_defender.saturating_sub(1);
            if e.prep_attacker == 0 && e.prep_defender == 0 {
                e.phase = EncounterPhase::Pending;
                st.battle_ready = Some(e.id);
            }
            continue;
        }
        // Sustain range is one tile slacker than initiation: discrete steps
        // make an equal-speed chase oscillate between distance 1 and 2.
        if !pathfind::dist_le(map, la, ld, 2)
            || is_sea_tile(map, la)
            || is_sea_tile(map, ld)
        {
            dissolved.push(e.id); // the gap opened: chase failed
            continue;
        }
        e.prep_attacker = e.prep_attacker.saturating_sub(1);
        e.prep_defender = e.prep_defender.saturating_sub(1);
        if e.prep_attacker == 0 && e.prep_defender == 0 {
            // Escape rule, resolved when the prep window closes: a side that
            // is fleeing gets away if it's strictly faster than its pursuer,
            // or if nobody pursues. Equal or slower while chased = run down,
            // and the battle initiates mid-flight (column deployment).
            let (a, d) = (&st.armies[att], &st.armies[def]);
            let (sa, sd) = (army_base_speed(map, a), army_base_speed(map, d));
            let def_escapes = moving_away(map, d, a.loc)
                && (sd > sa * 1.01 || !moving_toward(map, a, d.loc));
            let att_escapes = moving_away(map, a, d.loc)
                && (sa > sd * 1.01 || !moving_toward(map, d, a.loc));
            if def_escapes || att_escapes {
                let key = (e.attacker.min(e.defender), e.attacker.max(e.defender));
                st_no_rematch.push((key, st_tick + tun::ESCAPE_COOLDOWN_TICKS));
                dissolved.push(e.id);
            } else {
                e.phase = EncounterPhase::Pending;
                st.battle_ready = Some(e.id);
            }
        }
    }
    for (key, until) in st_no_rematch {
        st.no_rematch.insert(key, until);
    }
    for id in &dissolved {
        for a in &mut st.armies {
            if a.encounter == Some(*id) {
                a.encounter = None;
            }
        }
        st.encounters.retain(|e| e.id != *id);
    }

    // New contacts: hostile pairs in range, both free. Deterministic id order.
    let n = st.armies.len();
    for i in 0..n {
        for j in i + 1..n {
            let (a, b) = (&st.armies[i], &st.armies[j]);
            if !a.alive()
                || !b.alive()
                || a.faction == b.faction
                || a.encounter.is_some()
                || b.encounter.is_some()
            {
                continue;
            }
            // Routed, embarked, and hidden armies are intangible.
            if matches!(a.stance, Stance::Routed { .. } | Stance::AtSea | Stance::Ambush { .. })
                || matches!(b.stance, Stance::Routed { .. } | Stance::AtSea | Stance::Ambush { .. })
                || is_sea_tile(map, a.loc)
                || is_sea_tile(map, b.loc)
            {
                continue;
            }
            if !pathfind::in_contact(map, a.loc, b.loc) {
                continue;
            }
            let key = (a.id.min(b.id), a.id.max(b.id));
            if st.no_rematch.get(&key).is_some_and(|&until| st.tick < until) {
                continue; // it just got away; the gap is becoming real
            }
            // The mover is the attacker; ties go to the lower id. A dug-in
            // camp is always the defender, formed up the moment it's hit —
            // the surprise is on whoever marched into the palisade.
            let a_dug_in = matches!(a.stance, Stance::Camp { build_ticks_left: 0 });
            let b_dug_in = matches!(b.stance, Stance::Camp { build_ticks_left: 0 });
            let attacker_is_a = if a_dug_in != b_dug_in {
                b_dug_in
            } else {
                a.marching() || !b.marching()
            };
            let (prep_att, prep_def) = if a_dug_in != b_dug_in {
                (tun::PREP_SURPRISED_TICKS, 0)
            } else {
                (tun::PREP_TICKS, tun::PREP_TICKS)
            };
            let id = st.next_encounter_id;
            let seed = ((st.rng.next_u32() as u64) << 32) | st.rng.next_u32() as u64;
            let (ai, bi) = (st.armies[i].id, st.armies[j].id);
            st.encounters.push(Encounter {
                id,
                attacker: if attacker_is_a { ai } else { bi },
                defender: if attacker_is_a { bi } else { ai },
                prep_attacker: prep_att,
                prep_defender: prep_def,
                phase: EncounterPhase::Preparing,
                ambush: false,
                seed,
                reinforcements: Vec::new(),
                no_retreat: [false, false],
            });
            st.next_encounter_id += 1;
            st.armies[i].encounter = Some(id);
            st.armies[j].encounter = Some(id);
        }
    }
}

fn timers(st: &mut CampaignState) {
    for a in &mut st.armies {
        if a.embark_ticks_left > 0 {
            a.embark_ticks_left -= 1;
        }
        if let Stance::Ambush { settle_ticks_left, .. } = &mut a.stance {
            if *settle_ticks_left > 0 {
                *settle_ticks_left -= 1;
            }
        }
        if let Stance::Camp { build_ticks_left } = &mut a.stance {
            if *build_ticks_left > 0 {
                *build_ticks_left -= 1;
            }
        }
        // Routs: once the retreat path is run, the army regroups after a
        // dazed day; annihilation was decided when the path was drawn.
        if let Stance::Routed { tiles_left, daze_ticks_left } = &mut a.stance {
            if a.path_idx < a.path.len() {
                *tiles_left = (a.path.len() - a.path_idx) as u16;
            } else if *daze_ticks_left > 0 {
                *daze_ticks_left -= 1;
            } else {
                a.stance = Stance::Hold;
            }
        }
    }
    let now = st.tick;
    st.no_rematch.retain(|_, &mut until| until > now);
}

/// Build the initial state from the world map.
pub fn new_state(map: &WorldMap, seed: u64, player_faction: u32) -> CampaignState {
    let player = player_faction;
    let factions: Vec<Faction> = map
        .factions
        .iter()
        .enumerate()
        .map(|(i, _)| Faction { treasury: 500, ai: i as u32 != player_faction })
        .collect();
    let cities = map
        .nodes
        .iter()
        .enumerate()
        .filter(|(_, n)| n.kind == NodeKind::City)
        .map(|(i, n)| {
            (i as u32, CityState { owner: n.initial_owner, ..Default::default() })
        })
        .collect();
    let armies = map
        .start_armies
        .iter()
        .enumerate()
        .map(|(i, s)| Army {
            id: i as ArmyId,
            faction: s.faction,
            garrison_of: None,
            roster: s
                .roster
                .iter()
                .map(|&(class, count)| RosterEntry { class, count, max: count, morale_cap: 1.0 })
                .collect(),
            loc: Loc::Node(s.at),
            path: Vec::new(),
            path_idx: 0,
            progress: 0.0,
            stance: Stance::Hold,
            encounter: None,
            embark_ticks_left: 0,
        })
        .collect();
    CampaignState {
        version: 1,
        player_faction: player,
        tick: 0,
        rng: contract::Pcg32::new(seed, 0xCA),
        factions,
        armies,
        cities,
        encounters: Vec::new(),
        next_encounter_id: 0,
        battle_ready: None,
        no_rematch: std::collections::BTreeMap::new(),
        visible: Vec::new(),
    }
}

/// Plan and set a path (shared by the player order surface and the AI).
pub(crate) fn try_move(map: &WorldMap, st: &mut CampaignState, army: ArmyId, dest: Loc, allow_sea: bool) -> bool {
    let Some(a) = st.armies.get(army as usize) else { return false };
    if !a.alive()
        || a.garrison_of.is_some()
        || matches!(a.stance, Stance::Routed { .. } | Stance::Occupying { .. })
    {
        return false;
    }
    if let Some(eid) = a.encounter {
        let prep = st.encounters.iter().any(|e| {
            e.id == eid && e.phase == EncounterPhase::Preparing && !e.ambush
        });
        if !prep {
            return false; // frozen: ambushed, pending, or fighting
        }
    }
    let Some(path) = crate::pathfind::plan(map, a.loc, dest, allow_sea) else { return false };
    let a = &mut st.armies[army as usize];
    a.path = path;
    a.path_idx = 0;
    a.progress = 0.0;
    if matches!(a.stance, Stance::Hold | Stance::Ambush { .. } | Stance::Camp { .. }) {
        a.stance = Stance::March;
    }
    true
}
