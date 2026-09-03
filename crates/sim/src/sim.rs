//! Sim orchestration: world state, spawning, orders, and the tick pipeline.
//!
//! Tick order:
//!   snapshot prev positions -> order delivery + reflexes -> unit motion ->
//!   contact-mode anchor/facing adjustments -> slot re-forming ->
//!   soldier steering (+ measurement) -> body collision -> combat ->
//!   unit-state integration (disorder, cohesion, stamina, contact decay).

use crate::class::{class_stats, UnitClass, UnitClassId};
use crate::combat::run_combat;
use crate::force_trace::{ForceChannel, Tracer};
#[cfg(feature = "force-trace")]
use crate::force_trace::{ForceTrace, ForceTraceFilter};
use crate::grid::SpatialHash;
use crate::math::{dir, rotate_toward, wrap_angle, Vec2};
use crate::movement::{soldier_surge_speed, update_unit_motion};
use crate::separation::apply_separation;
use crate::steer::{steer_soldiers, UnitMeasure, REFORM_COH};
use crate::terrain::Terrain;
use crate::tunables::{Pace, Tunables, DT};
use crate::unit::{reassign_slots, reform_slots, slide_halted_frames, OrderMode, Unit};
use contract::Pcg32;

pub struct SpawnSpec {
    pub anchor: Vec2,
    pub facing: f32,
    pub count: usize,
    pub files: Option<usize>,
    pub class: UnitClassId,
    pub stats: UnitClass,
    pub look: u32,
    pub team: u32,
}

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
    /// Crowd squeeze per soldier (EMA of WEAVE spring load): the friendly net
    /// crushing him plus the enemy reach-spring shoving him back. Measured off
    /// the weave, never written by gameplay. Kills evade, drives the vice.
    pub pressure: Vec<f32>,
    /// EMA of the net crush VECTOR — the friendly squeeze plus the enemy reach-
    /// spring. The vice (scalar minus this) and the ram drag read it.
    pub(crate) press_x: Vec<f32>,
    pub(crate) press_y: Vec<f32>,
    pub attack_cd: Vec<f32>,
    /// Impact momentum carried by the body (kg·m/s, world vector): set when
    /// a charge lands, spent against the crowd, zeroed by stagger. THIS is
    /// what makes cavalry punch INTO a line instead of stopping at its rim —
    /// and a heavy infantryman at a dead sprint carries a stride of it too.
    pub mom_x: Vec<f32>,
    pub mom_y: Vec<f32>,
    /// Weapon currently in hand (index into the class weapon list).
    pub cur_weapon: Vec<u8>,
    /// This rider's lance has landed its one couched strike and SNAPPED — he is
    /// down to his sword until he breaks clear and couches a fresh one (reset with
    /// the impact quota, on `enemy_contact` clearing). One skewer per charge, like
    /// the one impact fell — which is what makes a single charge a single shock.
    pub(crate) charge_wpn_spent: Vec<bool>,
    /// Seconds left in this soldier's weapon swap (no strikes meanwhile).
    pub switch_cd: Vec<f32>,
    pub stun: Vec<f32>,
    /// Seconds left being RUN DOWN by a committed charge: the man is bowled and
    /// staggered, so his weave (will to hold formation) is suppressed and his
    /// neighbours treat him as a gap — the charge punches a hole that heals once
    /// it bogs. Distinct from stun (no felling/lethality coupling).
    pub(crate) trampled: Vec<f32>,
    /// Seconds left in the visible missile loosing beat.
    pub loosing_ttl: Vec<f32>,
    /// Current melee engagement (enemy soldier index, -1 = none).
    /// Set at awareness range (~6m): drives approach facing.
    pub target: Vec<i32>,
    pub attacked_by: Vec<u16>,
    // --- Jacobi combat staging (M-equivariance) ---------------------------
    // A tick's strikes do not mutate the field as they iterate; they ACCUMULATE
    // here and are applied together after the whole combat pass. In place, the
    // round-robin's index order (team 0 holds the lower indices) was a systematic
    // first-mover advantage — a low-index man killed / stunned / shoved his foe
    // before that foe acted the same tick, robbing the simultaneous strike back.
    // That index handedness is the engine's directional bias (see
    // specs/directional-bias.md). Staged, mutual blows are mutual.
    pub(crate) dmg_acc: Vec<f32>,
    pub(crate) mount_dmg_acc: Vec<f32>,
    /// Of the melee damage staged on each victim this tick, the part dealt by the
    /// CHARGE WEAPON (the lance) or a charge-impale. Measurement only: the apply
    /// pass reads it to label a melee kill as a charge kill vs a grind kill (the
    /// sword is always the grind, even while the horse is still rolling).
    pub(crate) dmg_from_charge: Vec<f32>,
    /// How many men this charger has ridden down THIS charge — capped at
    /// `impact_kill_cap`; beyond it the horse only bowls the next over. Refreshes
    /// only when the body breaks CLEAR of the enemy (see `enemy_contact`), not
    /// when it bogs in place — so a stuck horse can't re-impact the press.
    pub(crate) impact_kill_count: Vec<u32>,
    /// Did this body overlap an enemy body last tick? Carries across ticks: an
    /// impact is one event per sustained contact, re-earned only after breaking
    /// clear, so a lingering walk-in can't out-impact a fast charge-through.
    pub(crate) enemy_contact: Vec<bool>,
    /// Hit-shove deltas (2·n), summed over the tick's strikes.
    pub(crate) push_acc: Vec<f32>,
    /// 1 = the engaged enemy is within actual weapon reach. Reflexes (halt,
    /// drift tracking, drain) key on THIS — being able to see an enemy is
    /// not being in a fight.
    pub fighting: Vec<u8>,
    /// Cached by the previous combat pass: at least one soldier had
    /// `fighting == 1`. This lets pre-motion contact refresh skip peaceful
    /// 30k-soldier ticks without guessing from unit-level `engaged`, which
    /// can legitimately be zero for the reach-asymmetric victim.
    pub(crate) has_fighting: bool,
    /// Same-unit comrades FIGHTING within ~6m (clamped at 10): the local
    /// fight density that licenses a soldier's combat initiative. A man on
    /// a quiet wing reads 0; a man beside the scrum reads high — and his
    /// seek radius grows with it (cascading envelopment).
    pub fight_near: Vec<u8>,
    /// Surface gap to the nearest living enemy body (f32::MAX when none in
    /// awareness range), written by the combat targeting scan each tick.
    pub nearest_enemy_d: Vec<f32>,
    /// That enemy's soldier index (-1 when none) — the blade-lock tangent
    /// reference for the fighting-tempo cap.
    pub nearest_enemy: Vec<i32>,
    /// 1 = the bearing to this soldier's target is clear of friendly bodies
    /// (within 1.5m, ±40°). The anti-blender leash: rank-3 men behind
    /// comrades may NOT wade in regardless of seek radius.
    pub front_clear: Vec<u8>,
    /// SITUATIONAL AWARENESS, 0..1: how well this man sees the foe he'd face. His
    /// line to the threat is blocked by the comrades stacked between him and it —
    /// each one halves what he perceives — so a front/edge man (clear line) is fully
    /// aware and turns to meet a flanker, while a man BURIED in the block can't see
    /// it coming and holds his frontage. This GATES the re-face (a gradient, not an
    /// edge/interior flag): it is why a flank charge breaks into the soft middle.
    pub awareness: Vec<f32>,
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
    /// The two most recent ticks' TOTAL displacement (start -> final,
    /// separation solver included) — the true trajectory the idle settle
    /// damp watches for SELF-reversal; see the capture in `tick`.
    pub(crate) last_disp_x: Vec<f32>,
    pub(crate) last_disp_y: Vec<f32>,
    /// ~0.5s EMA of the total displacement — the sustained drift. An
    /// oscillation has a step but no drift; a steady push has both.
    pub(crate) ema_disp_x: Vec<f32>,
    pub(crate) ema_disp_y: Vec<f32>,
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
    #[cfg(feature = "force-trace")]
    pub force_trace: ForceTrace,
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
            press_x: Vec::new(),
            press_y: Vec::new(),
            attack_cd: Vec::new(),
            mom_x: Vec::new(),
            mom_y: Vec::new(),
            cur_weapon: Vec::new(),
            charge_wpn_spent: Vec::new(),
            switch_cd: Vec::new(),
            stun: Vec::new(),
            trampled: Vec::new(),
            loosing_ttl: Vec::new(),
            target: Vec::new(),
            attacked_by: Vec::new(),
            dmg_acc: Vec::new(),
            mount_dmg_acc: Vec::new(),
            dmg_from_charge: Vec::new(),
            impact_kill_count: Vec::new(),
            enemy_contact: Vec::new(),
            push_acc: Vec::new(),
            fighting: Vec::new(),
            has_fighting: false,
            fight_near: Vec::new(),
            nearest_enemy_d: Vec::new(),
            nearest_enemy: Vec::new(),
            front_clear: Vec::new(),
            awareness: Vec::new(),
            hit_dir: Vec::new(),
            hit_ttl: Vec::new(),
            kin_vx: Vec::new(),
            kin_vy: Vec::new(),
            last_disp_x: Vec::new(),
            last_disp_y: Vec::new(),
            ema_disp_x: Vec::new(),
            ema_disp_y: Vec::new(),
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
            #[cfg(feature = "force-trace")]
            force_trace: ForceTrace::new(),
        }
    }

    #[cfg(feature = "force-trace")]
    pub fn clear_force_trace(&mut self) {
        self.force_trace.clear();
    }

    #[cfg(feature = "force-trace")]
    pub fn set_force_trace_filter(&mut self, filter: ForceTraceFilter) {
        self.force_trace.set_filter(filter);
    }

    #[cfg(feature = "force-trace")]
    pub fn force_trace_steering_residuals(&self, tick: u64) -> Vec<(usize, Vec2)> {
        let mut sums = vec![Vec2::ZERO; self.soldier_count()];
        for record in self.force_trace.records() {
            if record.tick == tick && record.channel.is_steering() {
                sums[record.soldier] = sums[record.soldier] + record.vec;
            }
        }
        let mut out = Vec::new();
        for i in 0..self.soldier_count() {
            if self.alive[i] == 0 {
                continue;
            }
            let actual = Vec2::new(self.kin_vx[i] * DT, self.kin_vy[i] * DT);
            out.push((i, sums[i] - actual));
        }
        out
    }

    pub fn soldier_count(&self) -> usize {
        self.facings.len()
    }

    pub fn soldier_pos(&self, i: usize) -> Vec2 {
        Vec2::new(self.positions[2 * i], self.positions[2 * i + 1])
    }

    /// The VICE on soldier `i` (m/s of spring load): scalar crush minus the net
    /// push vector. A man squeezed equally from opposing sides has a large
    /// scalar crush but a near-zero net vector — that gap is the vice, and it is
    /// what pins his arms (combat reads it). A man shoved from one side has
    /// scalar ≈ |net| and so feels no vice.
    pub fn soldier_vice(&self, i: usize) -> f32 {
        let net = (self.press_x[i] * self.press_x[i] + self.press_y[i] * self.press_y[i]).sqrt();
        (self.pressure[i] - net).max(0.0)
    }

    /// Distance from soldier `i` to its currently assigned slot.
    pub fn slot_error(&self, i: usize) -> f32 {
        let u = &self.units[self.soldier_unit[i] as usize];
        (u.slot_world(self.soldier_slot[i] as usize) - self.soldier_pos(i)).len()
    }

    /// Spawn a fully resolved unit in perfect formation. `anchor` is the
    /// front-center; omitted frontage comes from the class's default depth.
    pub fn spawn(&mut self, spec: SpawnSpec) -> usize {
        let SpawnSpec {
            anchor,
            facing,
            count,
            files,
            class,
            stats,
            look,
            team,
        } = spec;
        let files_bounds = Unit::files_bounds(count);
        let files = files
            .unwrap_or_else(|| count.div_ceil(stats.default_depth.max(1)))
            .clamp(*files_bounds.start(), *files_bounds.end());
        let unit_index = self.units.len();
        // Which way home lies: the half of the field this unit deploys in fixes
        // the edge it will flee to if broken (the same edge campaign
        // reinforcements enter from). A sign, not a coordinate, so a unit shoved
        // past its own edge still flees outward, not back into the fight.
        let map_mid_y = self.terrain.origin.y + 0.5 * self.terrain.h as f32 * self.terrain.cell;
        let home_dir_y = if anchor.y >= map_mid_y { 1.0 } else { -1.0 };
        let mut unit = Unit {
            class,
            render_look: look,
            stats,
            pace_mult: stats.pace_mult,
            accel_mult: stats.accel_mult,
            start: self.soldier_count(),
            count,
            files: files.max(1),
            files_eff: files.max(1),
            path: Vec::new(),
            path_idx: 0,
            waiting: false,
            spacing: stats.spacing,
            anchor,
            facing,
            frame_speed: 0.0,
            cruise: 0.0,
            brace_ramp: 0.0,
            move_target: None,
            pending_target: None,
            pending_mode: OrderMode::Move,
            pending_timer: 0.0,
            pending_total: 0.0,
            pace: Pace::Walk,
            stamina: 1.0,
            training: stats.training.clamp(0.0, 1.0),
            team,
            home_dir_y,
            disorder: 0.0,
            cohesion: 1.0,
            pivoting: false,
            mode: OrderMode::Move,
            charge_enabled: stats.charge,
            charging: false,
            fear_adapt: 0.0,
            charge_time: 0.0,
            charge_at_speed: false,
            fight_drain_mult: stats.fight_drain_mult,
            move_drain_mult: stats.move_drain_mult,
            resume_target: None,
            alive_count: count,
            deaths_since_reform: 0,
            deep_beat_dead_mark: 0,
            engaged: 0,
            contact_hist: [0.0; 12],
            contact_unit: 0,
            quiet_ticks: 0,
            disengage_reform_pending: false,
            recent_casualties: 0.0,
            lost_impact: 0,
            lost_charge_melee: 0,
            lost_grind_melee: 0,
            lost_missile: 0,
            lost_post_rout: 0,
            ammo: 0,
            missile_override: None,
            fire_at_will: true,
            evade_auto: false,
            morale: 0.7 + 0.3 * stats.training.clamp(0.0, 1.0),
            morale_ceiling: 1.0,
            routing: false,
            recent_missiles: 0.0,
            losing_push: 0.0,
            ram_press: 0.0,
            foe_ranks: 0.0,
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

            order_queue: Vec::new(),
        };
        for s in 0..count {
            let p = unit.slot_world(s);
            self.positions.push(p.x);
            self.positions.push(p.y);
            self.facings.push(facing);
            self.health.push(stats.health);
            self.mass.push(stats.mass);
            self.radius.push(stats.soldier_radius);
            self.mounted.push(stats.mounted as u8);
            self.mount_health.push(stats.mount_health);
            self.pressure.push(0.0);
            self.press_x.push(0.0);
            self.press_y.push(0.0);
            self.attack_cd.push(0.0);
            self.mom_x.push(0.0);
            self.mom_y.push(0.0);
            self.cur_weapon.push(
                stats
                    .weapons
                    .iter()
                    .position(|weapon| !weapon.is_charge())
                    .unwrap_or(0) as u8,
            );
            self.charge_wpn_spent.push(false);
            self.switch_cd.push(0.0);
            self.stun.push(0.0);
            self.trampled.push(0.0);
            self.loosing_ttl.push(0.0);
            self.target.push(-1);
            self.attacked_by.push(0);
            self.fighting.push(0);
            self.fight_near.push(0);
            self.nearest_enemy_d.push(f32::MAX);
            self.nearest_enemy.push(-1);
            self.front_clear.push(1);
            self.awareness.push(1.0);
            self.hit_dir.push(0.0);
            self.hit_ttl.push(0.0);
            self.kin_vx.push(0.0);
            self.kin_vy.push(0.0);
            self.alive.push(1);
            self.soldier_unit.push(unit_index as u32);
            self.soldier_slot.push(s as u32);
            self.fidget_offset.push(Vec2::ZERO);
        }
        self.max_radius = self.max_radius.max(stats.soldier_radius);
        if let Some(missile) = crate::missiles::missile_spec(class) {
            unit.ammo = missile.ammo * count as u32;
        }
        unit.evade_auto = matches!(class, UnitClassId::Skirmishers | UnitClassId::HorseArchers);
        self.units.push(unit);
        unit_index
    }

    /// Convenience for test-owned formations with custom spacing and drill.
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
        let original_stats = class_stats(UnitClassId::LightSpear);
        let stats = UnitClass {
            pace_mult: 1.0,
            accel_mult: 1.0,
            soldier_radius: self.tun.soldier_radius,
            mass: 1.0,
            mounted: false,
            spacing,
            health: 1.0,
            mount_health: 0.0,
            training,
            charge: false,
            fight_drain_mult: 1.0,
            move_drain_mult: 1.0,
            ..original_stats
        };
        let idx = self.spawn(SpawnSpec {
            anchor,
            facing,
            count,
            files: Some(files),
            class: UnitClassId::LightSpear,
            stats,
            look: UnitClassId::LightSpear as u32,
            team,
        });
        self.units[idx].stats = original_stats;
        idx
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
        self.spawn(SpawnSpec {
            anchor,
            facing,
            count,
            files: None,
            class,
            stats,
            look: class as u32,
            team,
        })
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
            if matches!(
                u.class,
                UnitClassId::Skirmishers | UnitClassId::HorseArchers
            ) {
                u.evade_auto = on;
            }
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
        // A MOVE/DISENGAGE onto impassable ground (a rock, water) resolves to the
        // nearest standable point — men can't stand inside a cliff, and a target
        // they can never reach is chased forever (steering at the raw point once
        // the path exhausts), so the frame never arrives and the men never re-seat
        // (cohesion stays low). An ATTACK tracks a live enemy anchor refreshed each
        // tick, so it is not clamped here.
        let target = if matches!(mode, OrderMode::Attack(_)) {
            target
        } else {
            let from = self.units.get(unit).map_or(target, |u| u.anchor);
            crate::path::clamp_to_passable(&self.terrain, from, target)
        };
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
        // An attack has no commanded final facing: the unit faces wherever the
        // chase takes it — squared up on the enemy, refreshed each tick as the
        // move_target tracks the foe. A stale final_facing from a prior order
        // would otherwise freeze the destination ghost (and the arrival pivot)
        // to the heading the unit happened to hold when the order was given.
        if let Some(u) = self.units.get_mut(unit) {
            u.final_facing = None;
        }
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
        let files_bounds = Unit::files_bounds(self.units[unit].count);
        let files = files.clamp(*files_bounds.start(), *files_bounds.end());
        let u = &mut self.units[unit];
        u.files = files;
        u.files_eff = files;
        u.reform_timer = u.reform_timer.max(8.0);
        reassign_slots(
            &self.units[unit],
            &self.positions,
            &self.fidget_offset,
            &self.alive,
            &mut self.soldier_slot,
        );
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
        self.reseat(unit, 8.0);
    }

    /// Gather the unit: re-seat the formation frame on the men's current center
    /// of mass, reassign slots to the clean grid, and accelerate cohesion
    /// recovery (`reform_timer`). The pull-yourself-together a unit does on an
    /// explicit Reform — and implicitly when a BLOBBED unit accepts a relocate
    /// order, so a diving trampler told to ride off re-forms around a clean grid
    /// instead of chasing the stale, scattered slots the dive left it.
    fn reseat(&mut self, unit: usize, gather_secs: f32) {
        let u = &mut self.units[unit];
        u.reform_timer = gather_secs;
        // Re-seat the frame on the men's actual center of mass.
        u.anchor = u.centroid + dir(u.facing) * (0.5 * u.depth());
        reassign_slots(
            &self.units[unit],
            &self.positions,
            &self.fidget_offset,
            &self.alive,
            &mut self.soldier_slot,
        );
    }

    /// Give a unit a TEST-OWNED missile armament, overriding its per-class
    /// `missile_spec` — for scenario tests built on FAKE reference units, so a
    /// real archer's balance can't leak in. Resets ammo to the new spec.
    pub fn set_missile_spec(&mut self, unit: usize, spec: crate::missiles::MissileSpec) {
        if let Some(u) = self.units.get_mut(unit) {
            u.ammo = spec.ammo * u.count as u32;
            u.missile_override = Some(spec);
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
        #[cfg(feature = "force-trace")]
        let mut tick_force_records = Vec::new();
        let mut tracer = Tracer::new(
            #[cfg(feature = "force-trace")]
            &mut tick_force_records,
            self.tick_count,
        );

        // Last tick's TOTAL displacement (start -> final, separation solver
        // included) — the true trajectory, where kin_v* deliberately holds
        // only the steer motion. The idle settle damp reads this: a limit
        // cycle that closes through the solver (steer in, get shoved out)
        // reverses HERE every tick while the steer-only velocity never does,
        // so a damp watching kin_v was blind to it by construction (the
        // friendly-overlap and corridor rest buzz).
        self.last_disp_x.resize(n, 0.0);
        self.last_disp_y.resize(n, 0.0);
        self.ema_disp_x.resize(n, 0.0);
        self.ema_disp_y.resize(n, 0.0);
        {
            // Soldiers appended since last tick (reinforcements) have no
            // snapshot yet — update the tracked prefix, leave the newcomers'
            // history at the zeroed resize default instead of skipping the
            // whole pass for one tick.
            let tracked = (self.prev_positions.len() / 2).min(n);
            // ~0.5s horizon: slow enough to average out a 2-tick solver
            // cycle AND a ~1s standing sway, fast enough to register a real
            // push within a stride.
            let a = DT / 0.5;
            for i in 0..tracked {
                self.last_disp_x[i] = self.positions[2 * i] - self.prev_positions[2 * i];
                self.last_disp_y[i] = self.positions[2 * i + 1] - self.prev_positions[2 * i + 1];
                self.ema_disp_x[i] += (self.last_disp_x[i] - self.ema_disp_x[i]) * a;
                self.ema_disp_y[i] += (self.last_disp_y[i] - self.ema_disp_y[i]) * a;
            }
        }

        // Snapshot for velocity measurement (charges, anchor drift).
        self.prev_positions.resize(2 * n, 0.0);
        self.prev_positions.copy_from_slice(&self.positions);

        self.mark_at_ease(); // current centroids; before stance/fidget/slot logic reads it
        self.refresh_contact_engagement();
        self.deliver_orders_and_reflexes(dt);
        self.run_skirmish_evade();
        self.navigate_units();

        for (unit_index, u) in self.units.iter_mut().enumerate() {
            let ground = self.terrain.speed_at(u.anchor).max(0.15);
            let a0 = u.anchor;
            let facing0 = u.facing;
            update_unit_motion(&tun, u, dt, ground);
            let frame_delta = u.anchor - a0;
            if frame_delta.x != 0.0 || frame_delta.y != 0.0 {
                tracer.record(
                    u.start,
                    unit_index,
                    ForceChannel::UnitFrame,
                    None,
                    frame_delta,
                    "unit_anchor_motion",
                );
            }
            if u.facing != facing0 {
                tracer.record(
                    u.start,
                    unit_index,
                    ForceChannel::UnitFacing,
                    None,
                    Vec2::new(wrap_angle(u.facing - facing0), 0.0),
                    "unit_motion_facing",
                );
            }
            // frame_speed MEASURES the frame's gross motion in this pass —
            // bracing, charge windows, and mobile-fire gates read it. One
            // blind spot: it is taken before the anchor law runs, so a
            // leashed frame re-walking the same meter every tick still
            // reads ~pace; mass_advance is the measurement that can't.
            if !u.pivoting {
                u.frame_speed = (u.anchor - a0).len() / dt;
            }
        }
        drop(tracer);
        #[cfg(feature = "force-trace")]
        self.force_trace.extend(tick_force_records);

        slide_halted_frames(self);
        reform_slots(self);

        let measures = steer_soldiers(self, dt);
        // Honest kinematics: what each body's own legs and carried momentum
        // did this tick (prev_positions snapshots the tick start; nothing
        // but the steer pass has moved anyone yet). Captured BEFORE the
        // separation solver so impacts read motion, not constraint churn.
        for i in 0..self.kin_vx.len() {
            self.kin_vx[i] = (self.positions[2 * i] - self.prev_positions[2 * i]) / dt;
            self.kin_vy[i] = (self.positions[2 * i + 1] - self.prev_positions[2 * i + 1]) / dt;
        }
        apply_separation(self);
        run_combat(self);
        self.run_missiles();
        for ttl in &mut self.loosing_ttl {
            if *ttl > 0.0 {
                *ttl = (*ttl - dt).max(0.0);
            }
        }
        self.contact_facing(&measures, dt);
        self.integrate_units(&measures, dt);
        self.mark_at_ease(); // fresh centroids; before morale reads it
        self.run_morale(dt);

        self.tick_count += 1;
    }

    fn refresh_contact_engagement(&mut self) {
        if !self.has_fighting {
            return;
        }
        let mut incoming = vec![0usize; self.units.len()];
        let mut contact_unit = vec![u32::MAX; self.units.len()];
        for i in 0..self.soldier_count() {
            if self.alive[i] == 0 || self.fighting[i] == 0 || self.target[i] < 0 {
                continue;
            }
            let target = self.target[i] as usize;
            if self.alive[target] == 0 {
                continue;
            }
            let attacker_u = self.soldier_unit[i] as usize;
            let victim_u = self.soldier_unit[target] as usize;
            if attacker_u == victim_u || self.units[attacker_u].team == self.units[victim_u].team {
                continue;
            }
            incoming[victim_u] += 1;
            if contact_unit[victim_u] == u32::MAX {
                contact_unit[victim_u] = attacker_u as u32;
            }
        }
        for (ui, u) in self.units.iter_mut().enumerate() {
            if incoming[ui] > u.engaged {
                u.engaged = incoming[ui];
                u.contact_unit = contact_unit[ui];
            }
        }
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
        let (anchor, facing, files, files_eff, spacing_x, depth, alive, count) = {
            let u = &self.units[ui];
            (
                u.anchor,
                u.facing,
                u.files,
                u.files_eff,
                u.spacing.x,
                u.depth(),
                u.alive_count,
                u.count,
            )
        };
        let f = dir(facing);
        let r = f.perp();
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
        // Casualties reshape the block: it sheds DEPTH at full width, and only
        // once it would fray below its anti-fray rank floor does it close up and
        // shed WIDTH instead — staying a coherent cloth as it bleeds rather than
        // fraying into a one-deep skirmish string. The floor is the unit's DEPLOYED
        // depth, capped at 3: a deep block sheds down to 3 ranks then narrows, but
        // a line deliberately deployed SHALLOW (2-deep pike screen, a wide skirmish
        // line) keeps that depth and is never force-thickened to 3. (The cap
        // overrides the corridor floor — a dying unit narrows past it.)
        let deployed_ranks = count.div_ceil(files.max(1)).max(1);
        let min_ranks = 3.min(deployed_ranks);
        let casualty_cap = (alive / min_ranks).max(1);
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
            reassign_slots(
                &self.units[ui],
                &self.positions,
                &self.fidget_offset,
                &self.alive,
                &mut self.soldier_slot,
            );
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
                let r = f.perp();
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

    fn update_threat_bearings(&mut self) {
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
    }

    fn deliver_orders_and_reflexes(&mut self, dt: f32) {
        for u in self.units.iter_mut() {
            if u.latch_cd > 0.0 {
                u.latch_cd -= dt;
            }
        }
        self.update_threat_bearings();

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
            // A BLOBBED unit accepting a RELOCATE order gathers itself around its
            // center of mass (the "re-form" of "return to Move, re-form, ride
            // off") — without it a diving trampler chases the stale dive-scattered
            // slots and never tightens. A formed unit / an Attack keeps its grid.
            let mut reseat_now = false;
            if let Some(t) = u.pending_target {
                u.pending_timer -= dt;
                if u.pending_timer <= 0.0 {
                    let mode = u.pending_mode;
                    u.mode = mode;
                    u.move_target = Some(t);
                    u.resume_target = None;
                    u.pending_target = None;
                    // A DISENGAGE never gathers: re-forming is the opposite of "turn
                    // your back and run", and the gather's walk-clamp would pin the
                    // fleeing unit in the grind it is trying to escape (it can't
                    // re-form while engaged, so the clamp never lifts). A disengage
                    // peels off via the wheel-and-run drift instead. A MOVE relocate
                    // DOES gather — a diving trampler told to ride off re-forms around
                    // a clean grid instead of chasing its dive-scattered slots.
                    reseat_now = !matches!(mode, OrderMode::Attack(_) | OrderMode::Disengage)
                        && u.cohesion < REFORM_COH;
                }
            }

            let engaged_frac = u.engaged as f32 / u.alive_count.max(1) as f32;
            let mode = u.mode;
            if reseat_now {
                // A long clean-grid window: the gather releases as soon as the
                // unit is formed (cohesion bar), so the window only needs to be
                // long enough to never expire mid-gather. It walks itself together
                // then rides off.
                self.reseat(ui, 25.0);
            }

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
                    let er = ef.perp();
                    a.dot(ef).abs() * 0.5 * ev.depth() + a.dot(er).abs() * 0.5 * ev.width()
                };
                // The chase point sits BEYOND the enemy mass — past its far
                // edge along my approach, footprint-derived (a press through
                // a 20-rank column must aim past the whole column): a press
                // is a direction, not a destination — you never arrive at
                // it, never overshoot it, and the leash decides how deep the
                // frame actually gets.
                let standoff = enemy_edge_ext + 5.0;
                let (enemy_dead, enemy_anchor, approach_dir) = {
                    let ev = &self.units[e];
                    let me = self.units[ui].centroid;
                    let through = ev.centroid - me;
                    let l = through.len();
                    // Interpenetrated masses have no usable axis — press on
                    // along the facing instead of flip-flopping backward.
                    let dir_v = if l > 6.0 {
                        through * (1.0 / l)
                    } else {
                        dir(self.units[ui].facing)
                    };
                    (ev.alive_count == 0, ev.centroid + dir_v * standoff, dir_v)
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
                    // The latch keeps the order LIVE through the fight: the
                    // frame always pursues the enemy anchor and the leash
                    // (anchor law) decides how deep it actually presses.
                    u.move_target = Some(enemy_anchor);
                    if u.charge_enabled {
                        let charge_sp = self.tun.base_speed
                            + (self.tun.charge_speed - self.tun.base_speed)
                                * crate::movement::stamina_factor(u.stamina)
                                * u.pace_mult;
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
                        // A lance-charge is a committed gallop AT the enemy — you
                        // cannot couch the lance and spur to a charge while still
                        // pointed across his front. So the burst ignites only once
                        // the unit is actually HEADED at the foe (its lance line,
                        // = facing, within ~50° of the approach). A frontal charge
                        // is aligned from the first stride; a unit that swung to
                        // the flank waits out its 90° wheel, then ignites fresh and
                        // carries that single burst into contact — instead of
                        // firing early across the turn and burning the burst before
                        // it ever arrives.
                        let aligned = dir(u.facing).dot(approach_dir) > 0.64;
                        let start = engaged_frac < 0.05
                            && aligned
                            && to_front < charge_sp * self.tun.charge_window
                            && u.stamina > 0.3
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
            if engaged_frac > 0.06 {
                u.disengage_reform_pending = true;
            }
            if engaged_frac > 0.06 && u.mode != OrderMode::Disengage && !u.evade_auto {
                u.quiet_ticks = 0;
                match u.mode {
                    OrderMode::Move => {
                        if u.pursue {
                            // Reactive latch: revocable too.
                            u.latch_best = f32::MAX;
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
                        // within a 5s RUN (stamina-aware, class speed) — and
                        // attacks close at the double (effective_pace), so
                        // anything latched is reachable inside the 6s timer.
                        // An expiry now MEANS the prey is pulling away. (A
                        // flat 70m here used to latch a walking advance,
                        // time out, and sit in the cooldown across contact —
                        // mutual attack-moves never burst.)
                        let run_sp = self.tun.base_speed
                            + (self.tun.run_speed - self.tun.base_speed)
                                * crate::movement::stamina_factor(u.stamina)
                                * u.pace_mult;
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

    /// In contact: the anchor tracks the measured front (plus a small lean
    /// when ordered to press), and unit facing follows the threat-weighted
    /// circular mean of contact bearings, masked by adjacent friendlies.
    /// Contact FACING only — the anchor itself answers to one law (see
    /// `clamp_anchor_to_men`): it pursues the order, leashed to the men.
    fn contact_facing(&mut self, measures: &[UnitMeasure], dt: f32) {
        let tun = self.tun;
        #[cfg(feature = "force-trace")]
        let mut force_records = Vec::new();
        let mut tracer = Tracer::new(
            #[cfg(feature = "force-trace")]
            &mut force_records,
            self.tick_count,
        );
        for ui in 0..self.units.len() {
            let (engaged, alive_n) = (measures[ui].engaged, measures[ui].alive_n.max(1));
            let engaged_frac = engaged as f32 / alive_n as f32;
            if engaged_frac <= 0.06
                || self.units[ui].mode == OrderMode::Disengage
                || self.units[ui].evade_auto
            {
                continue;
            }

            // A unit faces its OBJECTIVE, never the local contacts. An ORDERED
            // unit aims at its waypoint (Move) or the foe's CENTROID (Attack)
            // during the approach; once it locks into a grind it HOLDS the
            // facing it met the enemy at — tracking the shifting centroid from
            // inside the grind IS the swirl. A unit with NO order does not turn
            // at all: it holds the facing the player gave it. The sim does not
            // wheel a line toward whatever wanders into its flank — a mistake in
            // positioning is the player's (or the AI's) to own, and a unit may
            // be deliberately keeping its front for a bigger threat than the
            // peasant on its side. The per-soldier reactive facing still turns
            // the edge MEN to meet who is on them; the FORMATION holds its
            // commanded front. Cavalry is exempt from the lock: it maneuvers in
            // contact (rides through, wheels, re-charges) instead of grinding.
            let intent_dir = match self.units[ui].mode {
                OrderMode::Move => self.units[ui]
                    .move_target
                    .map(|t| t - self.units[ui].anchor),
                OrderMode::Attack(e) => {
                    Some(self.units[e as usize].centroid - self.units[ui].anchor)
                }
                _ => None,
            }
            .filter(|v| v.len() > 4.0);
            let locked = engaged_frac > 0.08 && !self.units[ui].is_mounted();
            let desired = if locked {
                None
            } else {
                intent_dir.map(|v| v.y.atan2(v.x))
            };
            if let Some(desired) = desired {
                let u = &mut self.units[ui];
                let diff = wrap_angle(desired - u.facing);
                if diff.abs() > 0.35 {
                    let top = soldier_surge_speed(&tun, u);
                    // Geometric corner-speed cap only — cohesion does NOT throttle
                    // the turn (a disordered unit must still be able to wheel; the
                    // trample carry-through law holds without it).
                    let geom = tun.wheel_speed_factor * top / u.pivot_radius().max(1.0);
                    let center = u.center();
                    let facing_before = u.facing;
                    let anchor_before = u.anchor;
                    u.facing = rotate_toward(u.facing, desired, geom * dt);
                    u.anchor = center + dir(u.facing) * (0.5 * u.depth());
                    if u.facing != facing_before {
                        tracer.record(
                            u.start,
                            ui,
                            ForceChannel::UnitFacing,
                            None,
                            Vec2::new(wrap_angle(u.facing - facing_before), 0.0),
                            "contact_facing",
                        );
                    }
                    let anchor_delta = u.anchor - anchor_before;
                    if anchor_delta.x != 0.0 || anchor_delta.y != 0.0 {
                        tracer.record(
                            u.start,
                            ui,
                            ForceChannel::UnitFrame,
                            None,
                            anchor_delta,
                            "contact_anchor_reseat",
                        );
                    }
                    u.pivoting = true; // slots keep relabeling while we wheel
                }
            }
        }
        drop(tracer);
        #[cfg(feature = "force-trace")]
        self.force_trace.extend(force_records);
    }

    fn integrate_units(&mut self, measures: &[UnitMeasure], dt: f32) {
        let tun = self.tun;
        // Rank-depth of every unit, so a trampler can read its foe's depth (the
        // ram-drag waives a shallow screen however wide).
        let ranks: Vec<f32> = self
            .units
            .iter()
            .map(|u| u.alive_count.max(1).div_ceil(u.files_eff.max(1)) as f32)
            .collect();
        for (
            u,
            &UnitMeasure {
                err_sum,
                effort,
                engaged,
                alive_n,
                cx,
                cy,
                opp_press,
                pivot_sum,
            },
        ) in self.units.iter_mut().zip(measures)
        {
            u.foe_ranks = if u.engaged > 0 {
                ranks.get(u.contact_unit as usize).copied().unwrap_or(0.0)
            } else {
                0.0
            };
            let n = alive_n.max(1) as f32;
            let c0 = u.centroid;
            u.centroid = Vec2::new(cx / n, cy / n);
            // Measured momentum of the MASS: centroid forward speed, smoothed
            // over ~0.4s to ride out collision jitter and casualty shifts.
            let v_fwd = (u.centroid - c0).dot(dir(u.facing)) / dt;
            u.mass_advance += (v_fwd - u.mass_advance) * (1.0 - (-dt / 0.4f32).exp());
            // BRACE RAMP: a halted line takes a few seconds to set its feet and
            // reach full brace; the instant it gets moving (or is told to march)
            // it loses the set. So a charge that lands before the ramp completes
            // hits a not-yet-braced line and rides through. Measured frame speed,
            // not the order, decides "halted" — a line stalled in contact starts
            // bracing on its own.
            if u.frame_speed < 0.3 && !u.pivoting {
                u.brace_ramp = (u.brace_ramp + dt / self.tun.brace_ramp_secs).min(1.0);
            } else {
                u.brace_ramp = 0.0;
            }
            // The ram-drag reads ENEMY counter-press, but the per-soldier crush it
            // sums also carries FRIENDLY compression — so a unit NOT in contact
            // must report zero, or its own internal squeeze (e.g. the rear ranks
            // piling onto the front as it accelerates) is misread as an enemy wall
            // braking it, and a clean open-ground run brakes itself to a halt.
            u.counter_press = if u.engaged > 0 { opp_press / n } else { 0.0 };
            // SMOOTHED copy for the trampler ram-drag only: the instantaneous crush
            // spikes alike on a thin screen and a braced wall for a frame, so it
            // can't tell them apart — but the SUSTAINED average can (a screen the cav
            // rides through averages ~5, a wall it bogs against ~11+). Infantry keep
            // the instantaneous press (their clash must brake at first contact, no
            // lag), so this is a separate channel.
            u.ram_press += (u.counter_press - u.ram_press) * (1.0 - (-dt / 0.4f32).exp());

            // THE ANCHOR LAW: the frame always pursues the order, but it is
            // leashed to the men's measured center of mass. Out of combat
            // the slack is generous (jams merely hold it back); in combat it
            // is tight — the frame sits where the men actually are, so a
            // pushed-back front drags its slots with it (losing the push)
            // and a winning push lets the frame advance (walking them back).
            // Depth's forward pressure is not a separate command bit; it
            // emerges from the rear ranks' mass compressing the formation.
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
                // The frame sits AT the men when engaged — no rank-counting
                // forward slack shoving slots ahead of the line (a phantom drive
                // that drags the rear into the front and blobs the block). Depth
                // pressure emerges from rear ranks physically compressing the
                // weave springs against the planted front. So the leash is just
                // "the frame holds with the men"; the press is real, paid in
                // compression, by mass.
                // Disengage/rout aside, the frame is leashed TIGHT and BOTH
                // WAYS: it never runs far ahead of its men (which would tow the
                // front out and stretch the block on the march — the run-fray)
                // nor lag behind them. Tight on the march keeps the block
                // dressed as it closes; tight in the fight keeps the slots on
                // the men so the rear bonds don't tear. Disengage stays loose
                // (fleeing slots must LEAD the men out).
                let disengaging = u.mode == OrderMode::Disengage;
                // A locked MOVE whose target is BEHIND the facing is a shields-front
                // WITHDRAWAL: like a Disengage, its frame must LEAD the men out (the
                // loose leash), or the tight engaged leash pins it in the grind and
                // the order never extracts. (Attack/latch is excluded — its target is
                // the foe AHEAD — so the clash is untouched.)
                let backing_off = u.mode == OrderMode::Move
                    && fighting_frac > 0.1
                    && u.move_target.map_or(false, |mt| {
                        let to = mt - u.anchor;
                        to.dot(f) < -0.2 * to.len()
                    });
                // Tight when engaged/marching so a short approach arrives dressed
                // (a long run still frays through the men's varied top speeds and
                // terrain pockets — a charge over distance is meant to cost
                // coherence, so the player halts to regroup). Disengage runs loose
                // (fleeing slots must LEAD the men out).
                let leash = if disengaging || backing_off {
                    0.6 * u.depth() + 5.0
                } else if fighting_frac > 0.1 {
                    // ENGAGED: the frame sits AT the men, no depth slack — slack
                    // lets the slots LEAD the fighting line and tow it through the
                    // enemy. The forward press is paid in compression by the rear
                    // ranks, never by a leading frame.
                    1.0
                } else {
                    0.3 * u.depth() + 1.5
                };
                if lag > leash {
                    u.anchor = u.anchor + f * (-(lag - leash));
                    // Ordered to stand or advance yet measurably walked
                    // back: the precise involuntary-displacement signal.
                    if fighting_frac > 0.1 && u.mode != OrderMode::Disengage {
                        let alpha = 1.0 - (-dt / 2.0f32).exp();
                        u.losing_push += ((lag - leash) / dt - u.losing_push) * alpha;
                    }
                } else if !disengaging && !backing_off && lag < -leash {
                    u.anchor = u.anchor + f * (-(lag + leash));
                }
            } else if u.routing {
                // The frame follows the fleeing mob (so a rally has a unit
                // to re-form around).
                u.anchor = u.centroid + dir(u.facing) * (0.5 * u.depth());
                u.frame_speed = 0.0;
            }

            // COHESION is the weave's strain. STRETCH — men torn from the
            // lattice, their bonds pulled long — and PIVOT — the lattice bent,
            // sheared, or wrapped off its rest grid. Compression is deliberately
            // ABSENT: a packed formation is natural and already pays through
            // pressure, so counting it here would double-penalise it. Both terms
            // fall straight out of the same neighbour bonds the springs use.
            let mean_stretch = err_sum / n; // mean bond stretch (m)
            let mean_pivot = pivot_sum / n; // mean bond pivot (rad)
            let observed = (mean_stretch * tun.cohesion_stretch + mean_pivot * tun.cohesion_pivot)
                .clamp(0.0, 1.0);

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
            // exertions drain, and the kit scales the bill (fight_drain_mult):
            // armor is paid for in wind.
            // MOVEMENT drain (run / bad ground / charge gallop): scaled by the kit
            // cost AND the per-class movement factor — cavalry moves cheaply (the
            // horse carries the kit), foot pays full.
            let mut move_drain = 0.0f32;
            if u.effective_pace() == Pace::Run && u.frame_speed > tun.base_speed * 1.05 {
                move_drain += tun.run_drain;
            }
            move_drain += tun.terrain_drain * (effort / n);
            // Gated on the MEN's measured motion (not the frame's — the
            // leash pins the frame even while the mass rolls): the burst is
            // paid while the mass actually sprints. A charge pinned dead in
            // a bog drains as a fight, not as a gallop.
            if u.charging && u.mass_advance > tun.base_speed * 1.05 {
                move_drain += tun.charge_drain;
            }
            // FIGHT drain (melee): scaled by the kit cost only — everyone fights as
            // hard as their kit demands, mounted or not. So a class can move cheaply
            // yet still blow out in a long grind.
            let fight_drain = tun.combat_drain * engaged_frac;
            // Two independent muls: movement by move_drain_mult, fighting by
            // fight_drain_mult. (For foot they are equal, so this is just the kit
            // cost; cavalry splits them — cheap to move, normal to fight.)
            let mut drain = move_drain * u.move_drain_mult + fight_drain * u.fight_drain_mult;
            if u.frame_speed < 0.1 && u.move_target.is_none() && engaged == 0 {
                drain -= tun.rest_recover;
            }
            u.stamina = (u.stamina - drain * dt).clamp(0.0, 1.0);

            // Contact memory and casualty rate decay.
            for w in &mut u.contact_hist {
                *w *= 0.96;
            }
            u.recent_casualties *= 1.0 - (dt / 8.0);
        }
    }
}
