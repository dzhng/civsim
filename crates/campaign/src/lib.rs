//! The campaign game: an EU4-style pausable real-time strategy layer over a
//! road graph of the ancient world. Pure logic, no wasm — the composition
//! root binds it for the browser. Shares only `contract` with the battle sim.

pub mod ai;
pub mod battlegen;
pub mod economy;
pub mod mapdata;
pub mod pathfind;
pub mod resolve;
pub mod rollout;
pub mod sim;
pub mod state;
pub mod tunables;
pub mod units;
pub mod visibility;

use mapdata::WorldMap;
use state::*;
use std::collections::{BTreeMap, BTreeSet};

pub struct Campaign {
    pub map: WorldMap,
    pub state: CampaignState,
    /// External-AI scheduling — the host-driven deferred-command queue. Not part
    /// of the saved state: a snapshot the worker reads is a plain paused game.
    sched: ExternalAi,
}

/// The lockstep-with-input-delay bookkeeping for off-thread AI (see
/// `advance_external`). All in real-time-bound ticks, so it's independent of how
/// long the worker takes — late decisions force a wait, never a different game.
#[derive(Default)]
struct ExternalAi {
    /// Decisions the host has submitted, keyed by the tick they apply on.
    queue: BTreeMap<u64, Vec<ai::Decision>>,
    /// Apply-ticks we've dispatched and are still waiting on (the stall set).
    awaiting: BTreeSet<u64>,
    /// The last dispatch tick the host acknowledged (so we don't re-stop on it).
    last_dispatch: Option<u64>,
    /// A dispatch tick `advance_external` stopped on, pending the host's snapshot.
    dispatch_pending: Option<u64>,
}

impl Campaign {
    pub fn new(map_json: &str, seed: u64, player_faction: u32) -> Campaign {
        let map = WorldMap::from_json(map_json);
        let mut state = sim::new_state(&map, seed, player_faction);
        normalize_state(&mut state);
        Campaign {
            map,
            state,
            sched: ExternalAi::default(),
        }
    }

    pub fn tick(&mut self) {
        sim::tick(&self.map, &mut self.state);
    }

    /// Order an army to march. Rejected (false) if the army can't take orders
    /// or no route exists. Sea legs are allowed; the army embarks at ports.
    pub fn order_move(&mut self, army: ArmyId, dest: Loc) -> bool {
        sim::try_move(&self.map, &mut self.state, army, dest, true)
    }

    /// Latch an army onto a moving enemy army and chase it indefinitely — the
    /// path re-aims at the target every tick, and the chase carries on even
    /// after the target routs. Rejected if the chaser can't take orders or the
    /// target isn't a reachable, live army.
    pub fn order_pursue(&mut self, army: ArmyId, target: ArmyId) -> bool {
        sim::order_pursue(&self.map, &mut self.state, army, target)
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

    pub fn order_set_class_doctrine(
        &mut self,
        class: contract::UnitClassId,
        unit_type: contract::UnitTypeId,
        size_mult: u8,
    ) -> bool {
        let f = self.state.player_faction;
        economy::set_class_doctrine(&self.map, &mut self.state, f, class, unit_type, size_mult)
    }

    pub fn order_auto_replenish(&mut self, army: ArmyId, on: bool) -> bool {
        economy::set_auto_replenish(&mut self.state, army, on)
    }
    /// Steer an owned city's development with the two policy dials: focus
    /// (−1 Economy … +1 Military) and throttle (0 Grow … 1 Exploit). The city
    /// auto-develops from there — the player's whole city interaction.
    pub fn order_set_city_policy(&mut self, node: u32, focus: f32, throttle: f32) -> bool {
        let f = self.state.player_faction;
        economy::set_city_policy(&mut self.state, node, f, focus, throttle)
    }
    /// Flag an owned army to sack (vs hold) the next city it captures.
    pub fn order_sack_intent(&mut self, army: ArmyId, on: bool) -> bool {
        let f = self.state.player_faction;
        ai::orders::apply(&self.map, &mut self.state, f, &ai::Order::Sack { army, on })
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

    // ---- AI scheduling ----------------------------------------------------
    // The AI never runs inside `tick`; the host drives it. In the app a worker
    // computes `commander_decisions` against a posted snapshot and applies them
    // on a fixed delay (see `advance_external`, tunables AI_DISPATCH_EVERY /
    // AI_LATENCY). Tests drive the same path synchronously via `drive_ai`.

    /// Run the commander AI synchronously: compute every campaigning faction's
    /// decision against the current state and apply it immediately. The same
    /// decisions the worker computes, just applied here-and-now (zero delay) —
    /// deterministic, and a convenience for tests and headless play.
    pub fn drive_ai(&mut self) {
        let decisions = ai::commander_decisions(&self.map, &self.state);
        self.apply_decisions(&decisions);
    }

    /// Compute every campaigning faction's decision against the current state,
    /// without touching it — what a worker runs on a posted snapshot.
    pub fn commander_decisions(&self) -> Vec<ai::Decision> {
        ai::commander_decisions(&self.map, &self.state)
    }

    /// Apply decisions the host computed earlier (replays orders + AI state).
    pub fn apply_decisions(&mut self, decisions: &[ai::Decision]) {
        for d in decisions {
            ai::apply_decision(&self.map, &mut self.state, d);
        }
    }

    /// Current campaign tick — the clock the host schedules dispatch/apply on.
    pub fn tick_count(&self) -> u64 {
        self.state.tick
    }

    /// Advance up to `max_n` ticks under host-driven AI, stopping at the
    /// boundaries the host must service. Returns `(advanced, reason, tick)`:
    ///   - reason 0 = ran the budget out (or hit a battle): nothing to do.
    ///   - reason 1 = stopped *on* a dispatch tick: the host must snapshot now
    ///     (`save`), send it to the worker to apply at tick + AI_LATENCY, then
    ///     call `ack_dispatch` and resume.
    ///   - reason 2 = stalled: the decision due at `tick` hasn't been submitted
    ///     yet; the host must wait for the worker, then resume.
    /// Because apply ticks are fixed, the worker's latency only ever causes a
    /// stall (a pause) — never a different outcome.
    pub fn advance_external(&mut self, max_n: u32) -> (u32, u8, u64) {
        let mut advanced = 0;
        while advanced < max_n {
            let t = self.state.tick;
            // Stop on an un-serviced dispatch boundary so the host snapshots.
            if t % tunables::AI_DISPATCH_EVERY == 0 && self.sched.last_dispatch != Some(t) {
                self.sched.dispatch_pending = Some(t);
                return (advanced, 1, t);
            }
            // Stall before a tick whose decision is due but not yet here.
            let next = t + 1;
            if self.sched.awaiting.contains(&next) && !self.sched.queue.contains_key(&next) {
                return (advanced, 2, next);
            }
            sim::tick(&self.map, &mut self.state);
            advanced += 1;
            // Apply anything scheduled for the tick we just reached.
            if let Some(ds) = self.sched.queue.remove(&self.state.tick) {
                for d in &ds {
                    ai::apply_decision(&self.map, &mut self.state, d);
                }
            }
            self.sched.awaiting.remove(&self.state.tick);
            if self.state.battle_ready.is_some() {
                return (advanced, 0, self.state.tick); // auto-pause for the battle
            }
        }
        (advanced, 0, self.state.tick)
    }

    /// Acknowledge the snapshot the host just took at the pending dispatch tick:
    /// records it (so `advance_external` won't re-stop there) and registers the
    /// apply tick it's now waiting on.
    pub fn ack_dispatch(&mut self) {
        if let Some(t) = self.sched.dispatch_pending.take() {
            self.sched.last_dispatch = Some(t);
            self.sched.awaiting.insert(t + tunables::AI_LATENCY);
        }
    }

    /// Submit decisions a worker computed for an earlier snapshot, to apply on
    /// their scheduled tick.
    pub fn submit_decisions(&mut self, apply_at: u64, decisions: Vec<ai::Decision>) {
        self.sched
            .queue
            .entry(apply_at)
            .or_default()
            .extend(decisions);
    }

    pub fn load(map_json: &str, save: &str) -> Result<Campaign, String> {
        let map = WorldMap::from_json(map_json);
        let mut state: CampaignState = serde_json::from_str(save).map_err(|e| e.to_string())?;
        normalize_state(&mut state);
        Ok(Campaign {
            map,
            state,
            sched: ExternalAi::default(),
        })
    }
}

fn normalize_state(state: &mut CampaignState) {
    state
        .doctrines
        .resize_with(state.factions.len(), state::FactionDoctrine::default);
    for f in 0..state.factions.len() as u32 {
        let d = &mut state.doctrines[f as usize];
        for &class in &contract::ALL_CLASSES {
            if let Some(slot) = d.slots.iter_mut().find(|s| s.class == class) {
                let bad_selected = match units::decode_unit_type(slot.selected) {
                    Some((sf, sc, option)) => {
                        sf != f || sc != class || option >= units::DEFAULT_OPTIONS_PER_CLASS
                    }
                    None => true,
                };
                if bad_selected {
                    slot.selected = units::unit_type_id(f, class, 0);
                }
                if !matches!(slot.size_mult, 1 | 2 | 3) {
                    slot.size_mult = 1;
                }
            } else {
                d.slots.push(state::DoctrineSlot {
                    class,
                    selected: units::unit_type_id(f, class, 0),
                    size_mult: 1,
                    cooldown_until: 0,
                });
            }
        }
        d.slots
            .retain(|s| contract::ALL_CLASSES.iter().any(|&c| c == s.class));
        d.slots.sort_by_key(|s| s.class as u32);
    }
}
