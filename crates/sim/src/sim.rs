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
use crate::movement::{pace_speed, soldier_charge_speed, soldier_surge_speed, update_unit_motion};
use crate::rng::Pcg32;
use crate::terrain::{stagger01, Terrain};
use crate::tunables::{Pace, Tunables, DT};
use crate::unit::{compact_slots_preserving_order, reassign_slots, slot_local, OrderMode, Unit};

/// Idle-fidget drift amplitude (m, peak ≈ this) and glance drift (rad, peak). A
/// standing man is never a fence-post: he drifts off his slot and his eye
/// wanders, off the sim RNG (stagger01) so it's reproducible. Gated on true
/// ease — no order, no contact, no nearby threat — so alert formations stop
/// casual sway before it can ring through the lattice.
const IDLE_FIDGET: f32 = 0.12;
const IDLE_GLANCE: f32 = 0.18;
/// A soldier re-aims his facing only once the threat is more than this far off it
/// (rad, ~8°); inside it he holds his stance. Stops his body servoing on the
/// tick-to-tick separation churn of a packed grind (the facing jitter).
const FACING_DEADZONE: f32 = 0.14;
/// A foe within this arc of the unit's commanded frontage (rad) is met by simply
/// holding the frontage; only a foe beyond it (a flanker) turns the man outward.
/// Keeps a frontal grind's facings steady instead of chasing each foe's churn.
const FACING_FRONT_ARC: f32 = 1.0;
/// A formation bond may bridge a small casualty gap to the next live man in the
/// same rank/file. This keeps a line a connected sheet after a few deaths while
/// still letting real holes stay open.
const WEAVE_NEIGHBOR_SKIP: usize = 4;

/// Per-unit aggregates `steer_soldiers` measures over its men in one pass, for
/// `contact_facing` and `integrate_units` to consume. Centroid is carried as the
/// running sums (cx, cy); divide by `alive_n` to get the mean.
struct UnitMeasure {
    /// Sum of per-soldier slot stretch (m) — feeds mean bond stretch / cohesion.
    err_sum: f32,
    /// Accumulated terrain effort (per-man (1 - ground) while moving).
    effort: f32,
    /// Living men in contact (engaged > 0).
    engaged: usize,
    /// Living men.
    alive_n: usize,
    /// Centroid running sums (x, y); mean = cx/alive_n, cy/alive_n.
    cx: f32,
    cy: f32,
    /// Received push OPPOSING the facing — the unit-level braking force.
    opp_press: f32,
    /// Sum of per-soldier bond pivot — feeds cohesion.
    pivot_sum: f32,
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
            pace_mult: 1.0,
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
            cruise: 0.0,
            brace_ramp: 0.0,
            move_target: None,
            pending_target: None,
            pending_mode: OrderMode::Move,
            pending_timer: 0.0,
            pending_total: 0.0,
            pace: Pace::Walk,
            stamina: 1.0,
            training: training.clamp(0.0, 1.0),
            team,
            home_dir_y,
            disorder: 0.0,
            cohesion: 1.0,
            pivoting: false,
            mode: OrderMode::Move,
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
            lost_impact: 0,
            lost_charge_melee: 0,
            lost_grind_melee: 0,
            lost_missile: 0,
            lost_post_rout: 0,
            ammo: 0,
            fire_at_will: true,
            evade_auto: false,
            morale: 0.7 + 0.3 * training.clamp(0.0, 1.0),
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
            self.charge_wpn_spent.push(false);
            self.switch_cd.push(0.0);
            self.stun.push(0.0);
            self.trampled.push(0.0);
            self.target.push(-1);
            self.attacked_by.push(0);
            self.fighting.push(0);
            self.fight_near.push(0);
            self.front_clear.push(1);
            self.hit_dir.push(0.0);
            self.hit_ttl.push(0.0);
            self.kin_vx.push(0.0);
            self.kin_vy.push(0.0);
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
        self.spawn_class_with_files(anchor, facing, count, files, class, team)
    }

    /// Spawn a class unit already dressed at a chosen frontage. This is for
    /// scenario/test setup where the initial shape is part of the experiment.
    /// Use `set_files` for live player reshapes; it deliberately keeps the men
    /// in place and makes them reform into the new slots over time.
    pub fn spawn_class_with_files(
        &mut self,
        anchor: Vec2,
        facing: f32,
        count: usize,
        files: usize,
        class: UnitClassId,
        team: u32,
    ) -> usize {
        let stats = self.balance.get(class);
        let lower = 4.min(count.max(1));
        let files = files.clamp(lower, (count / 3).max(lower));
        let idx = self.spawn_unit(
            anchor,
            facing,
            count,
            files,
            stats.spacing,
            team,
            stats.training,
        );
        let start = self.units[idx].start;
        // Default weapon is the GRIND sidearm, not the charge lance: a horseman
        // rides with his sabre and only couches the lance when he actually charges
        // (see the weapon-selection latch). For non-cav this is just weapon 0.
        let default_weapon = stats
            .weapons
            .iter()
            .position(|w| !w.is_charge())
            .unwrap_or(0) as u8;
        for s in 0..count {
            self.health[start + s] = stats.health;
            self.mass[start + s] = stats.mass;
            self.radius[start + s] = stats.soldier_radius;
            self.mounted[start + s] = stats.mounted as u8;
            self.mount_health[start + s] = stats.mount_health;
            self.cur_weapon[start + s] = default_weapon;
        }
        self.max_radius = self.max_radius.max(stats.soldier_radius);
        let u = &mut self.units[idx];
        u.class = class;
        u.stats = stats;
        u.pace_mult = stats.pace_mult;
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
        let count = self.units[unit].count;
        // Never wider than 3 ranks deep — a line thinner than that isn't a line,
        // it's a brittle string. (Enforced here so any width control, including
        // a future right-drag-to-widen, can't cross it.)
        let lower = 4.min(count.max(1));
        let files = files.clamp(lower, (count / 3).max(lower));
        let u = &mut self.units[unit];
        u.files = files;
        u.files_eff = files;
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
        u.reform_timer = 8.0;
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

        self.mark_at_ease(); // current centroids; before stance/fidget/slot logic reads it
        self.refresh_contact_engagement();
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

        // Re-form slots while pivoting, after casualties opened real gaps in a
        // non-contact/thick formation, and on a slow drumbeat for DEEP engaged
        // blocks. Do NOT re-sort a living thin HELD line while it is dimpled:
        // the neighbour identities are the sheet. Re-labeling a 3-4-rank held
        // line to its current ragged shape erases that memory and turns a clean
        // bulge into streamers. Advancing/wrapping sheets still need vacancy
        // flow, and deep blocks need periodic back-rank flow to keep a grind
        // from pancaking.
        for ui in 0..self.units.len() {
            let ranks = self.units[ui].alive_count as f32 / self.units[ui].files_eff.max(1) as f32;
            let advancing = self.units[ui].move_target.is_some()
                || matches!(self.units[ui].mode, OrderMode::Attack(_));
            let mounted_contact = self
                .units
                .get(self.units[ui].contact_unit as usize)
                .map_or(false, Unit::is_mounted);
            let casualty_reform = self.units[ui].deaths_since_reform * 50
                > self.units[ui].alive_count.max(1)
                && (self.units[ui].engaged == 0 || ranks >= 5.0 || advancing);
            let needs = self.units[ui].pivoting
                || casualty_reform
                || (self.units[ui].engaged > 0
                    && ranks >= 5.0
                    && self.tick_count % 60 == (ui as u64) % 60)
                // A SETTLED, AT-EASE unit (halted, no enemy near) that frayed on
                // the march RE-FORMS on a slow drumbeat so order RECOVERS — without
                // this a unit kept its march disorder forever (nothing re-sorted a
                // standing, unengaged line). Gated on at_ease so it NEVER fires near
                // a fight (re-sorting mid-combat would perturb the scrum).
                || (self.units[ui].at_ease
                    && self.units[ui].frame_speed < 0.3
                    && self.units[ui].cohesion < 0.9
                    && self.tick_count % 45 == (ui as u64) % 45);
            if needs {
                if casualty_reform
                    && advancing
                    && ranks < 5.0
                    && !mounted_contact
                    && !self.units[ui].pivoting
                {
                    compact_slots_preserving_order(
                        &self.units[ui],
                        &self.alive,
                        &mut self.soldier_slot,
                    );
                } else {
                    reassign_slots(
                        &self.units[ui],
                        &self.positions,
                        &self.fidget_offset,
                        &self.alive,
                        &mut self.soldier_slot,
                    );
                }
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
        let (anchor, facing, files, files_eff, spacing_x, depth, alive) = {
            let u = &self.units[ui];
            (
                u.anchor,
                u.facing,
                u.files,
                u.files_eff,
                u.spacing.x,
                u.depth(),
                u.alive_count,
            )
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
                    let dir_v = if l > 6.0 {
                        through * (1.0 / l)
                    } else {
                        dir(self.units[ui].facing)
                    };
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
                        let start = engaged_frac < 0.05
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

    /// Per-soldier steering and measurement. Returns one `UnitMeasure` per unit.
    fn steer_soldiers(&mut self, dt: f32) -> Vec<UnitMeasure> {
        let tun = self.tun;
        let Sim {
            units,
            soldier_unit,
            positions,
            prev_positions,
            kin_vx,
            kin_vy,
            mass,
            mom_x,
            mom_y,
            pressure,
            press_x,
            press_y,
            front_clear,
            facings,
            soldier_slot,
            fidget_offset,
            terrain,
            tick_count,
            alive,
            stun,
            trampled,
            target,
            fighting,
            hit_dir,
            hit_ttl,
            mounted,
            ..
        } = self;
        let tick_now = *tick_count;
        // Pressure is read straight off the WEAVE now: a man's crush is the
        // load on his springs — the friendly net squeezing him plus the enemy
        // reach-spring shoving him back when ranks pile him inside reach. No
        // separate force ledger; the same springs that move him measure him.
        let press_alpha = 1.0 - (-dt / tun.press_tau).exp();

        let mut measures = Vec::with_capacity(units.len());
        for u in units.iter() {
            let f = dir(u.facing);
            let r = Vec2::new(f.y, -f.x);
            let surge_sp = soldier_surge_speed(&tun, u);
            // The per-man sprint ceiling: a CHARGING unit's men may run all the way
            // to charge pace; otherwise the ceiling is the catch-up surge. Without
            // the charge branch the cap below clamps a charge back down to a surge.
            let sprint_sp = if u.charging {
                soldier_charge_speed(&tun, u)
            } else {
                surge_sp
            };
            let keep_up_sp = pace_speed(&tun, u) + 0.5;
            // Slot attraction depends on INTENT: a unit attacking or moving
            // loosens its slots so the NEIGHBOUR SPRINGS hold it together (and
            // the sheet can drape and wrap); a unit just holding grips its grid.
            // Loose-and-spring-held actually frays LESS on the march than
            // tight-and-slot-chasing, where the fast men overshoot the advancing
            // anchor and stretch the block.
            let advancing =
                matches!(u.mode, crate::unit::OrderMode::Attack(_)) || u.move_target.is_some();
            // A unit doing a FREE in-place pivot (a drilled about-face, not a
            // contact wheel) grips its grid HARD: the whole lattice turns in place,
            // so the men must chase the rotating slots tightly or the stiff weave
            // holds the old shape and the block smears through the arc like cloth
            // (the rear corners lag the spinning grid). Loose advancing-grip is for
            // the MARCH, where chasing a moving anchor overshoots; an in-place pivot
            // has no anchor drift to overshoot. Gated on NOT engaged so a braced
            // line micro-wheeling in contact keeps its normal contact grip.
            let strict_formation = u.stats.strict_formation;
            let slot_pull_u = if u.pivoting && u.engaged == 0 {
                tun.slot_pull_hold.max(tun.slot_pull)
            } else if advancing && !strict_formation {
                tun.slot_pull
            } else {
                tun.slot_pull_hold
            };
            let mounted_threat_near = !u.at_ease
                && units.iter().any(|v| {
                    if v.team == u.team || v.alive_count == 0 || v.routing || !v.is_mounted() {
                        return false;
                    }
                    let gap = (v.center() - u.center()).len()
                        - 0.5 * v.width().hypot(v.depth())
                        - 0.5 * u.width().hypot(u.depth());
                    gap < tun.at_ease_range
                });
            let my_files = u.files_eff.max(1);
            // How much of my front is actually under contact? A full press
            // engages many files across my frontage; separate narrow columns
            // only engage their local lanes even if their left/right span is wide.
            // Count covered FILES, not min/max lateral span, so three distinct
            // breach patches don't masquerade as one continuous wall of pressure.
            // (fighting[] is last tick's — a contact band doesn't jump rank to rank.)
            let broad_press = {
                let mut fighting_files = vec![false; my_files];
                for s in 0..u.count {
                    let i = u.start + s;
                    if alive[i] == 1 && fighting[i] == 1 {
                        fighting_files[soldier_slot[i] as usize % my_files] = true;
                    }
                }
                fighting_files.iter().filter(|&&covered| covered).count() * 2 > my_files
            };
            let reach_u = u.stats.weapons.iter().fold(0.0f32, |m, w| m.max(w.reach));
            let mut err_sum = 0.0f32;
            let mut pivot_sum = 0.0f32;
            let mut effort = 0.0f32;
            let mut engaged = 0usize;
            let mut alive_n = 0usize;
            let mut cx = 0.0f32;
            let mut cy = 0.0f32;
            // Received push OPPOSING the facing (the crowd's answer to the
            // unit's drive): the unit-level braking force, measured.
            let mut opp_press = 0.0f32;

            // The WEAVE: invert the slot map (slot index -> soldier) so each man
            // can find the men netted to him — the slots beside and behind — and
            // pull toward holding rest spacing with them. This lets the formation
            // deform as a CONNECTED sheet (dimple around a penetration, drape and
            // wrap on the advance) instead of every man tugging a rigid grid
            // point on his own. The slot still anchors the sheet so it springs
            // back to shape.
            let slot_capacity = u.count.div_ceil(u.files_eff.max(1)) * u.files_eff.max(1);
            let mut soldier_at_slot = vec![usize::MAX; slot_capacity];
            for s in 0..u.count {
                let i = u.start + s;
                if alive[i] == 1 {
                    let sl = soldier_slot[i] as usize;
                    if sl < slot_capacity {
                        soldier_at_slot[sl] = i;
                    }
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
                opp_press += (-(press_x[i] * f.x + press_y[i] * f.y)).max(0.0);

                // Only a TRAMPLER (cavalry) carries ballistic momentum — a horse
                // rides through. Infantry crash and grind: their carried momentum,
                // re-armed every tick by the strike/impact ledgers from grind
                // jitter, otherwise towed the whole block clean THROUGH the enemy
                // line (the centroid pass-through). A felling-blow knockback is a
                // separate concern (the victim is staggered out of the weave).
                if !u.tramples() {
                    mom_x[i] = 0.0;
                    mom_y[i] = 0.0;
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
                    let decay = 1.0 - (dt / 0.8);
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
                // BOWLED by a committed charge: no will to hold the line, the body
                // just coasts under the collision/momentum — the weave is erased
                // here so the charge keeps its lane (the last soft force the
                // trample exemption was missing). Heals as the timer runs out.
                if trampled[i] > 0.0 {
                    trampled[i] -= dt;
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
                    facings[i] = rotate_toward(
                        facings[i],
                        desired,
                        tun.soldier_turn_rate * u.stats.turn_mult * dt,
                    );
                    continue;
                }

                let aware_i = target[i] >= 0 && alive[target[i] as usize] == 1;
                let engaged_i = fighting[i] == 1 && aware_i;
                if engaged_i {
                    engaged += 1;
                }
                let order_advancing =
                    u.move_target.is_some() || matches!(u.mode, OrderMode::Attack(_));
                // Trample = ride through, no glue, on either of two intents: a
                // MOVE order (the enemy is terrain to ride past) OR a charge
                // still carrying speed (the momentum overruns whatever it hits).
                // The move half never flickers when a thin screen checks the
                // gallop — the ORDER, not the instantaneous pace, holds the glue
                // off. The speed half lets a CHARGE (attack order) plow a thin
                // line and bloody it, yet still bog in a DEEP block: there the
                // mass stalls below charge speed, the glue snaps back on,
                // collision pins it, and the rider fights. Computed BEFORE the
                // weave so the enemy bond (which welds at reach) also yields to a
                // plowing mass — a horse must ride through, not glue to, its prey.
                let trampling = u.tramples()
                    && (u.move_target.is_some() || u.mass_advance > tun.charge_spent_speed);

                let local = slot_local(soldier_slot[i] as usize, u.files_eff, u.spacing);
                let slot = u.anchor + r * local.x + f * (-local.y);
                let to = slot - p;
                let mut slot_pull_vec = to;
                let mut formation_blocks_forward = false;
                // A footman may not power himself forward through a living,
                // opposing foot formation's frontage. This is local and geometric:
                // inside that enemy's lateral corridor, remove the forward slot /
                // magnet tow and later cap self-drive to a fighting step. Flanks
                // outside the corridor still curl and wrap; collision can still
                // shove bodies either way. This closes the infantry "trample"
                // hole without turning the whole enemy face into a wall.
                if !u.tramples() {
                    for v in units.iter() {
                        if v.team == u.team || v.alive_count == 0 || v.is_mounted() || v.tramples()
                        {
                            continue;
                        }
                        let vf = dir(v.facing);
                        if f.dot(vf) > -0.35 {
                            continue;
                        }
                        let vr = Vec2::new(vf.y, -vf.x);
                        let half_w = 0.5 * v.width() + 0.5 * v.spacing.x;
                        let p_lat = (p - v.center()).dot(vr);
                        let slot_lat = (slot - v.center()).dot(vr);
                        if p_lat.abs().min(slot_lat.abs()) > half_w {
                            continue;
                        }
                        let v_mid = v.center().dot(f);
                        if p.dot(f) > v_mid && slot.dot(f) > v_mid {
                            let forward_pull = slot_pull_vec.dot(f).max(0.0);
                            slot_pull_vec = slot_pull_vec - f * forward_pull;
                            formation_blocks_forward = true;
                            break;
                        }
                    }
                }
                // Weave-derived disorder, set in the block below: how far my
                // bonds are STRETCHED, and how far they've PIVOTED. A man with no
                // live neighbours has only his absolute slot to judge by — an
                // isolated soldier IS out of formation.
                let mut soldier_stretch = to.len();
                let mut soldier_pivot = 0.0f32;
                // The draping net's pull (A1), applied to the FINAL steer below —
                // not just the slot-seek — so a man who is seeking or pressing an
                // enemy is still held in formation by his neighbours.
                let mut net_target: Option<Vec2> = None;
                // The weave's COMPRESSION push: summed over my squeezed bonds, a
                // shove away from each neighbour that grows exponentially as the
                // bond crushes toward zero. This is the anti-blob (the lattice
                // keeps its spacing) AND the contact hold (a front man's foe-weave
                // won't crush flat, so backpressure can't drive him through it).
                let mut comp_push = Vec2::ZERO;
                // The weave's PIVOT spring: summed over my bonds, a TANGENTIAL
                // shove that rotates each bond back toward its rest heading
                // (length untouched) — the force that snaps a bent/sheared line
                // straight, which the length-only net & compression springs can't
                // feel. Scaled by pivot_stiffness below.
                let mut pivot_push = Vec2::ZERO;
                // The scalar crush: the SUM of spring-load magnitudes (each bond's
                // push, plus the enemy reach-spring below). Vector cancels under a
                // two-sided squeeze; this scalar does not — that gap IS the vice.
                let mut crush_scalar = 0.0f32;
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
                    let neighbor_skip = if order_advancing && !strict_formation {
                        1
                    } else {
                        WEAVE_NEIGHBOR_SKIP
                    };
                    let mut nsum = Vec2::ZERO;
                    let mut nn = 0.0f32;
                    // Weave strain, the raw material of COHESION. A bond's rest
                    // is `off` (where I sit relative to that neighbour); the live
                    // bond is `p - jp`. STRETCH (only — compression is natural and
                    // owns its own pressure cost, so we don't double-count it) is
                    // how much longer than rest. PIVOT is how far the bond has
                    // rotated off its rest direction — a sheared, bent, or
                    // U-wrapped line racks up pivot while keeping its spacings.
                    let mut bond_stretch = 0.0f32;
                    let mut bond_pivot = 0.0f32;
                    let mut weave_bond = |j: usize, off: Vec2| {
                        // A bowled neighbour is a GAP: don't weave to a man a charge
                        // just ran through, or the formation follows him into the
                        // lane (and re-closes the hole the charge needs).
                        if j != usize::MAX && trampled[j] <= 0.0 {
                            let jp = Vec2::new(prev_positions[2 * j], prev_positions[2 * j + 1]);
                            nsum = nsum + jp + off;
                            nn += 1.0;
                            let d = p - jp;
                            let (al, rl) = (d.len(), off.len());
                            bond_stretch += (al - rl).max(0.0);
                            if al > 1e-3 && rl > 1e-3 {
                                let (dh, oh) = (d * (1.0 / al), off * (1.0 / rl));
                                let dot = (dh.x * oh.x + dh.y * oh.y).clamp(-1.0, 1.0);
                                bond_pivot += dot.acos();
                                // Angular spring: the part of the rest heading
                                // PERPENDICULAR to the live bond, scaled by the
                                // bond's length — a tangential pull that swings the
                                // bond back to rest without changing its length.
                                // (Linear in sin(angle): an exponential knee held
                                // its shape stiffer but read as too rigid and choked
                                // the wrap — a wrap is the same large bend, so any
                                // sharp angle law that stops a pancake stops a curl.)
                                let tang = oh - dh * dot;
                                pivot_push = pivot_push + tang * al;
                            }
                            // COMPRESSION push: when the bond is shorter than rest,
                            // shove away from the neighbour, the force climbing
                            // exponentially as the gap closes — the lattice yields
                            // a little under press but guards its spacing without
                            // bound near collapse. No squeeze, no push.
                            let comp = rl - al;
                            if comp > 0.0 && al > 1e-3 {
                                let push = tun.compress_strength
                                    * ((comp / tun.compress_scale).exp() - 1.0);
                                comp_push = comp_push + d * (push / al);
                                crush_scalar += push;
                            }
                        }
                    };
                    for step in 1..=file.min(neighbor_skip) {
                        let ns = si - step;
                        let j = soldier_at_slot[ns];
                        if j != usize::MAX && trampled[j] <= 0.0 {
                            weave_bond(j, r * (sx * step as f32));
                            break;
                        }
                    }
                    let right_steps = (files - 1 - file)
                        .min(slot_capacity.saturating_sub(1).saturating_sub(si))
                        .min(neighbor_skip);
                    for step in 1..=right_steps {
                        let ns = si + step;
                        let j = soldier_at_slot[ns];
                        if j != usize::MAX && trampled[j] <= 0.0 {
                            weave_bond(j, r * (-sx * step as f32));
                            break;
                        }
                    }
                    for step in 1..=rank.min(neighbor_skip) {
                        let ns = si - files * step;
                        let j = soldier_at_slot[ns];
                        if j != usize::MAX && trampled[j] <= 0.0 {
                            weave_bond(j, f * (-sy * step as f32));
                            break;
                        }
                    }
                    let ranks = slot_capacity.div_ceil(files);
                    for step in 1..=((ranks - 1 - rank).min(neighbor_skip)) {
                        let ns = si + files * step;
                        if ns >= slot_capacity {
                            break;
                        }
                        let j = soldier_at_slot[ns];
                        if j != usize::MAX && trampled[j] <= 0.0 {
                            weave_bond(j, f * (sy * step as f32));
                            break;
                        }
                    }
                    if nn > 0.0 {
                        // The draping net: where my live neighbours want me to
                        // sit (their positions + my rest offset from each) — the
                        // spring that holds the lattice.
                        let net_to = nsum * (1.0 / nn) - p;
                        net_target = Some(net_to);
                        soldier_stretch = bond_stretch / nn;
                        soldier_pivot = bond_pivot / nn;
                    }
                    // ENEMY BOND — the binary CONNECTED state, and the ONE force
                    // that holds a man AT his foe. A man within reach is bonded to
                    // him by the SAME weave spring as a friendly neighbour: rest
                    // length = reach. It WELDS the fronts (the pusher drives his
                    // foe back but cannot detach and walk through) and, being a
                    // WEAVE spring — the exponential, UN-capped comp_push — it owns
                    // the inside-reach standoff outright: the magnet no longer
                    // repels here, so this is the only "off my foe" push and it
                    // cannot fight a capped twin. A plowing horse (trample) does
                    // not weld to its prey — it rides through.
                    if aware_i && fighting[i] == 1 && !trampling {
                        let te = target[i] as usize;
                        let ep = Vec2::new(prev_positions[2 * te], prev_positions[2 * te + 1]);
                        let d = p - ep; // foe -> me
                        let al = d.len();
                        if al > 1e-3 {
                            // Rest: sit at reach from the foe, along the line to
                            // him. Blend the weld into the net target at half
                            // weight (the bond is one strong neighbour).
                            let bond_to = ep + d * (reach_u / al) - p;
                            net_target =
                                Some(net_target.map_or(bond_to, |nt| (nt + bond_to) * 0.5));
                            // Same exponential shove-apart if I am inside his reach.
                            let comp = reach_u - al;
                            if comp > 0.0 {
                                let push = tun.compress_strength
                                    * ((comp / tun.compress_scale).exp() - 1.0);
                                comp_push = comp_push + d * (push / al);
                                crush_scalar += push;
                            }
                        }
                    }
                }
                // STRETCH drives "out of place" (surge / straggler): a man torn
                // from his neighbours has long bonds; a packed man (compression)
                // does not surge. PIVOT feeds cohesion only (a wrapped line is in
                // formation, just bent).
                let err = soldier_stretch;
                err_sum += err;
                pivot_sum += soldier_pivot;
                let mut max_sp = if err > tun.surge_err_threshold {
                    sprint_sp
                } else {
                    keep_up_sp
                };
                // No two men run alike: each soldier has a personal TOP
                // speed (a fixed fraction of the sprint ceiling). A walking
                // pace is below everyone's ceiling — the line stays dressed;
                // a running pace is above the slowest fifth's — they trail,
                // and the formation frays the longer it runs. The ceiling is
                // the charge sprint while charging, so the burst isn't clamped.
                // Keyed by a MIRROR-INVARIANT slot id, not the raw soldier index:
                // under the 180° clash mirror south's man at (file f, rank r) maps
                // to north's at (file F-1-f, rank r), so an index key (south = low
                // indices, north = high) gives the two front ranks DIFFERENT cap
                // patterns — one line systematically faster, the army-scale
                // directional bias. `rank` is preserved under M and `min(f,F-1-f)`
                // is symmetric across the file flip, so mirror-paired men draw the
                // SAME personal top speed (see specs/directional-bias.md).
                let files_n = u.files_eff.max(1) as usize;
                let slot_id = soldier_slot[i] as usize;
                let (file_id, rank_id) = (slot_id % files_n, slot_id / files_n);
                let mkey = rank_id * files_n + file_id.min(files_n - 1 - file_id);
                max_sp = max_sp.min((0.62 + 0.44 * stagger01(mkey, 0xCAFE)) * sprint_sp);
                let idle = u.at_ease
                    && u.move_target.is_none()
                    && u.engaged == 0
                    && hit_ttl[i] <= 0.0
                    && err < 0.6;
                // WEAVE, the sum of real forces — no walls, no clamps:
                //   net_target  the neighbour SPRINGS pulling toward rest shape
                //   comp_push   the exponential push-apart that guards spacing
                //   slot_pull   a weak locator the order drags the sheet by
                //   magnet      the pull onto the enemy (the front line's glue)
                // A man is steered by their sum; he is STOPPED only by real bodies
                // (collision), never by a positional rule.
                // WEAVE STIFFNESS scales the neighbour lattice — the rest-shape
                // spring AND the compression resistance — but NOT the slot
                // fallback (no live neighbours = no weave to stiffen). A stiffer
                // lattice holds its rank against the magnet, so only the
                // frontline closes and the back ranks don't pile in.
                // weave_stiffness stiffens the REST-SHAPE spring (hold the grid),
                // NOT the compression: a pressing block must still squeeze axially
                // (rear ranks compressing against the held front), so comp_push
                // stays at baseline. The two deformations are different animals —
                // a PANCAKE is a shear (pivot_stiffness resists it), while axial
                // depth compression is left free. Lumping compression into
                // stiffness fought the very press it's meant to win.
                // A COMMITTED CHARGE suspends its OWN cohesion: the formation
                // stretches INTO the charge, the front not reeled back by the
                // weave (which, stiff, otherwise bleeds the gallop — a charging
                // line arrives slow and spent). It rides forward on its order
                // (slot_pull) alone, and re-forms when the charge spends. Same
                // trample exemption as the magnet — the soft formation forces are
                // off while the hard physics (momentum, bodies, bleed) rule.
                // The weave is STIFF by default — every unit wants to hold its
                // grid, even while pressing (a grinding clash moves slowly but is
                // still trying to keep formation; speed does NOT mark unwillingness).
                // Two DISCRETE carve-outs, both "committed to movement, formation
                // stretches INTO the motion instead of the stiff weave dragging it":
                //   - a CHARGE (trampler riding through), and
                //   - a RUN under a MOVE order (a march/run to a destination — the
                //     stiff weave otherwise reels the stretching run back and bleeds
                //     ~20% of the pace).
                // A FIGHTING unit (no move order) or one that has ARRIVED (stalled,
                // mass_advance low) stays stiff and holds — so a press, a wrap-
                // attack, and a defence are all full-stiff; only genuine locomotion
                // is soft. This is NOT the continuous "soft when moving" gradient
                // (which wrongly softened a slow press and blobbed it).
                let running = !strict_formation
                    && u.move_target.is_some()
                    && u.mass_advance > tun.charge_spent_speed;
                let mut steer_to = if trampling || running {
                    Vec2::ZERO
                } else {
                    let s = match net_target {
                        Some(nt) => nt * tun.weave_stiffness + comp_push,
                        None => to + comp_push,
                    };
                    s + pivot_push * tun.pivot_stiffness
                };
                let fi = target[i];
                let foe_mounted = fi >= 0 && mounted[fi as usize] == 1;
                // The foe I'm fighting is itself ~as wide as my line — a single
                // equal press. This fires from FIRST contact (it needs no developed
                // band), so a set line leans in time to trade the OPENING exchange
                // evenly. `broad_press` (above) is the complement: a wide contact
                // band assembled from ANY number of narrower units. A narrow column
                // is narrow on BOTH, so it still can't trigger the lean.
                let foe_broad = fi >= 0
                    && units[soldier_unit[fi as usize] as usize].files_eff.max(1) * 2 >= my_files;
                // The engaged FRONT of a HOLDING line leans into a broad press: a
                // softened slot grip lets the enemy magnet draw it forward to MEET
                // the foe with as many men as the attacker leans in with, so a set
                // line trades the opening evenly instead of being pinned back and
                // ground down. The REAR keeps the strong hold-grip (it must not lunge
                // with the front and blob). Against a CHARGE (mounted) the braced
                // front PLANTS, it doesn't step onto the hooves, so the anti-charge
                // stop is untouched.
                let slot_pull_i =
                    if !advancing && engaged_i && !foe_mounted && (foe_broad || broad_press) {
                        0.65
                    } else {
                        slot_pull_u
                    };
                steer_to = steer_to + slot_pull_vec * slot_pull_i;
                // ENEMY MAGNET — the SEEK, and nothing else. A pure attract
                // toward the foe a man is fighting: far off he is pulled in hard
                // (he RUNS to contact); at reach the force fades to zero (he STOPS
                // — "once attacking it stops moving"). It does NOT repel inside
                // reach: that standoff is the enemy BOND's job (one force, one
                // place), so the two no longer stack a capped push against an
                // uncapped one at the contact line. Because the bond is to the foe
                // he is FIGHTING, not the nearest body, he does not chase: he
                // advances a step only when that foe falls and he re-targets.
                // Gated on FRONT_CLEAR so only the front (and an overhang man with
                // an open shot — the wrap) seeks. A plowing mass does not seek.
                let mut seeking_flank = false;
                if aware_i && front_clear[i] == 1 && !trampling {
                    let te = target[i] as usize;
                    // Tick-start snapshot, NOT live positions: the steer loop writes
                    // positions[i] in place, so a live read gives an already-moved foe
                    // for low-index soldiers and a stale one for high-index — a
                    // Gauss-Seidel skew that breaks the 180° mirror of a head-on clash.
                    // Every other neighbor read in this loop already snapshots; this
                    // magnet was the lone hole (see specs/directional-bias.md).
                    let ep = Vec2::new(prev_positions[2 * te], prev_positions[2 * te + 1]);
                    let d = ep - p;
                    let dist = d.len();
                    if dist > 1e-3 {
                        let off = dist - reach_u;
                        let pull = (tun.magnet_strength * (1.0 - (-off / tun.magnet_scale).exp()))
                            .max(0.0);
                        let mut magnet = d * (pull / dist);
                        if formation_blocks_forward {
                            let forward = magnet.dot(f).max(0.0);
                            magnet = magnet - f * forward;
                        }
                        steer_to = steer_to + magnet;
                        // An OVERHANGING flank man — his foe is well OFF the unit's
                        // facing axis (to his inner side, not ahead) — must CURL IN
                        // to envelop, not be towed straight ahead by the frame
                        // feed-forward (which would pour the wing past the foe). The
                        // magnet already pulls him inward; just don't override it.
                        let md = dir(u.facing);
                        if !strict_formation && d.dot(md) / dist < 0.45 {
                            seeking_flank = true;
                        }
                    }
                }
                // Idle fidget: a few standing men ease off-slot at a time
                // (recorded so the re-form sort can subtract it).
                fidget_offset[i] = Vec2::ZERO;
                if idle && !engaged_i && stagger01(i * 7 + 5, tick_now / 4) > 0.65 {
                    let fx = stagger01(i * 3, tick_now / 4) - 0.5;
                    let fy = stagger01(i * 3 + 1, tick_now / 4) - 0.5;
                    fidget_offset[i] = Vec2::new(fx, fy) * IDLE_FIDGET;
                    steer_to = steer_to + fidget_offset[i];
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

                let mut v = steer_to * tun.soldier_gain;
                let vl = v.len();
                if vl > max_sp {
                    v = v * (max_sp / vl);
                }
                if formation_blocks_forward {
                    let forward = v.dot(f);
                    // Slow press is allowed; march/slot/cruise speed through the
                    // enemy corridor is not. Pure Move gets a little more creep
                    // to preserve move==attack; combat latches get the tighter
                    // cap that keeps rear ranks from feeding center trampling.
                    let cap = tun.base_speed
                        * if u.move_target.is_some() && matches!(u.mode, OrderMode::Move) {
                            0.2
                        } else {
                            0.15
                        };
                    if forward > cap {
                        v = v - f * (forward - cap);
                    }
                }
                if vl > 0.2 {
                    effort += 1.0 - ground;
                }
                // FRAME FEED-FORWARD: under a MOVE order a man rides at the FRAME's
                // own advance speed, not the weak slot-chase. The slot-chase is a
                // first-order lag — the men trail the moving frame, the leash caps
                // the lead, and the unit never reaches its pace (worse, a slow/deep
                // frame gets PINNED by the leash and the loop deadlocks into a
                // walk). Carrying the frame's velocity makes the formation TRACK
                // its frame with no lag; the slots/weave still dress it laterally,
                // and the per-man max_sp cap below leaves the slow tail to fray.
                // Applies to ANY advancing order — a MOVE (relocate) or an ATTACK
                // (close to contact, incl. a charge): the men track the frame's
                // cruise so the unit reaches its commanded pace / charge speed
                // instead of lagging. Stops per-man once he ENGAGES (the fighting
                // pace owns him then), so the rear ranks keep pressing up while the
                // front fights. (cruise ramps to charge_speed when u.charging.)
                let advancing = u.move_target.is_some() || matches!(u.mode, OrderMode::Attack(_));
                // A man whose move target is BEHIND his facing is BACKING OFF (the
                // engage withdrawal: shields to the threat, feet to the rear). Don't
                // carry the cruise FORWARD along his facing then — it shoves him back
                // INTO the threat and deadlocks the retreat; the slot-chase walks him
                // out. (Attacks/advances face their target, so dot ≥ 0 — unaffected.)
                let backing_off = u
                    .move_target
                    .map_or(false, |mt| (mt - p).dot(dir(u.facing)) < 0.0);
                if advancing
                    && !engaged_i
                    && !seeking_flank
                    && !backing_off
                    && !formation_blocks_forward
                {
                    let md = dir(u.facing);
                    let fwd = v.x * md.x + v.y * md.y;
                    let want = u.cruise.min(max_sp);
                    if want > fwd {
                        v = v + md * (want - fwd);
                    }
                }
                // FIGHTING PACE, directional: a man already engaged may not drive
                // INTO his foe faster than a fighting step. This caps only the
                // velocity component TOWARD the foe — so a charging front rank
                // can't punch through its enemy and stretch off its own rank (the
                // violent depth spike at contact) — while leaving his LATERAL
                // motion free, so an attacker still drapes/wraps along the line.
                // He still surges if torn badly out of place (err high).
                if engaged_i && err < tun.surge_err_threshold {
                    let te = target[i] as usize;
                    // Snapshot, not live: this fighting-pace clamp reads the FOE's
                    // position; in place a low-index front-ranker reads his foe
                    // already moved this tick and a high-index one does not — a
                    // front-line Gauss-Seidel skew that compounds with depth.
                    let ep = Vec2::new(prev_positions[2 * te], prev_positions[2 * te + 1]);
                    let e = ep - p;
                    let el = e.len();
                    if el > 1e-3 {
                        let eh = e * (1.0 / el);
                        let fwd = v.x * eh.x + v.y * eh.y;
                        if fwd > tun.base_speed {
                            v = v - eh * (fwd - tun.base_speed);
                        }
                    }
                }
                if !order_advancing && u.stats.strict_formation && u.engaged > 0 && !seeking_flank {
                    // Packed pike contact lateral friction: a leveled sarissa
                    // block cannot freely crab sideways in the press without
                    // tangling shafts and neighbours. The spring/collision
                    // lattice otherwise rings side-to-side and the phalanx
                    // backline visibly buzzes despite taking no casualties.
                    // Damp only the lateral component that reverses against last
                    // tick, so a steady shove is not dragged down and true flank
                    // wrap stays free.
                    let lat = v.dot(r);
                    let last_lat = Vec2::new(kin_vx[i], kin_vy[i]).dot(r);
                    if lat * last_lat < 0.0 {
                        v = v - r * (lat * (1.0 - tun.idle_settle_damp));
                    }
                }
                // Idle/hold settle damping: a HALTED formation with no order and
                // no contact has no force left to chase — only its own spring
                // residual. A frictionless lattice re-injects that residual every
                // tick and RINGS in a limit cycle: the edge men step out, the
                // separation solver shoves them back, repeat — a velocity that
                // REVERSES every tick. Damping only that reversing component (the
                // steer velocity opposing last tick's motion) turns the spring
                // into a damped oscillator that settles to rest, WITHOUT dragging
                // a steady motion — so a friendly push compressing this block
                // (consistent, non-reversing motion) is untouched; only the
                // oscillation dies.
                //
                // This remains active after a foot threat makes the line ALERT:
                // alertness stops casual fidget, but it should not remove the
                // shock absorber from a braced, unordered formation. Incoming
                // cavalry is different: a not-yet-contacting line needs normal
                // pre-impact looseness so the collision/brace physics, not this
                // settling damper, decide how the charge lands. It still never
                // reaches a man with an order, a moving frame, or actual contact.
                // (kin_v* hold last tick's steer motion, captured after the
                // previous steer pass.)
                if (u.at_ease || !mounted_threat_near)
                    && u.move_target.is_none()
                    && u.engaged == 0
                    && !engaged_i
                    && u.frame_speed < 0.5
                {
                    let last = Vec2::new(kin_vx[i], kin_vy[i]);
                    if v.dot(last) < 0.0 {
                        v = v * tun.idle_settle_damp;
                    }
                }
                let mut np = Vec2::new(p.x + v.x * dt, p.y + v.y * dt);
                // No "halt at your foe" clamp, no "hold the rank" clamp: the man
                // is stopped by his foe's BODY (collision) and held on it by the
                // magnet. The ranks behind stop because the lattice in front of
                // them won't compress flat. Real forces only.
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

                // Read the crush off the weave: EMA the spring load so a strike's
                // jolt or a momentary squeeze doesn't flicker the vice/evade.
                pressure[i] += (crush_scalar - pressure[i]) * press_alpha;
                press_x[i] += (comp_push.x - press_x[i]) * press_alpha;
                press_y[i] += (comp_push.y - press_y[i]) * press_alpha;

                // Facing: a nearby enemy (turn to meet a threat even before he's
                // in reach, and even while the crowd shoves you), then the man who
                // just hit you, then where you're going. This is per-SOLDIER only
                // — the unit's commanded facing never changes, so a flanked block
                // doesn't wheel itself and override the player's order; its edge
                // men just turn outward to face who's on them.
                let desired_face = if aware_i {
                    // Snapshot, not live: face the foe's tick-start position so the
                    // two front ranks of a clash turn symmetrically.
                    let tp = Vec2::new(
                        prev_positions[2 * target[i] as usize],
                        prev_positions[2 * target[i] as usize + 1],
                    );
                    let raw = (tp - p).y.atan2((tp - p).x);
                    // A man faces the threat MASS deliberately and HOLDS it — he
                    // never servos his stance on the tick-to-tick separation churn of
                    // one body (that twitch IS the facing jitter). A foe already in
                    // the unit's FRONT arc is met by holding the commanded frontage;
                    // a foe OFF the front (a flanker) turns him outward — but toward
                    // the threatening unit's CENTROID (a stable direction), not the
                    // single foe's churning position. Both branches track a stable
                    // reference, so no quarter twitches.
                    if wrap_angle(raw - u.facing).abs() < FACING_FRONT_ARC {
                        u.facing
                    } else {
                        let foe_unit = soldier_unit[target[i] as usize] as usize;
                        let c = units[foe_unit].centroid;
                        (c - p).y.atan2((c - p).x)
                    }
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
                // Deadzone: a man holds his stance and only re-aims when the threat
                // has genuinely shifted off it (> ~8°). Without this his facing
                // CHASES the tick-to-tick separation churn of a packed grind —
                // bodies shoved a few cm back and forth move the bearing a hair, and
                // he was re-aiming (and REVERSING) ~25% of ticks at his full turn
                // rate. Real stances don't twitch 30x/s; the deadzone makes facing a
                // deliberate turn, not a servo on positional noise.
                if wrap_angle(desired_face - facings[i]).abs() > FACING_DEADZONE {
                    facings[i] = rotate_toward(
                        facings[i],
                        desired_face,
                        tun.soldier_turn_rate * u.stats.turn_mult * dt,
                    );
                }
            }
            measures.push(UnitMeasure {
                err_sum,
                effort,
                engaged,
                alive_n,
                cx,
                cy,
                opp_press,
                pivot_sum,
            });
        }
        measures
    }

    /// In contact: the anchor tracks the measured front (plus a small lean
    /// when ordered to press), and unit facing follows the threat-weighted
    /// circular mean of contact bearings, masked by adjacent friendlies.
    /// Contact FACING only — the anchor itself answers to one law (see
    /// `clamp_anchor_to_men`): it pursues the order, leashed to the men.
    fn contact_facing(&mut self, measures: &[UnitMeasure], dt: f32) {
        let tun = self.tun;
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
                    let geom = tun.wheel_speed_factor * top / u.pivot_radius().max(1.0);
                    let throttle = crate::math::lerp(tun.min_turn_frac, 1.0, u.cohesion).max(0.6);
                    let center = u.center();
                    u.facing = rotate_toward(u.facing, desired, geom * throttle * dt);
                    u.anchor = center + dir(u.facing) * (0.5 * u.depth());
                    u.pivoting = true; // slots keep relabeling while we wheel
                }
            }
        }
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
            u.stamina = (u.stamina - drain * dt).clamp(0.0, 1.0);

            // Contact memory and casualty rate decay.
            for w in &mut u.contact_hist {
                *w *= 0.96;
            }
            u.recent_casualties *= 1.0 - (dt / 8.0);
        }
    }
}
