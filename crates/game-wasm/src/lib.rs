//! Thin wasm-bindgen wrapper around the pure `sim` crate.
//!
//! The boundary contract: JS issues rare, small calls (orders, spawns) and
//! reads bulk state zero-copy via pointers into wasm linear memory. Pointers
//! must be re-fetched every frame — Vec reallocation can move them and grow
//! the memory (which detaches any existing JS TypedArray views).

use contract::TerrainSource;
use sim::{
    build_map, deploy_custom_army, generate_map, generate_vista_grid, setup_battle,
    setup_battle_generated, setup_sandbox, Battle, MapId, MapRecipe, Pace, Sim, Tunables, Vec2,
    VistaGrid,
};
use wasm_bindgen::prelude::*;

mod campaign_bind;
pub use campaign_bind::*;

/// Floats per unit in the unit_info array:
/// [anchor_x, anchor_y, facing, speed, cohesion, disorder, team, count,
///  stamina, pace, target_x, target_y, has_target, class, order_delay_frac,
///  alive_count, engaged, at_ease, charge (0 off / 1 armed / 2 charging), ammo,
///  morale, routing, final_facing, has_final_facing, mode (0 move / 1 attack /
///  2 disengage), pursue, evade_auto, waiting, compressed, mean_pressure,
///  centroid_x, centroid_y, render_look, current_files, current_ranks]
pub const UNIT_INFO_STRIDE: usize = 35;

/// Quick-battle map selector: 0 RiverAndCrags, 1 WalledPlain, 2 CoastalScrub.
/// Out-of-range falls back to the first map.
fn map_id_from_index(map: u32) -> MapId {
    match map {
        1 => MapId::WalledPlain,
        2 => MapId::CoastalScrub,
        _ => MapId::RiverAndCrags,
    }
}

fn deployment_certificate_json(
    t: &sim::Terrain,
    side: sim::genmap::certify::Side,
) -> serde_json::Value {
    let c = sim::genmap::certify::deployment_band_certificate(t, side);
    serde_json::json!({
        "totalCells": c.total_cells,
        "passableFraction": c.passable_fraction,
        "blockedCells": c.blocked_cells,
        "p95Slope": c.p95_slope,
        "maxSlope": c.max_slope,
        "meetsContract": c.meets_contract(),
    })
}

#[wasm_bindgen]
pub fn generated_map_manifest(seed: u64) -> String {
    let recipe = MapRecipe {
        seed,
        ..MapRecipe::default()
    };
    let terrain = generate_map(&recipe);
    generated_manifest_json(recipe, &terrain).to_string()
}

#[wasm_bindgen]
pub struct Game {
    battle: Battle,
    unit_info: Vec<f32>,
    posture_info: Vec<u8>,
    generated_recipe: Option<MapRecipe>,
    generated_vista: Option<VistaGrid>,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Game {
        Game {
            battle: Battle::from_sim(Sim::new(Tunables::default(), seed as u64)),
            unit_info: Vec::new(),
            posture_info: Vec::new(),
            generated_recipe: None,
            generated_vista: None,
        }
    }

    pub(crate) fn battle(&self) -> &Battle {
        &self.battle
    }

    pub(crate) fn from_battle(battle: Battle) -> Game {
        let mut g = Game {
            battle,
            unit_info: Vec::new(),
            posture_info: Vec::new(),
            generated_recipe: None,
            generated_vista: None,
        };
        g.refresh_unit_info();
        g
    }

    pub(crate) fn from_battle_with_terrain_source(battle: Battle, source: &TerrainSource) -> Game {
        let mut g = Game::from_battle(battle);
        if let TerrainSource::Recipe(recipe) = source {
            g.generated_recipe = Some(*recipe);
        }
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

    pub fn spawn_class(
        &mut self,
        x: f32,
        y: f32,
        facing: f32,
        count: u32,
        files: u32,
        class_id: u32,
        team: u32,
    ) -> u32 {
        let class = contract::ALL_CLASSES[(class_id as usize).min(contract::ALL_CLASSES.len() - 1)];
        let id = self.battle.sim.spawn(sim::SpawnSpec {
            anchor: Vec2::new(x, y),
            facing,
            count: count as usize,
            files: Some(files as usize),
            class,
            stats: self.battle.sim.balance.get(class),
            look: class as u32,
            team,
        });
        self.refresh_unit_info();
        id as u32
    }

    pub fn deploy_custom_army(&mut self, team: u32, class_ids: Vec<u32>) {
        let classes: Vec<contract::UnitClassId> = class_ids
            .into_iter()
            .filter_map(|id| contract::ALL_CLASSES.get(id as usize).copied())
            .collect();
        deploy_custom_army(&mut self.battle.sim, team, &classes);
        self.refresh_unit_info();
    }

    pub fn set_move_order(&mut self, unit: u32, x: f32, y: f32) {
        self.battle
            .sim
            .set_move_order(unit as usize, Vec2::new(x, y));
    }

    /// 0 = RiverAndCrags, 1 = WalledPlain, 2 = CoastalScrub.
    pub fn load_map(&mut self, map: u32) {
        self.battle.sim.terrain = build_map(map_id_from_index(map));
        self.generated_recipe = None;
        self.generated_vista = None;
    }

    pub fn load_generated_map(&mut self, seed: u64) {
        let recipe = MapRecipe {
            seed,
            ..MapRecipe::default()
        };
        self.battle.sim.terrain = generate_map(&recipe);
        self.generated_recipe = Some(recipe);
        self.generated_vista = None;
    }

    /// Tiny vibe-check fields: 0 = 1v1 heavies, 1 = 5v5 mixed inf + cav.
    pub fn start_sandbox(&mut self, kind: u32) {
        setup_sandbox(&mut self.battle.sim, kind);
        self.refresh_unit_info();
    }

    /// The full class table as JSON, for the stat card: attributes, melee
    /// weapons, missile spec. Static data — call once. Weapon display
    /// names live here (the sim's Weapon struct is anonymous physics).
    pub fn class_specs(&self) -> String {
        let specs: Vec<serde_json::Value> = contract::CLASS_SPECS
            .iter()
            .enumerate()
            .map(|(ci, spec)| {
                let id = spec.class;
                let c = sim::class_stats(id);
                let weapons: Vec<serde_json::Value> = c
                    .weapons
                    .iter()
                    .enumerate()
                    .map(|(wi, w)| {
                        serde_json::json!({
                            "name": spec.weapon_names.get(wi).copied().unwrap_or("weapon"),
                            "reach": w.reach,
                            "minRange": w.min_range,
                            "arc": w.zones.swing_arc(),
                            "interval": w.attack_interval,
                            "damage": w.damage,
                            "braced": w.hedge(),
                            "impales": w.impales,
                            "charge": w.is_charge(),
                        })
                    })
                    .collect();
                let missile = sim::missile_spec(id).map(|m| {
                    serde_json::json!({
                        "name": spec.missile_name,
                        "range": m.range,
                        "interval": m.interval,
                        "ammo": m.ammo,
                        "damage": m.damage,
                        "mobileFire": m.mobile_fire,
                    })
                });
                serde_json::json!({
                    "id": ci,
                    "key": contract::unit_class_key(id),
                    "name": contract::unit_class_name(id),
                    "cost": contract::unit_cost(id),
                    "mass": c.mass,
                    "radius": c.soldier_radius,
                    "brace": c.brace_mult,
                    "block": c.block,
                    "evade": c.evade,
                    "training": c.training,
                    "paceMult": c.pace_mult,
                    "drainMult": c.fight_drain_mult,
                    "health": c.health,
                    "mountHealth": c.mount_health,
                    "mounted": c.mounted,
                    "charges": c.charge,
                    "weapons": weapons,
                    "missile": missile,
                })
            })
            .collect();
        serde_json::to_string(&specs).unwrap()
    }

    /// Head-to-head testing bench: any class vs any class, by index into
    /// the contract's ALL_CLASSES order.
    pub fn start_duel(&mut self, a: u32, b: u32) {
        let pick =
            |i: u32| contract::ALL_CLASSES[(i as usize).min(contract::ALL_CLASSES.len() - 1)];
        sim::setup_duel(&mut self.battle.sim, pick(a), pick(b));
        self.refresh_unit_info();
    }

    /// Build terrain AND deploy both full armies.
    pub fn start_battle(&mut self, map: u32) {
        setup_battle(&mut self.battle.sim, map_id_from_index(map));
        self.generated_recipe = None;
        self.generated_vista = None;
        self.refresh_unit_info();
    }

    pub fn start_battle_generated(&mut self, seed: u64) {
        let recipe = MapRecipe {
            seed,
            ..MapRecipe::default()
        };
        setup_battle_generated(&mut self.battle.sim, &recipe);
        self.generated_recipe = Some(recipe);
        self.generated_vista = None;
        self.refresh_unit_info();
    }

    /// Certificate verdicts computed by the ONE owner (sim::genmap::certify) on
    /// the live terrain, so the frontend never re-implements them.
    pub fn generated_map_certificates(&self) -> String {
        use sim::genmap::certify;
        let t = &self.battle.sim.terrain;
        let drainage = self
            .generated_recipe
            .map(|recipe| serde_json::to_value(sim::genmap::drainage_report(&recipe)).unwrap())
            .unwrap_or(serde_json::Value::Null);
        serde_json::json!({
            "westSealed": certify::side_sealed_fraction(t, certify::Side::West),
            "eastSealed": certify::side_sealed_fraction(t, certify::Side::East),
            "southOpen": certify::open_edge_fraction(t, certify::Side::South),
            "northOpen": certify::open_edge_fraction(t, certify::Side::North),
            "southDeployPassable": certify::deployment_band_passable_fraction(t, certify::Side::South),
            "northDeployPassable": certify::deployment_band_passable_fraction(t, certify::Side::North),
            "southDeployment": deployment_certificate_json(t, certify::Side::South),
            "northDeployment": deployment_certificate_json(t, certify::Side::North),
            "corridor": certify::has_deployment_corridor(t),
            "westFlankUnreachable": certify::flank_unreachable_fraction(t, certify::Side::West),
            "eastFlankUnreachable": certify::flank_unreachable_fraction(t, certify::Side::East),
            "orphanBlockedCells": certify::speed_zero_cells_without_blocking_tint(t),
            "largestIsolatedPassablePocket": certify::largest_isolated_passable_pocket_cells(t),
            "drainage": drainage,
        })
        .to_string()
    }

    pub fn generated_map_descriptor(&self) -> String {
        let seed = self.generated_recipe.map_or(0, |r| r.seed);
        let slope_bands = self
            .generated_recipe
            .map_or_else(sim::genmap::SlopeBands::default, |r| r.slope_bands);
        let edge_seals = self.generated_recipe.map(|recipe| {
            let composition = sim::genmap::edges::composition(&recipe);
            serde_json::json!({
                "weights": recipe.edge_seals.weights,
                "composition": composition,
                "expectedRoles": {
                    "west": composition.west.expected_edge_role(),
                    "east": composition.east.expected_edge_role(),
                },
            })
        });
        let lake_surfaces = self
            .generated_recipe
            .map(|recipe| sim::genmap::drainage_report(&recipe).lakes)
            .unwrap_or_default();
        let feature_summary = self
            .generated_recipe
            .map(|recipe| generated_feature_summary_json(recipe, &self.battle.sim.terrain))
            .unwrap_or(serde_json::Value::Null);
        serde_json::json!({
            "seed": seed,
            "seedHex": format!("{:#018x}", seed),
            "groundCover": "green-grass",
            "reliefScale": 1.0,
            "slopeBands": slope_bands,
            "edgeSeals": edge_seals,
            "terrainHash": format!("{:#018x}", sim::genmap::terrain_hash(&self.battle.sim.terrain)),
            "lakeSurfaces": lake_surfaces,
            "featureSummary": feature_summary,
            "vista": self.generated_recipe.map(vista_descriptor),
        })
        .to_string()
    }

    pub fn generated_map_manifest(&self) -> String {
        generated_map_manifest(self.generated_recipe.unwrap_or_default().seed)
    }

    pub fn generated_vista_band_count(&self) -> u32 {
        self.generated_recipe.map_or(0, |_| 2)
    }

    pub fn generated_vista_band_width(&mut self, band: u32) -> u32 {
        self.ensure_generated_vista();
        self.vista_band(band).map_or(0, |b| b.w as u32)
    }

    pub fn generated_vista_band_height(&mut self, band: u32) -> u32 {
        self.ensure_generated_vista();
        self.vista_band(band).map_or(0, |b| b.h as u32)
    }

    pub fn generated_vista_band_cell(&mut self, band: u32) -> f32 {
        self.ensure_generated_vista();
        self.vista_band(band).map_or(0.0, |b| b.cell)
    }

    pub fn generated_vista_band_origin_x(&mut self, band: u32) -> f32 {
        self.ensure_generated_vista();
        self.vista_band(band).map_or(0.0, |b| b.origin.x)
    }

    pub fn generated_vista_band_origin_y(&mut self, band: u32) -> f32 {
        self.ensure_generated_vista();
        self.vista_band(band).map_or(0.0, |b| b.origin.y)
    }

    pub fn generated_vista_band_height_ptr(&mut self, band: u32) -> *const f32 {
        self.ensure_generated_vista();
        self.vista_band(band)
            .map_or(std::ptr::null(), |b| b.heights.as_ptr())
    }

    pub fn generated_vista_band_water_ptr(&mut self, band: u32) -> *const f32 {
        self.ensure_generated_vista();
        self.vista_band(band)
            .map_or(std::ptr::null(), |b| b.water.as_ptr())
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

    /// Per-cell ground elevation in meters (presentation/seating only). Same
    /// width*height layout and origin as the other terrain channels.
    pub fn terrain_height_ptr(&self) -> *const f32 {
        self.battle.sim.terrain.height.as_ptr()
    }

    /// 0 = walk, anything else = run.
    pub fn set_pace(&mut self, unit: u32, pace: u32) {
        let pace = if pace == 0 { Pace::Walk } else { Pace::Run };
        self.battle.sim.set_pace(unit as usize, pace);
        self.refresh_unit_info();
    }

    pub fn set_attack_order(&mut self, unit: u32, enemy: u32) {
        self.battle
            .sim
            .set_attack_order(unit as usize, enemy as usize);
        self.refresh_unit_info();
    }

    pub fn set_attack_move_order(&mut self, unit: u32, x: f32, y: f32) {
        self.battle
            .sim
            .set_attack_move_order(unit as usize, Vec2::new(x, y));
        self.refresh_unit_info();
    }

    pub fn set_disengage_order(&mut self, unit: u32, x: f32, y: f32) {
        self.battle
            .sim
            .set_disengage_order(unit as usize, Vec2::new(x, y));
        self.refresh_unit_info();
    }

    pub fn alive_ptr(&self) -> *const u8 {
        self.battle.sim.alive.as_ptr()
    }

    /// Presentation observations, one byte per soldier: bit 0 incapacitated,
    /// bit 1 guarded soldier-facing branch, bit 2 guarded unit-facing branch.
    /// Routing remains in unit_info. These bits never drive the simulation.
    pub fn posture_ptr(&self) -> *const u8 {
        self.posture_info.as_ptr()
    }

    /// Three cumulative f64 metres per soldier: qualified world X, world Y,
    /// and tick-path length. Ordinary/routing movement qualifies; disabled
    /// transport does not. Reacquire after mutations that may grow the pool.
    pub fn motor_travel_ptr(&self) -> *const f64 {
        self.battle.sim.motor_travel.as_ptr().cast()
    }

    /// Current infantry/rider health, one value per soldier; not a hit event.
    pub fn health_ptr(&self) -> *const f32 {
        self.battle.sim.health.as_ptr()
    }

    /// Current mount health (zero for unmounted soldiers). Alive is authoritative
    /// for death: a lethal mount injury need not reduce the rider's health.
    pub fn mount_health_ptr(&self) -> *const f32 {
        self.battle.sim.mount_health.as_ptr()
    }

    /// 1 = actively trading blows (within weapon reach). Drives attack anims.
    pub fn fighting_ptr(&self) -> *const u8 {
        self.battle.sim.fighting.as_ptr()
    }

    /// Seconds remaining after an emitted projectile, not a windup command.
    pub fn loosing_ptr(&self) -> *const f32 {
        self.battle.sim.loosing_ttl.as_ptr()
    }

    /// Duration backing the countdown, so readers can recover observed release age.
    pub fn loosing_duration(&self) -> f32 {
        sim::missiles::LOOSING_TTL
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

    pub fn projectile_z_ptr(&self) -> *const f32 {
        self.battle.sim.projectiles.z.as_ptr()
    }

    pub fn projectile_vx_ptr(&self) -> *const f32 {
        self.battle.sim.projectiles.vx.as_ptr()
    }

    pub fn projectile_vy_ptr(&self) -> *const f32 {
        self.battle.sim.projectiles.vy.as_ptr()
    }

    pub fn projectile_vz_ptr(&self) -> *const f32 {
        self.battle.sim.projectiles.vz.as_ptr()
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
        self.battle
            .sim
            .pick_unit(Vec2::new(x, y), max_dist)
            .map_or(-1, |u| u as i32)
    }

    /// Fingerprint the battle state for cross-thread determinism checks.
    pub fn state_hash(&self) -> u64 {
        self.battle.sim.state_hash()
    }

    pub fn tick(&mut self) {
        self.battle.tick();
        self.refresh_unit_info();
    }

    /// Run several sim ticks but refresh the exported unit-info buffer once.
    /// The renderer only reads unit info after a frame/batch; rebuilding it
    /// after every internal tick made fast-forward and catch-up pay UI-copy
    /// cost hundreds of unnecessary times.
    pub fn advance_ticks(&mut self, n: u32) {
        for _ in 0..n {
            self.battle.tick();
        }
        self.refresh_unit_info();
    }

    pub fn set_ai_team(&mut self, team: i32) {
        if (0..2).contains(&team) {
            self.battle.set_ai(team as u32, true);
        }
    }

    pub fn set_move_order_facing(&mut self, unit: u32, x: f32, y: f32, facing: f32) {
        self.battle
            .sim
            .set_move_order_facing(unit as usize, Vec2::new(x, y), facing);
        self.refresh_unit_info();
    }

    /// Packed formation placements: unit, x, y, facing, alive, files, spacing.
    pub fn formation_preview(&self, units: &[u32], x0: f32, y0: f32, x1: f32, y1: f32) -> Vec<f32> {
        let ids: Vec<_> = units.iter().map(|&u| u as usize).collect();
        self.battle
            .sim
            .formation_line(&ids, Vec2::new(x0, y0), Vec2::new(x1, y1))
            .iter()
            .flat_map(|p| {
                let u = &self.battle.sim.units[p.unit];
                [
                    p.unit as f32,
                    p.target.x,
                    p.target.y,
                    p.facing,
                    u.alive_count as f32,
                    p.files as f32,
                    u.spacing.x,
                ]
            })
            .collect()
    }

    pub fn order_formation_line(
        &mut self,
        units: &[u32],
        x0: f32,
        y0: f32,
        x1: f32,
        y1: f32,
        queued: bool,
    ) {
        let ids: Vec<_> = units.iter().map(|&u| u as usize).collect();
        self.battle
            .sim
            .order_formation_line(&ids, Vec2::new(x0, y0), Vec2::new(x1, y1), queued);
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
                    self.battle.sim.enqueue_order(
                        unit as usize,
                        OrderMode::Attack(e as u32),
                        anchor,
                        None,
                    );
                }
            }
            2 => self.battle.sim.enqueue_order(
                unit as usize,
                OrderMode::Disengage,
                Vec2::new(x, y),
                None,
            ),
            _ => self
                .battle
                .sim
                .enqueue_order(unit as usize, OrderMode::Move, Vec2::new(x, y), f),
        }
        self.refresh_unit_info();
    }

    /// The unit's SHIFT-queued follow-up orders, flattened for the Space
    /// overlay: `[x, y, mode]` per queued waypoint, in execution order, where
    /// mode is 0 = move, 1 = attack, 2 = disengage. The ACTIVE order is already
    /// in `unit_info` (target_x/target_y) — this is only the chain BEHIND it, so
    /// the overlay draws `active -> q0 -> q1 -> ...`. Returns an empty array for
    /// an unknown unit or an empty queue. Copying (called only while Space is
    /// held, on a handful of selected units) — no pointer to re-fetch.
    pub fn queued_orders(&self, unit: u32) -> Vec<f32> {
        use sim::OrderMode;
        let Some(u) = self.battle.sim.units.get(unit as usize) else {
            return Vec::new();
        };
        let mut out = Vec::with_capacity(u.order_queue.len() * 3);
        for order in &u.order_queue {
            let mode = &order.mode;
            let target = &order.target;
            let m = match mode {
                OrderMode::Move => 0.0,
                OrderMode::Attack(_) => 1.0,
                OrderMode::Disengage => 2.0,
            };
            out.push(target.x);
            out.push(target.y);
            out.push(m);
        }
        out
    }

    /// Per-soldier weapon-swap countdown (>0 = mid-fumble; drives the anim).
    pub fn switch_cd_ptr(&self) -> *const f32 {
        self.battle.sim.switch_cd.as_ptr()
    }

    /// Per-soldier index of the weapon in hand (into the class's weapon list) —
    /// so the attack-arc viz draws the weapon actually swung (pike vs side-sword),
    /// not always the primary.
    pub fn cur_weapon_ptr(&self) -> *const u8 {
        self.battle.sim.cur_weapon.as_ptr()
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

    // Field order is the packed unit_info contract; the TS reader names these
    // offsets in packages/game-renderer/src/battle/unitInfoLayout.ts
    // (UNIT_INFO) — extend both together.
    fn refresh_unit_info(&mut self) {
        self.unit_info.clear();
        self.posture_info.resize(self.battle.sim.soldier_count(), 0);
        for u in &self.battle.sim.units {
            // Mean crowd pressure over living soldiers (the CRUSH readout).
            let mut press = 0.0f32;
            let mut np = 0u32;
            for i in u.start..u.start + u.count {
                self.posture_info[i] = if self.battle.sim.alive[i] == 1 {
                    (self.battle.sim.incapacitated(i) as u8)
                        | (self.battle.sim.guarded_facings[i] << 1)
                        | ((u.guarded_facing as u8) << 2)
                } else {
                    0
                };
                if self.battle.sim.alive[i] == 1 {
                    press += self.battle.sim.pressure[i];
                    np += 1;
                }
            }
            let mean_pressure = press / np.max(1) as f32;
            // HUD destination acknowledges the newest accepted command even
            // while low cohesion delays replacing the unit's active target.
            let destination = u.pending_target.or(u.move_target);
            self.unit_info.extend_from_slice(&[
                u.anchor.x,
                u.anchor.y,
                u.facing,
                u.frame_speed,
                u.cohesion,
                u.disorder,
                u.team as f32,
                u.count as f32,
                u.stamina,
                // Effective: an attack closes at the double, and the HUD
                // should say so even if the ordered pace is a walk.
                if u.effective_pace() == Pace::Walk {
                    0.0
                } else {
                    1.0
                },
                destination.map_or(0.0, |t| t.x),
                destination.map_or(0.0, |t| t.y),
                if destination.is_some() { 1.0 } else { 0.0 },
                u.class as u32 as f32,
                if u.pending_total > 0.0 && u.pending_target.is_some() {
                    (u.pending_timer / u.pending_total).clamp(0.0, 1.0)
                } else {
                    0.0
                },
                u.alive_count as f32,
                u.engaged as f32,
                if u.at_ease { 1.0 } else { 0.0 },
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
                mean_pressure,
                // Living-soldier centre of mass — where a unit's banner plants,
                // unlike the anchor (the front-rank reference) at [0],[1].
                u.centroid.x,
                u.centroid.y,
                u.render_look as f32,
                u.files_eff.max(1) as f32,
                u.alive_count.max(1).div_ceil(u.files_eff.max(1)) as f32,
            ]);
        }
    }

    fn ensure_generated_vista(&mut self) {
        if self.generated_vista.is_none() {
            if let Some(recipe) = self.generated_recipe {
                self.generated_vista = Some(generate_vista_grid(&recipe));
            }
        }
    }

    fn vista_band(&self, band: u32) -> Option<&sim::VistaBand> {
        self.generated_vista
            .as_ref()
            .and_then(|v| v.bands.get(band as usize))
    }
}

fn vista_descriptor(recipe: MapRecipe) -> serde_json::Value {
    let bands = sim::genmap::vista_band_specs(&recipe);
    serde_json::json!({
        "shape": "two full vertex-sample height bands; renderer cuts the inner rect per band",
        "bands": bands.iter().map(|b| {
            serde_json::json!({
                "name": b.name,
                "width": b.w,
                "height": b.h,
                "cell": b.cell,
                "originX": b.origin.x,
                "originY": b.origin.y,
                "innerHalfW": b.inner_half_w,
                "innerHalfH": b.inner_half_h,
                "outerHalfW": b.outer_half_w,
                "outerHalfH": b.outer_half_h,
            })
        }).collect::<Vec<_>>(),
    })
}

fn generated_manifest_json(recipe: MapRecipe, terrain: &sim::Terrain) -> serde_json::Value {
    let composition = sim::genmap::edges::composition(&recipe);
    serde_json::json!({
        "seed": recipe.seed,
        "seedHex": format!("{:#018x}", recipe.seed),
        // The ONE class owner is sim::genmap::recipe_class - consumers (the
        // seed-browser sheet, catalog labels) must read it here, never
        // re-derive the roll (a duplicated mix64 diverged once already).
        "recipeClass": sim::genmap::recipe_class(&recipe).as_str(),
        "groundCover": "green-grass",
        "edges": {
            "north": "open-fog",
            "south": "open-fog",
            "west": composition.west.expected_edge_role(),
            "east": composition.east.expected_edge_role(),
        },
        "edgeSeals": {
            "composition": composition,
            "expectedRoles": {
                "west": composition.west.expected_edge_role(),
                "east": composition.east.expected_edge_role(),
            },
        },
        "featureSummary": generated_feature_summary_json(recipe, terrain),
        "terrainHash": format!("{:#018x}", sim::genmap::terrain_hash(terrain)),
    })
}

fn generated_feature_summary_json(recipe: MapRecipe, terrain: &sim::Terrain) -> serde_json::Value {
    let drainage = sim::genmap::drainage_report(&recipe);
    let field = sim::genmap::field_texture::summary(terrain);
    serde_json::json!({
        "lakeCells": drainage.lake_cells,
        "playableLakeCells": drainage.playable_lake_cells,
        "passableForestCells": field.passable_forest_cells,
        "screeCells": field.scree_cells,
        "mudCells": field.mud_cells,
        "roughFieldCells": field.rough_field_cells,
        "streams": drainage.stream_count,
        "streamCells": drainage.stream_cells,
    })
}

impl Default for Game {
    fn default() -> Self {
        Self::new(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_preview_shows_latest_destination_while_command_is_transmitting() {
        let mut game = Game::new(7);
        game.spawn_unit(0.0, 0.0, 0.0, 1, 1, 1.0, 1.0, 0, 0.5);
        let old = Vec2::new(20.0, 0.0);
        let requested = Vec2::new(60.0, 10.0);
        game.battle.sim.set_move_order(0, old);
        game.battle.sim.units[0].cohesion = 0.1;
        game.battle.sim.set_move_order(0, requested);
        assert_eq!(game.battle.sim.units[0].move_target, Some(old));
        assert_eq!(game.battle.sim.units[0].pending_target, Some(requested));
        game.refresh_unit_info();
        assert_eq!(
            &game.unit_info[10..13],
            &[60.0, 10.0, 1.0],
            "destination preview must acknowledge the new click before the old order stops"
        );
    }

    #[test]
    fn loosing_duration_reads_the_emission_constant_without_mutating_countdowns() {
        let mut game = Game::new(7);
        game.spawn_unit(0.0, 0.0, 0.0, 1, 1, 1.0, 1.0, 0, 0.5);
        game.battle.sim.loosing_ttl[0] = 0.25;
        assert_eq!(game.loosing_duration(), sim::missiles::LOOSING_TTL);
        assert_eq!(game.battle.sim.loosing_ttl[0], 0.25);
    }

    #[test]
    fn injury_pointers_read_the_simulation_pools_without_copying() {
        let mut game = Game::new(7);
        game.spawn_unit(0.0, 0.0, 0.0, 2, 2, 1.0, 1.0, 0, 0.5);
        game.battle.sim.health.copy_from_slice(&[2.5, 1.25]);
        game.battle.sim.mount_health.copy_from_slice(&[0.0, 4.5]);
        assert_eq!(game.health_ptr(), game.battle.sim.health.as_ptr());
        assert_eq!(
            game.mount_health_ptr(),
            game.battle.sim.mount_health.as_ptr()
        );
        // The owner remains alive, and no allocation occurs between acquiring
        // these pointers and reading their initialized soldier-length slices.
        unsafe {
            assert_eq!(
                std::slice::from_raw_parts(game.health_ptr(), 2),
                &[2.5, 1.25]
            );
            assert_eq!(
                std::slice::from_raw_parts(game.mount_health_ptr(), 2),
                &[0.0, 4.5]
            );
        }
    }

    #[test]
    fn posture_buffer_observes_current_incapacitation_and_initializes_new_soldiers() {
        let mut game = Game::new(7);
        game.spawn_unit(0.0, 0.0, 0.0, 1, 1, 1.0, 1.0, 0, 0.5);
        assert_eq!(game.posture_info, [0]);
        game.battle.sim.stun[0] = 1.0;
        game.battle.sim.guarded_facings[0] = 1;
        game.battle.sim.units[0].guarded_facing = true;
        game.refresh_unit_info();
        assert_eq!(game.posture_info, [7]);
        assert_eq!(game.posture_ptr(), game.posture_info.as_ptr());
        game.spawn_unit(10.0, 0.0, 0.0, 1, 1, 1.0, 1.0, 0, 0.5);
        assert_eq!(game.posture_info, [7, 0]);
        game.battle.sim.stun[0] = 0.0;
        game.refresh_unit_info();
        assert_eq!(game.posture_info, [6, 0]);
        game.battle.sim.alive[0] = 0;
        game.refresh_unit_info();
        assert_eq!(game.posture_info, [0, 0]);
    }

    #[test]
    fn bulk_travel_preserves_mixed_disabled_and_recovery_ticks_across_batches() {
        fn game() -> Game {
            let mut game = Game::new(0x5150);
            game.battle.sim.tun.morale_enabled = false;
            game.spawn_class(0.0, 0.0, 0.0, 1, 1, 0, 0);
            game.spawn_class(0.2, 0.0, 0.0, 1, 1, 0, 0);
            game.battle.sim.stun[0] = sim::DT * 0.5;
            game
        }
        let mut stepped = game();
        stepped.tick();
        assert_eq!(
            stepped.posture_info[0] & 1,
            0,
            "stun expired after movement skipped"
        );
        assert_eq!(stepped.battle.sim.motor_travel[0], [0.0; 3]);
        let start = stepped.battle.sim.positions.clone();
        stepped.tick();
        let dx = stepped.battle.sim.positions[0] as f64 - start[0] as f64;
        let dy = stepped.battle.sim.positions[1] as f64 - start[1] as f64;
        let mut batched = game();
        batched.advance_ticks(2);
        assert_eq!(batched.battle.sim.positions, stepped.battle.sim.positions);
        // Reacquired view into the actual Sim-owned record; no allocation during read.
        unsafe {
            assert_eq!(
                std::slice::from_raw_parts(batched.motor_travel_ptr(), 3),
                &[dx, dy, dx.hypot(dy)]
            );
        }
        let prior = batched.battle.sim.motor_travel[0];
        batched.spawn_class(40.0, 0.0, 0.0, 1, 1, 0, 0);
        unsafe {
            let records = std::slice::from_raw_parts(batched.motor_travel_ptr(), 9);
            assert_eq!(&records[..3], &prior);
            assert_eq!(&records[6..], &[0.0; 3]);
        }
    }
}
