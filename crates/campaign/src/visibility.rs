//! Fog of war. Geography and city ownership are always known; enemy armies
//! are seen only near your assets (road-graph distance, so a ridge between
//! roads hides things naturally). Concealed ambushers stay invisible unless
//! a moving enemy with scouts (skirmishers or any cavalry) brushes past.

use crate::mapdata::WorldMap;
use crate::pathfind;
use crate::state::*;
use contract::UnitClassId;
use std::collections::BTreeSet;

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
    matches!(a.stance, Stance::Ambush { settle_ticks_left: 0, .. })
}

/// Road distance from `from` to the nearest matching target, capped.
fn within<F: Fn(Loc) -> bool>(map: &WorldMap, from: Loc, radius: u32, hit: F) -> Option<u32> {
    if hit(from) {
        return Some(0);
    }
    let mut seen: BTreeSet<Loc> = BTreeSet::new();
    seen.insert(from);
    let mut frontier = vec![from];
    for depth in 1..=radius {
        let mut next = Vec::new();
        for &l in &frontier {
            for n in pathfind::neighbors(map, l) {
                if !seen.insert(n) {
                    continue;
                }
                if hit(n) {
                    return Some(depth);
                }
                next.push(n);
            }
        }
        frontier = next;
    }
    None
}

pub fn recompute(map: &WorldMap, st: &mut CampaignState) {
    let nfactions = st.factions.len();
    let mut visible: Vec<BTreeSet<ArmyId>> = vec![BTreeSet::new(); nfactions];

    for a in st.armies.iter().filter(|a| a.alive()) {
        // BFS once around the army; every faction reads its own assets out.
        for f in 0..nfactions as u32 {
            if f == a.faction {
                visible[f as usize].insert(a.id);
                continue;
            }
            let outpost_at = |l: Loc| match l {
                Loc::Node(n) => st
                    .outposts
                    .get(&n)
                    .is_some_and(|o| o.owner == f && o.build_ticks_left == 0),
                _ => false,
            };
            let is_concealed = concealed(a);
            let seen = if is_concealed {
                // Only a moving enemy with scouts at one tile smells the
                // woods — or a standing watchtower close by.
                within(map, a.loc, VISION_SCOUT_AMBUSH, |l| {
                    st.armies.iter().any(|o| {
                        o.faction == f && o.alive() && o.loc == l && o.marching() && has_scouts(o)
                    })
                })
                .is_some()
                    || within(map, a.loc, crate::tunables::OUTPOST_REVEAL_RADIUS, outpost_at)
                        .is_some()
            } else {
                within(map, a.loc, VISION_ARMY, |l| {
                    st.armies.iter().any(|o| o.faction == f && o.alive() && o.loc == l)
                })
                .is_some()
                    // dug-in camps watch further than a column on the march
                    || within(map, a.loc, VISION_ARMY + crate::tunables::CAMP_VISION_BONUS, |l| {
                        st.armies.iter().any(|o| {
                            o.faction == f
                                && o.alive()
                                && o.loc == l
                                && matches!(o.stance, Stance::Camp { build_ticks_left: 0 })
                        })
                    })
                    .is_some()
                    || within(map, a.loc, VISION_CITY, |l| match l {
                        Loc::Node(n) => st.cities.get(&n).is_some_and(|c| c.owner == f),
                        _ => false,
                    })
                    .is_some()
                    || within(map, a.loc, crate::tunables::OUTPOST_VISION, outpost_at).is_some()
            };
            if seen {
                visible[f as usize].insert(a.id);
            }
        }
    }
    st.visible = visible;
}
