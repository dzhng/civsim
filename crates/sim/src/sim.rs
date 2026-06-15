//! Sim orchestration: world state, spawning, orders, and the tick pipeline.
//!
//! Tick order:
//!   snapshot prev positions -> order delivery + reflexes -> unit motion ->
//!   contact-mode anchor/facing adjustments -> slot re-forming ->
//!   soldier steering (+ measurement) -> body collision -> combat ->
//!   unit-state integration (disorder, cohesion, stamina, contact decay).

use crate::class::{class_stats, UnitClassId};
use crate::grid::SpatialHash;
use crate::math::{dir, rotate_toward, wrap_angle, Vec2};
use crate::movement::{pace_speed, soldier_surge_speed, update_unit_motion};
use crate::rng::Pcg32;
use crate::terrain::{stagger01, Terrain};
use crate::tunables::{Pace, Tunables, DT};
use crate::unit::{bearing_bucket, bucket_bearing, reassign_slots, slot_local, OrderMode, Unit};

/// Idle-fidget drift amplitude (m, peak ≈ this) and glance drift (rad, peak). A
/// standing man is never a fence-post: he drifts off his slot and his eye
/// wanders, off the sim RNG (stagger01) so it's reproducible. Gated only on
/// being idle — NOT on the enemy's distance — so the line never tightens or
/// untightens as a foe drifts in and out of range; he simply stops the moment
/// he moves or fights. The drift is real, so a charge that lands on a still-idle
/// line meets it a hair loose; that is the (small, accepted) cost.
const IDLE_FIDGET: f32 = 0.12;
const IDLE_GLANCE: f32 = 0.18;

pub struct Sim {
    pub tun: Tunables,
    /// Per-class balance surface (stats/weapons), injected. Units capture their
    /// stats from it at spawn; `Default` == the `class_stats` tables.
    pub balance: crate::class::BalanceConfig,
    /// Interleaved soldier positions [x0, y0, x1, y1, ...].
    pub positions: Vec<f32>,
    pub facings: Vec<f32>,
    pub health: Vec<f32>,
    /// Collision/push mass per soldier (from class; bracing multiplies it).
    pub mass: Vec<f32>,
    /// Personal-space radius per soldier (cavalry is much bigger than men).
    pub radius: Vec<f32>,
    pub(crate) max_radius: f32,
    /// 1 = two-circle elongated body with a rider pool at center.
    pub mounted: Vec<u8>,
    /// Rider health (mounted only; geometry decides who can strike it).
    pub mount_health: Vec<f32>,
    /// Seconds the instantaneous victor condition has held (morale.rs):
    /// the verdict must be sustained before it locks.
    pub(crate) verdict_hold: f32,
    /// Crowd squeeze per soldier (EMA of received push, m/s): measured,
    /// never written by gameplay. Kills evade, transmits force.
    pub pressure: Vec<f32>,
    /// THE LEDGER — raw received push this tick, posted by every system
    /// that displaces a soldier against his will (separation solver,
    /// weapon hit-push, stone bowls). Own legs and carried momentum never
    /// post. Zeroed each tick; folded into the pressure EMAs at the end,
    /// after the last poster — so a pike hedge hammering a charger is
    /// pressure exactly like a crowd squeezing him.
    pub(crate) recv_x: Vec<f32>,
    pub(crate) recv_y: Vec<f32>,
    pub(crate) recv_mag: Vec<f32>,
    /// EMA of the net received push vector (m/s), ALL sources — the vice
    /// and the ram drag read this (a hedge of thrusts is compression).
    pub(crate) press_x: Vec<f32>,
    pub(crate) press_y: Vec<f32>,
    /// EMA of the net COLLISION push vector only — the othismos force
    /// chain (bodies conducting momentum through contact). A sword blow
    /// compresses a man; it does not make him a better pusher, so the
    /// conduction term must not read weapon pushes.
    pub(crate) cond_x: Vec<f32>,
    pub(crate) cond_y: Vec<f32>,
    pub attack_cd: Vec<f32>,
    /// Impact momentum carried by the body (kg·m/s, world vector): set when
    /// a charge lands, spent against the crowd, zeroed by stagger. THIS is
    /// what makes cavalry punch INTO a line instead of stopping at its rim —
    /// and a heavy infantryman at a dead sprint carries a stride of it too.
    pub mom_x: Vec<f32>,
    pub mom_y: Vec<f32>,
    /// Weapon currently in hand (index into the class weapon list).
    pub cur_weapon: Vec<u8>,
    /// Seconds left in this soldier's weapon swap (no strikes meanwhile).
    pub switch_cd: Vec<f32>,
    pub stun: Vec<f32>,
    /// Current melee engagement (enemy soldier index, -1 = none).
    /// Set at awareness range (~6m): drives approach facing.
    pub target: Vec<i32>,
    /// 1 = the engaged enemy is within actual weapon reach. Reflexes (halt,
    /// drift tracking, drain) key on THIS — being able to see an enemy is
    /// not being in a fight.
    pub fighting: Vec<u8>,
    /// Same-unit comrades FIGHTING within ~6m (clamped at 10): the local
    /// fight density that licenses a soldier's combat initiative. A man on
    /// a quiet wing reads 0; a man beside the scrum reads high — and his
    /// seek radius grows with it (cascading envelopment).
    pub fight_near: Vec<u8>,
    /// 1 = the bearing to this soldier's target is clear of friendly bodies
    /// (within 1.5m, ±40°). The anti-blender leash: rank-3 men behind
    /// comrades may NOT wade in regardless of seek radius.
    pub front_clear: Vec<u8>,
    /// Bearing of the last attacker and its time-to-live (reactive facing).
    pub(crate) hit_dir: Vec<f32>,
    pub(crate) hit_ttl: Vec<f32>,
    /// Honest kinematic velocity per soldier (m/s): steering + carried
    /// momentum, captured after the steer pass and BEFORE the separation
    /// solver — the impact stack reads this, never position deltas, which
    /// in a packed scrum carry 5-9 m/s of solver oscillation ("phantom
    /// velocity") that minted momentum and chipped stun-locked men dead.
    pub(crate) kin_vx: Vec<f32>,
    pub(crate) kin_vy: Vec<f32>,
    pub(crate) prev_positions: Vec<f32>,
    pub(crate) body_pos: Vec<f32>,
    pub(crate) body_r: Vec<f32>,
    pub(crate) body_owner: Vec<u32>,
    /// 1 = alive. Dead soldiers stay in the arrays as corpses; the slot
    /// machinery reshuffles the living around them.
    pub alive: Vec<u8>,
    /// Unit index per soldier (static after spawn).
    pub soldier_unit: Vec<u32>,
    /// Formation slot per soldier; remapped while a unit pivots/re-forms.
    pub soldier_slot: Vec<u32>,
    /// This tick's idle-fidget displacement per soldier (world, zero unless the
    /// man is currently fidgeting in place). Recorded by the steer pass and
    /// SUBTRACTED by the re-form sort, so the deliberate liveliness drift never
    /// reaches formation logic — a standing man's 6 cm sway can't reorder the
    /// ranks. Combat men carry zero here, so the re-form is byte-for-byte the
    /// clean-formation sort; nothing in a fight is perturbed.
    pub(crate) fidget_offset: Vec<Vec2>,
    pub units: Vec<Unit>,
    pub terrain: Terrain,
    pub projectiles: crate::missiles::Projectiles,
    /// Diagnostics: landings that struck a body / landed on empty ground.
    pub missile_hits: u64,
    pub missile_misses: u64,
    /// Diagnostics: men killed by collision impact (knockdown wounds) —
    /// the scrum-chip regression reads this (a grind must show ZERO).
    pub impact_casualties: u64,
    pub tick_count: u64,
    pub rng: Pcg32,
    pub(crate) grid: SpatialHash,
    pub(crate) scratch: Vec<f32>,
}

impl Sim {
    pub fn new(tun: Tunables, seed: u64) -> Self {
        Self::with_balance(tun, crate::class::BalanceConfig::default(), seed)
    }

    /// As `new`, but with a tuned balance surface — the seam the balance
    /// harness uses to sweep configs against one compiled binary.
    pub fn with_balance(tun: Tunables, balance: crate::class::BalanceConfig, seed: u64) -> Self {
        Self {
            tun,
            balance,
            positions: Vec::new(),
            facings: Vec::new(),
            health: Vec::new(),
            mass: Vec::new(),
            radius: Vec::new(),
            max_radius: tun.soldier_radius,
            mounted: Vec::new(),
            mount_health: Vec::new(),
            verdict_hold: 0.0,
            pressure: Vec::new(),
            recv_x: Vec::new(),
            recv_y: Vec::new(),
            recv_mag: Vec::new(),
            press_x: Vec::new(),
            press_y: Vec::new(),
            cond_x: Vec::new(),
            cond_y: Vec::new(),
            attack_cd: Vec::new(),
            mom_x: Vec::new(),
            mom_y: Vec::new(),
            cur_weapon: Vec::new(),
            switch_cd: Vec::new(),
            stun: Vec::new(),
            target: Vec::new(),
            fighting: Vec::new(),
            fight_near: Vec::new(),
            front_clear: Vec::new(),
            hit_dir: Vec::new(),
            hit_ttl: Vec::new(),
            kin_vx: Vec::new(),
            kin_vy: Vec::new(),
            prev_positions: Vec::new(),
            body_pos: Vec::new(),
            body_r: Vec::new(),
            body_owner: Vec::new(),
            alive: Vec::new(),
            soldier_unit: Vec::new(),
            soldier_slot: Vec::new(),
            fidget_offset: Vec::new(),
            units: Vec::new(),
            terrain: Terrain::flat(1, 1, 4.0, Vec2::ZERO),
            projectiles: crate::missiles::Projectiles::default(),
            missile_hits: 0,
            missile_misses: 0,
            impact_casualties: 0,
            tick_count: 0,
            rng: Pcg32::new(seed, 0xda3e),
            grid: SpatialHash::new(),
            scratch: Vec::new(),
        }
    }

    pub fn soldier_count(&self) -> usize {
        self.facings.len()
    }

    pub fn soldier_pos(&self, i: usize) -> Vec2 {
        Vec2::new(self.positions[2 * i], self.positions[2 * i + 1])
    }

    /// Distance from soldier `i` to its currently assigned slot.
    pub fn slot_error(&self, i: usize) -> f32 {
        let u = &self.units[self.soldier_unit[i] as usize];
        (u.slot_world(self.soldier_slot[i] as usize) - self.soldier_pos(i)).len()
    }

    /// Spawn a unit in perfect formation. `anchor` is the front-center.
    pub fn spawn_unit(
        &mut self,
        anchor: Vec2,
        facing: f32,
        count: usize,
        files: usize,
        spacing: Vec2,
        team: u32,
        training: f32,
    ) -> usize {
        let unit_index = self.units.len();
        // Which way home lies: the half of the field this unit deploys in fixes
        // the edge it will flee to if broken (the same edge campaign
        // reinforcements enter from). A sign, not a coordinate, so a unit shoved
        // past its own edge still flees outward, not back into the fight.
        let map_mid_y = self.terrain.origin.y + 0.5 * self.terrain.h as f32 * self.terrain.cell;
        let home_dir_y = if anchor.y >= map_mid_y { 1.0 } else { -1.0 };
        let unit = Unit {
            class: UnitClassId::LightSpear,
            stats: class_stats(UnitClassId::LightSpear),
            speed_mult: 1.0,
            start: self.soldier_count(),
            count,
            files: files.max(1),
            files_eff: files.max(1),
            path: Vec::new(),
            path_idx: 0,
            waiting: false,
            spacing,
            anchor,
            facing,
            frame_speed: 0.0,
            move_target: None,
            pending_target: None,
            pending_mode: OrderMode::Move,
            pending_timer: 0.0,
            pending_total: 0.0,
            pace: Pace::Walk,
            fatigue: 1.0,
            training: training.clamp(0.0, 1.0),
            team,
            home_dir_y,
            disorder: 0.0,
            cohesion: 1.0,
            pivoting: false,
            mode: OrderMode::Move,
            stance: crate::unit::Stance::Othismos,
            charge_enabled: false,
            charging: false,
            fear_adapt: 0.0,
            charge_time: 0.0,
            charge_at_speed: false,
            drain_mult: 1.0,
            resume_target: None,
            alive_count: count,
            deaths_since_reform: 0,
            engaged: 0,
            contact_hist: [0.0; 12],
            contact_unit: 0,
            quiet_ticks: 0,
            recent_casualties: 0.0,
            ammo: 0,
            fire_at_will: true,
            evade_auto: false,
            morale: 0.7 + 0.3 * training.clamp(0.0, 1.0),
            morale_ceiling: 1.0,
            routing: false,
            overhung: false,
            recent_missiles: 0.0,
            losing_push: 0.0,
            centroid: anchor,
            at_ease: false,
            counter_press: 0.0,
            mass_advance: 0.0,
            final_facing: None,
            reform_timer: 0.0,
            pursue: false,
            threat_bearing: None,
            threat_unit: None,
            latch_best: f32::INFINITY,
            latch_cd: 0.0,
            weapon_pref: 0,
            switch_timer: 0.0,
            pending_pref: 0,
            order_queue: Vec::new(),
        };
        for s in 0..count {
            let p = unit.slot_world(s);
            self.positions.push(p.x);
            self.positions.push(p.y);
            self.facings.push(facing);
            self.health.push(1.0);
            self.mass.push(1.0);
            self.radius.push(self.tun.soldier_radius);
            self.mounted.push(0);
            self.mount_health.push(0.0);
            self.pressure.push(0.0);
            self.press_x.push(0.0);
            self.press_y.push(0.0);
            self.attack_cd.push(0.0);
            self.mom_x.push(0.0);
            self.mom_y.push(0.0);
            self.cur_weapon.push(0);
            self.switch_cd.push(0.0);
            self.stun.push(0.0);
            self.target.push(-1);
            self.fighting.push(0);
            self.fight_near.push(0);
            self.front_clear.push(1);
            self.hit_dir.push(0.0);
            self.hit_ttl.push(0.0);
            self.kin_vx.push(0.0);
            self.kin_vy.push(0.0);
            self.recv_x.push(0.0);
            self.recv_y.push(0.0);
            self.recv_mag.push(0.0);
            self.cond_x.push(0.0);
            self.cond_y.push(0.0);
            self.alive.push(1);
            self.soldier_unit.push(unit_index as u32);
            self.soldier_slot.push(s as u32);
            self.fidget_offset.push(Vec2::ZERO);
        }
        self.units.push(unit);
        unit_index
    }

    /// Spawn a unit of a class: stats, body size, mass, spacing, and depth
    /// all come from the class table.
    pub fn spawn_class(
        &mut self,
        anchor: Vec2,
        facing: f32,
        count: usize,
        class: UnitClassId,
        team: u32,
    ) -> usize {
        let stats = self.balance.get(class);
        let files = count.div_ceil(stats.default_depth.max(1));
        let idx = self.spawn_unit(anchor, facing, count, files, stats.spacing, team, stats.training);
        let start = self.units[idx].start;
        for s in 0..count {
            self.health[start + s] = stats.health;
            self.mass[start + s] = stats.mass;
            self.radius[start + s] = stats.soldier_radius;
            self.mounted[start + s] = stats.mounted as u8;
            self.mount_health[start + s] = stats.mount_health;
        }
        self.max_radius = self.max_radius.max(stats.soldier_radius);
        let u = &mut self.units[idx];
        u.class = class;
        u.stats = stats;
        u.speed_mult = stats.speed_mult;
        u.stance = stats.stance;
        u.charge_enabled = stats.charge;
        u.drain_mult = stats.drain_mult;
        if let Some(spec) = crate::missiles::missile_spec(class) {
            u.ammo = spec.ammo * count as u32;
        }
        u.evade_auto = matches!(class, UnitClassId::Skirmishers | UnitClassId::HorseArchers);
        idx
    }

    pub fn set_fire_at_will(&mut self, unit: usize, on: bool) {
        if let Some(u) = self.units.get_mut(unit) {
            u.fire_at_will = on;
        }
    }

    /// Kiting is a class capability (loose order, ranged, drilled to run):
    /// only skirmishers and horse archers can toggle it.
    pub fn set_evade_auto(&mut self, unit: usize, on: bool) {
        if let Some(u) = self.units.get_mut(unit) {
            if matches!(u.class, UnitClassId::Skirmishers | UnitClassId::HorseArchers) {
                u.evade_auto = on;
            }
        }
    }

    pub fn set_stance(&mut self, unit: usize, stance: crate::unit::Stance) {
        if let Some(u) = self.units.get_mut(unit) {
            u.stance = stance;
        }
    }

    /// Test-isolation hook only: in the game, charging is the class
    /// capability, applied automatically on an explicit attack — there is
    /// no player toggle. Scenario tests switch it off to isolate variables.
    pub fn set_charge_enabled(&mut self, unit: usize, enabled: bool) {
        if let Some(u) = self.units.get_mut(unit) {
            u.charge_enabled = enabled;
        }
    }

    // --- orders (all pass through the cohesion-gated transmission delay) ----

    /// Shift-queued order: runs after everything already underway finishes.
    pub fn enqueue_order(
        &mut self,
        unit: usize,
        mode: OrderMode,
        target: Vec2,
        facing: Option<f32>,
    ) {
        let Some(u) = self.units.get_mut(unit) else {
            return;
        };
        let idle = u.move_target.is_none()
            && u.pending_target.is_none()
            && matches!(u.mode, OrderMode::Move)
            && u.order_queue.is_empty();
        if idle {
            self.apply_order(unit, mode, target, facing);
        } else {
            self.units[unit].order_queue.push((mode, target, facing));
        }
    }

    fn apply_order(&mut self, unit: usize, mode: OrderMode, target: Vec2, facing: Option<f32>) {
        let queue = std::mem::take(&mut self.units[unit].order_queue);
        self.queue_order(unit, mode, target);
        let u = &mut self.units[unit];
        u.order_queue = queue;
        u.final_facing = facing;
    }

    fn queue_order(&mut self, unit: usize, mode: OrderMode, target: Vec2) {
        let tun = self.tun;
        let Some(u) = self.units.get_mut(unit) else {
            return;
        };
        u.order_queue.clear();
        let shortfall = (tun.order_delay_threshold - u.cohesion).max(0.0);
        let delay = (shortfall * tun.order_delay_scale).min(tun.order_delay_max);
        if delay < 0.05 {
            u.mode = mode;
            u.move_target = Some(target);
            u.resume_target = None;
            u.pending_target = None;
        } else {
            u.pending_target = Some(target);
            u.pending_mode = mode;
            u.pending_timer = delay;
            u.pending_total = delay;
        }
    }

    pub fn set_move_order(&mut self, unit: usize, target: Vec2) {
        self.queue_order(unit, OrderMode::Move, target);
    }

    pub fn set_attack_move_order(&mut self, unit: usize, target: Vec2) {
        // Sugar for Move with the pursue bit set: latch onto whatever the
        // advance meets (the old AttackMove, now one less mode).
        self.set_pursue(unit, true);
        self.queue_order(unit, OrderMode::Move, target);
    }

    pub fn set_disengage_order(&mut self, unit: usize, target: Vec2) {
        self.queue_order(unit, OrderMode::Disengage, target);
    }

    /// Latch onto an enemy unit: targeting convenience only — combat outcomes
    /// are identical to walking into contact yourself.
    pub fn set_attack_order(&mut self, unit: usize, enemy: usize) {
        if enemy >= self.units.len() || unit >= self.units.len() {
            return;
        }
        let anchor = self.units[enemy].anchor;
        self.queue_order(unit, OrderMode::Attack(enemy as u32), anchor);
    }

    /// Move order that also pivots to a final facing on arrival
    /// (line-painting / group drag orders).
    pub fn set_move_order_facing(&mut self, unit: usize, target: Vec2, facing: f32) {
        self.queue_order(unit, OrderMode::Move, target);
        if let Some(u) = self.units.get_mut(unit) {
            u.final_facing = Some(facing);
        }
    }

    /// Permanently reshape the formation's frontage (single-unit drag).
    pub fn set_files(&mut self, unit: usize, files: usize) {
        if unit >= self.units.len() {
            return;
        }
        let count = self.units[unit].count;
        // Never wider than 3 ranks deep — a line thinner than that isn't a line,
        // it's a brittle string. (Enforced here so any width control, including
        // a future right-drag-to-widen, can't cross it.)
        let lower = 4.min(count.max(1));
        let files = files.clamp(lower, (count / 3).max(lower));
        let u = &mut self.units[unit];
        u.files = files;
        u.files_eff = files;
        reassign_slots(&self.units[unit], &self.positions, &self.fidget_offset, &self.alive, &mut self.soldier_slot);
    }

    /// Reform: halt, re-seat the frame on the men, accelerated recovery.
    pub fn set_reform(&mut self, unit: usize) {
        let Some(u) = self.units.get_mut(unit) else {
            return;
        };
        if u.routing {
            return;
        }
        u.move_target = None;
        u.pending_target = None;
        u.resume_target = None;
        u.path.clear();
        u.mode = OrderMode::Move;
        u.final_facing = None;
        u.reform_timer = 8.0;
        // Re-seat the frame on the men's actual center of mass.
        u.anchor = u.centroid + dir(u.facing) * (0.5 * u.depth());
        reassign_slots(&self.units[unit], &self.positions, &self.fidget_offset, &self.alive, &mut self.soldier_slot);
    }

    /// Order the whole unit onto its secondary weapon (or back to weapons
    /// by judgment). Takes ~1s to shout down the line, then each soldier
    /// swaps with his own ~1s fumble.
    pub fn set_weapon_pref(&mut self, unit: usize, secondary: bool) {
        if let Some(u) = self.units.get_mut(unit) {
            let pref = if secondary { 1 } else { 0 };
            if u.weapon_pref != pref {
                u.pending_pref = pref;
                u.switch_timer = 1.0;
            }
        }
    }

    pub fn set_pursue(&mut self, unit: usize, on: bool) {
        if let Some(u) = self.units.get_mut(unit) {
            u.pursue = on;
        }
    }

    pub fn set_pace(&mut self, unit: usize, pace: Pace) {
        if let Some(u) = self.units.get_mut(unit) {
            u.pace = pace;
        }
    }

    /// Nearest unit (by formation midpoint) within max_dist, or None.
    pub fn pick_unit(&self, p: Vec2, max_dist: f32) -> Option<usize> {
        let mut best: Option<(usize, f32)> = None;
        for (i, u) in self.units.iter().enumerate() {
            if u.alive_count == 0 {
                continue;
            }
            let d = (u.center() - p).len();
            if d <= max_dist && best.map_or(true, |(_, bd)| d < bd) {
                best = Some((i, d));
            }
        }
        best.map(|(i, _)| i)
    }

    pub fn tick(&mut self) {
        let dt = DT;
        let tun = self.tun;
        let n = self.soldier_count();

        // Snapshot for velocity measurement (charges, anchor drift).
        self.prev_positions.resize(2 * n, 0.0);
        self.prev_positions.copy_from_slice(&self.positions);
        // Open the received-push ledger for this tick.
        for v in self.recv_x.iter_mut().chain(self.recv_y.iter_mut()).chain(self.recv_mag.iter_mut()) {
            *v = 0.0;
        }

        self.deliver_orders_and_reflexes(dt);
        self.run_skirmish_evade();
        self.navigate_units();

        for u in &mut self.units {
            let ground = self.terrain.speed_at(u.anchor).max(0.15);
            let a0 = u.anchor;
            update_unit_motion(&tun, u, dt, ground);
            // frame_speed MEASURES the frame's gross motion in this pass —
            // bracing, charge windows, and mobile-fire gates read it. One
            // blind spot: it is taken before the anchor law runs, so a
            // leashed frame re-walking the same meter every tick still
            // reads ~pace; mass_advance is the measurement that can't.
            if !u.pivoting {
                u.frame_speed = (u.anchor - a0).len() / dt;
            }
        }

        // A halted frame with slots on impassable ground slides itself clear:
        // the ideal formation must always be physically achievable, or the
        // disorder measurement would report a lie forever. (Marching past
        // rocks stays transient by design — this only acts at rest.)
        for ui in 0..self.units.len() {
            if self.tick_count % 15 != (ui as u64) % 15 {
                continue;
            }
            let u = &self.units[ui];
            if u.move_target.is_some() || u.pivoting || u.engaged > 0 || u.alive_count == 0 {
                continue;
            }
            let mut esc = Vec2::ZERO;
            let mut bad = 0;
            for s in (0..u.alive_count).step_by(3) {
                let p = u.slot_world(s);
                if self.terrain.speed_at(p) <= 0.0 {
                    esc = esc + self.terrain.escape_dir(p);
                    bad += 1;
                }
            }
            if bad > 0 {
                let l = esc.len();
                let step = if l > 1e-3 {
                    esc * (1.0 / l)
                } else {
                    dir(self.units[ui].facing + std::f32::consts::PI)
                };
                self.units[ui].anchor = self.units[ui].anchor + step * 0.45;
            }
        }

        // Re-form slots while pivoting or after casualties opened gaps — and at
        // a slow drumbeat while FIGHTING (vacancy back-fill): a man who stepped
        // out vacates his slot, the man behind relabels forward and marches up,
        // arrives beside the scrum, reads high fight density, and steps out
        // himself. The cascade is rate-limited by actual walking. The re-form's
        // sort is jitter-stable (see reassign_slots), so idle drift in the rear
        // ranks can't churn the line and swing the fight.
        for ui in 0..self.units.len() {
            let needs = self.units[ui].pivoting
                || self.units[ui].deaths_since_reform * 50 > self.units[ui].alive_count.max(1)
                || (self.units[ui].engaged > 0 && self.tick_count % 60 == (ui as u64) % 60);
            if needs {
                reassign_slots(&self.units[ui], &self.positions, &self.fidget_offset, &self.alive, &mut self.soldier_slot);
                self.units[ui].deaths_since_reform = 0;
            }
        }

        let measures = self.steer_soldiers(dt);
        // Honest kinematics: what each body's own legs and carried momentum
        // did this tick (prev_positions snapshots the tick start; nothing
        // but the steer pass has moved anyone yet). Captured BEFORE the
        // separation solver so impacts read motion, not constraint churn.
        for i in 0..self.kin_vx.len() {
            self.kin_vx[i] = (self.positions[2 * i] - self.prev_positions[2 * i]) / dt;
            self.kin_vy[i] = (self.positions[2 * i + 1] - self.prev_positions[2 * i + 1]) / dt;
        }
        self.apply_separation();
        self.run_combat();
        self.run_missiles();
        // Close the ledger: fold this tick's received pushes into the
        // pressure EMAs, after the LAST poster (separation, strikes,
        // stones have all run).
        {
            let alpha = 1.0 - (-dt / self.tun.press_tau).exp();
            for i in 0..self.pressure.len() {
                self.pressure[i] += (self.recv_mag[i] / dt - self.pressure[i]) * alpha;
                self.press_x[i] += (self.recv_x[i] / dt - self.press_x[i]) * alpha;
                self.press_y[i] += (self.recv_y[i] / dt - self.press_y[i]) * alpha;
            }
        }
        self.contact_facing(&measures, dt);
        self.integrate_units(&measures, dt);
        self.mark_at_ease(); // fresh centroids; before morale reads it
        self.run_morale(dt);

        self.tick_count += 1;
    }

    /// Refresh each unit's `at_ease` flag: no living, non-routing enemy whose
    /// formation comes within at_ease_range. EXTENT-AWARE — the gap is measured
    /// edge to edge (centroid distance less each unit's bounding half-radius),
    /// because "at ease" is a fact about the nearest steel, not about centres: a
    /// 200-wide line whose flank a column nearly touches is NOT at ease even if
    /// the centroids sit far apart, and a deep block is threatened the moment
    /// its front rank is in reach, not when its middle is. The one shared notion
    /// of "safe" — it gates morale recovery here and the relaxed stance in the
    /// renderer (same range), so a unit at ease in one sense is at ease in all.
    /// A fleeing enemy is no threat and doesn't count. Cheap O(units^2).
    fn mark_at_ease(&mut self) {
        let snap = self.threat_snapshot();
        let range = self.tun.at_ease_range;
        for i in 0..self.units.len() {
            // At ease unless the nearest enemy's steel is within range.
            self.units[i].at_ease =
                Self::nearest_enemy(&snap, i).map_or(true, |(gap, _, _)| gap >= range);
        }
    }

    /// Per-unit basis for every "how near is the nearest enemy" question:
    /// live centroid, team, a "no threat" flag (routing or wiped out), and
    /// the formation bounding radius (0.5 * width⊕depth). `at_ease` and the
    /// threat scan share this snapshot AND `nearest_enemy` below, so they can
    /// never disagree about who is close — one notion of "the nearest steel".
    fn threat_snapshot(&self) -> Vec<(Vec2, u32, bool, f32)> {
        self.units
            .iter()
            .map(|u| {
                let r = 0.5 * u.width().hypot(u.depth());
                (u.centroid, u.team, u.routing || u.alive_count == 0, r)
            })
            .collect()
    }

    /// Nearest living, non-routing enemy to unit `i`: (edge gap, bearing,
    /// unit index). The gap subtracts BOTH formations' bounding radii — the
    /// distance between their nearest steel, not their centres, so a wide
    /// line is "close" when its flank is neared and a deep block when its
    /// front rank is in reach. None if no enemy remains.
    fn nearest_enemy(snap: &[(Vec2, u32, bool, f32)], i: usize) -> Option<(f32, f32, u32)> {
        let (ci, ti, _, ri) = snap[i];
        let mut best: Option<(f32, f32, u32)> = None;
        for (vi, &(cj, tj, gone, rj)) in snap.iter().enumerate() {
            if tj == ti || gone {
                continue;
            }
            let to = cj - ci;
            let gap = to.len() - ri - rj;
            if best.map_or(true, |(bg, _, _)| gap < bg) {
                best = Some((gap, to.y.atan2(to.x), vi as u32));
            }
        }
        best
    }

    /// Anchor intelligence: plan around impassables, squeeze through
    /// corridors, queue behind same-flow traffic. Staggered (each unit
    /// re-evaluates ~3x/second).
    fn navigate_units(&mut self) {
        for ui in 0..self.units.len() {
            if self.tick_count % 10 != (ui as u64) % 10 {
                continue;
            }
            if self.units[ui].alive_count == 0 || self.units[ui].routing {
                continue;
            }
            // --- path planning ------------------------------------------
            if let Some(goal) = self.units[ui].move_target {
                let stale = self.units[ui]
                    .path
                    .last()
                    .map_or(true, |&g| (g - goal).len() > 6.0);
                if stale {
                    match crate::path::plan(&self.terrain, self.units[ui].anchor, goal) {
                        Some(way) => {
                            self.units[ui].path = way;
                            self.units[ui].path_idx = 0;
                        }
                        None => {
                            self.units[ui].path.clear();
                            self.units[ui].path_idx = 0;
                        }
                    }
                }
                let u = &mut self.units[ui];
                while u.path_idx + 1 < u.path.len() && (u.path[u.path_idx] - u.anchor).len() < 5.0 {
                    u.path_idx += 1;
                }
            } else if !self.units[ui].path.is_empty() {
                self.units[ui].path.clear();
                self.units[ui].path_idx = 0;
            }

            self.update_corridor(ui);
            self.update_yield(ui);
        }
    }

    /// Measure lateral clearance at (and just ahead of) the anchor; compress
    /// the formation frame to fit, centered in the gap; relax on open ground.
    fn update_corridor(&mut self, ui: usize) {
        let (anchor, facing, files, files_eff, spacing_x, depth, alive) = {
            let u = &self.units[ui];
            (u.anchor, u.facing, u.files, u.files_eff, u.spacing.x, u.depth(), u.alive_count)
        };
        let f = dir(facing);
        let r = Vec2::new(f.y, -f.x);
        let half_full = (files.max(1) - 1) as f32 * spacing_x * 0.5 + 2.0;
        let clearance = |origin: Vec2, side: Vec2| -> f32 {
            let mut s = 1.0;
            while s <= half_full {
                if self.terrain.speed_at(origin + side * s) <= 0.0 {
                    return s - 0.5;
                }
                s += 1.0;
            }
            half_full
        };
        let mut corridor = f32::MAX;
        let mut bias = 0.0;
        for probe in [anchor, anchor + f * 5.0, anchor + f * (-0.5 * depth)] {
            let cl = clearance(probe, r * -1.0);
            let cr = clearance(probe, r);
            if cl + cr < corridor {
                corridor = cl + cr;
                bias = cr - cl;
            }
        }
        let floor = 4.min(files.max(1));
        // Casualties reshape the block: it sheds DEPTH at full width until it
        // would fall below 3 ranks, then it closes up and sheds WIDTH instead,
        // never thinner than 3 ranks. The line stays a coherent cloth as it
        // bleeds, rather than fraying into a one-deep skirmish string. (The
        // casualty cap overrides the corridor floor — a dying unit narrows past
        // it.)
        let casualty_cap = (alive / 3).max(1);
        let target = ((corridor / spacing_x.max(0.2)) as usize)
            .clamp(floor, files.max(1))
            .min(casualty_cap);
        let new_eff = if target < files_eff {
            files_eff.saturating_sub(2).max(target)
        } else {
            (files_eff + 1).min(target)
        };
        if new_eff != files_eff {
            self.units[ui].files_eff = new_eff;
            reassign_slots(&self.units[ui], &self.positions, &self.fidget_offset, &self.alive, &mut self.soldier_slot);
        }
        if target < files {
            // Center the squeezed frame in the gap.
            let shift = (bias * 0.1).clamp(-0.25, 0.25);
            self.units[ui].anchor = self.units[ui].anchor + r * shift;
        }
    }

    /// Inside a corridor, queue behind friendly units flowing the same way.
    /// Different commands (opposing flows) do NOT coordinate — they push
    /// through each other and pay the disorder, by design.
    fn update_yield(&mut self, ui: usize) {
        let blocked = {
            let u = &self.units[ui];
            if u.files_eff >= u.files || u.move_target.is_none() || u.engaged > 0 {
                false
            } else {
                let f = dir(u.facing);
                let r = Vec2::new(f.y, -f.x);
                let half_w = u.width() * 0.5;
                self.units.iter().enumerate().any(|(vi, v)| {
                    if vi == ui || v.team != u.team || v.alive_count == 0 {
                        return false;
                    }
                    if dir(v.facing).dot(f) < 0.3 {
                        return false; // opposing flow: no coordination
                    }
                    let to = v.center() - u.anchor;
                    let ahead = to.dot(f);
                    let lateral = to.dot(r).abs();
                    ahead > 0.0
                        && ahead < 10.0 + 0.5 * v.depth()
                        && lateral < (half_w + 0.5 * v.width()) * 0.75
                        && v.frame_speed < u.frame_speed.max(0.6)
                })
            }
        };
        self.units[ui].waiting = blocked;
    }

    fn deliver_orders_and_reflexes(&mut self, dt: f32) {
        for u in self.units.iter_mut() {
            if u.latch_cd > 0.0 {
                u.latch_cd -= dt;
            }
            if u.switch_timer > 0.0 {
                u.switch_timer -= dt;
                if u.switch_timer <= 0.0 {
                    u.weapon_pref = u.pending_pref;
                }
            }
        }
        // Nearest-enemy gap + bearing, off the SAME snapshot/measure as
        // `at_ease` (see `nearest_enemy`). `threat_bearing` is retained only
        // while NOT at ease (gap < at_ease_range): a unit that isn't at ease
        // is precisely the one that won't regen morale AND turns to face the
        // enemy — the two can't disagree. `threat_unit` keeps the true gap
        // uncapped for the pursue latch, which gates its own reach.
        let snap = self.threat_snapshot();
        for ui in 0..self.units.len() {
            let best = Self::nearest_enemy(&snap, ui);
            self.units[ui].threat_bearing = best
                .filter(|&(g, _, _)| g < self.tun.at_ease_range)
                .map(|(_, b, _)| b);
            self.units[ui].threat_unit = best.map(|(g, _, v)| (v, g));
        }

        for ui in 0..self.units.len() {
            if self.units[ui].routing {
                self.units[ui].order_queue.clear();
                continue; // no orders reach a broken unit
            }
            // Next queued follow-up, once everything underway has finished.
            {
                let u = &self.units[ui];
                if !u.order_queue.is_empty()
                    && u.move_target.is_none()
                    && u.pending_target.is_none()
                    && matches!(u.mode, OrderMode::Move)
                    && u.engaged == 0
                {
                    let (mode, target, facing) = self.units[ui].order_queue.remove(0);
                    let target = if let OrderMode::Attack(e) = mode {
                        self.units[e as usize].anchor
                    } else {
                        target
                    };
                    self.apply_order(ui, mode, target, facing);
                }
            }
            // Queued order transmission.
            let u = &mut self.units[ui];
            if let Some(t) = u.pending_target {
                u.pending_timer -= dt;
                if u.pending_timer <= 0.0 {
                    u.mode = u.pending_mode;
                    u.move_target = Some(t);
                    u.resume_target = None;
                    u.pending_target = None;
                }
            }

            let engaged_frac = u.engaged as f32 / u.alive_count.max(1) as f32;
            let mode = u.mode;

            // Attack latch: chase the enemy anchor while unengaged, and burst
            // into the charge in the measured final approach.
            let was_charging = self.units[ui].charging;
            self.units[ui].charging = false;
            if was_charging {
                self.units[ui].charge_time += dt;
                // The burst LANDS when the mass reaches impact speed; armed,
                // the spent check below watches for the crowd to bleed it.
                if self.units[ui].mass_advance >= self.tun.charge_min_speed {
                    self.units[ui].charge_at_speed = true;
                }
            } else {
                // A burst is a sprint, and sprints need recovery: the clock
                // drains at quarter rate, so a spent burst can't chain into
                // the next one (nobody gallops in indefinite 4s installments).
                let ct = &mut self.units[ui].charge_time;
                *ct = (*ct - 0.25 * dt).max(0.0);
                self.units[ui].charge_at_speed = false;
            }
            if let OrderMode::Attack(e) = mode {
                let e = e as usize;
                // OVERHANG: am I markedly wider than the foe I'm latched to (a line
                // vs a column)? Then I keep advancing my hanging flanks to WRAP it,
                // instead of halting at contact like an equal clash.
                self.units[ui].overhung = self.units[ui].width() > self.units[e].width() * 1.5;
                // The enemy's edge along MY approach: half-depth when I come
                // at their face, half-WIDTH when I come at their flank — a
                // 100x4 column is 2m deep head-on and 50m wide side-on, and
                // the charge must open at the edge either way.
                let enemy_edge_ext = {
                    let ev = &self.units[e];
                    let approach = ev.centroid - self.units[ui].centroid;
                    let l = approach.len().max(0.5);
                    let a = approach * (1.0 / l);
                    let ef = dir(ev.facing);
                    let er = Vec2::new(ef.y, -ef.x);
                    a.dot(ef).abs() * 0.5 * ev.depth() + a.dot(er).abs() * 0.5 * ev.width()
                };
                // The chase point sits BEYOND the enemy mass — past its far
                // edge along my approach, footprint-derived (a press through
                // a 20-rank column must aim past the whole column): a press
                // is a direction, not a destination — you never arrive at
                // it, never overshoot it, and the leash decides how deep the
                // frame actually gets.
                let standoff = enemy_edge_ext + 5.0;
                let (enemy_dead, enemy_anchor) = {
                    let ev = &self.units[e];
                    let me = self.units[ui].centroid;
                    let through = ev.centroid - me;
                    let l = through.len();
                    // Interpenetrated masses have no usable axis — press on
                    // along the facing instead of flip-flopping backward.
                    let dir_v = if l > 6.0 { through * (1.0 / l) } else { dir(self.units[ui].facing) };
                    (ev.alive_count == 0, ev.centroid + dir_v * standoff)
                };
                let enemy_routing = self.units[e].routing;
                // An auto-latch that is measurably LOSING GROUND gives up:
                // no chasing faster prey across the map. The question is
                // "am I gaining?", asked of the gap itself — a clock can't
                // tell approaching prey from escaping prey.
                let gap = {
                    let ev = &self.units[e];
                    let me = &self.units[ui];
                    (ev.centroid - me.centroid).len()
                        - 0.5 * ev.width().max(ev.depth())
                        - 0.5 * me.width().max(me.depth())
                };
                let u = &mut self.units[ui];
                if u.latch_best.is_finite() {
                    if engaged_frac > 0.03 {
                        u.latch_best = f32::INFINITY; // contact made: the latch holds
                    } else if gap < u.latch_best {
                        u.latch_best = gap;
                    } else if gap > u.latch_best + self.tun.latch_slip {
                        u.mode = OrderMode::Move;
                        u.move_target = u.resume_target.take();
                        u.latch_cd = 5.0;
                        continue;
                    }
                }
                // The charge survives FIRST CONTACT: weapons come in reach
                // ~1.5m before bodies meet, and clearing the burst there
                // would deliver the impact at a crawl. It ends when the
                // momentum is SPENT — once the burst has reached impact
                // speed, the mass's measured speed falling back below the
                // spent threshold means the crowd has bled it dry (a mutual
                // infantry impact dies in a stride; a plow through a thin
                // line keeps rolling). The clock only caps a sprint in the
                // OPEN (a whiffed burst gives up); once the burst is in the
                // enemy, the crowd decides — stopped or carried through.
                // ...and a burst that never even REACHED impact speed (a
                // fatigued run can sag under charge_min right at ignition)
                // is equally dead once it stands stopped in the crowd —
                // without this, the unarmed spent-check let CHARGING stick
                // through whole melees, bleeding charge drain.
                let spent = u.mass_advance < self.tun.charge_spent_speed
                    && (u.charge_at_speed || u.engaged > 0);
                let sustained = was_charging
                    && !spent
                    && u.charge_enabled
                    && (u.engaged > 0 || u.charge_time < self.tun.charge_window * 2.0);
                u.charging = sustained;
                if enemy_dead || (enemy_routing && !u.pursue) {
                    // Hold ground when they break, unless told to chase.
                    u.mode = OrderMode::Move;
                    u.move_target = u.resume_target.take();
                } else {
                    // The latch keeps the order LIVE through the fight, but it aims
                    // for CONTACT, not the enemy's center: a standoff just short of
                    // the enemy's front, so the two fronts meet and the centroids
                    // stay a formation-depth apart. Driving to the enemy anchor made
                    // the fronts pass THROUGH each other until the centers merged —
                    // and a merged center makes "face the enemy" spin, swirling the
                    // press. The leash (anchor law) still decides press depth.
                    let to = enemy_anchor - u.anchor;
                    let d = to.len();
                    let target = if d > 1.5 {
                        u.anchor + to * ((d - 1.5) / d)
                    } else {
                        u.anchor
                    };
                    u.move_target = Some(target);
                    if u.charge_enabled {
                        let charge_sp = (self.tun.base_speed
                            + (self.tun.charge_speed - self.tun.base_speed)
                                * crate::movement::fatigue_capacity(u.fatigue))
                            * u.speed_mult;
                        let dist = (enemy_anchor - u.anchor).len();
                        // The window opens at charge-distance from the enemy
                        // FRONT (the chase point is mass+8, and the mass sits
                        // half their depth behind the front — measuring there
                        // would start the burst after contact, i.e., never).
                        // The window can only START a burst, and only from an
                        // unengaged approach (you can't wind up a sprint in
                        // contact — this is what ends the charge in a formed
                        // melee), on real legs (the charge is paid in stamina,
                        // drained while charging), with the recovery clock at
                        // least half drained (no flickering at the budget's
                        // edge). Sustaining is the latch's job above.
                        let to_front = dist - standoff - enemy_edge_ext;
                        let start = engaged_frac < 0.05
                            && to_front < charge_sp * self.tun.charge_window
                            && u.fatigue > 0.3
                            && u.charge_time < self.tun.charge_window;
                        u.charging = sustained || start;
                    }
                }
                // Once contact begins the charge is over: the momentum has
                // been delivered bodily (the collision impacts carry it).
            }

            let u = &mut self.units[ui];
            // Skirmish screens never volunteer for melee: no halt-and-face —
            // their answer to contact is their legs.
            if engaged_frac > 0.06 && u.mode != OrderMode::Disengage && !u.evade_auto {
                u.quiet_ticks = 0;
                match u.mode {
                    OrderMode::Move => {
                        if u.pursue {
                            u.latch_best = f32::MAX; // reactive latch: revocable too
                            // Pursue setting: the advance latches onto what
                            // it meets, resuming the path afterward.
                            if u.resume_target.is_none() {
                                u.resume_target = u.move_target;
                            }
                            u.move_target = None;
                            u.mode = OrderMode::Attack(u.contact_unit);
                        }
                        // Otherwise ENGAGE posture: the live order keeps
                        // driving the anchor (facing threats, drifting);
                        // a unit without one stands and fights where it is.
                    }
                    OrderMode::Attack(_) => {}
                    OrderMode::Disengage => {}
                }
            } else if engaged_frac <= 0.01 {
                // Proactive auto-charge: a pursue-move latches onto any
                // enemy that comes within range of the advance (timed).
                if u.pursue
                    && u.mode == OrderMode::Move
                    && u.move_target.is_some()
                    && u.latch_cd <= 0.0
                {
                    if let Some((e, d)) = u.threat_unit {
                        // The latch only reaches what the legs can: enemies
                        // within a 5s RUN (fatigue-aware, class speed) — and
                        // attacks close at the double (effective_pace), so
                        // anything latched is reachable inside the 6s timer.
                        // An expiry now MEANS the prey is pulling away. (A
                        // flat 70m here used to latch a walking advance,
                        // time out, and sit in the cooldown across contact —
                        // mutual attack-moves never burst.)
                        let run_sp = (self.tun.base_speed
                            + (self.tun.run_speed - self.tun.base_speed)
                                * crate::movement::fatigue_capacity(u.fatigue))
                            * u.speed_mult;
                        if d < run_sp * 5.0 && !self.units[e as usize].routing {
                            let u = &mut self.units[ui];
                            if u.resume_target.is_none() {
                                u.resume_target = u.move_target;
                            }
                            u.mode = OrderMode::Attack(e);
                            u.latch_best = f32::MAX;
                            continue;
                        }
                    }
                }
                let u = &mut self.units[ui];
                u.quiet_ticks += 1;
                // Resume a stashed path only when actually idle — taking
                // the stash while a live target exists would DESTROY it
                // (the latch timeout needs it intact).
                if u.quiet_ticks == 90
                    && u.move_target.is_none()
                    && matches!(u.mode, OrderMode::Move)
                {
                    if let Some(t) = u.resume_target.take() {
                        u.move_target = Some(t);
                    }
                }
            }
        }
    }

    /// Per-soldier steering and measurement. Returns per-unit measures:
    /// (err_sum, stragglers, surging, effort, engaged, face_dev, alive_n, cx,
    /// cy, opp_press, opp_pressed_n)
    #[allow(clippy::type_complexity)]
    fn steer_soldiers(&mut self, dt: f32) -> Vec<(f32, usize, usize, f32, usize, f32, usize, f32, f32, f32, usize)> {
        let tun = self.tun;
        let Sim {
            units,
            positions,
            prev_positions,
            mass,
            mom_x,
            mom_y,
            press_x,
            press_y,
            fight_near,
            front_clear,
            facings,
            soldier_slot,
            fidget_offset,
            terrain,
            tick_count,
            alive,
            stun,
            target,
            fighting,
            hit_dir,
            hit_ttl,
            ..
        } = self;
        let tick_now = *tick_count;

        let mut measures = Vec::with_capacity(units.len());
        for u in units.iter() {
            let f = dir(u.facing);
            let r = Vec2::new(f.y, -f.x);
            let surge_sp = soldier_surge_speed(&tun, u);
            let keep_up_sp = pace_speed(&tun, u) + 0.5;
            let drifting_out = u.mode == crate::unit::OrderMode::Move
                && match (u.move_target, u.threat_bearing) {
                    (Some(t), Some(threat)) => {
                        let to = t - u.anchor;
                        crate::math::wrap_angle(to.y.atan2(to.x) - threat).abs() > 1.35
                    }
                    _ => false,
                };
            let holds_ground =
                u.mode != crate::unit::OrderMode::Disengage && !u.evade_auto && !drifting_out;
            // Othismos at the SOLDIER level: the front rank leans its body
            // onto its man instead of standing at weapon's length. This is
            // the source of the pressure chain — the frame slack only sets
            // how deep the slots sit; the men are what actually push.
            // OFFENSE vs DEFENSE: a unit with a forward intent (attack/move) is
            // on the offensive — its men step INTO the enemy and the cloth drapes
            // and wraps. A braced defender (no order) HOLDS: it fights what
            // reaches it and lets the breach dimple it BACK, it does not reach
            // forward to grab the column.
            // ...UNTIL broadly engaged. A line whose whole front has met the enemy
            // has arrived: it stops driving forward and HOLDS like a defender, so
            // its frame and slots go still and the men dress to them instead of
            // chasing a moving frame into a swirl. A NARROW contact (a wide line
            // overhanging a column) stays under the bar, so it keeps advancing its
            // hanging flanks to wrap. This is "advance to contact, then hold".
            // Advance to contact, then HOLD (men dress to a still frame) — UNLESS
            // we overhang the foe (a wide line on a column), where the hanging
            // flanks keep driving in to wrap. Equal clashes hold; overhangs wrap.
            let broadly_engaged = u.engaged as f32 > 0.06 * (u.alive_count.max(1) as f32);
            let advancing = (matches!(u.mode, crate::unit::OrderMode::Attack(_))
                || u.move_target.is_some())
                && (!broadly_engaged || u.overhung);
            let pressing = holds_ground && u.stance == crate::unit::Stance::Othismos && advancing;
            let reach_u = u.stats
                .weapons
                .iter()
                .fold(0.0f32, |m, w| m.max(w.reach));
            let strag_thresh = tun.straggler_dist.max(0.04 * u.depth().max(u.width()));
            let mut err_sum = 0.0f32;
            let mut stragglers = 0usize;
            let mut surging = 0usize;
            let mut effort = 0.0f32;
            let mut engaged = 0usize;
            let mut face_dev = 0.0f32;
            let mut alive_n = 0usize;
            let mut cx = 0.0f32;
            let mut cy = 0.0f32;
            // Received push OPPOSING the facing (the crowd's answer to the
            // unit's drive): the unit-level braking force, measured.
            let mut opp_press = 0.0f32;
            let mut opp_pressed_n = 0usize;

            // The WEAVE: invert the slot map (slot index -> soldier) so each man
            // can find the men netted to him — the slots beside and behind — and
            // pull toward holding rest spacing with them. This lets the formation
            // deform as a CONNECTED sheet (dimple around a penetration, drape and
            // wrap on the advance) instead of every man tugging a rigid grid
            // point on his own. The slot still anchors the sheet so it springs
            // back to shape.
            let mut soldier_at_slot = vec![usize::MAX; u.count];
            // Where this unit's fight IS (mean of its men in contact). On the
            // OFFENSIVE, men with no enemy in front drive on this — so the
            // overlapping flanks curl in and the cloth wraps the enemy.
            let (mut fcx, mut fcy, mut fcn) = (0.0f32, 0.0f32, 0.0f32);
            for s in 0..u.count {
                let i = u.start + s;
                if alive[i] == 1 {
                    let sl = soldier_slot[i] as usize;
                    if sl < u.count {
                        soldier_at_slot[sl] = i;
                    }
                    if fighting[i] == 1 {
                        fcx += positions[2 * i];
                        fcy += positions[2 * i + 1];
                        fcn += 1.0;
                    }
                }
            }
            let fight_centroid = (fcn > 0.0).then(|| Vec2::new(fcx / fcn, fcy / fcn));
            // The engaged FRONTAGE: the span of front-rank files actually in
            // contact. A man OUTSIDE [eng_lo, eng_hi] is a hanging flank with
            // nothing ahead of him — he wraps. If the WHOLE front rank is engaged
            // the span is full and nobody wraps: the line holds cohesion. This
            // scales to any number of foes (the span is just wherever contact is),
            // and an interior hole from a felled foe stays inside the span, so a
            // momentary gap doesn't peel the line open.
            let files_pp = u.files_eff.max(1);
            let (mut eng_lo, mut eng_hi) = (usize::MAX, 0usize);
            for f in 0..files_pp {
                let s = soldier_at_slot[f]; // rank-0 slot index == file
                if s != usize::MAX && fighting[s] == 1 {
                    if eng_lo == usize::MAX {
                        eng_lo = f;
                    }
                    eng_hi = f;
                }
            }

            for s in 0..u.count {
                let i = u.start + s;
                if alive[i] == 0 {
                    continue;
                }
                alive_n += 1;
                let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
                cx += p.x;
                cy += p.y;
                let op = (-(press_x[i] * f.x + press_y[i] * f.y)).max(0.0);
                opp_press += op;
                if op > 0.05 {
                    opp_pressed_n += 1;
                }

                // BODY, part 1 — carried momentum (p = m·v) moves the body
                // regardless of will: armed by impacts and by being struck
                // at speed, spent against the crowd, gone in ~a second.
                // The same law gives charges their punch, staggered men
                // their stumble-through, and fleeing men their escape.
                if mom_x[i] != 0.0 || mom_y[i] != 0.0 {
                    let v = 1.0 / mass[i].max(0.2);
                    positions[2 * i] += mom_x[i] * v * dt;
                    positions[2 * i + 1] += mom_y[i] * v * dt;
                    // A line that has ARRIVED and is holding bleeds carried momentum
                    // FAST, so a charge's punch doesn't coast the men straight through
                    // the enemy front (which scatters an equal clash). Overhanging
                    // wrappers and still-advancing units keep the normal ~0.8s coast.
                    let decay = if broadly_engaged && !u.overhung {
                        1.0 - (dt / 0.2)
                    } else {
                        1.0 - (dt / 0.8)
                    };
                    mom_x[i] *= decay;
                    mom_y[i] *= decay;
                    if mom_x[i] * mom_x[i] + mom_y[i] * mom_y[i] < 1.0 {
                        mom_x[i] = 0.0;
                        mom_y[i] = 0.0;
                    }
                }
                if stun[i] > 0.0 {
                    stun[i] -= dt; // staggered: no will, body coasts above
                    continue;
                }

                if u.routing {
                    // Broken men flee as a MOB, not a starburst. The whole unit
                    // shares ONE escape heading — away from the enemy mass taken
                    // from the UNIT centroid, so every man runs the same way. (A
                    // per-man "away from MY spot" gives each soldier a different
                    // radial heading, which is exactly what fans a rout across
                    // the whole field.) A man who has drifted wide of his fellows
                    // bends his run back toward the centroid, so the rout stays a
                    // clump that holds together and can later rally.
                    // Run for our OWN side — straight for the map edge (top or
                    // bottom) this unit deployed from, where campaign
                    // reinforcements also arrive. Broken men sprint for that
                    // baseline as one body; they don't wheel around the nearest
                    // enemy. The whole unit shares the one heading, so the rout
                    // runs as a clump, not a starburst.
                    let flee = Vec2::new(0.0, u.home_dir_y);
                    let to_c = u.centroid - p;
                    let cl = to_c.len();
                    let bend = if cl > 1.0 {
                        // up to half-weight toward the mob, ramped over ~15 m out
                        to_c * ((0.5 * (cl / 15.0).min(1.0)) / cl)
                    } else {
                        Vec2::ZERO
                    };
                    let run = flee + bend;
                    let run = run * (1.0 / run.len().max(1e-3));
                    let sp = surge_sp
                        * (terrain.speed_at(p)
                            * (1.0 - tun.micro_rough * (1.0 - crate::terrain::micro_rough(p))))
                        .max(0.0);
                    positions[2 * i] = p.x + run.x * sp * dt;
                    positions[2 * i + 1] = p.y + run.y * sp * dt;
                    let desired = run.y.atan2(run.x);
                    facings[i] = rotate_toward(facings[i], desired, tun.soldier_turn_rate * dt);
                    continue;
                }

                let aware_i = target[i] >= 0 && alive[target[i] as usize] == 1;
                let engaged_i = fighting[i] == 1 && aware_i;
                if engaged_i {
                    engaged += 1;
                }

                let local = slot_local(soldier_slot[i] as usize, u.files_eff, u.spacing);
                let slot = u.anchor + r * local.x + f * (-local.y);
                let mut to = slot - p;
                // Weave: blend the rigid-slot pull with where my NEIGHBOURS want
                // me — rest spacing from the men beside and behind. Undeformed,
                // the two agree (the net's rest shape IS the grid); when a
                // neighbour is shoved, I follow him, so a dimple or a drape
                // propagates through the sheet and the line never tears. The slot
                // share keeps it anchored so it recovers its shape.
                {
                    let si = soldier_slot[i] as usize;
                    let files = u.files_eff.max(1);
                    let (file, rank) = (si % files, si / files);
                    let (sx, sy) = (u.spacing.x, u.spacing.y);
                    let nbrs = [
                        (file > 0, si.wrapping_sub(1), r * sx),       // left: I sit at his +r
                        (file + 1 < files, si + 1, r * (-sx)),        // right
                        (rank > 0, si.wrapping_sub(files), f * (-sy)), // front: I sit behind him
                        (true, si + files, f * sy),                   // back
                    ];
                    let mut nsum = Vec2::ZERO;
                    let mut nn = 0.0f32;
                    for (ok, ns, off) in nbrs {
                        if !ok || ns >= u.count {
                            continue;
                        }
                        let j = soldier_at_slot[ns];
                        if j != usize::MAX {
                            nsum = nsum
                                + Vec2::new(prev_positions[2 * j], prev_positions[2 * j + 1])
                                + off;
                            nn += 1.0;
                        }
                    }
                    if nn > 0.0 {
                        let weave = u.stats.weave; // per-class formation coherence
                        let net_to = nsum * (1.0 / nn) - p;
                        to = to * (1.0 - weave) + net_to * weave;
                    }
                }
                let err = to.len();
                err_sum += err;
                if err > strag_thresh {
                    stragglers += 1;
                }
                let mut max_sp = if err > tun.surge_err_threshold {
                    surging += 1;
                    surge_sp
                } else {
                    keep_up_sp
                };
                // No two men run alike: each soldier has a personal TOP
                // speed (a fixed fraction of the surge ceiling). A walking
                // pace is below everyone's ceiling — the line stays dressed;
                // a running pace is above the slowest fifth's — they trail,
                // and the formation frays the longer it runs.
                max_sp = max_sp.min((0.62 + 0.44 * stagger01(i, 0xCAFE)) * surge_sp);
                let mut steer_to = to;
                // Idle fidget: a standing man drifts off slot and his glance
                // wanders (below, in the facing). Gated only on idle — no enemy
                // test — so there's no tighten/untighten as a foe nears; he
                // holds the drift until he marches or fights. tick/4 holds each
                // offset ~a third of a second.
                let idle = u.move_target.is_none() && u.engaged == 0
                    && hit_ttl[i] <= 0.0 && err < 0.6;
                // Only a MINORITY shift at any moment — a standing formation is
                // mostly crisp, a few men easing their weight off-slot while the
                // rest hold exactly. A per-man roll (re-cast each window) picks
                // who, so the unit never dissolves into uniform shimmer.
                let fidgeting = idle && stagger01(i * 7 + 5, tick_now / 4) > 0.65;
                fidget_offset[i] = if fidgeting {
                    let fx = stagger01(i * 3, tick_now / 4) - 0.5;
                    let fy = stagger01(i * 3 + 1, tick_now / 4) - 0.5;
                    let off = Vec2::new(fx, fy) * IDLE_FIDGET;
                    steer_to = to + off;
                    off // recorded so the re-form sort can subtract it (see field)
                } else {
                    Vec2::ZERO
                };
                // A man whose unit is fighting — or who is himself being
                // struck — closes to his own weapon's distance; nobody stands
                // being poked from a hand's-breadth beyond his reach.
                // TRAMPLE is the exception, and it is class × measured
                // velocity, no order or charge flag involved: a trampling
                // body whose unit is still moving at speed rides over the
                // man in his reach — a move order THROUGH a thin line
                // tramples by the same physics as a charge, and "arriving"
                // on a latched enemy is just the stall that drops the mass
                // below the threshold and turns the ride into a fight.
                // (Do NOT gate this on the body's own mom_x/mom_y: that
                // momentum re-arms on every fresh body slammed, so it
                // rewards target density — a dense block would sustain a
                // trample better than open order. The unit's measured
                // mass_advance can't be gamed that way: the crowd either
                // stopped the mass or it didn't.)
                let trampling = u.tramples() && u.mass_advance > tun.charge_spent_speed;
                if aware_i && holds_ground && !trampling && (u.engaged > 0 || hit_ttl[i] > 0.0) {
                    let t = target[i] as usize;
                    let tp = Vec2::new(positions[2 * t], positions[2 * t + 1]);
                    let tt = tp - p;
                    let d_t = tt.len() - 0.8; // body radii, roughly
                    // Graded combat initiative: the seek radius grows with
                    // the LOCAL fight density (comrades fighting within 6m).
                    // A man on a quiet wing keeps the tight 3.5m leash; a
                    // man beside the scrum reaches 6-9m and steps around the
                    // corner of the penetration — the cascade that wraps a
                    // line spreads at footspeed, link by link, and dies out
                    // where the fighting does. The empty-frontage flag is
                    // the anti-blender leash: nobody wades in through his
                    // own comrades' backs.
                    let r_seek = (3.5 + 0.6 * fight_near[i] as f32).min(9.0);
                    // Never seek toward a target closing at CHARGE speeds —
                    // you don't sprint into a gallop (you stand and brace) —
                    // but grinding melee speeds are fair game.
                    let tvx = positions[2 * t] - prev_positions[2 * t];
                    let tvy = positions[2 * t + 1] - prev_positions[2 * t + 1];
                    let closing = -(tvx * tt.x + tvy * tt.y) / (tt.len().max(0.01) * dt);
                    // Step onto a near enemy ONLY on the offensive — a braced
                    // defender does NOT reach forward to close the gap; it lets
                    // the enemy come and dimples BACK (the `advancing` gate).
                    if advancing && d_t > reach_u - 0.2 && d_t < r_seek && front_clear[i] == 1 && closing < 3.5 {
                        steer_to = tt;
                        max_sp = max_sp.min(keep_up_sp * 0.5);
                    } else if engaged_i {
                        // In range: fight in place. No slot-chase throttle — once
                        // a line is broadly engaged its FRAME is held still (see
                        // `broadly_engaged`), so the men dress to STABLE slots and
                        // there is nothing to dart toward; the old 0.25 throttle
                        // was a bandaid for a moving frame. (Impact momentum is
                        // separate REAL state — mom_x/mom_y — so a body that
                        // arrived at speed keeps driving until the crowd bleeds it.)
                        if pressing {
                            // Lean ON him: a slow sustained step into the
                            // target's body. Separation converts it into
                            // crowd pressure and the chain transmits it.
                            steer_to = tt;
                        }
                    }
                } else if advancing && holds_ground && !trampling && u.engaged > 0 {
                    // OFFENSE WRAP: a FRONT-rank man on a HANGING FLANK (outside the
                    // engaged frontage — nothing ahead of him) drives on where the
                    // fighting is, so the overlap curls inward and the cloth drapes
                    // around the enemy. A fully-engaged front rank has no hanging
                    // flank, so two matched lines just grind straight instead of
                    // curling into a blob; and a rigid wall (low weave) holds its
                    // shape. Front rank only: a buried man has friendlies ahead, so
                    // driving him forward rams the formation into itself.
                    let files = u.files_eff.max(1);
                    let (rank, file) = (soldier_slot[i] as usize / files, soldier_slot[i] as usize % files);
                    // Wrap only when the line markedly OVERHANGS its contact — the
                    // engaged frontage is well under two-thirds the line's width, so
                    // it's a column being enveloped, not an equal line merely
                    // drifting against a peer. Then the files OUTSIDE the engaged
                    // span (the genuine hanging flanks) curl in. Equal widths never
                    // trip it; a rigid wall (low weave) still won't curl.
                    let span = if eng_lo == usize::MAX { 0 } else { eng_hi - eng_lo + 1 };
                    let overhung = span >= 1 && span * 3 < files * 2;
                    let hanging = overhung && (file < eng_lo || file > eng_hi);
                    if rank == 0 && hanging && u.stats.weave > 0.3 {
                        if let Some(fc) = fight_centroid {
                            let to_fc = fc - p;
                            if to_fc.len() > reach_u {
                                steer_to = to_fc;
                                max_sp = max_sp.min(keep_up_sp * 0.5);
                            }
                        }
                    }
                }

                let micro = 1.0 - tun.micro_rough * (1.0 - crate::terrain::micro_rough(p));
                let ground = terrain.speed_at(p) * micro;
                if ground < 1.0 {
                    max_sp *= ground;
                }
                let rough = terrain.rough_at(p);
                if rough > 0.0 {
                    max_sp *= 1.0 - 0.5 * rough * stagger01(i, tick_now);
                }

                // A man does not SURGE past his slot. The slot — leashed to the
                // unit, a bit forward for the press — is his leash; once he has
                // reached it he fights IN PLACE rather than chasing a foe out of
                // the line. This is what keeps an ATTACKING formation dressed: it
                // advances to contact, then holds, exactly as a defender does
                // (whose men never had a forward drive to begin with). Catching up
                // from behind, dressing laterally, and dimpling BACK stay free —
                // only overrunning the front of one's own slot is denied.
                {
                    let fwd_slot = to.dot(f); // >0: slot ahead (catch up); <0: past it
                    let sf = steer_to.dot(f);
                    if fwd_slot < 0.0 && sf > 0.0 {
                        steer_to = steer_to - f * sf;
                    }
                }
                let mut v = steer_to * tun.soldier_gain;
                let vl = v.len();
                if vl > max_sp {
                    v = v * (max_sp / vl);
                }
                if vl > 0.2 {
                    effort += 1.0 - ground;
                }
                let mut np = Vec2::new(p.x + v.x * dt, p.y + v.y * dt);
                if ground <= 0.0 {
                    np = p + terrain.escape_dir(p) * (3.0 * dt);
                } else if terrain.speed_at(np) <= 0.0 {
                    let slide_x = Vec2::new(np.x, p.y);
                    let slide_y = Vec2::new(p.x, np.y);
                    np = if terrain.speed_at(slide_x) > 0.0 {
                        slide_x
                    } else if terrain.speed_at(slide_y) > 0.0 {
                        slide_y
                    } else {
                        p
                    };
                }
                positions[2 * i] = np.x;
                positions[2 * i + 1] = np.y;

                // Facing: a nearby enemy (turn to meet a threat even before he's
                // in reach, and even while the crowd shoves you), then the man who
                // just hit you, then where you're going. This is per-SOLDIER only
                // — the unit's commanded facing never changes, so a flanked block
                // doesn't wheel itself and override the player's order; its edge
                // men just turn outward to face who's on them.
                let desired_face = if aware_i {
                    let tp = Vec2::new(
                        positions[2 * target[i] as usize],
                        positions[2 * target[i] as usize + 1],
                    );
                    (tp - p).y.atan2((tp - p).x)
                } else if hit_ttl[i] > 0.0 {
                    hit_ttl[i] -= dt;
                    hit_dir[i]
                } else if err > 0.5 {
                    v.y.atan2(v.x)
                } else if idle {
                    // Standing easy: the glance drifts, so a line of facings is
                    // never machine-perfect (and never snaps back when a foe nears).
                    u.facing + (stagger01(i * 3 + 2, tick_now / 4) - 0.5) * IDLE_GLANCE
                } else {
                    u.facing
                };
                facings[i] = rotate_toward(facings[i], desired_face, tun.soldier_turn_rate * dt);
                face_dev += (wrap_angle(facings[i] - u.facing).abs() - tun.facing_tolerance).max(0.0);
            }
            measures.push((
                err_sum, stragglers, surging, effort, engaged, face_dev, alive_n, cx, cy,
                opp_press, opp_pressed_n,
            ));
        }
        measures
    }

    /// In contact: the anchor tracks the measured front (plus a small lean
    /// when ordered to press), and unit facing follows the threat-weighted
    /// circular mean of contact bearings, masked by adjacent friendlies.
    /// Contact FACING only — the anchor itself answers to one law (see
    /// `clamp_anchor_to_men`): it pursues the order, leashed to the men.
    fn contact_facing(
        &mut self,
        measures: &[(f32, usize, usize, f32, usize, f32, usize, f32, f32, f32, usize)],
        dt: f32,
    ) {
        let tun = self.tun;
        // Friendly masking sectors, computed against unit centers.
        let centers: Vec<(Vec2, f32, u32, usize)> = self
            .units
            .iter()
            .map(|u| (u.center(), 0.5 * u.width().max(u.depth()), u.team, u.alive_count))
            .collect();

        for ui in 0..self.units.len() {
            let (_, _, _, _, engaged, _f, alive_n, _, _, _, _) = measures[ui];
            let alive_n = alive_n.max(1);
            let engaged_frac = engaged as f32 / alive_n as f32;
            // Skip the idle 90%, BUT a unit with a live move/attack order still
            // faces where it's going even before contact — so it arrives squared
            // up on the enemy instead of sideways (it was only ever re-facing once
            // already engaged).
            if (engaged_frac <= 0.06 && self.units[ui].move_target.is_none())
                || self.units[ui].mode == OrderMode::Disengage
                || self.units[ui].evade_auto
            {
                continue;
            }

            // --- contact facing: masked circular mean ----------------------
            let mut hist = self.units[ui].contact_hist;
            let (my_center, my_ext, my_team, _) = centers[ui];
            for (vi, &(c, ext, team, alive_v)) in centers.iter().enumerate() {
                if vi == ui || team != my_team || alive_v == 0 {
                    continue;
                }
                let to = c - my_center;
                if to.len() < my_ext + ext + 25.0 {
                    let b = bearing_bucket(to.y.atan2(to.x));
                    hist[b] = 0.0;
                    hist[(b + 1) % 12] = 0.0;
                    hist[(b + 11) % 12] = 0.0;
                }
            }
            let mut sum = Vec2::ZERO;
            let mut weight = 0.0;
            for (k, &w) in hist.iter().enumerate() {
                sum = sum + dir(bucket_bearing(k)) * w;
                weight += w;
            }
            // A live move order VOTES on the facing alongside the measured
            // contacts — intent must be able to out-argue a self-reinforcing
            // fight (face north -> press north -> more north contact), or a
            // surrounded unit can never turn toward its breakout.
            if let (OrderMode::Move, Some(t)) = (self.units[ui].mode, self.units[ui].move_target) {
                let v = t - self.units[ui].anchor;
                if v.len() > 4.0 {
                    let w = weight * 0.8 + 2.0;
                    sum = sum + v * (w / v.len());
                    weight += w;
                }
            }
            // Rotate only on a DECISIVE contact direction. Near-opposite
            // attacks cancel in the mean — then the frame holds still and the
            // per-soldier reactive facing splits the men both ways (the spec).
            let decisive = weight > 4.0 && sum.len() > 0.45 * weight;
            let u = &self.units[ui];
            let broadly_engaged = engaged_frac > 0.06; // CURRENT-tick contact (from measures)
            let desired = if broadly_engaged {
                // ARRIVED: hold the heading we squared up with on the approach.
                // Re-aiming at the enemy while broadly engaged is the swirl — once
                // the lines drift off-axis, each unit chasing the other's center
                // makes the whole engagement ORBIT. Hold the axis and grind.
                None
            } else if let Some(t) = u.move_target {
                // Approaching: face the target so we arrive squared up on the enemy
                // (off-axis attacks used to fight sideways).
                let v = t - u.center();
                (v.len() > 4.0).then(|| v.y.atan2(v.x))
            } else if decisive {
                // No order (a standing defender): face where the fighting is.
                Some(sum.y.atan2(sum.x))
            } else {
                None
            };
            if let Some(desired) = desired {
                let u = &mut self.units[ui];
                let diff = wrap_angle(desired - u.facing);
                if diff.abs() > 0.35 {
                    let top = soldier_surge_speed(&tun, u);
                    let geom = tun.wheel_speed_factor * top / u.pivot_radius().max(1.0);
                    // A unit fighting for its life turns regardless of how
                    // ragged it is — the breakout cannot wait for dressing.
                    let throttle = crate::math::lerp(tun.min_turn_frac, 1.0, u.cohesion)
                        .max(if decisive { 0.0 } else { 0.6 });
                    let center = u.center();
                    u.facing = rotate_toward(u.facing, desired, geom * throttle * dt);
                    u.anchor = center + dir(u.facing) * (0.5 * u.depth());
                    u.pivoting = true; // slots keep relabeling while we wheel
                }
            }
        }
    }

    fn integrate_units(
        &mut self,
        measures: &[(f32, usize, usize, f32, usize, f32, usize, f32, f32, f32, usize)],
        dt: f32,
    ) {
        let tun = self.tun;
        use std::f32::consts::PI;
        for (
            u,
            &(err_sum, stragglers, _surging, effort, engaged, face_dev, alive_n, cx, cy, opp_press, opp_pressed_n),
        ) in
            self.units.iter_mut().zip(measures)
        {
            let n = alive_n.max(1) as f32;
            let c0 = u.centroid;
            u.centroid = Vec2::new(cx / n, cy / n);
            // Measured momentum of the MASS: centroid forward speed, smoothed
            // over ~0.4s to ride out collision jitter and casualty shifts.
            let v_fwd = (u.centroid - c0).dot(dir(u.facing)) / dt;
            u.mass_advance += (v_fwd - u.mass_advance) * (1.0 - (-dt / 0.4f32).exp());
            let _ = opp_pressed_n;
            u.counter_press = opp_press / n;

            // THE ANCHOR LAW: the frame always pursues the order, but it is
            // leashed to the men's measured center of mass. Out of combat
            // the slack is generous (jams merely hold it back); in combat it
            // is tight — the frame sits where the men actually are, so a
            // pushed-back front drags its slots with it (losing the push)
            // and a winning push lets the frame advance (walking them back).
            // Othismos with an order into the fight is the ONE deliberate
            // bias: extra forward slack scaled by depth — the rear ranks'
            // weight, expressed as slots the men keep pressing to reach.
            let fighting_frac = engaged as f32 / n;
            // A charging frame is exempt only while the MASS still moves at
            // impact speed (no polite pre-braking); the moment the crowd
            // bleeds it below charge grade, the frame obeys the law like
            // everyone else — the exemption ends when the momentum does,
            // by measurement, not by an engagement threshold.
            let charge_approach = u.charging && u.mass_advance > tun.charge_min_speed;
            if !u.routing && !charge_approach {
                let f = dir(u.facing);
                let expected = u.anchor + f * (-0.5 * u.depth());
                let lag = (expected - u.centroid).dot(f);
                // Slack tightens CONTINUOUSLY with engagement: a fresh
                // contact lets the frame keep pressing in (driving more men
                // into reach) until about a third of the unit is fighting —
                // the natural depth of a committed front. A binary gate here
                // regulates battles down to a bloodless standoff.
                let press = u.stance == crate::unit::Stance::Othismos
                    && (matches!(u.mode, OrderMode::Attack(_)) || u.move_target.is_some());
                // ONE knob: stance. Attack, arrived-move, and standing
                // defender all obey the same slack — othismos converts
                // depth into press, fence holds at weapon's length.
                let tight = if press {
                    let ranks = (u.alive_count / u.files_eff.max(1)).min(12) as f32;
                    0.6 + 0.25 * ranks
                } else {
                    0.8
                };
                // Binary by engagement, resolved by STANCE: fence fights at
                // weapon's length (tight), othismos presses rank-deep (its
                // tight is wide). Disengage always runs on loose slack —
                // fleeing slots must LEAD the men out.
                let engaged_now = fighting_frac > 0.05 && u.mode != OrderMode::Disengage;
                let leash = if engaged_now { tight } else { 0.6 * u.depth() + 5.0 };
                if lag > leash {
                    u.anchor = u.anchor + f * (-(lag - leash));
                    // Ordered to stand or advance yet measurably walked
                    // back: the precise involuntary-displacement signal.
                    if fighting_frac > 0.1 && u.mode != OrderMode::Disengage {
                        let alpha = 1.0 - (-dt / 2.0f32).exp();
                        u.losing_push += ((lag - leash) / dt - u.losing_push) * alpha;
                    }
                }
            } else if u.routing {
                // The frame follows the fleeing mob (so a rally has a unit
                // to re-form around).
                u.anchor = u.centroid + dir(u.facing) * (0.5 * u.depth());
                u.frame_speed = 0.0;
            }

            let mean_err = err_sum / n;
            let extent = u.depth().max(u.width());
            let scale = (0.5 * extent).max(tun.disorder_norm_spacings * u.spacing.x.max(0.25));
            let norm = (mean_err / scale).min(1.0);
            let strag_frac = stragglers as f32 / n;
            let facing_term = ((face_dev / n) / (PI - tun.facing_tolerance)).min(1.0);
            let observed =
                (0.6 * norm + 0.25 * facing_term + 0.15 * strag_frac).clamp(0.0, 1.0);

            if u.reform_timer > 0.0 {
                u.reform_timer -= dt;
            }
            let mut tau = if observed > u.disorder {
                tun.disorder_rise_tau
            } else {
                tun.disorder_fall_tau / (0.5 + u.training)
            };
            if u.reform_timer > 0.0 && observed <= u.disorder {
                tau *= 0.45; // the sergeants are shouting
            }
            let alpha = 1.0 - (-dt / tau).exp();
            u.disorder += (observed - u.disorder) * alpha;
            u.cohesion = (-tun.cohesion_k * u.disorder).exp();

            u.engaged = engaged;
            let engaged_frac = engaged as f32 / n;

            // Surging is drain-free by design: it is a CORRECTION the
            // controller orders, not a pace anyone chose. The chosen
            // exertions drain, and the kit scales the bill (drain_mult):
            // armor is paid for in wind.
            let mut drain = 0.0f32;
            if u.effective_pace() == Pace::Run && u.frame_speed > tun.base_speed * 1.05 {
                drain += tun.run_drain;
            }
            drain += tun.terrain_drain * (effort / n);
            drain += tun.combat_drain * engaged_frac;
            // Gated on the MEN's measured motion (not the frame's — the
            // leash pins the frame even while the mass rolls): the burst is
            // paid while the mass actually sprints. A charge pinned dead in
            // a bog drains as a fight, not as a gallop.
            if u.charging && u.mass_advance > tun.base_speed * 1.05 {
                drain += tun.charge_drain;
            }
            drain *= u.drain_mult;
            if u.frame_speed < 0.1 && u.move_target.is_none() && engaged == 0 {
                drain -= tun.rest_recover;
            }
            u.fatigue = (u.fatigue - drain * dt).clamp(0.0, 1.0);

            // Contact memory and casualty rate decay.
            for w in &mut u.contact_hist {
                *w *= 0.96;
            }
            u.recent_casualties *= 1.0 - (dt / 8.0);
        }
    }
}
