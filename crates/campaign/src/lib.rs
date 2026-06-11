//! The campaign game: an EU4-style pausable real-time strategy layer over a
//! road graph of the ancient world. Pure logic, no wasm — the composition
//! root binds it for the browser. Shares only `contract` with the battle sim.

pub mod battlegen;
pub mod mapdata;
pub mod pathfind;
pub mod resolve;
pub mod sim;
pub mod state;
pub mod tunables;

use mapdata::WorldMap;
use state::*;

pub struct Campaign {
    pub map: WorldMap,
    pub state: CampaignState,
}

impl Campaign {
    pub fn new(map_json: &str, seed: u64, player_faction: u32) -> Campaign {
        let map = WorldMap::from_json(map_json);
        let state = sim::new_state(&map, seed, player_faction);
        Campaign { map, state }
    }

    pub fn tick(&mut self) {
        sim::tick(&self.map, &mut self.state);
    }

    /// Order an army to march. Rejected (false) if the army can't take orders
    /// or no route exists. Sea legs are allowed; the army embarks at ports.
    pub fn order_move(&mut self, army: ArmyId, dest: Loc) -> bool {
        let Some(a) = self.state.armies.get(army as usize) else { return false };
        if !a.alive()
            || matches!(a.stance, Stance::Routed { .. } | Stance::Occupying { .. })
        {
            return false;
        }
        if let Some(eid) = a.encounter {
            let pending = self
                .state
                .encounters
                .iter()
                .any(|e| e.id == eid && e.phase != EncounterPhase::Preparing);
            if pending {
                return false; // frozen: battle imminent
            }
        }
        let Some(path) = pathfind::plan(&self.map, a.loc, dest, true) else { return false };
        let a = &mut self.state.armies[army as usize];
        a.path = path;
        a.path_idx = 0;
        a.progress = 0.0;
        if a.stance == Stance::Hold {
            a.stance = Stance::March;
        }
        true
    }

    pub fn order_halt(&mut self, army: ArmyId) -> bool {
        let Some(a) = self.state.armies.get_mut(army as usize) else { return false };
        if !a.alive() || matches!(a.stance, Stance::Routed { .. }) {
            return false;
        }
        a.path.clear();
        a.path_idx = 0;
        a.progress = 0.0;
        a.stance = Stance::Hold;
        true
    }

    /// Hand off a Pending encounter to the battle layer.
    pub fn battle_setup(&mut self, encounter: state::EncounterId) -> Option<contract::BattleSetup> {
        let pf = self.state.player_faction;
        resolve::battle_setup_for(&self.map, &mut self.state, encounter, pf)
    }

    /// Apply a finished battle's result back onto the campaign.
    pub fn apply_outcome(&mut self, encounter: state::EncounterId, result: &contract::BattleResult) {
        let pf = self.state.player_faction;
        resolve::apply_battle_outcome(&self.map, &mut self.state, encounter, result, pf);
    }

    pub fn save(&self) -> String {
        serde_json::to_string(&self.state).unwrap()
    }

    pub fn load(map_json: &str, save: &str) -> Result<Campaign, String> {
        let map = WorldMap::from_json(map_json);
        let state: CampaignState = serde_json::from_str(save).map_err(|e| e.to_string())?;
        Ok(Campaign { map, state })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::Loc;

    fn test_map() -> &'static str {
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
            {"faction": "red",  "at": "B", "roster": [["LightInfantry", 880]]},
            {"faction": "blue", "at": "C", "roster": [["Phalanx", 1280]]}
          ]
        }"#
    }

    #[test]
    fn loads_and_paths() {
        let c = Campaign::new(test_map(), 7, 0);
        assert_eq!(c.map.nodes.len(), 3);
        assert_eq!(c.state.armies.len(), 2);
        // A -> C by road: 12 tiles + B + 12 tiles + C = 26 locs.
        let p = pathfind::plan(&c.map, Loc::Node(0), Loc::Node(2), false).unwrap();
        assert_eq!(p.len(), 26);
        assert_eq!(*p.last().unwrap(), Loc::Node(2));
    }

    #[test]
    fn marches_and_arrives() {
        let mut c = Campaign::new(test_map(), 7, 0);
        assert!(c.order_move(0, Loc::Node(0))); // B -> A
        // 12 tiles + the node, at ~262 ticks/tile for light infantry.
        for _ in 0..14 * 300 {
            c.tick();
        }
        assert_eq!(c.state.armies[0].loc, Loc::Node(0));
        assert!(c.state.armies[0].halted());
    }

    #[test]
    fn hostile_meeting_preps_then_pends() {
        let mut c = Campaign::new(test_map(), 7, 0);
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
        assert!(pathfind::in_contact(&c.map, c.state.armies[a].loc, c.state.armies[d].loc));
        // Mover is the attacker.
        assert_eq!(e.attacker, 0);
    }

    #[test]
    fn faster_army_escapes_slower_chaser() {
        let mut c = Campaign::new(test_map(), 7, 0);
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
    fn save_load_roundtrip_is_deterministic() {
        let mut c = Campaign::new(test_map(), 7, 0);
        c.order_move(0, Loc::Node(2));
        for _ in 0..500 {
            c.tick();
        }
        let save = c.save();
        let mut c2 = Campaign::load(test_map(), &save).unwrap();
        for _ in 0..500 {
            c.tick();
            c2.tick();
        }
        assert_eq!(c.save(), c2.save());
    }

    #[test]
    fn sea_route_embarks() {
        let mut c = Campaign::new(test_map(), 7, 0);
        // Force the sea lane: dest is a sea tile midway.
        let p = pathfind::plan(&c.map, Loc::Node(0), Loc::Edge { edge: 2, tile: 3 }, true).unwrap();
        assert!(p.iter().all(|l| matches!(l, Loc::Edge { edge: 2, .. } | Loc::Node(_))));
        assert!(c.order_move(0, Loc::Edge { edge: 2, tile: 3 }));
        let mut embarked = false;
        for _ in 0..5_000 {
            c.tick();
            if c.state.armies[0].embark_ticks_left > 0 {
                embarked = true;
            }
        }
        assert!(embarked, "never paid the embark stop");
        assert!(matches!(c.state.armies[0].stance, Stance::AtSea));
    }
}
