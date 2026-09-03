//! Loyalty / overextension (slice 05) and sack-vs-hold (slice 06). AI off — the
//! outcomes are owned by the mechanic, not by commander timing.

mod common;

use campaign::state::{Loc, RosterEntry};
use campaign::{economy, tunables, Campaign};
use common::{inert, run_month};

/// A 1-D chain of four cities X0–X1–X2–X3 through junctions, all blue but X3.
/// Red can take a middle city and find it surrounded by blue neighbours — the
/// shape the overextension brake is about.
fn chain_map() -> &'static str {
    r#"{
      "half_w": 200, "half_h": 50,
      "nodes": [
        {"id": 1, "name": "X0", "pos": [0,0],   "kind": "city", "tier": 2, "port": false, "owner": "blue"},
        {"id": 2, "name": "J0", "pos": [10,0],  "kind": "junction", "tier": 0, "port": false, "owner": ""},
        {"id": 3, "name": "X1", "pos": [20,0],  "kind": "city", "tier": 2, "port": false, "owner": "blue"},
        {"id": 4, "name": "J1", "pos": [30,0],  "kind": "junction", "tier": 0, "port": false, "owner": ""},
        {"id": 5, "name": "X2", "pos": [40,0],  "kind": "city", "tier": 2, "port": false, "owner": "blue"},
        {"id": 6, "name": "J2", "pos": [50,0],  "kind": "junction", "tier": 0, "port": false, "owner": ""},
        {"id": 7, "name": "X3", "pos": [60,0],  "kind": "city", "tier": 2, "port": false, "owner": "red"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[10,0]],  "tiles": ["open","open","open","open"]},
        {"a": 2, "b": 3, "kind": "road", "via": [[10,0],[20,0]], "tiles": ["open","open","open","open"]},
        {"a": 3, "b": 4, "kind": "road", "via": [[20,0],[30,0]], "tiles": ["open","open","open","open"]},
        {"a": 4, "b": 5, "kind": "road", "via": [[30,0],[40,0]], "tiles": ["open","open","open","open"]},
        {"a": 5, "b": 6, "kind": "road", "via": [[40,0],[50,0]], "tiles": ["open","open","open","open"]},
        {"a": 6, "b": 7, "kind": "road", "via": [[50,0],[60,0]], "tiles": ["open","open","open","open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true},
        {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}
      ],
      "start_armies": [
        {"faction": "red", "at": "X3", "roster": [["LightSpear", 1]]}
      ]
    }"#
}

/// A full-strength field army (`units` battle units) for `faction`, placed `loc`.
fn place_army(c: &mut Campaign, faction: u32, loc: Loc, units: u32) -> u32 {
    let id = c.state.armies.len() as u32;
    let roster = (0..units)
        .map(|_| RosterEntry {
            class: contract::UnitClassId::LightSpear,
            count: 500,
            max: 500,
            morale_cap: 1.0,
        })
        .collect();
    c.state
        .armies
        .push(campaign::state::Army::new(id, faction, roster, loc));
    id
}

// X city indices (0-based, in node order): X0=0, X1=2, X2=4, X3=6.
const X1: u32 = 2;
const X2: u32 = 4;

#[test]
fn enemy_majority_neighbours_drain_loyalty() {
    // X1 is blue, flanked by blue X0 and blue X2 — but if we flip it to red it
    // borders two enemies and no friend: its loyalty must fall.
    let mut c = Campaign::new(chain_map(), 1, 0);
    inert(&mut c);
    c.state.cities.get_mut(&X1).unwrap().owner = 0; // red, surrounded by blue
    c.state.cities.get_mut(&X1).unwrap().loyalty = 0.9;
    let before = c.state.cities[&X1].loyalty;
    run_month(&mut c);
    assert!(
        c.state.cities[&X1].loyalty < before,
        "a city with more enemy neighbours than friendly loses loyalty"
    );
}

#[test]
fn unsupported_surrounded_conquest_revolts_within_a_month() {
    // Red takes X1, leaves no army: surrounded by blue, it throws red off within
    // about a game-month.
    let mut c = Campaign::new(chain_map(), 1, 0);
    inert(&mut c);
    economy::resolve_capture(&mut c.state, X1, 0, false); // hold (low loyalty)
    assert_eq!(c.state.cities[&X1].owner, 0);
    run_month(&mut c);
    let indep = c.map.independents();
    assert_eq!(
        c.state.cities[&X1].owner, indep,
        "an abandoned, surrounded conquest revolts in ~a month"
    );
}

#[test]
fn army_anchors_a_surrounded_conquest() {
    // Same conquest, but a full red army sits on it: the anchor holds the city
    // and it does not revolt.
    let mut c = Campaign::new(chain_map(), 1, 0);
    inert(&mut c);
    economy::resolve_capture(&mut c.state, X1, 0, false);
    place_army(&mut c, 0, Loc::Node(X1), 12); // ≥10 units = full anchor
    let before = c.state.cities[&X1].loyalty;
    run_month(&mut c);
    assert_eq!(c.state.cities[&X1].owner, 0, "the anchor holds the city");
    assert!(
        c.state.cities[&X1].loyalty >= before,
        "a stationed army holds and begins to pacify the conquest"
    );
}

#[test]
fn small_army_anchors_only_proportionally() {
    // A handful of stragglers (well under the anchor threshold) is not enough to
    // hold a surrounded conquest: it still revolts.
    let mut c = Campaign::new(chain_map(), 1, 0);
    inert(&mut c);
    economy::resolve_capture(&mut c.state, X1, 0, false);
    place_army(&mut c, 0, Loc::Node(X1), 2); // far below ANCHOR_MIN_UNITS
    run_month(&mut c);
    assert_eq!(
        c.state.cities[&X1].owner,
        c.map.independents(),
        "too small an army can't anchor a surrounded conquest"
    );
}

#[test]
fn sack_yields_gold_and_destroys_population() {
    let mut c = Campaign::new(chain_map(), 1, 0);
    inert(&mut c);
    c.state.cities.get_mut(&X2).unwrap().population = 5_000;
    let gold0 = c.state.factions[0].treasury;
    economy::resolve_capture(&mut c.state, X2, 0, true); // sack
    assert_eq!(c.state.cities[&X2].owner, 0);
    assert!(
        c.state.factions[0].treasury > gold0,
        "sacking plunders gold from the populace"
    );
    assert!(
        c.state.cities[&X2].population < 1_000,
        "sacking razes most of the population"
    );
}

#[test]
fn hold_keeps_population_at_low_loyalty() {
    let mut c = Campaign::new(chain_map(), 1, 0);
    inert(&mut c);
    c.state.cities.get_mut(&X2).unwrap().population = 5_000;
    economy::resolve_capture(&mut c.state, X2, 0, false); // hold
    assert_eq!(c.state.cities[&X2].owner, 0);
    assert_eq!(
        c.state.cities[&X2].population, 5_000,
        "holding keeps the population intact"
    );
    assert!(
        c.state.cities[&X2].loyalty <= tunables::CONQUEST_LOYALTY,
        "a held conquest starts at low loyalty, to be pacified"
    );
}
