//! The campaign half of the composition root, plus the battle handoff — the
//! single place the two games meet. Hot per-frame state goes out as flat
//! arrays (zero-copy pointers); rare modal data goes out as JSON strings.

use crate::Game;
use campaign::state::{EncounterPhase, Loc, Stance};
use wasm_bindgen::prelude::*;

/// Base floats per army in the army_info array:
/// [id, x, y, faction, soldiers, stance, pie_kind, pie_frac, marching,
///  encounter (-1 none), morale_cap_mean, is_player, live roster entries],
///  followed by per-class soldier counts and then per-class live roster-entry
///  counts per `contract::ALL_CLASSES` entry (index = UnitClassId).
/// stance: 0 march/hold, 1 camp, 2 ambush-settling, 3 ambush-hidden,
///         4 routed, 5 occupying, 6 at sea. pie_kind: 0 none, 1 battle prep,
///         2 occupation, 3 embark, 4 ambush settle.
pub const ARMY_INFO_BASE_STRIDE: usize = 13;
pub const ARMY_CLASS_SLOTS: usize = contract::ALL_CLASSES.len();
pub const ARMY_INFO_STRIDE: usize = ARMY_INFO_BASE_STRIDE + ARMY_CLASS_SLOTS * 2;
/// Floats per city: [node, owner, garrison_soldiers, queue_len].
pub const CITY_INFO_STRIDE: usize = 4;

#[wasm_bindgen]
pub struct Campaign {
    inner: campaign::Campaign,
    army_info: Vec<f32>,
    city_info: Vec<f32>,
    /// Encounter currently handed off to a battle.
    fighting: Option<u32>,
}

/// The result of one `advance_external` step. `reason`: 0 = budget spent or a
/// battle came due; 1 = stopped on a dispatch tick (host must snapshot); 2 =
/// stalled waiting on the decision due at `tick`.
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct ExternalStep {
    pub advanced: u32,
    pub reason: u8,
    pub tick: f64,
}

fn loc_decode(kind: u32, a: u32, b: u32) -> Loc {
    if kind == 0 {
        Loc::Node(a)
    } else {
        Loc::Edge {
            edge: a,
            tile: b as u16,
        }
    }
}

fn resolved_unit_stats(r: &contract::RosterUnit) -> sim::UnitClass {
    let mut s = sim::class_stats(r.class);
    let option = r.unit_type.map(campaign::units::option_index).unwrap_or(0);
    match option {
        // Auxiliary / irregular: cheaper, quicker to move and recover, but
        // materially less able to stand in a hard front-line press.
        1 => {
            s.health *= 0.9;
            s.mass *= 0.92;
            s.block *= 0.86;
            s.evade = (s.evade + 0.05).min(0.7);
            s.training = (s.training - 0.08).max(0.2);
            s.bravery *= 0.9;
            s.morale_aura *= 0.9;
            s.pace_mult *= 1.06;
            s.fight_drain_mult *= 0.88;
            s.move_drain_mult *= 0.88;
        }
        // Professional / specialist: more staying power and discipline, paid
        // for in cost and stamina.
        2 => {
            s.health *= 1.1;
            s.mass *= 1.08;
            s.block = (s.block + 0.06).min(0.75);
            s.evade *= 0.92;
            s.training = (s.training + 0.1).min(1.0);
            s.bravery *= 1.15;
            s.morale_aura *= 1.08;
            s.fight_drain_mult *= 1.12;
            s.move_drain_mult *= 1.12;
        }
        n if n > 2 => {
            s.health *= 1.16;
            s.mass *= 1.12;
            s.training = (s.training + 0.14).min(1.0);
            s.bravery *= 1.2;
            s.fight_drain_mult *= 1.18;
            s.move_drain_mult *= 1.18;
        }
        _ => {}
    }
    s
}

fn resolved_unit_render_look(r: &contract::RosterUnit) -> u32 {
    // The tactical class is the default model id today. Keeping this beside
    // `resolved_unit_stats` gives campaign unit types a single future hook for
    // visual variants without mixing art choices into combat stats.
    r.class as u32
}

#[wasm_bindgen]
impl Campaign {
    #[wasm_bindgen(constructor)]
    pub fn new(map_json: &str, seed: u32, player_faction: u32) -> Campaign {
        let inner = campaign::Campaign::new(map_json, seed as u64, player_faction);
        let mut c = Campaign {
            inner,
            army_info: Vec::new(),
            city_info: Vec::new(),
            fighting: None,
        };
        c.refresh();
        c
    }

    pub fn load(map_json: &str, save: &str) -> Option<Campaign> {
        let inner = campaign::Campaign::load(map_json, save).ok()?;
        let mut c = Campaign {
            inner,
            army_info: Vec::new(),
            city_info: Vec::new(),
            fighting: None,
        };
        c.refresh();
        Some(c)
    }

    pub fn save(&self) -> String {
        self.inner.save()
    }

    // ---- off-thread AI bridge ---------------------------------------------

    /// Run inside the worker: compute every campaigning faction's decision for
    /// the loaded snapshot and return them as JSON to post back to the host.
    pub fn commander_decisions_json(&self) -> String {
        serde_json::to_string(&self.inner.commander_decisions()).unwrap()
    }

    /// Advance under host-driven AI, stopping at the boundaries the host must
    /// service (see `Campaign::advance_external`). On `reason == 1` snapshot with
    /// `save`, post it to the worker (apply at `tick + AI_LATENCY`), then
    /// `ack_dispatch`. On `reason == 2` wait for the worker. The result carries
    /// `advanced`, `reason`, and `tick`.
    pub fn advance_external(&mut self, max_n: u32) -> ExternalStep {
        if self.fighting.is_some() {
            return ExternalStep {
                advanced: 0,
                reason: 0,
                tick: self.inner.tick_count() as f64,
            };
        }
        let (advanced, reason, tick) = self.inner.advance_external(max_n);
        self.refresh();
        ExternalStep {
            advanced,
            reason,
            tick: tick as f64,
        }
    }

    /// Acknowledge the snapshot just taken at the pending dispatch tick.
    pub fn ack_dispatch(&mut self) {
        self.inner.ack_dispatch();
    }

    /// Submit a worker's decisions (JSON) to apply on their scheduled tick.
    pub fn submit_decisions_json(&mut self, apply_at: f64, json: &str) {
        if let Ok(decisions) = serde_json::from_str::<Vec<campaign::ai::Decision>>(json) {
            self.inner.submit_decisions(apply_at as u64, decisions);
        }
    }

    /// Saving is refused while a battle is pending or underway.
    pub fn can_save(&self) -> bool {
        self.fighting.is_none() && self.inner.state.battle_ready.is_none()
    }

    pub fn tick(&mut self, n: u32) {
        if self.fighting.is_some() {
            return; // world holds its breath while the battle runs
        }
        for _ in 0..n {
            self.inner.tick();
            if self.inner.state.battle_ready.is_some() {
                break; // auto-pause: the frontend reads battle_ready
            }
        }
        self.refresh();
    }

    pub fn player_faction(&self) -> u32 {
        self.inner.state.player_faction
    }

    pub fn current_tick(&self) -> f64 {
        self.inner.state.tick as f64
    }

    /// Encounter id awaiting the player's fight/auto choice, or -1.
    pub fn battle_ready(&self) -> i32 {
        self.inner.state.battle_ready.map_or(-1, |e| e as i32)
    }

    pub fn derived_site_seed(&self, kind: u32, a: u32, b: u32) -> u64 {
        let site = if kind == 0 {
            campaign::state::Loc::Node(a)
        } else {
            campaign::state::Loc::Edge {
                edge: a,
                tile: b as u16,
            }
        };
        campaign::battlegen::derived_site_seed(self.inner.state.campaign_seed, site)
    }

    /// Modal payload for the initiation screen (sides, sizes, retreat flags).
    pub fn encounter_json(&self, id: u32) -> String {
        let st = &self.inner.state;
        let Some(e) = st.encounters.iter().find(|e| e.id == id) else {
            return "null".into();
        };
        let mut visited = campaign::pathfind::Visited::new(&self.inner.map);
        let reinforcements =
            campaign::resolve::eligible_reinforcements(&self.inner.map, st, e.id, &mut visited)
                .len();
        let army = |id: u32| {
            let a = &st.armies[id as usize];
            serde_json::json!({
                "id": a.id,
                "faction": a.faction,
                "soldiers": a.soldiers(),
                "garrison": a.garrison_of.is_some(),
            })
        };
        serde_json::json!({
            "id": e.id,
            "ambush": e.ambush,
            "attacker": army(e.attacker),
            "defender": army(e.defender),
            "no_retreat": e.no_retreat,
            // not committed until Fight — show what WOULD join
            "reinforcements": reinforcements,
            "player_faction": st.player_faction,
        })
        .to_string()
    }

    /// Active sieges of the PLAYER's cities — the defended towns currently
    /// standing an assault, for the on-map "city besieged" notifications. The
    /// world keeps running through a siege (no auto-pause); clicking a notice
    /// pans the camera to the city. Each entry carries the city node, its world
    /// position (to pan to), and the besieging faction.
    pub fn sieges_json(&self) -> String {
        let st = &self.inner.state;
        let map = &self.inner.map;
        let mut rows: Vec<serde_json::Value> = Vec::new();
        for e in &st.encounters {
            if e.phase != EncounterPhase::Preparing {
                continue;
            }
            let def = &st.armies[e.defender as usize];
            let Some(node) = def.garrison_of else {
                continue;
            }; // garrison defender = a siege
            if def.faction != st.player_faction {
                continue; // only the player's own cities raise a notification
            }
            let [x, y] = campaign::sim::loc_pos(map, Loc::Node(node));
            rows.push(serde_json::json!({
                "node": node,
                "x": x,
                "y": y,
                "attacker": st.armies[e.attacker as usize].faction,
            }));
        }
        serde_json::json!(rows).to_string()
    }

    // ---- orders (the wasm layer enforces "player commands only own armies")

    pub fn order_move(&mut self, army: u32, kind: u32, a: u32, b: u32) -> bool {
        if !self.owns(army) {
            return false;
        }
        let ok = self.inner.order_move(army, loc_decode(kind, a, b));
        self.refresh();
        ok
    }

    pub fn order_halt(&mut self, army: u32) -> bool {
        if !self.owns(army) {
            return false;
        }
        let ok = self.inner.order_halt(army);
        self.refresh();
        ok
    }

    /// Chase a moving enemy army indefinitely (right-click an enemy army).
    pub fn order_pursue(&mut self, army: u32, target: u32) -> bool {
        if !self.owns(army) {
            return false;
        }
        let ok = self.inner.order_pursue(army, target);
        self.refresh();
        ok
    }

    pub fn order_ambush(&mut self, army: u32, spot: u32) -> bool {
        if !self.owns(army) {
            return false;
        }
        let ok = self.inner.order_ambush(army, spot);
        self.refresh();
        ok
    }

    pub fn order_recruit(&mut self, node: u32, class: u32, count: u32) -> bool {
        let owner = self.inner.state.cities.get(&node).map(|c| c.owner);
        if owner != Some(self.inner.state.player_faction) {
            return false;
        }
        let Some(&class) = contract::ALL_CLASSES.get(class as usize) else {
            return false;
        };
        let ok = self.inner.order_recruit(node, class, count);
        self.refresh();
        ok
    }

    pub fn order_set_class_doctrine(&mut self, class: u32, unit_type: u32, size_mult: u32) -> bool {
        let Some(&class) = contract::ALL_CLASSES.get(class as usize) else {
            return false;
        };
        let ok = self.inner.order_set_class_doctrine(
            class,
            contract::UnitTypeId(unit_type),
            size_mult as u8,
        );
        self.refresh();
        ok
    }

    pub fn order_auto_replenish(&mut self, army: u32, on: bool) -> bool {
        if !self.owns(army) {
            return false;
        }
        let ok = self.inner.order_auto_replenish(army, on);
        self.refresh();
        ok
    }

    pub fn order_merge(&mut self, src: u32, dst: u32) -> bool {
        let ok = self.owns(src) && self.owns(dst) && self.inner.order_merge(src, dst);
        self.refresh();
        ok
    }

    /// Set a city's policy dials: focus (−1 Economy … +1 Military) and throttle
    /// (0 Grow … 1 Exploit). The player's whole city interaction — the city
    /// auto-develops from there (no build menu).
    pub fn order_set_city_policy(&mut self, node: u32, focus: f32, throttle: f32) -> bool {
        let ok = self.inner.order_set_city_policy(node, focus, throttle);
        self.refresh();
        ok
    }

    // ---- diplomacy --------------------------------------------------------

    /// The great powers and the player's standing with each, for the diplomacy
    /// panel. Independents (neutral, un-treatyable) are omitted.
    pub fn diplomacy_json(&self) -> String {
        use campaign::state::Relation;
        let st = &self.inner.state;
        let p = st.player_faction;
        let list: Vec<_> = self
            .inner
            .map
            .factions
            .iter()
            .enumerate()
            .filter(|(_, fac)| fac.playable)
            .map(|(i, fac)| {
                let f = i as u32;
                let cities = st.cities.values().filter(|c| c.owner == f).count();
                let soldiers: u32 = st
                    .armies
                    .iter()
                    .filter(|a| a.faction == f && a.alive())
                    .map(|a| a.soldiers())
                    .sum();
                let relation = if f == p {
                    "self"
                } else {
                    match st.relation(p, f) {
                        Relation::War => "war",
                        Relation::Peace => "peace",
                        Relation::Alliance => "alliance",
                    }
                };
                serde_json::json!({
                    "id": f,
                    "name": fac.name,
                    "color": fac.color,
                    "is_player": f == p,
                    "relation": relation,
                    "cities": cities,
                    "soldiers": soldiers,
                })
            })
            .collect();
        serde_json::json!(list).to_string()
    }

    pub fn declare_war(&mut self, other: u32) -> bool {
        let ok = self.inner.declare_war(other);
        self.refresh();
        ok
    }

    pub fn make_peace(&mut self, other: u32) -> bool {
        let ok = self.inner.make_peace(other);
        self.refresh();
        ok
    }

    pub fn propose_alliance(&mut self, other: u32) -> bool {
        let ok = self.inner.propose_alliance(other);
        self.refresh();
        ok
    }

    pub fn break_alliance(&mut self, other: u32) -> bool {
        let ok = self.inner.break_alliance(other);
        self.refresh();
        ok
    }

    pub fn gift_gold(&mut self, other: u32, amount: u32) -> bool {
        let ok = self.inner.gift_gold(other, amount);
        self.refresh();
        ok
    }

    /// City detail for the panel: population, policy dials, development, loyalty,
    /// and the month's gold the city earns. Replaces the building readout.
    pub fn city_json(&self, node: u32) -> String {
        let Some(c) = self.inner.state.cities.get(&node) else {
            return "null".into();
        };
        let cap = campaign::tunables::city_pop_cap(self.inner.map.nodes[node as usize].tier);
        serde_json::json!({
            "population": c.population,
            "pop_cap": cap,
            "focus": c.focus,
            "throttle": c.throttle,
            "econ_dev": c.econ_dev,
            "mil_dev": c.mil_dev,
            "loyalty": c.loyalty,
            "monthly_income": campaign::economy::city_monthly_income(c),
        })
        .to_string()
    }

    /// The realm's monthly books for the economics panel: per-city income, total
    /// income, total army upkeep, net, and the ticks until the next settlement.
    pub fn economy_json(&self) -> String {
        let st = &self.inner.state;
        let f = st.player_faction;
        let cities: Vec<_> = st
            .cities
            .iter()
            .filter(|(_, c)| c.owner == f)
            .map(|(&node, c)| {
                serde_json::json!({
                    "node": node,
                    "name": self.inner.map.nodes[node as usize].name,
                    "population": c.population,
                    "income": campaign::economy::city_monthly_income(c),
                    "loyalty": c.loyalty,
                })
            })
            .collect();
        let income = campaign::economy::faction_monthly_income(st, f);
        let upkeep = campaign::economy::faction_monthly_upkeep(&self.inner.map, st, f);
        let per_month = campaign::tunables::TICKS_PER_MONTH as u64;
        let ticks_to_settle = per_month - (st.tick % per_month);
        serde_json::json!({
            "treasury": st.factions[f as usize].treasury,
            "monthly_income": income,
            "monthly_upkeep": upkeep,
            "monthly_net": income as i64 - upkeep as i64,
            "ticks_to_settle": ticks_to_settle,
            "cities": cities,
        })
        .to_string()
    }

    /// Debug/test only: drop an army onto a loc, halted and disentangled, so
    /// the visual harness can pose it on a road tile or any city.
    pub fn debug_place(&mut self, army: u32, kind: u32, a: u32, b: u32) {
        if let Some(ar) = self.inner.state.armies.get_mut(army as usize) {
            ar.loc = loc_decode(kind, a, b);
            ar.path.clear();
            ar.path_idx = 0;
            ar.progress = 0.0;
            ar.encounter = None;
            ar.stance = Stance::Hold;
        }
        self.refresh();
    }

    pub fn order_camp(&mut self, army: u32) -> bool {
        let ok = self.owns(army) && self.inner.order_camp(army);
        self.refresh();
        ok
    }

    /// Split roster entries (bitmask over roster indices) onto an adjacent tile.
    pub fn order_split(&mut self, army: u32, entries_mask: u32) -> bool {
        let entries: Vec<usize> = (0..32)
            .filter(|i| entries_mask & (1u32 << i) != 0)
            .collect();
        let ok = self.owns(army) && self.inner.order_split(army, &entries);
        self.refresh();
        ok
    }

    // ---- flat state out (refreshed after tick/orders) -----------------------

    pub fn army_count(&self) -> u32 {
        (self.army_info.len() / ARMY_INFO_STRIDE) as u32
    }

    pub fn army_info_ptr(&self) -> *const f32 {
        self.army_info.as_ptr()
    }

    pub fn army_info_stride(&self) -> u32 {
        ARMY_INFO_STRIDE as u32
    }

    pub fn army_info_base_stride(&self) -> u32 {
        ARMY_INFO_BASE_STRIDE as u32
    }

    pub fn army_class_slots(&self) -> u32 {
        ARMY_CLASS_SLOTS as u32
    }

    pub fn army_stack_unit_cap(&self) -> u32 {
        campaign::tunables::ARMY_STACK_UNIT_CAP as u32
    }

    pub fn unit_class_names_json(&self) -> String {
        serde_json::to_string(
            &contract::ALL_CLASSES
                .iter()
                .map(|class| format!("{class:?}"))
                .collect::<Vec<_>>(),
        )
        .unwrap()
    }

    pub fn class_doctrine_json(&self) -> String {
        let st = &self.inner.state;
        let f = st.player_faction;
        let rows: Vec<serde_json::Value> = contract::ALL_CLASSES
            .iter()
            .enumerate()
            .map(|(ci, &class)| {
                let selected = campaign::units::selected_unit_type(st, f, class);
                let size = campaign::units::size_mult(st, f, class);
                let cooldown_until = st
                    .doctrines
                    .get(f as usize)
                    .and_then(|d| d.slots.iter().find(|s| s.class == class))
                    .map(|s| s.cooldown_until)
                    .unwrap_or(0);
                let live = campaign::economy::field_living_soldiers(st, f, class);
                let max: u32 = st
                    .armies
                    .iter()
                    .filter(|a| a.faction == f && a.garrison_of.is_none() && a.alive())
                    .flat_map(|a| &a.roster)
                    .filter(|r| r.class == class)
                    .map(|r| r.max)
                    .sum();
                let options: Vec<serde_json::Value> =
                    campaign::units::available_options(&self.inner.map, f, class)
                        .into_iter()
                        .map(|u| {
                            let apply_cost = campaign::economy::class_doctrine_cost(
                                &self.inner.map,
                                st,
                                f,
                                class,
                                u.id,
                                size,
                            );
                            serde_json::json!({
                                "id": u.id.0,
                                "name": u.name,
                                "costPerSoldier": u.cost_per_soldier_milligold as f32 / 1000.0,
                                "upkeepPerSoldier": u.upkeep_per_soldier_milligold as f32 / 1000.0,
                                "recruitTicksPerSoldier": u.recruit_ticks_per_soldier,
                                "option": u.option,
                                "applyCost": apply_cost,
                            })
                        })
                        .collect();
                serde_json::json!({
                    "classIndex": ci,
                    "class": format!("{class:?}"),
                    "selected": selected.0,
                    "sizeMult": size,
                    "cooldown": cooldown_until.saturating_sub(st.tick),
                    "live": live,
                    "max": max,
                    "options": options,
                })
            })
            .collect();
        serde_json::to_string(&rows).unwrap()
    }

    pub fn city_count(&self) -> u32 {
        (self.city_info.len() / CITY_INFO_STRIDE) as u32
    }

    pub fn city_info_ptr(&self) -> *const f32 {
        self.city_info.as_ptr()
    }

    pub fn city_info_stride(&self) -> u32 {
        CITY_INFO_STRIDE as u32
    }

    /// Roster of one army as JSON (panel data, rare).
    pub fn army_roster_json(&self, army: u32) -> String {
        let Some(a) = self.inner.state.armies.get(army as usize) else {
            return "null".into();
        };
        serde_json::to_string(
            &a.roster
                .iter()
                .map(|r| serde_json::json!({ "class": format!("{:?}", r.class), "count": r.count, "max": r.max, "morale_cap": r.morale_cap }))
                .collect::<Vec<_>>(),
        )
        .unwrap()
    }

    pub fn army_auto_replenish(&self, army: u32) -> bool {
        self.inner
            .state
            .armies
            .get(army as usize)
            .map(|a| a.auto_replenish)
            .unwrap_or(false)
    }

    pub fn treasury(&self) -> u32 {
        self.inner.state.factions[self.inner.state.player_faction as usize].treasury
    }

    fn owns(&self, army: u32) -> bool {
        self.inner.state.armies.get(army as usize).is_some_and(|a| {
            a.faction == self.inner.state.player_faction && a.garrison_of.is_none()
        })
    }

    fn refresh(&mut self) {
        let st = &self.inner.state;
        let map = &self.inner.map;
        let player = st.player_faction as usize;
        let visible = st.visible.get(player);
        self.army_info.clear();
        for a in &st.armies {
            if !a.alive() {
                continue;
            }
            let mine = a.faction == st.player_faction;
            if !mine && visible.is_some_and(|v| !v.contains(&a.id)) {
                continue; // fogged
            }
            let pos = {
                let p = campaign::sim::loc_pos(map, a.loc);
                if a.marching() {
                    let q = campaign::sim::loc_pos(map, a.path[a.path_idx]);
                    [
                        p[0] + (q[0] - p[0]) * a.progress,
                        p[1] + (q[1] - p[1]) * a.progress,
                    ]
                } else {
                    p
                }
            };
            let (stance, mut pie_kind, mut pie_frac) = match a.stance {
                // Pursuing renders like an ordinary march — it *is* a march, just
                // one re-aimed at a moving target each tick.
                Stance::March | Stance::Hold | Stance::Pursuing { .. } => (0.0, 0.0, 0.0),
                Stance::Camp { build_ticks_left } => (
                    1.0,
                    if build_ticks_left > 0 { 2.0 } else { 0.0 },
                    1.0 - build_ticks_left as f32 / campaign::tunables::CAMP_BUILD_TICKS as f32,
                ),
                Stance::Ambush {
                    settle_ticks_left, ..
                } if settle_ticks_left > 0 => (
                    2.0,
                    4.0,
                    1.0 - settle_ticks_left as f32 / campaign::tunables::AMBUSH_SETTLE_TICKS as f32,
                ),
                Stance::Ambush { .. } => (3.0, 0.0, 0.0),
                Stance::Routed { .. } => (4.0, 0.0, 0.0),
                Stance::Occupying { ticks_left, .. } => (
                    5.0,
                    2.0,
                    1.0 - ticks_left as f32 / campaign::tunables::OCCUPY_TICKS as f32,
                ),
                Stance::AtSea => (6.0, 0.0, 0.0),
            };
            if a.embark_ticks_left > 0 {
                pie_kind = 3.0;
                pie_frac =
                    1.0 - a.embark_ticks_left as f32 / campaign::tunables::EMBARK_TICKS as f32;
            }
            if let Some(eid) = a.encounter {
                if let Some(e) = st.encounters.iter().find(|e| e.id == eid) {
                    if e.phase == EncounterPhase::Preparing {
                        let (mine_prep, total) = if e.attacker == a.id {
                            (
                                e.prep_attacker,
                                if e.ambush {
                                    campaign::tunables::PREP_SURPRISED_TICKS
                                } else {
                                    campaign::tunables::PREP_TICKS
                                },
                            )
                        } else {
                            (e.prep_defender, campaign::tunables::PREP_TICKS)
                        };
                        pie_kind = 1.0;
                        pie_frac = 1.0 - mine_prep as f32 / total.max(1) as f32;
                    }
                }
            }
            let cap = {
                let (mut num, mut den) = (0.0f32, 0u32);
                for r in &a.roster {
                    num += r.morale_cap * r.count as f32;
                    den += r.count;
                }
                num / den.max(1) as f32
            };
            self.army_info.extend_from_slice(&[
                a.id as f32,
                pos[0],
                pos[1],
                a.faction as f32,
                a.soldiers() as f32,
                stance,
                pie_kind,
                pie_frac.clamp(0.0, 1.0),
                if a.marching() { 1.0 } else { 0.0 },
                a.encounter.map_or(-1.0, |e| e as f32),
                cap,
                if mine { 1.0 } else { 0.0 },
                a.roster.iter().filter(|r| r.count > 0).count() as f32,
            ]);
            // Per-class soldier and unit counts (index = UnitClassId), so the
            // map can build each army marker from its real composition.
            let mut by_class = [0u32; ARMY_CLASS_SLOTS];
            let mut units_by_class = [0u32; ARMY_CLASS_SLOTS];
            for r in &a.roster {
                if r.count == 0 {
                    continue;
                }
                by_class[r.class as usize] += r.count;
                units_by_class[r.class as usize] += 1;
            }
            self.army_info.extend(by_class.iter().map(|&c| c as f32));
            self.army_info
                .extend(units_by_class.iter().map(|&c| c as f32));
        }
        self.city_info.clear();
        for (&node, c) in &st.cities {
            self.city_info.extend_from_slice(&[
                node as f32,
                c.owner as f32,
                c.garrison.iter().map(|r| r.count).sum::<u32>() as f32,
                c.recruit_queue.len() as f32,
            ]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map_with_roster(roster: &str) -> String {
        format!(
            r#"{{
              "half_w": 20, "half_h": 20,
              "nodes": [
                {{"id": 1, "name": "A", "pos": [0,0], "kind": "city", "tier": 1, "port": false, "owner": "red"}}
              ],
              "edges": [],
              "ambush_spots": [],
              "factions": [
                {{"id": "red", "name": "Red", "color": [200,0,0], "playable": true}},
                {{"id": "independents", "name": "Ind", "color": [90,90,90], "playable": false}}
              ],
              "start_armies": [
                {{"faction": "red", "at": "A", "roster": {roster}}}
              ]
            }}"#
        )
    }

    #[test]
    fn army_info_has_one_slot_per_contract_class() {
        assert_eq!(
            ARMY_INFO_STRIDE,
            ARMY_INFO_BASE_STRIDE + contract::ALL_CLASSES.len() * 2
        );
    }

    #[test]
    fn campaign_refresh_exports_late_unit_classes() {
        let map = map_with_roster(r#"[["Peasant", 77], ["LightSword", 55], ["HeavySpear", 33]]"#);
        let c = Campaign::new(&map, 7, 0);
        assert_eq!(c.army_count(), 1);
        assert_eq!(c.army_info_stride(), ARMY_INFO_STRIDE as u32);
        assert_eq!(c.army_info_base_stride(), ARMY_INFO_BASE_STRIDE as u32);
        assert_eq!(c.army_class_slots(), contract::ALL_CLASSES.len() as u32);
        assert_eq!(c.army_stack_unit_cap(), 20);
    }
}

/// Hand a Pending encounter to the battle layer. The campaign freezes until
/// `report_battle`. Returns null if the encounter isn't pending.
#[wasm_bindgen]
pub fn start_campaign_battle(c: &mut Campaign, encounter: u32) -> Option<Game> {
    let setup = c.inner.battle_setup(encounter)?;
    let terrain_source = setup.terrain.clone();
    let mut battle = sim::Battle::from_setup_with_stats_and_looks(
        &setup,
        &resolved_unit_stats,
        &resolved_unit_render_look,
    );
    // Whoever isn't the player fights themselves; battle_setup_for puts the
    // player on team 0 when involved.
    battle.set_ai(1, true);
    if !c
        .inner
        .state
        .armies
        .iter()
        .any(|a| a.encounter == Some(encounter) && a.faction == c.inner.state.player_faction)
    {
        battle.set_ai(0, true);
    }
    c.fighting = Some(encounter);
    Some(Game::from_battle_with_terrain_source(
        battle,
        &terrain_source,
    ))
}

/// Battle over (sim verdict, or forced by remaining strength if cut short):
/// write the outcome back and let the world breathe again.
#[wasm_bindgen]
pub fn report_battle(c: &mut Campaign, g: &Game) {
    let Some(eid) = c.fighting.take() else { return };
    let result = g.battle_result();
    c.inner.apply_outcome(eid, &result);
    c.refresh();
}

impl Game {
    pub(crate) fn battle_result(&self) -> contract::BattleResult {
        self.battle()
            .result()
            .unwrap_or_else(|| self.battle().forced_result())
    }
}
