#![allow(dead_code)]

use campaign::state::RosterEntry;
use campaign::tunables as tun;
use campaign::Campaign;
use contract::UnitClassId;

pub fn inert(c: &mut Campaign) {
    for f in &mut c.state.factions {
        f.ai = false;
    }
}

/// Drive the campaign `ticks` ticks the way the harness does: the commander AI
/// runs at its dispatch cadence (`drive_ai`) and any battle that comes due is
/// resolved the cheap way (`resolve::estimate`). One place wires the AI for
/// every behaviour test. Returns the number of battles fought.
pub fn run_ai(c: &mut Campaign, ticks: u32) -> u32 {
    let mut battles = 0;
    for _ in 0..ticks {
        c.tick();
        if c.state.tick % tun::AI_DISPATCH_EVERY == 0 {
            c.drive_ai();
        }
        if let Some(eid) = c.state.battle_ready {
            match c.battle_setup(eid) {
                Some(setup) => {
                    let r = campaign::resolve::estimate(&c.map, &setup);
                    c.apply_outcome(eid, &r);
                    battles += 1;
                }
                None => c.state.battle_ready = None,
            }
        }
    }
    battles
}

pub fn test_map() -> &'static str {
    include_str!("../fixtures/test-map.json")
}

pub fn real_map() -> String {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../web/public/data/campaign-map.json"
    );
    std::fs::read_to_string(path).expect("real campaign map should be present")
}

/// Strong red, weak blue, and one junction: small enough for rollout tests but
/// complete enough to drive the full campaign-to-battle loop to a verdict.
pub fn lopsided_map() -> &'static str {
    r#"{
      "half_w": 100, "half_h": 100,
      "nodes": [
        {"id": 1, "name": "Red",  "pos": [0,0],  "kind": "city", "tier": 2, "port": false, "owner": "red"},
        {"id": 2, "name": "Mid",  "pos": [20,0], "kind": "junction", "tier": 0, "port": false, "owner": ""},
        {"id": 3, "name": "Blue", "pos": [40,0], "kind": "city", "tier": 1, "port": false, "owner": "blue"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[20,0]], "tiles": ["open","open","open","open","open","open"]},
        {"a": 2, "b": 3, "kind": "road", "via": [[20,0],[40,0]], "tiles": ["open","open","open","open","open","open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true},
        {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}
      ],
      "start_armies": [
        {"faction": "red",  "at": "Red",  "roster": [["HeavySword", 3], ["Archers", 1], ["ShockCavalry", 1]]},
        {"faction": "blue", "at": "Blue", "roster": [["LightSpear", 1]]}
      ]
    }"#
}

/// Tick exactly to the next monthly settlement.
pub fn run_month(c: &mut Campaign) {
    for _ in 0..tun::TICKS_PER_MONTH {
        c.tick();
    }
}

pub fn garrison(class: UnitClassId, count: u32) -> Vec<RosterEntry> {
    vec![RosterEntry {
        class,
        count,
        max: count,
        morale_cap: 1.0,
    }]
}
