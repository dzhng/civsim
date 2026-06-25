//! Fog of war. Geography and city ownership are always known; enemy armies
//! are seen only near your assets (road-graph distance, so a ridge between
//! roads hides things naturally). Concealed ambushers stay invisible unless
//! a moving enemy with scouts (skirmishers or any cavalry) brushes past.

use crate::mapdata::WorldMap;
use crate::pathfind;
use crate::state::*;
use contract::UnitClassId;
use std::collections::{BTreeMap, BTreeSet};

pub const VISION_CITY: u32 = 8;
pub const VISION_ARMY: u32 = 4;
pub const VISION_SCOUT_AMBUSH: u32 = 1;
/// Recompute cadence (ticks).
pub const VIS_EVERY: u64 = 5;

fn has_scouts(a: &Army) -> bool {
    a.roster.iter().any(|r| {
        r.count > 0
            && matches!(
                r.class,
                UnitClassId::Skirmishers | UnitClassId::ShockCavalry | UnitClassId::HorseArchers
            )
    })
}

fn concealed(a: &Army) -> bool {
    matches!(
        a.stance,
        Stance::Ambush {
            settle_ticks_left: 0,
            ..
        }
    )
}

pub fn recompute(map: &WorldMap, st: &mut CampaignState) {
    let nfactions = st.factions.len();
    let mut visible: Vec<BTreeSet<ArmyId>> = vec![BTreeSet::new(); nfactions];
    let mut bfs = pathfind::Visited::new(map);
    let camp_radius = VISION_ARMY + crate::tunables::CAMP_VISION_BONUS;

    // Who stands where: one pass, so each tile's occupants are an O(1) lookup
    // instead of re-scanning every army inside the BFS.
    let mut army_at: BTreeMap<Loc, Vec<usize>> = BTreeMap::new();
    for (i, a) in st.armies.iter().enumerate() {
        if a.alive() {
            army_at.entry(a.loc).or_default().push(i);
        }
    }

    // The BFS around an army is the same whatever faction is looking; only the
    // asset test differs. So flood once per army to the widest relevant radius,
    // then read each faction's vision off the reached tiles.
    let mut reached: Vec<(Loc, u32)> = Vec::new();
    let mut seen_by = vec![false; nfactions];
    for a in st.armies.iter().filter(|a| a.alive()) {
        visible[a.faction as usize].insert(a.id); // own armies, always

        let is_concealed = concealed(a);
        let max_radius = if is_concealed {
            VISION_SCOUT_AMBUSH
        } else {
            VISION_CITY
        };

        // Flood out to max_radius, recording depth per tile.
        reached.clear();
        reached.push((a.loc, 0));
        bfs.clear();
        bfs.insert(map, a.loc);
        let mut frontier = vec![a.loc];
        for depth in 1..=max_radius {
            let mut next = Vec::new();
            for &l in &frontier {
                for n in pathfind::neighbors(map, l) {
                    if bfs.insert(map, n) {
                        reached.push((n, depth));
                        next.push(n);
                    }
                }
            }
            frontier = next;
        }

        for s in seen_by.iter_mut() {
            *s = false;
        }
        for &(l, d) in &reached {
            // Enemy armies parked within sight reveal `a` to their owner.
            for &oi in army_at.get(&l).map(|v| v.as_slice()).unwrap_or(&[]) {
                let o = &st.armies[oi];
                if o.faction == a.faction {
                    continue;
                }
                if is_concealed {
                    if d <= VISION_SCOUT_AMBUSH && o.marching() && has_scouts(o) {
                        seen_by[o.faction as usize] = true;
                    }
                } else if d <= VISION_ARMY
                    || (d <= camp_radius
                        && matches!(
                            o.stance,
                            Stance::Camp {
                                build_ticks_left: 0
                            }
                        ))
                {
                    seen_by[o.faction as usize] = true;
                }
            }
            if let Loc::Node(n) = l {
                // A city sees out to VISION_CITY (not for concealed ambushers).
                if !is_concealed && d <= VISION_CITY {
                    if let Some(c) = st.cities.get(&n) {
                        seen_by[c.owner as usize] = true;
                    }
                }
            }
        }
        for f in 0..nfactions {
            if f != a.faction as usize && seen_by[f] {
                visible[f].insert(a.id);
            }
        }
    }
    st.visible = visible;
}
