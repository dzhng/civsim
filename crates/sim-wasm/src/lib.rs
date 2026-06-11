//! Thin wasm-bindgen wrapper around the pure `sim` crate.
//!
//! The boundary contract: JS issues rare, small calls (orders, spawns) and
//! reads bulk state zero-copy via pointers into wasm linear memory. Pointers
//! must be re-fetched every frame — Vec reallocation can move them and grow
//! the memory (which detaches any existing JS TypedArray views).

use sim::{ai_commander, build_map, setup_battle, MapId, Pace, Sim, Stance, Tunables, Vec2};
use wasm_bindgen::prelude::*;

/// Floats per unit in the unit_info array:
/// [anchor_x, anchor_y, facing, speed, cohesion, disorder, team, count,
///  fatigue, pace, target_x, target_y, has_target, class, order_delay_frac,
///  alive_count, engaged, stance, charge (0 off / 1 armed / 2 charging), ammo,
///  morale, routing]
pub const UNIT_INFO_STRIDE: usize = 22;

#[wasm_bindgen]
pub struct Game {
    sim: Sim,
    unit_info: Vec<f32>,
    /// Team the built-in commander plays (-1 = none).
    ai_team: i32,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Game {
        Game {
            sim: Sim::new(Tunables::default(), seed as u64),
            unit_info: Vec::new(),
            ai_team: -1,
        }
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
        let id = self.sim.spawn_unit(
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
        self.sim.set_move_order(unit as usize, Vec2::new(x, y));
    }

    /// 0 = RiverAndCrags, anything else = WalledPlain.
    pub fn load_map(&mut self, map: u32) {
        let id = if map == 0 { MapId::RiverAndCrags } else { MapId::WalledPlain };
        self.sim.terrain = build_map(id);
    }

    /// Build terrain AND deploy both full armies.
    pub fn start_battle(&mut self, map: u32) {
        let id = if map == 0 { MapId::RiverAndCrags } else { MapId::WalledPlain };
        setup_battle(&mut self.sim, id);
        self.refresh_unit_info();
    }

    pub fn radius_ptr(&self) -> *const f32 {
        self.sim.radius.as_ptr()
    }

    pub fn terrain_w(&self) -> u32 {
        self.sim.terrain.w as u32
    }

    pub fn terrain_h(&self) -> u32 {
        self.sim.terrain.h as u32
    }

    pub fn terrain_cell(&self) -> f32 {
        self.sim.terrain.cell
    }

    pub fn terrain_origin_x(&self) -> f32 {
        self.sim.terrain.origin.x
    }

    pub fn terrain_origin_y(&self) -> f32 {
        self.sim.terrain.origin.y
    }

    pub fn terrain_speed_ptr(&self) -> *const f32 {
        self.sim.terrain.speed.as_ptr()
    }

    pub fn terrain_rough_ptr(&self) -> *const f32 {
        self.sim.terrain.rough.as_ptr()
    }

    pub fn terrain_tint_ptr(&self) -> *const u8 {
        self.sim.terrain.tint.as_ptr()
    }

    /// 0 = walk, anything else = run.
    pub fn set_pace(&mut self, unit: u32, pace: u32) {
        let pace = if pace == 0 { Pace::Walk } else { Pace::Run };
        self.sim.set_pace(unit as usize, pace);
        self.refresh_unit_info();
    }

    pub fn set_charge_enabled(&mut self, unit: u32, enabled: u32) {
        self.sim.set_charge_enabled(unit as usize, enabled != 0);
        self.refresh_unit_info();
    }

    /// 0 = Othismos (press), anything else = Fence (fight at reach).
    pub fn set_stance(&mut self, unit: u32, stance: u32) {
        let stance = if stance == 0 { Stance::Othismos } else { Stance::Fence };
        self.sim.set_stance(unit as usize, stance);
        self.refresh_unit_info();
    }

    pub fn set_attack_order(&mut self, unit: u32, enemy: u32) {
        self.sim.set_attack_order(unit as usize, enemy as usize);
        self.refresh_unit_info();
    }

    pub fn set_attack_move_order(&mut self, unit: u32, x: f32, y: f32) {
        self.sim.set_attack_move_order(unit as usize, Vec2::new(x, y));
        self.refresh_unit_info();
    }

    pub fn set_withdraw_order(&mut self, unit: u32, x: f32, y: f32) {
        self.sim.set_withdraw_order(unit as usize, Vec2::new(x, y));
        self.refresh_unit_info();
    }

    pub fn alive_ptr(&self) -> *const u8 {
        self.sim.alive.as_ptr()
    }

    /// 1 = actively trading blows (within weapon reach). Drives attack anims.
    pub fn fighting_ptr(&self) -> *const u8 {
        self.sim.fighting.as_ptr()
    }

    pub fn projectile_count(&self) -> u32 {
        self.sim.projectiles.len() as u32
    }

    pub fn projectile_x_ptr(&self) -> *const f32 {
        self.sim.projectiles.x.as_ptr()
    }

    pub fn projectile_y_ptr(&self) -> *const f32 {
        self.sim.projectiles.y.as_ptr()
    }

    pub fn projectile_kind_ptr(&self) -> *const u8 {
        self.sim.projectiles.kind.as_ptr()
    }

    /// -1 while contested, else the winning team.
    pub fn victor(&self) -> i32 {
        self.sim.victor().map_or(-1, |t| t as i32)
    }

    /// Nearest unit to (x, y) within max_dist, or -1.
    pub fn pick_unit(&self, x: f32, y: f32, max_dist: f32) -> i32 {
        self.sim
            .pick_unit(Vec2::new(x, y), max_dist)
            .map_or(-1, |u| u as i32)
    }

    pub fn tick(&mut self) {
        self.sim.tick();
        if self.ai_team >= 0 {
            ai_commander(&mut self.sim, self.ai_team as u32);
        }
        self.refresh_unit_info();
    }

    pub fn set_ai_team(&mut self, team: i32) {
        self.ai_team = team;
    }

    pub fn set_move_order_facing(&mut self, unit: u32, x: f32, y: f32, facing: f32) {
        self.sim
            .set_move_order_facing(unit as usize, Vec2::new(x, y), facing);
        self.refresh_unit_info();
    }

    pub fn set_files(&mut self, unit: u32, files: u32) {
        self.sim.set_files(unit as usize, files as usize);
        self.refresh_unit_info();
    }

    pub fn set_reverse_move_order(&mut self, unit: u32, x: f32, y: f32) {
        self.sim.set_reverse_move_order(unit as usize, Vec2::new(x, y));
        self.refresh_unit_info();
    }

    pub fn set_reform(&mut self, unit: u32) {
        self.sim.set_reform(unit as usize);
        self.refresh_unit_info();
    }

    pub fn set_pursue(&mut self, unit: u32, on: u32) {
        self.sim.set_pursue(unit as usize, on != 0);
    }

    pub fn set_fire_at_will(&mut self, unit: u32, on: u32) {
        self.sim.set_fire_at_will(unit as usize, on != 0);
    }

    pub fn set_evade_auto(&mut self, unit: u32, on: u32) {
        self.sim.set_evade_auto(unit as usize, on != 0);
    }

    pub fn soldier_count(&self) -> u32 {
        self.sim.soldier_count() as u32
    }

    pub fn unit_count(&self) -> u32 {
        self.sim.units.len() as u32
    }

    pub fn positions_ptr(&self) -> *const f32 {
        self.sim.positions.as_ptr()
    }

    pub fn facings_ptr(&self) -> *const f32 {
        self.sim.facings.as_ptr()
    }

    pub fn soldier_unit_ptr(&self) -> *const u32 {
        self.sim.soldier_unit.as_ptr()
    }

    pub fn unit_info_ptr(&self) -> *const f32 {
        self.unit_info.as_ptr()
    }

    pub fn unit_info_stride(&self) -> u32 {
        UNIT_INFO_STRIDE as u32
    }

    fn refresh_unit_info(&mut self) {
        self.unit_info.clear();
        for u in &self.sim.units {
            self.unit_info.extend_from_slice(&[
                u.anchor.x,
                u.anchor.y,
                u.facing,
                u.speed,
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
            ]);
        }
    }
}

impl Default for Game {
    fn default() -> Self {
        Self::new(0)
    }
}
