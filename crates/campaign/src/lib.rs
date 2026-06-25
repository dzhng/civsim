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
pub mod tunables;
pub mod visibility;

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
        let Some(a) = self.state.armies.get_mut(army as usize) else {
            return false;
        };
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
    pub fn apply_outcome(
        &mut self,
        encounter: state::EncounterId,
        result: &contract::BattleResult,
    ) {
        let pf = self.state.player_faction;
        resolve::apply_battle_outcome(&self.map, &mut self.state, encounter, result, pf);
    }

    /// Slip off the road into a hiding spot. Valid while halted on the
    /// spot's trigger tile; the army settles, then vanishes from enemy view.
    pub fn order_ambush(&mut self, army: ArmyId, spot: u32) -> bool {
        let Some(sp) = self.map.ambush_spots.get(spot as usize) else {
            return false;
        };
        let trigger = state::Loc::Edge {
            edge: sp.edge,
            tile: sp.tile,
        };
        let Some(a) = self.state.armies.get_mut(army as usize) else {
            return false;
        };
        if !a.alive() || !a.halted() || a.encounter.is_some() || a.loc != trigger {
            return false;
        }
        a.stance = state::Stance::Ambush {
            spot,
            settle_ticks_left: tunables::AMBUSH_SETTLE_TICKS,
        };
        true
    }

    /// Dig in where the army stands: halted, on land, free of entanglements.
    pub fn order_camp(&mut self, army: ArmyId) -> bool {
        use state::{Loc, Stance};
        let Some(a) = self.state.armies.get(army as usize) else {
            return false;
        };
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
        self.state.armies[army as usize].stance = Stance::Camp {
            build_ticks_left: tunables::CAMP_BUILD_TICKS,
        };
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
    /// Start a market or barracks at an owned city (player faction pays).
    pub fn order_build(&mut self, node: u32, kind: state::BuildKind) -> bool {
        let f = self.state.player_faction;
        economy::build(&mut self.state, node, kind, f)
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

    // ---- diplomacy (player-driven) ----------------------------------------

    /// The player's current stance toward another faction.
    pub fn relation_to(&self, other: FactionId) -> state::Relation {
        self.state.relation(self.state.player_faction, other)
    }

    pub fn declare_war(&mut self, other: FactionId) -> bool {
        self.set_player_relation(other, state::Relation::War)
    }

    pub fn make_peace(&mut self, other: FactionId) -> bool {
        self.set_player_relation(other, state::Relation::Peace)
    }

    /// Propose an alliance. The other power refuses if it badly outclasses you —
    /// there's nothing in it for a giant to ally a minnow.
    pub fn propose_alliance(&mut self, other: FactionId) -> bool {
        let p = self.state.player_faction;
        if other == p {
            return false;
        }
        let cities = |f: FactionId| self.state.cities.values().filter(|c| c.owner == f).count();
        if cities(other) > cities(p).saturating_mul(3).max(3) {
            return false;
        }
        self.state.set_relation(p, other, state::Relation::Alliance);
        true
    }

    /// Walk away from an alliance, back to an uneasy peace.
    pub fn break_alliance(&mut self, other: FactionId) -> bool {
        self.set_player_relation(other, state::Relation::Peace)
    }

    /// Send gold to another faction (a gift, a bribe, or tribute).
    pub fn gift_gold(&mut self, other: FactionId, amount: u32) -> bool {
        let p = self.state.player_faction;
        if other == p || self.state.factions[p as usize].treasury < amount {
            return false;
        }
        self.state.factions[p as usize].treasury -= amount;
        let t = &mut self.state.factions[other as usize].treasury;
        *t = t.saturating_add(amount);
        true
    }

    fn set_player_relation(&mut self, other: FactionId, r: state::Relation) -> bool {
        let p = self.state.player_faction;
        if other == p {
            return false;
        }
        self.state.set_relation(p, other, r);
        true
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
