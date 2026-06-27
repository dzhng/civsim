mod common;

use campaign::state::{EncounterPhase, Loc, RosterEntry, Stance};
use campaign::{pathfind, tunables, units, Campaign};
use common::{inert, test_map};

#[test]
fn hostile_meeting_preps_then_pends() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    assert!(c.order_move(0, Loc::Node(2))); // red marches at blue's city
    let mut pended = false;
    for _ in 0..20_000 {
        c.tick();
        if c.state.battle_ready.is_some() {
            pended = true;
            break;
        }
    }
    assert!(pended, "armies never reached Pending");
    let e = &c.state.encounters[0];
    assert_eq!(e.phase, EncounterPhase::Pending);
    // Both armies frozen and adjacent.
    let (a, d) = (e.attacker as usize, e.defender as usize);
    assert!(pathfind::in_contact(
        &c.map,
        c.state.armies[a].loc,
        c.state.armies[d].loc
    ));
    // Mover is the attacker.
    assert_eq!(e.attacker, 0);
}

#[test]
fn faster_army_escapes_slower_chaser() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Blue (phalanx, 0.85) marches on B, held by red light infantry
    // (1.1). Red flees toward A: the speed gap opens the range before red
    // runs out of road and the encounter dissolves. (Ordering blue to A
    // would test nothing — pathing correctly prefers the sea lane for
    // that trip, and fleets can't fight.)
    assert!(c.order_move(1, Loc::Node(1)));
    let mut fled = false;
    for _ in 0..30_000 {
        c.tick();
        if !fled {
            if let Some(e) = c.state.encounters.first() {
                assert_eq!(e.phase, EncounterPhase::Preparing);
                assert!(c.order_move(0, Loc::Node(0)));
                fled = true;
            }
        }
        if c.state.battle_ready.is_some() {
            panic!("light infantry should outrun a phalanx");
        }
        if fled && c.state.encounters.is_empty() {
            return; // gap opened, encounter dissolved
        }
    }
    panic!("chase never resolved");
}

#[test]
fn garrison_sorties_and_blocks_assault() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.armies[1].roster[0].count = 0; // no blue field army
    c.state
        .cities
        .get_mut(&2)
        .unwrap()
        .garrison
        .push(RosterEntry {
            class: contract::UnitClassId::LightSpear,
            count: 440,
            max: 440,
            morale_cap: 1.0,
        });
    assert!(c.order_move(0, Loc::Node(2)));
    let mut pended = false;
    for _ in 0..20_000 {
        c.tick();
        if c.state.battle_ready.is_some() {
            pended = true;
            break;
        }
    }
    assert!(pended, "assault on a garrisoned city must become a battle");
    let g = c
        .state
        .armies
        .iter()
        .find(|a| a.garrison_of == Some(2))
        .unwrap();
    assert!(g.alive() && g.loc == Loc::Node(2));
}

#[test]
fn defended_city_assault_stands_a_siege() {
    // Player is red (faction 0); A (node 0) is the player's city. An enemy
    // assault on a defended city opens a siege the world runs through — the
    // real-time window to march relief — instead of committing instantly.
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.armies[0].roster[0].count = 0; // no red field army to intercept
    c.state
        .cities
        .get_mut(&0)
        .unwrap()
        .garrison
        .push(RosterEntry {
            class: contract::UnitClassId::LightSpear,
            count: 440,
            max: 440,
            morale_cap: 1.0,
        });
    // Start blue adjacent to A by road (at B): an overland approach so the
    // garrison sorties as the enemy nears, rather than a sea lane that
    // disembarks straight onto the port city.
    c.state.armies[1].loc = Loc::Node(1);
    assert!(c.order_move(1, Loc::Node(0))); // blue marches on the player's city
    let mut sieged = false;
    for _ in 0..20_000 {
        c.tick();
        if let Some(e) = c
            .state
            .encounters
            .iter()
            .find(|e| c.state.armies[e.defender as usize].garrison_of == Some(0))
        {
            assert_eq!(e.phase, EncounterPhase::Preparing);
            assert_eq!(
                e.prep_attacker,
                tunables::SIEGE_TICKS,
                "a defended city stands a siege"
            );
            assert_eq!(e.prep_defender, tunables::SIEGE_TICKS);
            sieged = true;
            break;
        }
    }
    assert!(sieged, "an assault on a defended city must open a siege");
    // The siege does NOT commit instantly — the campaign is free to keep running.
    assert!(
        c.state.battle_ready.is_none(),
        "a siege gives the defender time before the battle commits"
    );
}

#[test]
fn ai_city_assault_stands_the_same_siege() {
    // The siege is faction-blind: an AI-vs-AI assault gets the same window as a
    // player one (here red→blue, with the player a third idle faction). Pins
    // "all factions, same logic" — not a player-only courtesy.
    let mut c = Campaign::new(test_map(), 7, 2);
    inert(&mut c);
    c.state.armies[1].roster[0].count = 0; // no blue field army
    c.state
        .cities
        .get_mut(&2)
        .unwrap()
        .garrison
        .push(RosterEntry {
            class: contract::UnitClassId::LightSpear,
            count: 440,
            max: 440,
            morale_cap: 1.0,
        });
    assert!(c.order_move(0, Loc::Node(2)));
    let mut formed = false;
    for _ in 0..20_000 {
        c.tick();
        if let Some(e) = c
            .state
            .encounters
            .iter()
            .find(|e| c.state.armies[e.defender as usize].garrison_of == Some(2))
        {
            assert_eq!(
                e.prep_attacker,
                tunables::SIEGE_TICKS,
                "an AI-vs-AI assault stands the same siege as a player one"
            );
            formed = true;
            break;
        }
    }
    assert!(formed, "the garrison encounter should form");
}

#[test]
fn won_assault_occupies_the_city() {
    // Winning a city assault seizes the city then and there: the victor is
    // placed Occupying the city node, not left idle beside it. AI is OFF, so
    // this proves the capture is owned by the battle resolution and needs no
    // commander to walk the army in — the gap the old code left, which only
    // captured when the occupy-clock happened to beat the next AI order.
    let mut c = Campaign::new(test_map(), 7, 2);
    inert(&mut c);
    c.state.armies[1].roster[0].count = 0; // no blue field army / relief
    c.state.armies[0].loc = Loc::Node(1); // red adjacent to C
    c.state.armies[0].roster[0].count = 600;
    c.state.armies[0].roster[0].max = 600;
    c.state.cities.get_mut(&2).unwrap().garrison.push(RosterEntry {
        class: contract::UnitClassId::LightSpear,
        count: 120,
        max: 120,
        morale_cap: 1.0,
    });
    assert!(c.order_move(0, Loc::Node(2)));
    let mut resolved = false;
    for _ in 0..40_000 {
        c.tick();
        if let Some(eid) = c.state.battle_ready {
            let s = c.battle_setup(eid).expect("setup");
            let r = campaign::resolve::estimate(&c.map, &s);
            c.apply_outcome(eid, &r);
            resolved = true;
            break;
        }
    }
    assert!(resolved, "the assault never came to battle");
    let red = &c.state.armies[0];
    assert!(red.alive(), "red won the assault");
    assert_eq!(red.loc, Loc::Node(2), "the victor stands in the city it took");
    assert!(
        matches!(red.stance, Stance::Occupying { city: 2, .. }),
        "the victor occupies its prize, got {:?}",
        red.stance
    );
    // No commander to redirect it: the occupation completes and C flips.
    for _ in 0..tunables::OCCUPY_TICKS as u32 + 5 {
        c.tick();
    }
    assert_eq!(c.state.cities[&2].owner, 0, "C falls to red");
}

#[test]
fn a_siege_converts_to_a_capture() {
    // The end-to-end property a siege must preserve: a determined assault on a
    // defended city, with NO relief possible, eventually takes the city. (The
    // regression this guards: if a besieged city replenishes its garrison, the
    // attacker wins fight after fight but the walls keep regrowing and the city
    // never flips.) Player is a third faction — pure AI-vs-AI.
    let mut c = Campaign::new(test_map(), 7, 2);
    for f in &mut c.state.factions {
        f.ai = true;
    }
    c.state.armies[1].roster[0].count = 0; // delete blue's field army — no relief
    c.state.armies[0].loc = Loc::Node(1); // strong red army adjacent to C
    c.state.armies[0].roster[0].count = 600;
    c.state.armies[0].roster[0].max = 600;
    c.state.cities.get_mut(&2).unwrap().garrison.push(RosterEntry {
        class: contract::UnitClassId::LightSpear,
        count: 120,
        max: 120,
        morale_cap: 1.0,
    });
    let owner0 = c.state.cities[&2].owner;
    let mut captured = false;
    for _ in 0..40_000 {
        c.tick();
        if c.state.tick % 60 == 0 {
            c.drive_ai();
        }
        if let Some(eid) = c.state.battle_ready {
            match c.battle_setup(eid) {
                Some(s) => {
                    let r = campaign::resolve::estimate(&c.map, &s);
                    c.apply_outcome(eid, &r);
                }
                None => c.state.battle_ready = None,
            }
        }
        if c.state.cities[&2].owner != owner0 {
            captured = true;
            break;
        }
    }
    assert!(captured, "a defended city with no relief must eventually fall");
}

#[test]
fn handoff_and_outcome_rout_or_annihilation() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    assert!(c.order_move(0, Loc::Node(2)));
    for _ in 0..20_000 {
        c.tick();
        if c.state.battle_ready.is_some() {
            break;
        }
    }
    let eid = c.state.battle_ready.expect("battle pending");
    let setup = c.battle_setup(eid).expect("setup");
    assert_eq!(setup.deployments.len(), 2);
    assert!(!setup.terrain.ops.is_empty());
    // Attacker (red, player) must be team 0... red IS the player here, and
    // red attacked, so red = attacker = team 0.
    assert_eq!(setup.deployments[0].team, 0);
    assert!(setup.deployments[0].column, "red was marching: column");

    // Blue is cornered at C: its only land road out runs through red's
    // tile. The initiation screen must say so, and defeat is annihilation.
    let enc = c.state.encounters.iter().find(|e| e.id == eid).unwrap();
    assert!(enc.no_retreat[1], "defender's retreat is cut off");
    assert!(!enc.no_retreat[0], "attacker can fall back the way it came");

    // Fabricate: red wins; blue had survivors but nowhere to regroup.
    let blue_id = ((1u64) << 8) | 0;
    let red_id = ((0u64) << 8) | 0;
    let result = contract::BattleResult {
        victor: 0,
        units: vec![
            contract::UnitResult {
                id: red_id,
                team: 0,
                survivors: 500,
                routed: false,
                morale_cap: 0.9,
                deployed: true,
            },
            contract::UnitResult {
                id: blue_id,
                team: 1,
                survivors: 400,
                routed: true,
                morale_cap: 0.6,
                deployed: true,
            },
        ],
    };
    c.apply_outcome(eid, &result);
    assert_eq!(c.state.armies[0].roster[0].count, 500);
    assert_eq!(
        c.state.armies[1].roster[0].count, 0,
        "cornered: captured and wiped"
    );
    assert!(c.state.encounters.is_empty());
}

#[test]
fn battle_handoff_carries_selected_unit_type() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.factions[0].treasury = 1_000;
    let class = contract::UnitClassId::LightSpear;
    let picked = units::unit_type_id(0, class, 2);
    assert!(c.order_set_class_doctrine(class, picked, 1));

    assert!(c.order_move(0, Loc::Node(2)));
    for _ in 0..20_000 {
        c.tick();
        if c.state.battle_ready.is_some() {
            break;
        }
    }
    let eid = c.state.battle_ready.expect("battle pending");
    let setup = c.battle_setup(eid).expect("setup");
    let red_unit = setup.deployments[0]
        .units
        .iter()
        .find(|u| u.class == class)
        .expect("red light spear");
    assert_eq!(red_unit.unit_type, Some(picked));
}

#[test]
fn loser_with_a_road_out_routs_along_it() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Meet mid-road: red marches at C, blue marches at A.
    assert!(c.order_move(0, Loc::Node(2)));
    assert!(c.order_move(1, Loc::Node(1)));
    for _ in 0..20_000 {
        c.tick();
        if c.state.battle_ready.is_some() {
            break;
        }
    }
    let eid = c.state.battle_ready.expect("battle pending");
    c.battle_setup(eid).expect("setup");
    let blue_id = ((1u64) << 8) | 0;
    let red_id = ((0u64) << 8) | 0;
    let result = contract::BattleResult {
        victor: 0,
        units: vec![
            contract::UnitResult {
                id: red_id,
                team: 0,
                survivors: 500,
                routed: false,
                morale_cap: 0.9,
                deployed: true,
            },
            contract::UnitResult {
                id: blue_id,
                team: 1,
                survivors: 400,
                routed: true,
                morale_cap: 0.6,
                deployed: true,
            },
        ],
    };
    c.apply_outcome(eid, &result);
    assert_eq!(
        c.state.armies[1].roster[0].count, 400,
        "open road behind: survivors rout"
    );
    assert!(matches!(c.state.armies[1].stance, Stance::Routed { .. }));
    let blue_loc = c.state.armies[1].loc;
    for _ in 0..8_000 {
        c.tick();
    }
    assert_ne!(c.state.armies[1].loc, blue_loc, "routing army runs");
    assert!(matches!(
        c.state.armies[1].stance,
        Stance::Routed { .. } | Stance::Hold
    ));
}

#[test]
fn ambush_springs_on_the_trigger_tile() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Blue hides at the forest spot on edge 0 (tile 6 was authored as
    // forest in this map; ambush_spots[0] points at edge 0 tile 2 - use
    // whatever the map defines).
    let sp = &c.map.ambush_spots[0];
    let trigger = Loc::Edge {
        edge: sp.edge,
        tile: sp.tile,
    };
    c.state.armies[1].loc = trigger;
    assert!(c.order_ambush(1, 0));
    for _ in 0..tunables::AMBUSH_SETTLE_TICKS as u32 + 5 {
        c.tick();
    }
    // Red marches through the trigger tile toward A... it starts at B;
    // route B->A passes edge 0. March!
    assert!(c.order_move(0, Loc::Node(0)));
    let mut sprung = false;
    for _ in 0..20_000 {
        c.tick();
        if let Some(e) = c.state.encounters.first() {
            assert!(e.ambush, "the only encounter should be the ambush");
            assert_eq!(e.defender, 1, "ambusher defends the ground");
            assert_eq!(e.prep_defender, 0, "ambusher needs no prep");
            sprung = true;
            break;
        }
    }
    assert!(sprung, "ambush never triggered");
    // Victim is pinned: no flee order accepted.
    assert!(!c.order_move(0, Loc::Node(1)), "ambush victim is locked");
}

#[test]
fn camped_defender_surprises_its_attacker() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Blue digs in at C; red marches onto it. Camp must finish first.
    assert!(c.order_camp(1));
    for _ in 0..tunables::CAMP_BUILD_TICKS as u32 + 5 {
        c.tick();
    }
    assert!(
        matches!(
            c.state.armies[1].stance,
            Stance::Camp {
                build_ticks_left: 0
            }
        ),
        "camp never finished digging in"
    );
    assert!(c.order_move(0, Loc::Node(2)));
    let mut met = false;
    for _ in 0..20_000 {
        c.tick();
        if let Some(e) = c.state.encounters.first() {
            assert_eq!(e.defender, 1, "the camped side always defends");
            assert_eq!(e.prep_defender, 0, "dug-in camp is already formed");
            assert_eq!(e.prep_attacker, tunables::PREP_SURPRISED_TICKS);
            met = true;
            break;
        }
    }
    assert!(met, "attacker never reached the camp");
}

#[test]
fn ambush_spot_ignores_a_camped_army() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Blue hides at the spot; red CAMPS on the trigger tile. Nothing may
    // spring — camped armies are watchful, not bait.
    let sp = &c.map.ambush_spots[0];
    let trigger = Loc::Edge {
        edge: sp.edge,
        tile: sp.tile,
    };
    c.state.armies[1].loc = trigger;
    assert!(c.order_ambush(1, 0));
    for _ in 0..tunables::AMBUSH_SETTLE_TICKS as u32 + 5 {
        c.tick();
    }
    c.state.armies[0].loc = trigger;
    assert!(c.order_camp(0));
    for _ in 0..200 {
        c.tick();
    }
    assert!(c.state.encounters.is_empty(), "camped army was ambushed");
}

#[test]
fn equal_speed_chaser_follows_around_the_corner() {
    // A --e0(4)-- J --e1(8)-- C, plus J --e2(8)-- D: a corner at J.
    let map = r#"{
          "half_w": 100, "half_h": 100,
          "nodes": [
            {"id": 1, "name": "A", "pos": [0,0],   "kind": "city", "tier": 2, "port": false, "owner": "red"},
            {"id": 2, "name": "J", "pos": [20,0],  "kind": "junction", "tier": 0, "port": false, "owner": ""},
            {"id": 3, "name": "C", "pos": [60,0],  "kind": "city", "tier": 1, "port": false, "owner": "blue"},
            {"id": 4, "name": "D", "pos": [20,40], "kind": "city", "tier": 1, "port": false, "owner": "blue"}
          ],
          "edges": [
            {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[20,0]],  "tiles": ["open","open","open","open"]},
            {"a": 2, "b": 3, "kind": "road", "via": [[20,0],[60,0]], "tiles": ["open","open","open","open","open","open","open","open"]},
            {"a": 2, "b": 4, "kind": "road", "via": [[20,0],[20,40]],"tiles": ["open","open","open","open","open","open","open","open"]}
          ],
          "ambush_spots": [],
          "factions": [
            {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
            {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true},
            {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}
          ],
          "start_armies": [
            {"faction": "red",  "at": "A", "roster": [["LightSpear", 1]]},
            {"faction": "blue", "at": "C", "roster": [["LightSpear", 1]]}
          ]
        }"#;
    let mut c = Campaign::new(map, 7, 0);
    inert(&mut c);
    // Blue stands one tile up the A-J road; red marches at it.
    c.state.armies[1].loc = Loc::Edge { edge: 0, tile: 1 };
    assert!(c.order_move(0, Loc::Edge { edge: 0, tile: 1 }));
    for _ in 0..20_000 {
        c.tick();
        if !c.state.encounters.is_empty() {
            break;
        }
    }
    assert_eq!(c.state.encounters.len(), 1, "contact never made");
    // Stretch the prep window so the flight actually covers ground, then
    // send blue around the corner at J toward D.
    c.state.encounters[0].prep_attacker = 4000;
    c.state.encounters[0].prep_defender = 4000;
    assert!(c.order_move(1, Loc::Node(3)));
    let mut pended = false;
    for _ in 0..40_000 {
        c.tick();
        if c.state.battle_ready.is_some() {
            pended = true;
            break;
        }
        if c.state.encounters.is_empty() {
            break; // dissolved: the chaser lost the corner
        }
    }
    assert!(
        pended,
        "equal-speed chase should run the defender down past the corner"
    );
}
