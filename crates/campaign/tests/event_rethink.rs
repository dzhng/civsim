//! Slice 7 — event-triggered re-think. A faction drawn into a fresh fight runs
//! its commander at once instead of waiting up to an hour for its turn. The
//! proof: the commander runs (last_think updates) on a tick that is *not* a
//! 60-tick boundary, so only the event path — not the hourly pass — could have
//! done it. And a debounce keeps a messy collision from firing a storm.

use campaign::state::Loc;
use campaign::Campaign;

/// Red and Blue march straight at each other down one road; cavalry on one side
/// makes them meet off-centre, so contact lands on an odd tick. Node ids 0-based:
/// A=0 (red), B=1 (blue).
fn collision_map() -> &'static str {
    r#"{
      "half_w": 100, "half_h": 100,
      "nodes": [
        {"id": 1, "name": "A", "pos": [0,0],  "kind": "city", "tier": 1, "port": false, "owner": "red"},
        {"id": 2, "name": "B", "pos": [25,0], "kind": "city", "tier": 1, "port": false, "owner": "blue"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[25,0]], "tiles": ["open","open","open","open","open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true}
      ],
      "start_armies": [
        {"faction": "red",  "at": "A", "roster": [["HeavySword", 400]]},
        {"faction": "blue", "at": "B", "roster": [["ShockCavalry", 300]]}
      ]
    }"#
}

/// March both armies at each other and step until they first make contact.
/// Returns (contact_tick, campaign).
fn run_to_contact() -> (u64, Campaign) {
    let mut c = Campaign::new(collision_map(), 7, 0);
    for f in &mut c.state.factions {
        f.ai = true;
    }
    c.order_move(0, Loc::Node(1)); // red → Blue's city
    c.order_move(1, Loc::Node(0)); // blue → Red's city
    for _ in 0..4000 {
        c.tick();
        if !c.state.encounters.is_empty() {
            return (c.state.tick, c);
        }
    }
    panic!("the two armies never made contact");
}

#[test]
fn contact_rethinks_the_faction_off_the_hourly_cadence() {
    let (contact, c) = run_to_contact();

    // Both sides were drawn into the fight, so both should have re-thought on
    // the contact tick.
    assert_eq!(
        c.state.last_think.get(&0),
        Some(&contact),
        "red should have re-thought on the contact tick {contact}",
    );
    assert_eq!(
        c.state.last_think.get(&1),
        Some(&contact),
        "blue should have re-thought on the contact tick {contact}",
    );

    // The clincher: contact landed off a 60-tick boundary, so the hourly pass
    // did not run this tick — only the event re-think could have set last_think.
    assert_ne!(
        contact % 60,
        0,
        "contact at tick {contact} fell on an hourly boundary; test can't isolate the event path",
    );
}

#[test]
fn the_hourly_pass_still_runs_without_events() {
    // No contact: a lone campaigning faction should still get its hourly turn,
    // so the event path is additive, not a replacement.
    let mut c = Campaign::new(collision_map(), 7, 0);
    for f in &mut c.state.factions {
        f.ai = true;
    }
    for _ in 0..60 {
        c.tick();
    }
    assert_eq!(
        c.state.last_think.get(&0),
        Some(&60),
        "the hourly commander pass should run at tick 60 with no events at all",
    );
}
