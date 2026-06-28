//! Slice 8 — rivalry. A nemesis a faction fixates on: seeded from the map or
//! formed when attacked, escalating toward the strongest aggressor that hates it
//! back, dissolving once the gap in power is absurd — and biasing (never
//! dictating) the commander toward the rival's cities.

use campaign::ai::{plan, rival};
use campaign::pathfind;
use campaign::state::{ArmyId, FactionId, Loc};
use campaign::Campaign;

/// Three cities in a triangle, one per power, each with a starting army. Tests
/// reposition armies and resize rosters to stage attacks. Node ids 0-based:
/// R=0 (red), B=1 (blue), G=2 (green).
fn triangle_map() -> &'static str {
    r#"{
      "half_w": 100, "half_h": 100,
      "nodes": [
        {"id": 1, "name": "R", "pos": [0,0],   "kind": "city", "tier": 2, "port": false, "owner": "red"},
        {"id": 2, "name": "B", "pos": [10,0],  "kind": "city", "tier": 2, "port": false, "owner": "blue"},
        {"id": 3, "name": "G", "pos": [5,9],   "kind": "city", "tier": 2, "port": false, "owner": "green"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[10,0]], "tiles": ["open","open"]},
        {"a": 2, "b": 3, "kind": "road", "via": [[10,0],[5,9]], "tiles": ["open","open"]},
        {"a": 1, "b": 3, "kind": "road", "via": [[0,0],[5,9]], "tiles": ["open","open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",   "name": "Red",   "color": [200,0,0], "playable": true},
        {"id": "blue",  "name": "Blue",  "color": [0,0,200], "playable": true},
        {"id": "green", "name": "Green", "color": [0,200,0], "playable": true}
      ],
      "start_armies": [
        {"faction": "red",   "at": "R", "roster": [["HeavySword", 1]]},
        {"faction": "blue",  "at": "B", "roster": [["HeavySword", 1]]},
        {"faction": "green", "at": "G", "roster": [["HeavySword", 1]]}
      ]
    }"#
}

/// A triangle campaign with city garrisons emptied, so a faction's strength is
/// exactly the field army a test sets — no garrison weight to mask the gaps the
/// rivalry rules turn on.
fn staged() -> Campaign {
    let mut c = Campaign::new(triangle_map(), 7, 0);
    for n in 0..3u32 {
        if let Some(city) = c.state.cities.get_mut(&n) {
            city.garrison.clear();
        }
    }
    c
}

/// Park `army` (count set to `strength`) on a node to stage a siege of it.
fn besiege(c: &mut Campaign, army: ArmyId, node: u32, strength: u32) {
    c.state.armies[army as usize].loc = Loc::Node(node);
    c.state.armies[army as usize].roster[0].count = strength;
}

fn rival_of(c: &Campaign, f: FactionId) -> Option<FactionId> {
    c.state.factions[f as usize].rival
}

#[test]
fn seeded_rivalry_loads_and_survives_a_save() {
    // Rome ↔ Carthage, pinned in the map data.
    let map = r#"{
      "half_w": 50, "half_h": 50,
      "nodes": [
        {"id": 1, "name": "Rome",     "pos": [0,0],  "kind": "city", "tier": 2, "port": false, "owner": "rome"},
        {"id": 2, "name": "Carthage", "pos": [9,0],  "kind": "city", "tier": 2, "port": false, "owner": "carthage"}
      ],
      "edges": [{"a": 1, "b": 2, "kind": "road", "via": [[0,0],[9,0]], "tiles": ["open"]}],
      "ambush_spots": [],
      "factions": [
        {"id": "rome",     "name": "Rome",     "color": [200,0,0], "playable": true, "rival": "carthage"},
        {"id": "carthage", "name": "Carthage", "color": [0,0,200], "playable": true, "rival": "rome"}
      ],
      "start_armies": [
        {"faction": "rome",     "at": "Rome",     "roster": [["HeavySword", 1]]},
        {"faction": "carthage", "at": "Carthage", "roster": [["HeavySword", 1]]}
      ]
    }"#;
    let c = Campaign::new(map, 7, 0);
    assert_eq!(rival_of(&c, 0), Some(1), "rome should be seeded with carthage");
    assert_eq!(rival_of(&c, 1), Some(0), "carthage should be seeded with rome");

    let reloaded = Campaign::load(map, &c.save()).unwrap();
    assert_eq!(rival_of(&reloaded, 0), Some(1), "rivalry must survive a save");
}

#[test]
fn an_attacker_becomes_the_rival() {
    let mut c = staged();
    assert_eq!(rival_of(&c, 0), None, "red starts with no grudge");
    besiege(&mut c, 1, 0, 100); // blue's army sits on red's city
    rival::update(&c.map, &mut c.state, 0);
    assert_eq!(rival_of(&c, 0), Some(1), "the attacker should become the rival");
}

#[test]
fn escalates_to_the_stronger_mutual_rival() {
    let mut c = staged();
    // Both blue and green besiege red; green is stronger and already hates red.
    besiege(&mut c, 1, 0, 100);
    besiege(&mut c, 2, 0, 400);
    c.state.factions[2].rival = Some(0); // green already rivals red (mutual)
    rival::update(&c.map, &mut c.state, 0);
    assert_eq!(
        rival_of(&c, 0),
        Some(2),
        "red should fixate on the stronger, mutual aggressor",
    );
}

#[test]
fn hysteresis_holds_against_a_marginal_challenger() {
    let mut c = staged();
    c.state.factions[0].rival = Some(1); // red already rivals blue
    c.state.armies[0].roster[0].count = 100; // red comparable to blue — no auto-dissolve
    besiege(&mut c, 1, 0, 100); // blue still attacking, strength 100
    besiege(&mut c, 2, 0, 120); // green attacking, only 1.2× blue

    rival::update(&c.map, &mut c.state, 0);
    assert_eq!(rival_of(&c, 0), Some(1), "a marginal challenger shouldn't flip the grudge");

    // Now green clearly out-powers blue: the grudge switches.
    besiege(&mut c, 2, 0, 200);
    rival::update(&c.map, &mut c.state, 0);
    assert_eq!(rival_of(&c, 0), Some(2), "a clearly stronger aggressor should win the grudge");
}

#[test]
fn a_lopsided_rivalry_dissolves() {
    let mut c = staged();
    c.state.factions[0].rival = Some(1);
    // Blue is a standing rival, not currently attacking, and now a minnow next
    // to red (200 vs 20 = 10×, past the dissolve ratio).
    c.state.armies[0].roster[0].count = 200;
    c.state.armies[1].roster[0].count = 20;
    rival::update(&c.map, &mut c.state, 0);
    assert_eq!(rival_of(&c, 0), None, "a giant should stop fixating on a crushed minnow");
}

#[test]
fn an_eliminated_rival_is_dropped() {
    let mut c = staged();
    c.state.factions[0].rival = Some(1);
    // Wipe blue off the map: no army, no city.
    c.state.armies[1].roster[0].count = 0;
    c.state.cities.get_mut(&1).unwrap().owner = 0; // red took blue's city
    rival::update(&c.map, &mut c.state, 0);
    assert_eq!(rival_of(&c, 0), None, "an eliminated rival is no rival");
}

#[test]
fn the_grudge_adds_a_candidate_aimed_at_the_rival() {
    let mut c = staged();
    c.state.factions[0].rival = Some(2); // red rivals green (city node 2)
    let mut bfs = pathfind::Visited::new(&c.map);
    let plans = plan::candidates(&c.map, &c.state, 0, 130, &mut bfs);
    let rival_target = plans
        .iter()
        .find(|p| p.label == "rival")
        .and_then(|p| p.orders.first().map(|&(_, l)| l));
    assert_eq!(
        rival_target,
        Some(Loc::Node(2)),
        "with a rival set, a candidate plan should march on the rival's city",
    );
}
