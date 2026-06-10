//! Thin wasm-bindgen wrapper around the pure `sim` crate.
//!
//! The boundary contract: JS issues rare, small calls (orders, spawns) and
//! reads bulk state zero-copy via pointers into wasm linear memory. Pointers
//! must be re-fetched every frame — Vec reallocation can move them and grow
//! the memory (which detaches any existing JS TypedArray views).

use sim::{build_map, setup_battle, MapId, Pace, Sim, Tunables, Vec2};
use wasm_bindgen::prelude::*;

/// Floats per unit in the unit_info array:
/// [anchor_x, anchor_y, facing, speed, cohesion, disorder, team, count,
///  fatigue, pace, target_x, target_y, has_target, class, order_delay_frac]
pub const UNIT_INFO_STRIDE: usize = 15;

#[wasm_bindgen]
pub struct Game {
    sim: Sim,
    unit_info: Vec<f32>,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Game {
        Game {
            sim: Sim::new(Tunables::default(), seed as u64),
            unit_info: Vec::new(),
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

    /// 0 = RidgeDefense, anything else = MeetingField.
    pub fn load_map(&mut self, map: u32) {
        let id = if map == 0 { MapId::RidgeDefense } else { MapId::MeetingField };
        self.sim.terrain = build_map(id);
    }

    /// Build terrain AND deploy both full armies.
    pub fn start_battle(&mut self, map: u32) {
        let id = if map == 0 { MapId::RidgeDefense } else { MapId::MeetingField };
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

    /// 0 = walk, anything else = run.
    pub fn set_pace(&mut self, unit: u32, pace: u32) {
        let pace = if pace == 0 { Pace::Walk } else { Pace::Run };
        self.sim.set_pace(unit as usize, pace);
        self.refresh_unit_info();
    }

    /// Nearest unit to (x, y) within max_dist, or -1.
    pub fn pick_unit(&self, x: f32, y: f32, max_dist: f32) -> i32 {
        self.sim
            .pick_unit(Vec2::new(x, y), max_dist)
            .map_or(-1, |u| u as i32)
    }

    pub fn tick(&mut self) {
        self.sim.tick();
        self.refresh_unit_info();
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
            ]);
        }
    }
}

impl Default for Game {
    fn default() -> Self {
        Self::new(0)
    }
}
