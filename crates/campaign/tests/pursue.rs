//! The pursue order: an army latches onto a moving enemy army and chases it
//! across the map indefinitely — re-aiming every tick, staying on it even once
//! it routs, and standing down only when the quarry is gone.

use campaign::state::{Loc, Stance};
use campaign::Campaign;

/// A line of five nodes: Red's city, three junctions, Blue's city. Node ids
/// reindex 0-based: Red=0, J1=1, Mid=2, J3=3, Blue=4.
fn line_map() -> &'static str {
    r#"{
      "half_w": 100, "half_h": 100,
      "nodes": [
        {"id": 1, "name": "Red",  "pos": [0,0],   "kind": "city", "tier": 1, "port": false, "owner": "red"},
        {"id": 2, "name": "J1",   "pos": [10,0],  "kind": "junction", "tier": 0, "port": false, "owner": ""},
        {"id": 3, "name": "Mid",  "pos": [20,0],  "kind": "junction", "tier": 0, "port": false, "owner": ""},
        {"id": 4, "name": "J3",   "pos": [30,0],  "kind": "junction", "tier": 0, "port": false, "owner": ""},
        {"id": 5, "name": "Blue", "pos": [40,0],  "kind": "city", "tier": 1, "port": false, "owner": "blue"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[10,0]],  "tiles": ["open","open"]},
        {"a": 2, "b": 3, "kind": "road", "via": [[10,0],[20,0]], "tiles": ["open","open"]},
        {"a": 3, "b": 4, "kind": "road", "via": [[20,0],[30,0]], "tiles": ["open","open"]},
        {"a": 4, "b": 5, "kind": "road", "via": [[30,0],[40,0]], "tiles": ["open","open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true}
      ],
      "start_armies": [
        {"faction": "red",  "at": "Red", "roster": [["ShockCavalry", 1]]},
        {"faction": "blue", "at": "Mid", "roster": [["HeavySword", 1]]}
      ]
    }"#
}

#[test]
fn pursuit_catches_a_fleeing_army() {
    let mut c = Campaign::new(line_map(), 7, 0);
    // Blue marches away toward its city; red (faster cavalry) chases it down.
    assert!(c.order_move(1, Loc::Node(4)), "blue should accept the march");
    assert!(c.order_pursue(0, 1), "red should accept the pursuit");
    assert!(
        matches!(c.state.armies[0].stance, Stance::Pursuing { target: 1 }),
        "red is now pursuing blue",
    );

    let mut contacted = false;
    for _ in 0..4000 {
        c.tick();
        if let Some(eid) = c.state.battle_ready {
            // Caught it — the cavalry ran the moving infantry down.
            contacted = true;
            // Tidy up so the loop can continue if needed.
            c.state.battle_ready = None;
            let _ = eid;
            break;
        }
        if !c.state.encounters.is_empty() {
            contacted = true;
            break;
        }
    }
    assert!(contacted, "the pursuer never caught its moving quarry");
    // Red left its start and moved down the line after blue.
    assert_ne!(c.state.armies[0].loc, Loc::Node(0), "red should have given chase");
}

#[test]
fn pursuit_stays_on_a_routed_target() {
    let mut c = Campaign::new(line_map(), 7, 0);
    c.order_move(1, Loc::Node(4));
    c.order_pursue(0, 1);
    for _ in 0..200 {
        c.tick();
    }
    // Blue is now a routed rabble (still alive). The chase must continue.
    c.state.armies[1].stance = Stance::Routed {
        tiles_left: 8,
        regroup_ticks_left: 120,
        by: 0,
    };
    c.tick();
    assert!(
        matches!(c.state.armies[0].stance, Stance::Pursuing { target: 1 }),
        "red should keep chasing blue after it routs, not stand down",
    );
}

#[test]
fn pursuit_stands_down_when_the_quarry_dies() {
    let mut c = Campaign::new(line_map(), 7, 0);
    c.order_move(1, Loc::Node(4));
    c.order_pursue(0, 1);
    c.tick();
    assert!(matches!(c.state.armies[0].stance, Stance::Pursuing { .. }));

    // Wipe blue out; the next tick the pursuer should give up and hold.
    for r in &mut c.state.armies[1].roster {
        r.count = 0;
    }
    c.tick();
    assert_eq!(
        c.state.armies[0].stance,
        Stance::Hold,
        "with the quarry gone, the pursuer stands down",
    );
}

#[test]
fn cannot_pursue_a_dead_or_self_target() {
    let mut c = Campaign::new(line_map(), 7, 0);
    assert!(!c.order_pursue(0, 0), "an army can't pursue itself");
    for r in &mut c.state.armies[1].roster {
        r.count = 0;
    }
    assert!(!c.order_pursue(0, 1), "can't pursue a dead army");
}
