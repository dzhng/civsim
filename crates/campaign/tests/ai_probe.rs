//! Slice 3 — the readable probe. Dumps, for a fixture, what the commander's
//! lookahead *sees*: each candidate plan, the position it rolls forward to, and
//! its score — so a human can critique the AI's taste (is it valuing the right
//! things?) before it drives the game. Run it with:
//!
//!   cargo test -p campaign --test ai_probe -- --nocapture
//!
//! It also pins the mechanism: the search picks the argmax, and on this fixture
//! that means preferring the winnable conquest over the suicidal assault.

use campaign::ai::{eval, plan};
use campaign::pathfind;
use campaign::state::RosterEntry;
use campaign::tunables as tun;
use campaign::Campaign;
use contract::UnitClassId;

/// Red sits on its city with a solid army between two adjacent enemy cities: a
/// heavily-garrisoned wall it cannot crack, and a near-empty one it can take in
/// a day. The lower-id city (the wall) is what a naive "march on the nearest
/// enemy" picks; lookahead should prefer the winnable one. Node ids reindex
/// 0-based: Red=0, Strong=1, Weak=2.
fn fork_map() -> &'static str {
    r#"{
      "half_w": 100, "half_h": 100,
      "nodes": [
        {"id": 1, "name": "Red",    "pos": [0,0],  "kind": "city", "tier": 2, "port": false, "owner": "red"},
        {"id": 2, "name": "Strong", "pos": [5,0],   "kind": "city", "tier": 2, "port": false, "owner": "blue"},
        {"id": 3, "name": "Weak",   "pos": [0,5],   "kind": "city", "tier": 1, "port": false, "owner": "blue"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[5,0]], "tiles": ["open"]},
        {"a": 1, "b": 3, "kind": "road", "via": [[0,0],[0,5]], "tiles": ["open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true},
        {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}
      ],
      "start_armies": [
        {"faction": "red", "at": "Red", "roster": [["HeavySword", 1000]]}
      ]
    }"#
}

fn garrison(class: UnitClassId, count: u32) -> Vec<RosterEntry> {
    vec![RosterEntry {
        class,
        count,
        max: count,
        morale_cap: 1.0,
    }]
}

#[test]
fn probe_scores_candidate_futures() {
    let mut c = Campaign::new(fork_map(), 7, 0);
    // Strong(1) is a wall; Weak(2) is ripe. (Cities keyed by 0-based node id.)
    c.state.cities.get_mut(&1).unwrap().garrison = garrison(UnitClassId::LightSpear, 5000);
    c.state.cities.get_mut(&2).unwrap().garrison = garrison(UnitClassId::LightSpear, 50);

    let w = eval::Weights::default();
    let mut bfs = pathfind::Visited::new(&c.map);
    let candidates = plan::candidates(&c.map, &c.state, 0, &mut bfs);

    let base = eval::score(&c.map, &c.state, 0, &w);
    println!("\n  red — persona: default   base score {base:.0}");

    // Roll each candidate forward and score the resulting position.
    let mut scored: Vec<(f64, &plan::Plan)> = candidates
        .iter()
        .map(|p| {
            let mut sb = c.state.clone();
            campaign::rollout::forward_plan(
                &c.map,
                &mut sb,
                &p.orders,
                tun::AI_ROLLOUT_HORIZON,
                tun::AI_ROLLOUT_CAP,
            );
            let s = eval::score(&c.map, &sb, 0, &w);
            let red_cities = sb.cities.values().filter(|c| c.owner == 0).count();
            let dests: Vec<String> = p.orders.iter().map(|(a, l)| format!("army{a}->{l:?}")).collect();
            println!(
                "  candidate {:<18} score {:>12.0}   cities={red_cities} loc={:?}  [{}]",
                p.label,
                s,
                sb.armies[0].loc,
                dests.join(", ")
            );
            (s, p)
        })
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
    let pick = scored[0].1;
    println!("  -> picks: {}\n", pick.label);

    // Mechanism: every faction gets at least the "hold" baseline.
    assert!(
        candidates.iter().any(|p| p.label == "hold"),
        "hold must always be an option",
    );
    assert!(candidates.len() >= 2, "fixture should surface real choices");

    // Taste: the winnable conquest must outscore both holding and the assault
    // it cannot win — the whole point of looking ahead.
    let by = |label: &str| scored.iter().find(|(_, p)| p.label == label).map(|(s, _)| *s);
    let beatable = by("nearest-beatable").expect("a beatable target exists");
    let hold = by("hold").expect("hold is always present");
    assert!(
        beatable > hold,
        "taking the soft city ({beatable:.0}) should beat sitting still ({hold:.0})",
    );
    if let Some(any) = by("nearest-any") {
        assert!(
            beatable > any,
            "the winnable city ({beatable:.0}) should beat marching on the wall ({any:.0})",
        );
    }
    assert_eq!(pick.label, "nearest-beatable", "search should pick the conquest");
}

#[test]
fn think_marches_on_the_winnable_city() {
    // The whole point of slice 4: the live commander, not just the probe, now
    // chooses by lookahead. Red between a wall (Strong) and a soft city (Weak)
    // must send its army at Weak — the rule-based AI marched on the *nearest*
    // enemy city, which here is the wall it cannot take.
    let mut c = Campaign::new(fork_map(), 7, 0);
    for f in &mut c.state.factions {
        f.ai = true;
    }
    c.state.cities.get_mut(&1).unwrap().garrison = garrison(UnitClassId::LightSpear, 5000);
    c.state.cities.get_mut(&2).unwrap().garrison = garrison(UnitClassId::LightSpear, 50);

    campaign::ai::commanders(&c.map, &mut c.state);

    let dest = c.state.armies[0].path.last().copied();
    assert_eq!(
        dest,
        Some(campaign::state::Loc::Node(2)),
        "red should march on the soft city (Node 2), not the wall (Node 1); got {dest:?}",
    );
}

#[test]
fn score_is_monotonic_in_its_terms() {
    let c = Campaign::new(fork_map(), 7, 0);
    let w = eval::Weights::default();
    let base = eval::score(&c.map, &c.state, 0, &w);

    // One more city → higher score.
    let mut more_land = c.state.clone();
    more_land.cities.get_mut(&2).unwrap().owner = 0;
    assert!(
        eval::score(&c.map, &more_land, 0, &w) > base,
        "holding another city should raise the score",
    );

    // Lose the field army → lower score.
    let mut no_army = c.state.clone();
    for r in &mut no_army.armies[0].roster {
        r.count = 0;
    }
    assert!(
        eval::score(&c.map, &no_army, 0, &w) < base,
        "losing the army should lower the score",
    );
}
