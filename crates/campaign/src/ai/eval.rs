//! How a faction reads a position: one scalar, higher is better for it. The
//! commander's lookahead rolls each candidate plan forward, then ranks the
//! resulting positions with `score`. The **weights are the faction's
//! personality** (slice 6 supplies per-persona presets) — what it values when
//! it imagines the future.
//!
//! The default weights also carry the *scaling*: cities, army, and income live
//! in different units (a city count vs. milligold of upkeep vs. milligold/day),
//! so each default coefficient lifts its raw term into a common value space.
//! Personas then scale those coefficients up or down.

use super::{road_dist, strength};
use crate::mapdata::{NodeId, WorldMap};
use crate::state::*;
use crate::tunables as tun;

/// What a faction optimizes for. Each field multiplies one raw quantity; the
/// defaults make those quantities roughly commensurate (see module docs).
#[derive(Clone, Copy, Debug)]
pub struct Weights {
    /// Per owned city. The dominant term — territory is how the war is won.
    pub territory: f64,
    /// Per milligold of cost-weighted standing army (field + garrison).
    pub army: f64,
    /// Per milligold of daily income.
    pub income: f64,
    /// Subtracted: per milligold of visible hostile strength bearing on a city.
    pub threat: f64,
}

impl Default for Weights {
    fn default() -> Self {
        // Neutral expansionist baseline. A city is worth ~a solid field army;
        // income is valued over a month's horizon; threat to a city is a real,
        // if smaller, cost. Tuned for legibility, not yet for taste.
        Weights {
            territory: 50_000.0,
            army: 1.0,
            income: 30.0,
            threat: 1.0,
        }
    }
}

/// Score the position from `f`'s point of view. Reads only what `f` can see
/// (fog) for threats, plus its own ground truth (cities, army, treasury).
/// Pure: allocates a scratch BFS buffer but mutates nothing.
pub fn score(map: &WorldMap, st: &CampaignState, f: FactionId, w: &Weights) -> f64 {
    let cities = st.cities.values().filter(|c| c.owner == f).count() as f64;

    let mut army = 0.0;
    for a in st.armies.iter().filter(|a| a.faction == f && a.alive()) {
        army += strength(map, st, f, &a.roster) as f64;
    }
    for c in st.cities.values().filter(|c| c.owner == f) {
        army += strength(map, st, f, &c.garrison) as f64;
    }

    let income = crate::economy::daily_income(map, st, f) as f64;

    let threat = threat_to_cities(map, st, f);

    w.territory * cities + w.army * army + w.income * income - w.threat * threat
}

/// Total visible hostile strength within `AI_THREAT_RADIUS` road tiles of any
/// city `f` owns — the pressure on its borders, seen through its own fog.
fn threat_to_cities(map: &WorldMap, st: &CampaignState, f: FactionId) -> f64 {
    let visible = st.visible.get(f as usize).cloned().unwrap_or_default();
    let hostiles: Vec<(Loc, f64)> = st
        .armies
        .iter()
        .filter(|a| a.alive() && st.at_war(f, a.faction) && visible.contains(&a.id))
        .map(|a| (a.loc, strength(map, st, a.faction, &a.roster) as f64))
        .collect();
    if hostiles.is_empty() {
        return 0.0;
    }
    let mut bfs = crate::pathfind::Visited::new(map);
    let mut threat = 0.0;
    let my_cities: Vec<NodeId> = st
        .cities
        .iter()
        .filter(|(_, c)| c.owner == f)
        .map(|(&n, _)| n)
        .collect();
    for n in my_cities {
        let cloc = Loc::Node(n);
        for (hloc, hstr) in &hostiles {
            if road_dist(map, &mut bfs, *hloc, cloc, tun::AI_THREAT_RADIUS).is_some() {
                threat += hstr;
            }
        }
    }
    threat
}
