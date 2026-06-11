//! Thin wasm-bindgen wrapper around the pure `sim` crate.
//!
//! The boundary contract: JS issues rare, small calls (orders, spawns) and
//! reads bulk state zero-copy via pointers into wasm linear memory. Pointers
//! must be re-fetched every frame — Vec reallocation can move them and grow
//! the memory (which detaches any existing JS TypedArray views).

use sim::{build_map, setup_battle, setup_sandbox, Battle, MapId, Pace, Sim, Stance, Tunables, Vec2};
use wasm_bindgen::prelude::*;

mod campaign_bind;
pub use campaign_bind::*;

/// Floats per unit in the unit_info array:
/// [anchor_x, anchor_y, facing, speed, cohesion, disorder, team, count,
///  fatigue, pace, target_x, target_y, has_target, class, order_delay_frac,
///  alive_count, engaged, stance, charge (0 off / 1 armed / 2 charging), ammo,
///  morale, routing, final_facing, has_final_facing, mode (0 move / 1 attack /
///  2 disengage), pursue, evade_auto, waiting, compressed, weapon_pref,
///  switch_frac, mean_pressure]
pub const UNIT_INFO_STRIDE: usize = 32;

#[wasm_bindgen]
pub struct Game {
    battle: Battle,
    unit_info: Vec<f32>,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Game {
        Game {
            battle: Battle::from_sim(Sim::new(Tunables::default(), seed as u64)),
            unit_info: Vec::new(),
        }
    }

    pub(crate) fn battle(&self) -> &Battle {
        &self.battle
    }

    pub(crate) fn from_battle(battle: Battle) -> Game {
        let mut g = Game { battle, unit_info: Vec::new() };
        g.refresh_unit_info();
        g
    }

    /// Headless fast-forward (auto-resolve): run up to n ticks with both
    /// commanders on; returns the victor or -1 if still contested.
    pub fn auto_step(&mut self, n: u32) -> i32 {
        self.battle.set_ai(0, true);
        self.battle.set_ai(1, true);
        for _ in 0..n {
            self.battle.tick();
            if let Some(v) = self.battle.sim.victor() {
                self.refresh_unit_info();
                return v as i32;
            }
        }
        self.refresh_unit_info();
        -1
    }

    pub fn spawn_unit(
        &mut self,
        x: f32,
        y: f32,
        facing: f32,
        count: u32,
        files: u32,
        spacing_x: f32,
        spacing_y: f32,
        team: u32,
        training: f32,
    ) -> u32 {
        let id = self.battle.sim.spawn_unit(
            Vec2::new(x, y),
            facing,
            count as usize,
            files as usize,
            Vec2::new(spacing_x, spacing_y),
            team,
            training,
        );
        self.refresh_unit_info();
        id as u32
    }

    pub fn set_move_order(&mut self, unit: u32, x: f32, y: f32) {
        self.battle.sim.set_move_order(unit as usize, Vec2::new(x, y));
    }

    /// 0 = RiverAndCrags, anything else = WalledPlain.
    pub fn load_map(&mut self, map: u32) {
        let id = if map == 0 { MapId::RiverAndCrags } else { MapId::WalledPlain };
        self.battle.sim.terrain = build_map(id);
    }

    /// Tiny vibe-check fields: 0 = 1v1 heavies, 1 = 5v5 mixed inf + cav.
    pub fn start_sandbox(&mut self, kind: u32) {
        setup_sandbox(&mut self.battle.sim, kind);
        self.refresh_unit_info();
    }

    /// Head-to-head testing bench: any class vs any class, by index into
    /// the contract's ALL_CLASSES order.
    pub fn start_duel(&mut self, a: u32, b: u32) {
        let pick = |i: u32| contract::ALL_CLASSES[(i as usize).min(contract::ALL_CLASSES.len() - 1)];
        sim::setup_duel(&mut self.battle.sim, pick(a), pick(b));
        self.refresh_unit_info();
    }

    /// Build terrain AND deploy both full armies.
    pub fn start_battle(&mut self, map: u32) {
        let id = if map == 0 { MapId::RiverAndCrags } else { MapId::WalledPlain };
        setup_battle(&mut self.battle.sim, id);
        self.refresh_unit_info();
    }

    pub fn radius_ptr(&self) -> *const f32 {
        self.battle.sim.radius.as_ptr()
    }

    pub fn terrain_w(&self) -> u32 {
        self.battle.sim.terrain.w as u32
    }

    pub fn terrain_h(&self) -> u32 {
        self.battle.sim.terrain.h as u32
    }

    pub fn terrain_cell(&self) -> f32 {
        self.battle.sim.terrain.cell
    }

    pub fn terrain_origin_x(&self) -> f32 {
        self.battle.sim.terrain.origin.x
    }

    pub fn terrain_origin_y(&self) -> f32 {
        self.battle.sim.terrain.origin.y
    }

    pub fn terrain_speed_ptr(&self) -> *const f32 {
        self.battle.sim.terrain.speed.as_ptr()
    }

    pub fn terrain_rough_ptr(&self) -> *const f32 {
        self.battle.sim.terrain.rough.as_ptr()
    }

    pub fn terrain_tint_ptr(&self) -> *const u8 {
        self.battle.sim.terrain.tint.as_ptr()
    }

    /// 0 = walk, anything else = run.
    pub fn set_pace(&mut self, unit: u32, pace: u32) {
        let pace = if pace == 0 { Pace::Walk } else { Pace::Run };
        self.battle.sim.set_pace(unit as usize, pace);
        self.refresh_unit_info();
    }

    pub fn set_charge_enabled(&mut self, unit: u32, enabled: u32) {
        self.battle.sim.set_charge_enabled(unit as usize, enabled != 0);
        self.refresh_unit_info();
    }

    /// 0 = Othismos (press), anything else = Fence (fight at reach).
    pub fn set_stance(&mut self, unit: u32, stance: u32) {
        let stance = if stance == 0 { Stance::Othismos } else { Stance::Fence };
        self.battle.sim.set_stance(unit as usize, stance);
        self.refresh_unit_info();
    }

    pub fn set_attack_order(&mut self, unit: u32, enemy: u32) {
        self.battle.sim.set_attack_order(unit as usize, enemy as usize);
        self.refresh_unit_info();
    }

    pub fn set_attack_move_order(&mut self, unit: u32, x: f32, y: f32) {
        self.battle.sim.set_attack_move_order(unit as usize, Vec2::new(x, y));
        self.refresh_unit_info();
    }

    pub fn set_disengage_order(&mut self, unit: u32, x: f32, y: f32) {
        self.battle.sim.set_disengage_order(unit as usize, Vec2::new(x, y));
        self.refresh_unit_info();
    }

    pub fn alive_ptr(&self) -> *const u8 {
        self.battle.sim.alive.as_ptr()
    }

    /// 1 = actively trading blows (within weapon reach). Drives attack anims.
    pub fn fighting_ptr(&self) -> *const u8 {
        self.battle.sim.fighting.as_ptr()
    }

    pub fn projectile_count(&self) -> u32 {
        self.battle.sim.projectiles.len() as u32
    }

    pub fn projectile_x_ptr(&self) -> *const f32 {
        self.battle.sim.projectiles.x.as_ptr()
    }

    pub fn projectile_y_ptr(&self) -> *const f32 {
        self.battle.sim.projectiles.y.as_ptr()
    }

    pub fn projectile_kind_ptr(&self) -> *const u8 {
        self.battle.sim.projectiles.kind.as_ptr()
    }

    /// -1 while contested, else the winning team.
    pub fn victor(&self) -> i32 {
        self.battle.sim.victor().map_or(-1, |t| t as i32)
    }

    /// Nearest unit to (x, y) within max_dist, or -1.
    pub fn pick_unit(&self, x: f32, y: f32, max_dist: f32) -> i32 {
        self.battle.sim
            .pick_unit(Vec2::new(x, y), max_dist)
            .map_or(-1, |u| u as i32)
    }

    pub fn tick(&mut self) {
        self.battle.tick();
        self.refresh_unit_info();
    }

    pub fn set_ai_team(&mut self, team: i32) {
        if (0..2).contains(&team) {
            self.battle.set_ai(team as u32, true);
        }
    }

    pub fn set_move_order_facing(&mut self, unit: u32, x: f32, y: f32, facing: f32) {
        self.battle.sim
            .set_move_order_facing(unit as usize, Vec2::new(x, y), facing);
        self.refresh_unit_info();
    }

    pub fn set_files(&mut self, unit: u32, files: u32) {
        self.battle.sim.set_files(unit as usize, files as usize);
        self.refresh_unit_info();
    }

    pub fn set_reform(&mut self, unit: u32) {
        self.battle.sim.set_reform(unit as usize);
        self.refresh_unit_info();
    }

    /// Shift-queued orders: mode 0 = move (facing optional via has_facing),
    /// 1 = attack (x = enemy unit id), 2 = disengage.
    pub fn enqueue(&mut self, unit: u32, mode: u32, x: f32, y: f32, facing: f32, has_facing: u32) {
        use sim::OrderMode;
        let f = (has_facing != 0).then_some(facing);
        match mode {
            1 => {
                let e = x as usize;
                if e < self.battle.sim.units.len() {
                    let anchor = self.battle.sim.units[e].anchor;
                    self.battle.sim.enqueue_order(unit as usize, OrderMode::Attack(e as u32), anchor, None);
                }
            }
            2 => self.battle.sim.enqueue_order(unit as usize, OrderMode::Disengage, Vec2::new(x, y), None),
            _ => self.battle.sim.enqueue_order(unit as usize, OrderMode::Move, Vec2::new(x, y), f),
        }
        self.refresh_unit_info();
    }

    pub fn set_weapon_pref(&mut self, unit: u32, secondary: u32) {
        self.battle.sim.set_weapon_pref(unit as usize, secondary != 0);
        self.refresh_unit_info();
    }

    /// Per-soldier weapon-swap countdown (>0 = mid-fumble; drives the anim).
    pub fn switch_cd_ptr(&self) -> *const f32 {
        self.battle.sim.switch_cd.as_ptr()
    }

    pub fn set_pursue(&mut self, unit: u32, on: u32) {
        self.battle.sim.set_pursue(unit as usize, on != 0);
    }

    pub fn set_fire_at_will(&mut self, unit: u32, on: u32) {
        self.battle.sim.set_fire_at_will(unit as usize, on != 0);
    }

    pub fn set_evade_auto(&mut self, unit: u32, on: u32) {
        self.battle.sim.set_evade_auto(unit as usize, on != 0);
    }

    pub fn soldier_count(&self) -> u32 {
        self.battle.sim.soldier_count() as u32
    }

    pub fn unit_count(&self) -> u32 {
        self.battle.sim.units.len() as u32
    }

    pub fn positions_ptr(&self) -> *const f32 {
        self.battle.sim.positions.as_ptr()
    }

    pub fn facings_ptr(&self) -> *const f32 {
        self.battle.sim.facings.as_ptr()
    }

    pub fn soldier_unit_ptr(&self) -> *const u32 {
        self.battle.sim.soldier_unit.as_ptr()
    }

    pub fn unit_info_ptr(&self) -> *const f32 {
        self.unit_info.as_ptr()
    }

    pub fn unit_info_stride(&self) -> u32 {
        UNIT_INFO_STRIDE as u32
    }

    fn refresh_unit_info(&mut self) {
        self.unit_info.clear();
        for u in &self.battle.sim.units {
            // Mean crowd pressure over living soldiers (the CRUSH readout).
            let mut press = 0.0f32;
            let mut np = 0u32;
            for i in u.start..u.start + u.count {
                if self.battle.sim.alive[i] == 1 {
                    press += self.battle.sim.pressure[i];
                    np += 1;
                }
            }
            let mean_pressure = press / np.max(1) as f32;
            self.unit_info.extend_from_slice(&[
                u.anchor.x,
                u.anchor.y,
                u.facing,
                u.frame_speed,
                u.cohesion,
                u.disorder,
                u.team as f32,
                u.count as f32,
                u.fatigue,
                if u.pace == Pace::Walk { 0.0 } else { 1.0 },
                u.move_target.map_or(0.0, |t| t.x),
                u.move_target.map_or(0.0, |t| t.y),
                if u.move_target.is_some() { 1.0 } else { 0.0 },
                u.class as u32 as f32,
                if u.pending_total > 0.0 && u.pending_target.is_some() {
                    (u.pending_timer / u.pending_total).clamp(0.0, 1.0)
                } else {
                    0.0
                },
                u.alive_count as f32,
                u.engaged as f32,
                if u.stance == Stance::Othismos { 0.0 } else { 1.0 },
                if u.charging {
                    2.0
                } else if u.charge_enabled {
                    1.0
                } else {
                    0.0
                },
                u.ammo as f32,
                u.morale,
                if u.routing { 1.0 } else { 0.0 },
                u.final_facing.unwrap_or(0.0),
                if u.final_facing.is_some() { 1.0 } else { 0.0 },
                match u.mode {
                    sim::OrderMode::Move => 0.0,
                    sim::OrderMode::Attack(_) => 1.0,
                    sim::OrderMode::Disengage => 2.0,
                },
                if u.pursue { 1.0 } else { 0.0 },
                if u.evade_auto { 1.0 } else { 0.0 },
                if u.waiting { 1.0 } else { 0.0 },
                if u.files_eff < u.files { 1.0 } else { 0.0 },
                u.weapon_pref as f32,
                if u.switch_timer > 0.0 { u.switch_timer.min(1.0) } else { 0.0 },
                mean_pressure,
            ]);
        }
    }
}

impl Default for Game {
    fn default() -> Self {
        Self::new(0)
    }
}
