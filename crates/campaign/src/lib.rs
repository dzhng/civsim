//! The campaign game: an EU4-style pausable real-time strategy layer over a
//! road graph of the ancient world. Pure logic, no wasm — the composition
//! root binds it for the browser. Shares only `contract` with the battle sim.

pub mod ai;
pub mod battlegen;
pub mod economy;
pub mod mapdata;
pub mod pathfind;
pub mod resolve;
pub mod sim;
pub mod state;
pub mod visibility;
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
        sim::try_move(&self.map, &mut self.state, army, dest, true)
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

    /// Slip off the road into a hiding spot. Valid while halted on the
    /// spot's trigger tile; the army settles, then vanishes from enemy view.
    pub fn order_ambush(&mut self, army: ArmyId, spot: u32) -> bool {
        let Some(sp) = self.map.ambush_spots.get(spot as usize) else { return false };
        let trigger = state::Loc::Edge { edge: sp.edge, tile: sp.tile };
        let Some(a) = self.state.armies.get_mut(army as usize) else { return false };
        if !a.alive() || !a.halted() || a.encounter.is_some() || a.loc != trigger {
            return false;
        }
        a.stance = state::Stance::Ambush { spot, settle_ticks_left: tunables::AMBUSH_SETTLE_TICKS };
        true
    }

    /// Dig in where the army stands: halted, on land, free of entanglements.
    pub fn order_camp(&mut self, army: ArmyId) -> bool {
        use state::{Loc, Stance};
        let Some(a) = self.state.armies.get(army as usize) else { return false };
        let on_sea = matches!(a.loc, Loc::Edge { edge, .. } if self.map.edges[edge as usize].sea);
        if !a.alive()
            || !a.halted()
            || a.encounter.is_some()
            || a.garrison_of.is_some()
            || on_sea
            || !matches!(a.stance, Stance::March | Stance::Hold)
        {
            return false;
        }
        self.state.armies[army as usize].stance =
            Stance::Camp { build_ticks_left: tunables::CAMP_BUILD_TICKS };
        true
    }

    pub fn order_recruit(&mut self, node: u32, class: contract::UnitClassId, count: u32) -> bool {
        economy::recruit(&self.map, &mut self.state, node, class, count)
    }
    /// Upgrade a road edge one level (player faction pays).
    pub fn order_upgrade_road(&mut self, edge: u32) -> bool {
        let f = self.state.player_faction;
        economy::upgrade_road(&self.map, &mut self.state, edge, f)
    }
    /// Raise a watchtower on a junction (player faction pays).
    pub fn order_build_outpost(&mut self, node: u32) -> bool {
        let f = self.state.player_faction;
        economy::build_outpost(&self.map, &mut self.state, node, f)
    }
    pub fn order_disband(&mut self, army: ArmyId, entry: usize) -> bool {
        economy::disband(&mut self.state, army, entry)
    }
    pub fn order_merge(&mut self, src: ArmyId, dst: ArmyId) -> bool {
        economy::merge(&self.map, &mut self.state, src, dst)
    }
    pub fn order_split(&mut self, army: ArmyId, entries: &[usize]) -> bool {
        economy::split(&self.map, &mut self.state, army, entries)
    }

    pub fn save(&self) -> String {
        serde_json::to_string(&self.state).unwrap()
    }

    pub fn load(map_json: &str, save: &str) -> Result<Campaign, String> {
        let map = WorldMap::from_json(map_json);
        let mut state: CampaignState = serde_json::from_str(save).map_err(|e| e.to_string())?;
        // Saves predating road upgrades carry an empty vec.
        if state.road_levels.len() != map.edges.len() {
            state.road_levels = vec![1; map.edges.len()];
        }
        Ok(Campaign { map, state })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::Loc;

    /// Most scenarios premise an inert opponent; the AI gets its own test.
    fn inert(c: &mut Campaign) {
        for f in &mut c.state.factions {
            f.ai = false;
        }
    }

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
        let p = pathfind::plan(&c.map, &c.state.road_levels, Loc::Node(0), Loc::Node(2), false).unwrap();
        assert_eq!(p.len(), 26);
        assert_eq!(*p.last().unwrap(), Loc::Node(2));
    }

    #[test]
    fn marches_and_arrives() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
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
        assert!(pathfind::in_contact(&c.map, c.state.armies[a].loc, c.state.armies[d].loc));
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
    fn economy_income_upkeep_replenish() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        // Wound red's roster; it should refill at its friendly city... red
        // starts at B (junction) — move it home to A first via teleport.
        c.state.armies[0].loc = Loc::Node(0);
        c.state.armies[0].roster[0].count = 500; // max 880
        let t0 = c.state.factions[0].treasury;
        for _ in 0..tunables::TICKS_PER_DAY + 2 {
            c.tick();
        }
        // Income (tier 2 = 140) beats light-infantry upkeep (~13).
        assert!(c.state.factions[0].treasury > t0, "treasury should grow");
        assert!(c.state.armies[0].roster[0].count > 500, "should replenish at a friendly city");
        // Garrisons regenerate toward the establishment.
        let g = &c.state.cities[&0].garrison;
        assert!(g.iter().any(|r| r.count > 0), "garrison should regenerate");
    }

    #[test]
    fn broke_faction_bleeds_soldiers() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        c.state.factions[0].treasury = 0;
        // An upkeep far beyond tier-2 income: 20k shock cavalry.
        c.state.armies[0].roster[0] =
            RosterEntry { class: contract::UnitClassId::ShockCavalry, count: 20_000, max: 20_000, morale_cap: 1.0 };
        for _ in 0..2 * tunables::TICKS_PER_DAY + 2 {
            c.tick();
        }
        assert!(c.state.armies[0].roster[0].count < 20_000, "unpaid armies desert");
    }

    #[test]
    fn recruiting_delivers_a_new_army() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        c.state.factions[0].treasury = 10_000;
        assert!(c.order_recruit(0, contract::UnitClassId::Archers, 240));
        assert!(c.state.factions[0].treasury < 10_000, "cost paid up front");
        for _ in 0..2 * tunables::TICKS_PER_DAY + 2 {
            c.tick();
        }
        let recruited = c.state.armies.iter().any(|a| {
            a.faction == 0 && a.roster.iter().any(|r| r.class == contract::UnitClassId::Archers && r.count == 240)
        });
        assert!(recruited, "archers should muster at A");
    }

    #[test]
    fn undefended_city_is_occupied_and_flips() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        c.state.cities.get_mut(&2).unwrap().garrison.clear();
        c.state.armies[1].loc = Loc::Node(0); // move blue off C so red can take it... blue holds C
        c.state.armies[1].roster[0].count = 0; // simpler: tombstone blue
        c.state.armies[0].loc = Loc::Node(2); // red stands on C
        for _ in 0..tunables::OCCUPY_TICKS as u32 + 5 {
            c.tick();
        }
        assert_eq!(c.state.cities[&2].owner, 0, "C should flip to red");
    }

    #[test]
    fn garrison_sorties_and_blocks_assault() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        c.state.armies[1].roster[0].count = 0; // no blue field army
        c.state.cities.get_mut(&2).unwrap().garrison.push(RosterEntry {
            class: contract::UnitClassId::LightInfantry, count: 440, max: 440, morale_cap: 1.0,
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
        let g = c.state.armies.iter().find(|a| a.garrison_of == Some(2)).unwrap();
        assert!(g.alive() && g.loc == Loc::Node(2));
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
                contract::UnitResult { id: red_id, team: 0, survivors: 700, routed: false, morale_cap: 0.9, deployed: true },
                contract::UnitResult { id: blue_id, team: 1, survivors: 400, routed: true, morale_cap: 0.6, deployed: true },
            ],
        };
        c.apply_outcome(eid, &result);
        assert_eq!(c.state.armies[0].roster[0].count, 700);
        assert_eq!(c.state.armies[1].roster[0].count, 0, "cornered: captured and wiped");
        assert!(c.state.encounters.is_empty());
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
                contract::UnitResult { id: red_id, team: 0, survivors: 700, routed: false, morale_cap: 0.9, deployed: true },
                contract::UnitResult { id: blue_id, team: 1, survivors: 400, routed: true, morale_cap: 0.6, deployed: true },
            ],
        };
        c.apply_outcome(eid, &result);
        assert_eq!(c.state.armies[1].roster[0].count, 400, "open road behind: survivors rout");
        assert!(matches!(c.state.armies[1].stance, Stance::Routed { .. }));
        let blue_loc = c.state.armies[1].loc;
        for _ in 0..8_000 {
            c.tick();
        }
        assert_ne!(c.state.armies[1].loc, blue_loc, "routing army runs");
        assert!(matches!(c.state.armies[1].stance, Stance::Routed { .. } | Stance::Hold));
    }

    #[test]
    fn ai_faction_recruits_and_attacks() {
        let mut c = Campaign::new(test_map(), 7, 0); // blue (1) stays AI
        c.state.factions[1].treasury = 5_000;
        // Red's field army leaves the map area so blue sees no threat at home;
        // blue should eventually recruit and march on red's city A.
        c.state.armies[0].roster[0].count = 0; // tombstone red's army
        let mut recruited = false;
        let mut marched = false;
        for _ in 0..30 * tunables::TICKS_PER_DAY {
            c.tick();
            recruited |= !c.state.cities[&2].recruit_queue.is_empty()
                || c.state.armies.iter().any(|a| a.faction == 1 && a.id > 1 && a.alive());
            marched |= c.state.armies.iter().any(|a| a.faction == 1 && a.marching());
            if c.state.cities[&0].owner == 1 || (recruited && marched) {
                break;
            }
        }
        assert!(recruited, "AI should spend its treasury on troops");
        assert!(marched, "AI should move armies with a purpose");
    }

    #[test]
    fn ambush_springs_on_the_trigger_tile() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        // Blue hides at the forest spot on edge 0 (tile 6 was authored as
        // forest in this map; ambush_spots[0] points at edge 0 tile 2 - use
        // whatever the map defines).
        let sp = &c.map.ambush_spots[0];
        let trigger = Loc::Edge { edge: sp.edge, tile: sp.tile };
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
    fn save_load_roundtrip_is_deterministic() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
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
        inert(&mut c);
        // Force the sea lane: dest is a sea tile midway.
        let p = pathfind::plan(&c.map, &c.state.road_levels, Loc::Node(0), Loc::Edge { edge: 2, tile: 3 }, true).unwrap();
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

    /// A--B--C twice over: two equal road routes between A and C, so route
    /// preference is decided purely by road level.
    fn diamond_map() -> &'static str {
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
            {"faction": "red", "at": "A", "roster": [["LightInfantry", 880]]}
          ]
        }"#
    }

    /// A(red) --e0, 6 tiles, ambush spot at tile 4-- J(junction) --e1-- C(blue).
    /// J sits 2 tiles from the spot and inside red's territory radius.
    fn outpost_map() -> &'static str {
        r#"{
          "half_w": 100, "half_h": 100,
          "nodes": [
            {"id": 1, "name": "A", "pos": [0,0],  "kind": "city", "tier": 2, "port": false, "owner": "red"},
            {"id": 2, "name": "J", "pos": [35,0], "kind": "junction", "tier": 0, "port": false, "owner": ""},
            {"id": 3, "name": "C", "pos": [70,0], "kind": "city", "tier": 1, "port": false, "owner": "blue"}
          ],
          "edges": [
            {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[35,0]], "tiles": ["open","open","open","forest","forest","open"]},
            {"a": 2, "b": 3, "kind": "road", "via": [[35,0],[70,0]], "tiles": ["open","open","open","open","open","open"]}
          ],
          "ambush_spots": [{"edge": 0, "tile": 4, "side": 0}],
          "factions": [
            {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
            {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true},
            {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}
          ],
          "start_armies": [
            {"faction": "red",  "at": "A", "roster": [["LightInfantry", 880]]},
            {"faction": "blue", "at": "C", "roster": [["Phalanx", 1280]]}
          ]
        }"#
    }

    #[test]
    fn outpost_unmasks_a_concealed_ambusher() {
        let mut c = Campaign::new(outpost_map(), 7, 0);
        inert(&mut c);
        // Blue settles into the spot, 2 tiles from J.
        let sp = &c.map.ambush_spots[0];
        c.state.armies[1].loc = Loc::Edge { edge: sp.edge, tile: sp.tile };
        assert!(c.order_ambush(1, 0));
        for _ in 0..tunables::AMBUSH_SETTLE_TICKS as u32 + 10 {
            c.tick();
        }
        assert!(
            !c.state.visible[0].contains(&1),
            "concealed ambusher should be invisible without an outpost"
        );
        // A finished red watchtower at J turns the woods transparent.
        c.state.outposts.insert(1, Outpost { owner: 0, build_ticks_left: 0 });
        for _ in 0..visibility::VIS_EVERY + 1 {
            c.tick();
        }
        assert!(c.state.visible[0].contains(&1), "outpost should reveal the ambusher");
    }

    #[test]
    fn enemy_halt_razes_an_outpost() {
        let mut c = Campaign::new(outpost_map(), 7, 0);
        inert(&mut c);
        let gold0 = c.state.factions[0].treasury;
        assert!(c.order_build_outpost(1), "J is a junction in red territory");
        assert!(!c.order_build_outpost(1), "one outpost per node");
        assert_eq!(c.state.factions[0].treasury, gold0 - tunables::OUTPOST_COST);
        for _ in 0..tunables::OUTPOST_BUILD_TICKS + 5 {
            c.tick();
        }
        assert_eq!(c.state.outposts[&1].build_ticks_left, 0, "tower finished");
        // Round-trips through a save.
        let mut c = Campaign::load(outpost_map(), &c.save()).unwrap();
        inert(&mut c);
        assert_eq!(c.state.outposts[&1].owner, 0);
        // Blue marches onto J and halts: the tower comes down.
        assert!(c.order_move(1, Loc::Node(1)));
        for _ in 0..20_000 {
            c.tick();
            if c.state.outposts.is_empty() {
                break;
            }
        }
        assert!(c.state.outposts.is_empty(), "enemy halt should raze the outpost");
    }

    #[test]
    fn upgraded_road_marches_faster() {
        let ticks_to_arrive = |level: u8| {
            let mut c = Campaign::new(test_map(), 7, 0);
            inert(&mut c);
            c.state.road_levels[0] = level;
            assert!(c.order_move(0, Loc::Node(0))); // B -> A along edge 0
            for t in 0..20_000u32 {
                c.tick();
                if c.state.armies[0].loc == Loc::Node(0) && c.state.armies[0].halted() {
                    return t;
                }
            }
            panic!("never arrived");
        };
        let slow = ticks_to_arrive(1);
        let fast = ticks_to_arrive(3);
        assert!(
            (fast as f32) < slow as f32 / 1.45,
            "level 3 should be ~1.6x faster: {slow} -> {fast} ticks"
        );
    }

    #[test]
    fn routing_prefers_the_paved_parallel_route() {
        let mut c = Campaign::new(diamond_map(), 7, 0);
        inert(&mut c);
        // Identical routes either way; pave the south leg (edges 2+3) and
        // the planner must choose it.
        c.state.road_levels[2] = 3;
        c.state.road_levels[3] = 3;
        let p = pathfind::plan(&c.map, &c.state.road_levels, Loc::Node(0), Loc::Node(3), false).unwrap();
        assert!(
            p.contains(&Loc::Node(2)),
            "route should pass the southern junction S, got {p:?}"
        );
    }

    #[test]
    fn road_works_pay_build_and_persist() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        let gold0 = c.state.factions[0].treasury;
        assert!(c.order_upgrade_road(0)); // edge 0 touches red's A
        assert!(!c.order_upgrade_road(0), "one job per edge");
        let cost = tunables::ROAD_COST_PER_TILE * 12;
        assert_eq!(c.state.factions[0].treasury, gold0 - cost, "paid up front");
        // Save/load mid-build: the job must survive.
        let save = c.save();
        let mut c = Campaign::load(test_map(), &save).unwrap();
        inert(&mut c);
        assert_eq!(c.state.road_jobs.len(), 1);
        for _ in 0..tunables::ROAD_BUILD_TICKS_PER_TILE * 12 + 5 {
            c.tick();
        }
        assert_eq!(c.state.road_level(0), 2, "paving completed");
        assert!(c.state.road_jobs.is_empty());
        // And the finished level round-trips too.
        let c2 = Campaign::load(test_map(), &c.save()).unwrap();
        assert_eq!(c2.state.road_level(0), 2);
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
            matches!(c.state.armies[1].stance, Stance::Camp { build_ticks_left: 0 }),
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
    fn camp_breaks_on_a_move_order() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        assert!(c.order_camp(0));
        c.tick();
        assert!(matches!(c.state.armies[0].stance, Stance::Camp { .. }));
        assert!(c.order_move(0, Loc::Node(0)));
        assert!(matches!(c.state.armies[0].stance, Stance::March));
        // And camping is refused while marching.
        assert!(!c.order_camp(0));
    }

    #[test]
    fn ambush_spot_ignores_a_camped_army() {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        // Blue hides at the spot; red CAMPS on the trigger tile. Nothing may
        // spring — camped armies are watchful, not bait.
        let sp = &c.map.ambush_spots[0];
        let trigger = Loc::Edge { edge: sp.edge, tile: sp.tile };
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
}
