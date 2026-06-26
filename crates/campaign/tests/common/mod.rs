#![allow(dead_code)]

use campaign::tunables as tun;
use campaign::Campaign;

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
    // A--e0--B--e1--C road line (12-tile edges), plus a long sea lane A~C
    // (40 tiles: slower than the road, so pathing only takes it when forced).
    r#"{
          "half_w": 100, "half_h": 100,
          "nodes": [
            {"id": 1, "name": "A", "pos": [0,0],  "kind": "city", "tier": 2, "port": true,  "owner": "red"},
            {"id": 2, "name": "B", "pos": [20,0], "kind": "junction", "tier": 0, "port": false, "owner": ""},
            {"id": 3, "name": "C", "pos": [40,0], "kind": "city", "tier": 1, "port": true,  "owner": "blue"}
          ],
          "edges": [
            {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[20,0]], "tiles": ["open","open","open","open","open","open","forest","open","open","open","open","open"]},
            {"a": 2, "b": 3, "kind": "road", "via": [[20,0],[40,0]], "tiles": ["open","open","open","open","open","hill","open","open","open","open","open","open"]},
            {"a": 1, "b": 3, "kind": "sea",  "via": [[0,0],[20,-20],[40,0]], "tiles": ["sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea","sea"]}
          ],
          "ambush_spots": [{"edge": 0, "tile": 2, "side": 1}],
          "factions": [
            {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
            {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true},
            {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}
          ],
          "start_armies": [
            {"faction": "red",  "at": "B", "roster": [["LightSpear", 1]]},
            {"faction": "blue", "at": "C", "roster": [["Phalanx", 1]]}
          ]
        }"#
}

pub fn diamond_map() -> &'static str {
    r#"{
          "half_w": 100, "half_h": 100,
          "nodes": [
            {"id": 1, "name": "A", "pos": [0,0],   "kind": "city", "tier": 2, "port": false, "owner": "red"},
            {"id": 2, "name": "N", "pos": [20,10], "kind": "junction", "tier": 0, "port": false, "owner": ""},
            {"id": 3, "name": "S", "pos": [20,-10],"kind": "junction", "tier": 0, "port": false, "owner": ""},
            {"id": 4, "name": "C", "pos": [40,0],  "kind": "city", "tier": 1, "port": false, "owner": "red"}
          ],
          "edges": [
            {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[20,10]],  "tiles": ["open","open","open","open","open","open"]},
            {"a": 2, "b": 4, "kind": "road", "via": [[20,10],[40,0]], "tiles": ["open","open","open","open","open","open"]},
            {"a": 1, "b": 3, "kind": "road", "via": [[0,0],[20,-10]], "tiles": ["open","open","open","open","open","open"]},
            {"a": 3, "b": 4, "kind": "road", "via": [[20,-10],[40,0]],"tiles": ["open","open","open","open","open","open"]}
          ],
          "ambush_spots": [],
          "factions": [
            {"id": "red", "name": "Red", "color": [200,0,0], "playable": true},
            {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}
          ],
          "start_armies": [
            {"faction": "red", "at": "A", "roster": [["LightSpear", 1]]}
          ]
        }"#
}
