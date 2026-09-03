//! Sim orchestration: world state, spawning, orders, and the tick pipeline.
//!
//! Tick order:
//!   snapshot prev positions -> order delivery + reflexes -> unit motion ->
//!   contact-mode anchor/facing adjustments -> slot re-forming ->
//!   soldier steering (+ measurement) -> body collision -> combat ->
//!   unit-state integration (disorder, cohesion, stamina, contact decay).

use crate::class::{class_stats, UnitClass, UnitClassId};
#[cfg(feature = "force-trace")]
use crate::force_trace::{ForceChannel, ForceRecord, ForceTrace, ForceTraceFilter};
use crate::grid::SpatialHash;
use crate::math::{dir, rotate_toward, wrap_angle, Vec2};
use crate::movement::{
    drift_factor, pace_speed, soldier_charge_speed, soldier_surge_speed, update_unit_motion,
};
use crate::terrain::{stagger01, Terrain};
use crate::tunables::{Pace, Tunables, DT};
use crate::unit::{
    bridge_large_column_gaps, compact_columns, reassign_slots, slot_local, OrderMode, Unit,
};
use contract::Pcg32;

// A trampler is barely tied to its formation slot: it rides in as a loose blob
// and each rider's real pull is the enemy SEEK, so the lattice can't reel a
// diving rider back. The whole point of a trample is to scatter INTO the enemy
// and break their cohesion, not hold its own line.
const TRAMPLE_SLOT_GRIP: f32 = 0.3;
/// Below this cohesion a moving unit is BLOBBED, not merely stretched into its
/// stride — so it keeps its weave (the stiff lattice) to RE-FORM as it rides,
/// instead of softening it for locomotion. Above it a formed line softens (the
/// run doesn't fight the lattice). This is what pulls a diving trampler back into
/// a column when a Move order rides it off the enemy — the lattice re-forms it,
/// no "re-form" rule. Set above the 0.4 "out of the blob" bar so it clears it.
const REFORM_COH: f32 = 0.55;
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
/// Cheapness gate only: an unstretched adjacent bond is too short to be a
/// meaningful cliff-spanning spring, so terrain sampling starts after this slack.
const WEAVE_TERRAIN_CHECK_STRETCH: f32 = 2.0;
/// Cheapness gate only: settled men do not terrain-sample their slot vector; a
/// far straight-line slot behind a wall is not a walkable target without pathing.
const SLOT_TERRAIN_CHECK_DIST: f32 = 3.0;
/// A unit that has just cleared contact waits this many ticks before lateral
/// re-evening, so a momentary lull does not erase a fighting notch.
const DISENGAGE_REFORM_CLEAR_TICKS: u32 = 30;

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

fn covered_fighting_files(
    u: &Unit,
    alive: &[u8],
    fighting: &[u8],
    soldier_slot: &[u32],
) -> Vec<bool> {
    let files = u.files_eff.max(1);
    let mut covered = vec![false; files];
    for s in 0..u.count {
        let i = u.start + s;
        if alive[i] == 1 && fighting[i] == 1 {
            covered[soldier_slot[i] as usize % files] = true;
        }
    }
    covered
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
            render_look: UnitClassId::LightSpear as u32,
            stats: class_stats(UnitClassId::LightSpear),
            pace_mult: 1.0,
            accel_mult: 1.0,
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
            fight_drain_mult: 1.0,
            move_drain_mult: 1.0,
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
        // Respect the caller's chosen width down to a single rank — a wide, shallow
        // line (a 2-deep pike screen, a skirmish line) is a valid deployment. Only
        // guard the degenerate too-NARROW case (a 1-file column); depth coherence as
        // the unit bleeds is the reform's job, not a spawn-time floor.
        let lower = 4.min(count.max(1));
        let files = files.clamp(lower, count.max(lower));
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
        u.render_look = class as u32;
        u.stats = stats;
        u.pace_mult = stats.pace_mult;
        u.accel_mult = stats.accel_mult;
        u.charge_enabled = stats.charge;
        u.fight_drain_mult = stats.fight_drain_mult;
        u.move_drain_mult = stats.move_drain_mult;
        if let Some(spec) = crate::missiles::missile_spec(class) {
            u.ammo = spec.ammo * count as u32;
        }
        u.evade_auto = matches!(class, UnitClassId::Skirmishers | UnitClassId::HorseArchers);
        idx
    }

    /// Spawn a class unit with explicitly resolved stats. Campaign unit types
    /// use this to keep the tactical role (`class`) while varying the actual
    /// equipment/drill numbers per faction doctrine.
    pub fn spawn_class_stats_with_files(
        &mut self,
        anchor: Vec2,
        facing: f32,
        count: usize,
        files: usize,
        class: UnitClassId,
        stats: UnitClass,
        team: u32,
    ) -> usize {
        self.spawn_class_stats_look_with_files(
            anchor,
            facing,
            count,
            files,
            class,
            stats,
            class as u32,
            team,
        )
    }

    /// Spawn a class unit with resolved stats and an explicit render look. The
    /// extra look id is visual-only: campaign unit variants can dress the same
    /// tactical class differently while combat keeps reading `class`/`stats`.
    pub fn spawn_class_stats_look_with_files(
        &mut self,
        anchor: Vec2,
        facing: f32,
        count: usize,
        files: usize,
        class: UnitClassId,
        stats: UnitClass,
        render_look: u32,
        team: u32,
    ) -> usize {
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
        u.render_look = render_look;
        u.stats = stats;
        u.pace_mult = stats.pace_mult;
        u.accel_mult = stats.accel_mult;
        u.charge_enabled = stats.charge;
        u.fight_drain_mult = stats.fight_drain_mult;
        u.move_drain_mult = stats.move_drain_mult;
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
        let mut tick_force_records: Vec<ForceRecord> = Vec::new();

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

        #[cfg(feature = "force-trace")]
        let mut trace_unit_index = 0usize;
        for u in &mut self.units {
            let ground = self.terrain.speed_at(u.anchor).max(0.15);
            let a0 = u.anchor;
            #[cfg(feature = "force-trace")]
            let facing0 = u.facing;
            update_unit_motion(&tun, u, dt, ground);
            #[cfg(feature = "force-trace")]
            {
                let soldier = u.start;
                let frame_delta = u.anchor - a0;
                if frame_delta.x != 0.0 || frame_delta.y != 0.0 {
                    tick_force_records.push(ForceRecord::new(
                        self.tick_count,
                        soldier,
                        trace_unit_index,
                        ForceChannel::UnitFrame,
                        frame_delta,
                        "unit_anchor_motion",
                    ));
                }
                if u.facing != facing0 {
                    tick_force_records.push(ForceRecord::new(
                        self.tick_count,
                        soldier,
                        trace_unit_index,
                        ForceChannel::UnitFacing,
                        Vec2::new(wrap_angle(u.facing - facing0), 0.0),
                        "unit_motion_facing",
                    ));
                }
                trace_unit_index += 1;
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
        #[cfg(feature = "force-trace")]
        self.force_trace.extend(tick_force_records);

        // A halted frame with slots on unoccupiable ground slides itself clear:
        // the ideal formation must always be physically achievable, or the
        // disorder measurement would report a lie forever. (Marching past
        // rocks stays transient by design — this only acts at rest.)
        for ui in 0..self.units.len() {
            if self.tick_count % 15 != (ui as u64) % 15 {
                continue;
            }
            let slide = {
                let u = &self.units[ui];
                if u.move_target.is_some() || u.pivoting || u.engaged > 0 || u.alive_count == 0 {
                    None
                } else {
                    let my_center = u.center();
                    let my_centroid = u.centroid;
                    let my_frame_r = 0.5 * (u.width() + u.depth());
                    let my_soldier_r = self.radius[u.start];
                    let body_blockers: Vec<(usize, Vec2)> = self
                        .units
                        .iter()
                        .enumerate()
                        .filter_map(|(vi, v)| {
                            if vi == ui || v.alive_count == 0 {
                                return None;
                            }
                            let r = 0.5 * (v.width() + v.depth());
                            if (v.center() - my_center).len() < my_frame_r + r + 2.0 {
                                Some((vi, v.centroid))
                            } else {
                                None
                            }
                        })
                        .collect();

                    let mut esc = Vec2::ZERO;
                    let mut bad = 0;
                    // EVERY slot: a strided sample once skipped two in-wall slots
                    // forever, and the men assigned to them jittered against the
                    // wall until the whole standing lattice resonated (the shallow
                    // cliff-margin burst cycle). The check runs every 15 ticks on
                    // halted units only — full coverage is cheap and the law's
                    // guarantee ("the ideal formation is always achievable") is
                    // only as good as its weakest sample.
                    for s in 0..u.alive_count {
                        let p = u.slot_world(s);
                        if self.terrain.speed_at(p) <= 0.0 {
                            esc = esc + self.terrain.escape_dir(p);
                            bad += 1;
                        }

                        if !body_blockers.is_empty() {
                            for &(vi, other_centroid) in &body_blockers {
                                let v = &self.units[vi];
                                let mut occupied = false;
                                for i in v.start..v.start + v.count {
                                    if self.alive[i] == 0 {
                                        continue;
                                    }
                                    let clearance = self.radius[i] + my_soldier_r;
                                    if (self.soldier_pos(i) - p).len() < clearance {
                                        occupied = true;
                                        break;
                                    }
                                }
                                if occupied {
                                    let away = my_centroid - other_centroid;
                                    let l = away.len();
                                    esc = esc
                                        + if l > 1e-3 {
                                            away * (1.0 / l)
                                        } else {
                                            dir(u.facing + std::f32::consts::PI)
                                        };
                                    bad += 1;
                                    break;
                                }
                            }
                        }
                    }
                    if bad > 0 {
                        let l = esc.len();
                        let step = if l > 1e-3 {
                            esc * (1.0 / l)
                        } else {
                            dir(self.units[ui].facing + std::f32::consts::PI)
                        };
                        Some(step * 0.45)
                    } else {
                        None
                    }
                }
            };
            let Some(slide) = slide else {
                continue;
            };
            self.units[ui].anchor = self.units[ui].anchor + slide;
        }

        // Slot maps change in two distinct ways: fighting/advancing casualties
        // close forward within fixed files, while lateral re-evening is reserved
        // for reform beats or broad, deep contact where stale slot labels would
        // make a physically wide frontage read as a pinched one.
        for ui in 0..self.units.len() {
            let advancing = self.units[ui].move_target.is_some()
                || matches!(self.units[ui].mode, OrderMode::Attack(_));
            let casualties_to_close =
                self.units[ui].deaths_since_reform * 50 > self.units[ui].alive_count.max(1);
            let column_close = casualties_to_close && (self.units[ui].engaged > 0 || advancing);
            let disengage_reform = self.units[ui].disengage_reform_pending
                && self.units[ui].quiet_ticks == DISENGAGE_REFORM_CLEAR_TICKS;
            let files = self.units[ui].files_eff.max(1);
            let ranks = self.units[ui].alive_count as f32 / files as f32;
            let broad_contact_files = if self.units[ui].engaged > 0 && files >= 12 {
                covered_fighting_files(
                    &self.units[ui],
                    &self.alive,
                    &self.fighting,
                    &self.soldier_slot,
                )
                .iter()
                .filter(|&&covered| covered)
                .count()
            } else {
                0
            };
            let engaged_deep_reform = broad_contact_files * 2 > files
                && ranks >= 5.0
                && self.tun.engaged_deep_reform
                && self.tick_count % self.tun.engaged_deep_reform_ticks
                    == (ui as u64) % self.tun.engaged_deep_reform_ticks;
            // A SETTLED, AT-EASE unit (halted, no enemy near) that frayed on
            // the march RE-FORMS on a slow drumbeat so order RECOVERS — without
            // this a unit kept its march disorder forever (nothing re-sorted a
            // standing, unengaged line). Gated on at_ease so it NEVER fires near
            // a fight (re-sorting mid-combat would perturb the scrum).
            let at_ease_reform = self.units[ui].at_ease
                && self.units[ui].frame_speed < 0.3
                && self.units[ui].cohesion < 0.9
                && self.tick_count % 45 == (ui as u64) % 45;

            if self.units[ui].pivoting || disengage_reform || at_ease_reform || engaged_deep_reform
            {
                // The engaged-deep beat fires on a cadence, but its relabels
                // are only WORTH anything when men have fallen since the last
                // beat: with casualties the re-sort is de-facto relief (it
                // redistributes who stands in the kill zone — remove it and a
                // sword block pressed on pikes dies in place, 120 -> 12).
                // WITHOUT casualties the same re-sort is pure permutation
                // noise against an immovable press: ~80 label flips per beat,
                // men visibly walking sideways to swapped slots, fit gains
                // the press erases before the next beat (measured: slot error
                // p50 IMPROVED from 2.0 to 1.15 once the no-death churn was
                // rejected — the transit walks were keeping men off their
                // slots). Zero deaths is the natural, knob-free boundary.
                // The AT-EASE beat is the other standing cadence, and at
                // rest FIT is its only job (no relief semantics to protect):
                // its relabel is kept only when it meaningfully improves
                // total man-slot error (scale-free 10% bar). Without this a
                // big loose unit at rest with cohesion parked under the
                // fire bar re-sorts every 45 ticks forever, and the sort's
                // marginal permutation flips send batches of men on transit
                // walks that KEEP cohesion low — the self-sustaining
                // at-ease relabel storm (manifest on a 350-man skirmish
                // block after an ordinary angled move on the gen map).
                // Transition reforms (pivot, disengage) stay unconditional —
                // they fire once on a state change.
                let deep_cadence = engaged_deep_reform
                    && !(self.units[ui].pivoting || disengage_reform || at_ease_reform);
                let ease_cadence = at_ease_reform && !(self.units[ui].pivoting || disengage_reform);
                let total_dead = self.units[ui].count - self.units[ui].alive_count;
                let noise_beat = deep_cadence && total_dead == self.units[ui].deep_beat_dead_mark;
                if deep_cadence {
                    self.units[ui].deep_beat_dead_mark = total_dead;
                }
                if !noise_beat {
                    let slot_fit = |slots: &[u32], u: &Unit| -> f32 {
                        (u.start..u.start + u.count)
                            .filter(|&i| self.alive[i] == 1)
                            .map(|i| {
                                let p = Vec2::new(self.positions[2 * i], self.positions[2 * i + 1]);
                                (p - u.slot_world(slots[i] as usize)).len()
                            })
                            .sum()
                    };
                    let before = if ease_cadence {
                        Some((
                            self.soldier_slot.clone(),
                            slot_fit(&self.soldier_slot, &self.units[ui]),
                        ))
                    } else {
                        None
                    };
                    reassign_slots(
                        &self.units[ui],
                        &self.positions,
                        &self.fidget_offset,
                        &self.alive,
                        &mut self.soldier_slot,
                    );
                    let mut rejected = false;
                    if let Some((old, before_err)) = before {
                        let after_err = slot_fit(&self.soldier_slot, &self.units[ui]);
                        if after_err > 0.9 * before_err {
                            let u = &self.units[ui];
                            self.soldier_slot[u.start..u.start + u.count]
                                .copy_from_slice(&old[u.start..u.start + u.count]);
                            rejected = true;
                        }
                    }
                    if !rejected {
                        self.units[ui].deaths_since_reform = 0;
                    }
                }
                if disengage_reform {
                    self.units[ui].disengage_reform_pending = false;
                }
            } else if column_close {
                compact_columns(&self.units[ui], &self.alive, &mut self.soldier_slot);
                bridge_large_column_gaps(
                    &self.units[ui],
                    &self.alive,
                    &self.fighting,
                    &self.front_clear,
                    &mut self.soldier_slot,
                );
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

    /// Per-soldier steering and measurement. Returns one `UnitMeasure` per unit.
    fn steer_soldiers(&mut self, dt: f32) -> Vec<UnitMeasure> {
        let tun = self.tun;
        let Sim {
            units,
            soldier_unit,
            positions,
            prev_positions,
            last_disp_x,
            last_disp_y,
            ema_disp_x,
            ema_disp_y,
            mass,
            mom_x,
            mom_y,
            pressure,
            press_x,
            press_y,
            front_clear,
            awareness,
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
            nearest_enemy,
            nearest_enemy_d,
            ..
        } = self;
        let tick_now = *tick_count;
        #[cfg(feature = "force-trace")]
        let mut force_records: Vec<ForceRecord> = Vec::new();
        // Pressure is read straight off the WEAVE now: a man's crush is the
        // load on his springs — the friendly net squeezing him plus the enemy
        // reach-spring shoving him back when ranks pile him inside reach. No
        // separate force ledger; the same springs that move him measure him.
        let press_alpha = 1.0 - (-dt / tun.press_tau).exp();
        let pivot_stretch_slack = 0.10;
        let mut measures = Vec::with_capacity(units.len());
        for u in units.iter() {
            let f = dir(u.facing);
            let r = f.perp();
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
            let strict_formation = u.strict_formation();
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
            let broad_press = covered_fighting_files(u, alive, fighting, soldier_slot)
                .iter()
                .filter(|&&covered| covered)
                .count()
                * 2
                > my_files;
            let narrow_against_much_wider_foot = advancing
                && !strict_formation
                && !u.is_mounted()
                && !u.tramples()
                && units.iter().any(|v| {
                    if v.team == u.team
                        || v.alive_count == 0
                        || v.is_mounted()
                        || v.tramples()
                        || v.files_eff.max(1) < my_files * 4
                    {
                        return false;
                    }
                    let vf = dir(v.facing);
                    if f.dot(vf) > -0.35 {
                        return false;
                    }
                    let vr = vf.perp();
                    let lateral = (u.center() - v.center()).dot(vr).abs();
                    let lateral_overlap = lateral < 0.5 * (u.width() + v.width()) + u.spacing.x;
                    let axial = (v.center() - u.center()).dot(f);
                    lateral_overlap && axial > -u.depth() && axial < 220.0
                });
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

            let mut living_centroid = Vec2::ZERO;
            let mut living_count = 0.0f32;
            for s in 0..u.count {
                let i = u.start + s;
                if alive[i] == 1 {
                    living_centroid =
                        living_centroid + Vec2::new(positions[2 * i], positions[2 * i + 1]);
                    living_count += 1.0;
                }
            }
            if living_count > 0.0 {
                living_centroid = living_centroid * (1.0 / living_count);
            }

            let mut projected_pivot = vec![Vec2::ZERO; u.count];
            if living_count > 0.0 {
                let order_advancing =
                    u.move_target.is_some() || matches!(u.mode, OrderMode::Attack(_));
                let running = !strict_formation
                    && u.move_target.is_some()
                    && u.mass_advance > tun.charge_spent_speed;
                let gathering = u.reform_timer > 0.0
                    && u.cohesion < REFORM_COH
                    && !matches!(u.mode, OrderMode::Attack(_) | OrderMode::Disengage);
                let trampling_unit = u.tramples()
                    && (u.move_target.is_some() || u.mass_advance > tun.charge_spent_speed);
                let weave_active = !((trampling_unit || running) && !gathering);
                if weave_active {
                    let files = u.files_eff.max(1);
                    let (sx, sy) = (u.spacing.x, u.spacing.y);
                    let neighbor_skip = if order_advancing && !strict_formation {
                        1
                    } else {
                        WEAVE_NEIGHBOR_SKIP
                    };
                    let ranks = slot_capacity.div_ceil(files);
                    let mut torque = 0.0f32;
                    let mut inertia = 0.0f32;
                    for s in 0..u.count {
                        let i = u.start + s;
                        if alive[i] == 0 || stun[i] > 0.0 || trampled[i] > 0.0 || u.routing {
                            continue;
                        }
                        let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
                        let si = soldier_slot[i] as usize;
                        let (file, rank) = (si % files, si / files);
                        let mut raw = Vec2::ZERO;
                        let mut pivot_bond = |j: usize, off: Vec2| {
                            if j != usize::MAX && trampled[j] <= 0.0 {
                                let jp =
                                    Vec2::new(prev_positions[2 * j], prev_positions[2 * j + 1]);
                                let d = p - jp;
                                let (al, rl) = (d.len(), off.len());
                                // Same physical bond as the length spring below:
                                // men with a cliff between them are not holding
                                // formation together. Only stretched bonds pay
                                // the segment sample cost.
                                if al > rl + WEAVE_TERRAIN_CHECK_STRETCH
                                    && !terrain.segment_passable(p, jp)
                                {
                                    return;
                                }
                                if al > 1e-3 && rl > 1e-3 {
                                    let (dh, oh) = (d * (1.0 / al), off * (1.0 / rl));
                                    let dot = (dh.x * oh.x + dh.y * oh.y).clamp(-1.0, 1.0);
                                    let tang = oh - dh * dot;
                                    let fighting_mounted =
                                        target[i] >= 0 && mounted[target[i] as usize] == 1;
                                    let pivot_len = if (u.is_mounted()
                                        || fighting_mounted
                                        || narrow_against_much_wider_foot)
                                        && al > rl
                                    {
                                        al.min(rl + pivot_stretch_slack)
                                    } else {
                                        al
                                    };
                                    raw = raw + tang * pivot_len;
                                }
                            }
                        };
                        for step in 1..=file.min(neighbor_skip) {
                            let ns = si - step;
                            let j = soldier_at_slot[ns];
                            if j != usize::MAX && trampled[j] <= 0.0 {
                                pivot_bond(j, r * (sx * step as f32));
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
                                pivot_bond(j, r * (-sx * step as f32));
                                break;
                            }
                        }
                        for step in 1..=rank.min(neighbor_skip) {
                            let ns = si - files * step;
                            let j = soldier_at_slot[ns];
                            if j != usize::MAX && trampled[j] <= 0.0 {
                                pivot_bond(j, f * (-sy * step as f32));
                                break;
                            }
                        }
                        for step in 1..=((ranks - 1 - rank).min(neighbor_skip)) {
                            let ns = si + files * step;
                            if ns >= slot_capacity {
                                break;
                            }
                            let j = soldier_at_slot[ns];
                            if j != usize::MAX && trampled[j] <= 0.0 {
                                pivot_bond(j, f * (sy * step as f32));
                                break;
                            }
                        }
                        let component = raw * tun.pivot_stiffness;
                        projected_pivot[s] = component;
                        let lever = p - living_centroid;
                        torque += lever.x * component.y - lever.y * component.x;
                        inertia += lever.x * lever.x + lever.y * lever.y;
                    }
                    if inertia > 1.0e-6 {
                        let omega = torque / inertia;
                        for s in 0..u.count {
                            let i = u.start + s;
                            if alive[i] == 0 {
                                continue;
                            }
                            let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
                            let lever = p - living_centroid;
                            projected_pivot[s] =
                                projected_pivot[s] - Vec2::new(-omega * lever.y, omega * lever.x);
                        }
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
                    #[cfg(feature = "force-trace")]
                    let before = Vec2::new(positions[2 * i], positions[2 * i + 1]);
                    positions[2 * i] += mom_x[i] * v * dt;
                    positions[2 * i + 1] += mom_y[i] * v * dt;
                    #[cfg(feature = "force-trace")]
                    force_records.push(ForceRecord::new(
                        tick_now,
                        i,
                        soldier_unit[i] as usize,
                        ForceChannel::KnockbackMomentum,
                        Vec2::new(positions[2 * i], positions[2 * i + 1]) - before,
                        "carried_momentum_displacement",
                    ));
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
                    #[cfg(feature = "force-trace")]
                    force_records.push(ForceRecord::new(
                        tick_now,
                        i,
                        soldier_unit[i] as usize,
                        ForceChannel::Routing,
                        Vec2::new(positions[2 * i], positions[2 * i + 1]) - p,
                        "routing_run",
                    ));
                    let desired = run.y.atan2(run.x);
                    #[cfg(feature = "force-trace")]
                    let facing_before = facings[i];
                    facings[i] = rotate_toward(
                        facings[i],
                        desired,
                        tun.soldier_turn_rate * u.stats.turn_mult * dt,
                    );
                    #[cfg(feature = "force-trace")]
                    if facings[i] != facing_before {
                        force_records.push(ForceRecord::new(
                            tick_now,
                            i,
                            soldier_unit[i] as usize,
                            ForceChannel::SoldierFacing,
                            Vec2::new(wrap_angle(facings[i] - facing_before), 0.0),
                            "routing_facing",
                        ));
                    }
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
                // Soldiers have no pathfinding: a HALTED unit's slot behind a
                // wall must stop driving the man, or he grinds at the wall
                // forever. Only while the frame rests — a MARCHING frame's slot
                // sweeps past obstacles, and the through-rock pull composed
                // with the terrain slide is exactly what walks a man around a
                // boulder (zeroing it mid-march strands him behind it).
                let slot_anchor_blocked = u.move_target.is_none()
                    && u.frame_speed < 0.05
                    && to.len() > SLOT_TERRAIN_CHECK_DIST
                    && !terrain.segment_passable(p, slot);
                let slot_anchor_vec = if slot_anchor_blocked { Vec2::ZERO } else { to };
                let mut slot_pull_vec = slot_anchor_vec;
                let mut formation_blocks_forward = false;
                #[cfg(feature = "force-trace")]
                let mut corridor_slot_removed = Vec2::ZERO;
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
                        let vr = vf.perp();
                        let corridor_files = if tun.corridor_deployed_width {
                            v.files.max(v.files_eff)
                        } else {
                            v.files_eff
                        };
                        let half_w = 0.5 * (corridor_files.max(1) - 1) as f32 * v.spacing.x
                            + 0.5 * v.spacing.x;
                        let p_lat = (p - v.center()).dot(vr);
                        let slot_lat = (slot - v.center()).dot(vr);
                        if p_lat.abs().min(slot_lat.abs()) > half_w {
                            continue;
                        }
                        let v_mid = v.center().dot(f);
                        if p.dot(f) > v_mid && slot.dot(f) > v_mid {
                            let forward_pull = slot_pull_vec.dot(f).max(0.0);
                            let removed = f * forward_pull;
                            slot_pull_vec = slot_pull_vec - removed;
                            #[cfg(feature = "force-trace")]
                            {
                                corridor_slot_removed = corridor_slot_removed - removed;
                            }
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
                // feel. The torque-free per-unit component is precomputed above.
                // The scalar crush: the SUM of spring-load magnitudes (each bond's
                // push, plus the enemy reach-spring below). Vector cancels under a
                // two-sided squeeze; this scalar does not — that gap IS the vice.
                let mut crush_scalar = 0.0f32;
                #[cfg(feature = "force-trace")]
                let mut enemy_weld_component = Vec2::ZERO;
                #[cfg(feature = "force-trace")]
                let mut enemy_inside_push = Vec2::ZERO;
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
                            let d = p - jp;
                            let (al, rl) = (d.len(), off.len());
                            // A bond is two men holding formation together; men
                            // with a cliff between them are not doing that. Only
                            // stretched bonds pay the segment sample cost.
                            if al > rl + WEAVE_TERRAIN_CHECK_STRETCH
                                && !terrain.segment_passable(p, jp)
                            {
                                return;
                            }
                            nsum = nsum + jp + off;
                            nn += 1.0;
                            bond_stretch += (al - rl).max(0.0);
                            if al > 1e-3 && rl > 1e-3 {
                                let (dh, oh) = (d * (1.0 / al), off * (1.0 / rl));
                                let dot = (dh.x * oh.x + dh.y * oh.y).clamp(-1.0, 1.0);
                                bond_pivot += dot.acos();
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
                            #[cfg(feature = "force-trace")]
                            let before_bond = net_target.unwrap_or(Vec2::ZERO);
                            net_target =
                                Some(net_target.map_or(bond_to, |nt| (nt + bond_to) * 0.5));
                            #[cfg(feature = "force-trace")]
                            {
                                let after_bond = net_target.unwrap_or(Vec2::ZERO);
                                enemy_weld_component =
                                    enemy_weld_component + (after_bond - before_bond);
                            }
                            // Same exponential shove-apart if I am inside his reach.
                            let comp = reach_u - al;
                            if comp > 0.0 {
                                let push = tun.compress_strength
                                    * ((comp / tun.compress_scale).exp() - 1.0);
                                let push_vec = d * (push / al);
                                comp_push = comp_push + push_vec;
                                #[cfg(feature = "force-trace")]
                                {
                                    enemy_inside_push = enemy_inside_push + push_vec;
                                }
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
                // GATHERING: a unit that just RE-SEATED onto a clean grid (its
                // `reform_timer` running) under a relocate order and is still
                // BLOBBED. It rides at a GATHER pace (a walk) with its weave kept
                // ON (below), so the lattice tightens it back into a COLUMN before
                // it opens up — you cannot re-form at a gallop: release a still-
                // blobbed unit to a sprint and it frays right back apart. Only once
                // formed (cohesion past the bar) does it release to full pace and
                // ride off. The "re-form, ride off" of a trampler pulled out of a
                // dive, emergent: a mob can't sprint until it sorts itself out.
                // Tying it to the RESEAT (not raw cohesion) keeps the weave pulling
                // toward a CLEAN grid; a stale-slot blob would only knot tighter,
                // and a unit that never re-seated (a Move ride-through) softens
                // normally. A DIVE (Attack) never gathers — its blob is the point.
                // A DISENGAGE never gathers (it flees, it doesn't re-form), so the
                // walk-clamp can't pin a unit peeling out of a grind.
                let gathering = u.reform_timer > 0.0
                    && u.cohesion < REFORM_COH
                    && !matches!(u.mode, OrderMode::Attack(_) | OrderMode::Disengage);
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
                // The personal ceiling is MARCHING TEXTURE; the catch-up is
                // the controller's correction and escapes it — but only on a
                // RUNNING march with the enemy still beyond a couple of
                // strides. A slow-legged straggler on a map-scale run who
                // could never out-pace the line falls behind monotonically
                // (measured 0.38 m/s divergence, a 94m tail over 550m);
                // digging deep on the open road caps that tail at ~10m.
                // Approaching contact the cap returns: an uncapped surge
                // near enemy bodies slammed trailing men into crowd presses
                // at sprint speed (a walking spear column out-shoved
                // cavalry; the braced walk-in was annihilated). The burst
                // INTO contact belongs to the charge machinery, untouched.
                // ...and only while ACTUALLY GAINING GROUND: the drift EMA
                // (sustained true displacement, solver included) collapsing
                // toward zero means the road ahead is jammed — by anyone,
                // enemy or friend (a friendly crowd has no nearest_enemy_d
                // to warn with) — and a capped man never surge-slams into
                // the press. The bar sits at a TENTH of a base stride:
                // pressed-dead is ~0 while slow-but-real progress (a man
                // squeezing laterally into a casualty gap at ~0.3 m/s) must
                // stay exempt — at half a stride the guard smothered the
                // wrap line's file backfill and dead files stayed ropes.
                let drift = Vec2::new(ema_disp_x[i], ema_disp_y[i]).len();
                let digging_deep = err > tun.surge_err_threshold
                    && u.move_target.is_some()
                    && matches!(u.pace, Pace::Run)
                    && nearest_enemy_d[i] > 2.0 * tun.surge_speed
                    && drift > 0.1 * tun.base_speed * DT;
                if !digging_deep {
                    max_sp = max_sp.min((0.62 + 0.44 * stagger01(mkey, 0xCAFE)) * sprint_sp);
                }
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
                // Locomotion softens the weave so a moving line stretches into its
                // stride instead of the stiff lattice reeling it back. The
                // exception is a unit still GATHERING: blobbed (cohesion below the
                // re-form bar) under a relocate order, having re-seated onto a
                // clean grid when it took the order. It keeps its weave ON so the
                // lattice tightens it back into a column while the accel-throttle
                // holds the blob to a gather pace — then, formed, it softens and
                // rides off. No "re-form" rule; the gather IS the re-form. A DIVE
                // (Attack) never gathers: its blob is the disruption. (`gathering`
                // computed above, where it also caps the gather pace.)
                let weave_active = !((trampling || running) && !gathering);
                let mut steer_to = if !weave_active {
                    Vec2::ZERO
                } else {
                    let weave_component = match net_target {
                        Some(nt) => nt * tun.weave_stiffness + comp_push,
                        None => slot_anchor_vec + comp_push,
                    };
                    weave_component + projected_pivot[s]
                };
                #[cfg(feature = "force-trace")]
                if weave_active {
                    let net_component = match net_target {
                        Some(nt) => (nt - enemy_weld_component) * tun.weave_stiffness,
                        None => slot_anchor_vec,
                    };
                    let comp_component = comp_push - enemy_inside_push;
                    let pivot_component = projected_pivot[s];
                    for (channel, vec, meta) in [
                        (
                            ForceChannel::WeaveNet,
                            net_component,
                            "net_or_slot_fallback",
                        ),
                        (
                            ForceChannel::CompPush,
                            comp_component,
                            "friendly_weave_compression",
                        ),
                        (
                            ForceChannel::EnemyBondWeld,
                            enemy_weld_component * tun.weave_stiffness,
                            "fighting_target_reach_weld",
                        ),
                        (
                            ForceChannel::EnemyBondInsideReachPush,
                            enemy_inside_push,
                            "inside_reach_exponential_push",
                        ),
                        (
                            ForceChannel::PivotSpring,
                            pivot_component,
                            "bond_angle_spring",
                        ),
                    ] {
                        if vec.x != 0.0 || vec.y != 0.0 {
                            force_records.push(ForceRecord::new(
                                tick_now,
                                i,
                                soldier_unit[i] as usize,
                                channel,
                                vec * (tun.soldier_gain * dt),
                                meta,
                            ));
                        }
                    }
                }
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
                // A trampler DIVING hunts as a swarm: weak slot here, per-rider
                // enemy seek below. The dive engages only once the charge has BOGGED
                // into the grind (`!running`) — while the gallop still carries
                // (running), the mass stays TIGHT so its impact lands concentrated
                // (the knock-down), and it disperses to hunt only after it stalls.
                // A MOVE order is never a dive (it rides through in normal order to
                // its destination — move==attack ride-through for the move case).
                let trample_dive =
                    u.tramples() && matches!(u.mode, OrderMode::Attack(_)) && !running;
                let slot_pull_i = if trample_dive {
                    // Weak slot: the rider hunts, it doesn't hold a line (see
                    // TRAMPLE_SLOT_GRIP). The enemy seek below is its real pull.
                    slot_pull_u * TRAMPLE_SLOT_GRIP
                } else if !advancing && engaged_i && !foe_mounted && (foe_broad || broad_press) {
                    0.65
                } else {
                    slot_pull_u
                };
                steer_to = steer_to + slot_pull_vec * slot_pull_i;
                #[cfg(feature = "force-trace")]
                {
                    let slot_channel = if slot_pull_i == 0.65 {
                        ForceChannel::SlotPullLean
                    } else {
                        ForceChannel::SlotPull
                    };
                    let slot_vec = slot_pull_vec * slot_pull_i;
                    if slot_vec.x != 0.0 || slot_vec.y != 0.0 {
                        force_records.push(ForceRecord::new(
                            tick_now,
                            i,
                            soldier_unit[i] as usize,
                            slot_channel,
                            slot_vec * (tun.soldier_gain * dt),
                            if slot_pull_i == 0.65 {
                                "engaged_lean_0_65"
                            } else {
                                "slot_pull"
                            },
                        ));
                    }
                    let corridor_vec = corridor_slot_removed * slot_pull_i;
                    if corridor_vec.x != 0.0 || corridor_vec.y != 0.0 {
                        force_records.push(ForceRecord::cap(
                            tick_now,
                            i,
                            soldier_unit[i] as usize,
                            ForceChannel::CorridorClamp,
                            (slot_pull_vec - corridor_slot_removed)
                                * slot_pull_i
                                * (tun.soldier_gain * dt),
                            slot_pull_vec * slot_pull_i * (tun.soldier_gain * dt),
                            "slot_forward_removed",
                        ));
                    }
                }
                // ENEMY MAGNET — the SEEK, and nothing else. A pure attract
                // toward the foe a man is fighting: far off he is pulled in hard
                // (he RUNS to contact); at reach the force fades to zero (he STOPS
                // — "once attacking it stops moving"). It does NOT repel inside
                // reach: that standoff is the enemy BOND's job (one force, one
                // place), so the two no longer stack a capped push against an
                // uncapped one at the contact line. Because the bond is to the foe
                // he is FIGHTING, not the nearest body, he does not chase: he
                // advances a step only when that foe falls and he re-targets.
                // Gated on FRONT_CLEAR so for FORMED troops only the front (and an
                // overhang man with an open shot — the wrap) seeks. A TRAMPLER is
                // the exception: under an ATTACK order EVERY rider seeks its own
                // nearest foe, buried or not, so the unit pours INTO the enemy as a
                // swarm of individual hunters and breaks their cohesion — that
                // disruption is the whole point of a trample, and with the weak
                // slot above nothing reels the divers back into a line. A MOVE
                // order is NOT a dive: the trample rides through to its destination
                // (move==attack ride-through), so the swarm-seek is attack-only.
                let mut seeking_flank = false;
                if aware_i && (trample_dive || (front_clear[i] == 1 && !u.tramples())) {
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
                        // Pull FADES to zero at reach (a man eases in, doesn't ram
                        // his foe). For a trampler that fade is what lets MOMENTUM,
                        // not the magnet, carry the mass through: the seek only AIMS
                        // each rider at its nearest foe (the disruption), it does not
                        // clamp him onto it — so the carried charge rides on out.
                        let off = dist - reach_u;
                        let pull = (tun.magnet_strength * (1.0 - (-off / tun.magnet_scale).exp()))
                            .max(0.0);
                        let mut magnet = d * (pull / dist);
                        #[cfg(feature = "force-trace")]
                        let magnet_pre_clamp = magnet;
                        if formation_blocks_forward {
                            let forward = magnet.dot(f).max(0.0);
                            magnet = magnet - f * forward;
                        }
                        if trample_dive {
                            // The seek AIMS the disruption, it never BRAKES the ride:
                            // drop any pull that opposes the unit's facing (a foe
                            // already passed, now behind), so the carried momentum
                            // takes the mass THROUGH and out the far side. The leash
                            // (anchor chases the enemy) wheels it around for another
                            // pass — the back-and-forth, with no rule coding it.
                            let back = magnet.dot(f).min(0.0);
                            magnet = magnet - f * back;
                        }
                        steer_to = steer_to + magnet;
                        // An OVERHANGING flank man — his foe is well OFF the unit's
                        // facing axis (to his inner side, not ahead) — must CURL IN
                        // to envelop, not be towed straight ahead by the frame
                        // feed-forward (which would pour the wing past the foe). The
                        // magnet already pulls him inward; just don't override it.
                        let md = dir(u.facing);
                        if self.tun.seeking_flank_curl
                            && !strict_formation
                            && d.dot(md) / dist < 0.45
                        {
                            seeking_flank = true;
                        }
                        #[cfg(feature = "force-trace")]
                        {
                            if magnet.x != 0.0 || magnet.y != 0.0 {
                                force_records.push(ForceRecord::new(
                                    tick_now,
                                    i,
                                    soldier_unit[i] as usize,
                                    ForceChannel::Magnet,
                                    magnet * (tun.soldier_gain * dt),
                                    if self.tun.seeking_flank_curl
                                        && !strict_formation
                                        && d.dot(md) / dist < 0.45
                                    {
                                        "seeking_flank=true"
                                    } else {
                                        "seeking_flank=false"
                                    },
                                ));
                            }
                            if formation_blocks_forward
                                && (magnet_pre_clamp.x != magnet.x
                                    || magnet_pre_clamp.y != magnet.y)
                            {
                                force_records.push(ForceRecord::cap(
                                    tick_now,
                                    i,
                                    soldier_unit[i] as usize,
                                    ForceChannel::CorridorClamp,
                                    magnet_pre_clamp * (tun.soldier_gain * dt),
                                    magnet * (tun.soldier_gain * dt),
                                    "magnet_forward_removed",
                                ));
                            }
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
                    #[cfg(feature = "force-trace")]
                    force_records.push(ForceRecord::new(
                        tick_now,
                        i,
                        soldier_unit[i] as usize,
                        ForceChannel::Fidget,
                        fidget_offset[i] * (tun.soldier_gain * dt),
                        "idle_fidget",
                    ));
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
                    #[cfg(feature = "force-trace")]
                    let pre_cap = v;
                    v = v * (max_sp / vl);
                    #[cfg(feature = "force-trace")]
                    force_records.push(ForceRecord::cap(
                        tick_now,
                        i,
                        soldier_unit[i] as usize,
                        ForceChannel::SpeedCap,
                        pre_cap * dt,
                        v * dt,
                        "soldier_max_speed",
                    ));
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
                        #[cfg(feature = "force-trace")]
                        let pre_cap = v;
                        v = v - f * (forward - cap);
                        #[cfg(feature = "force-trace")]
                        force_records.push(ForceRecord::cap(
                            tick_now,
                            i,
                            soldier_unit[i] as usize,
                            ForceChannel::CorridorClamp,
                            pre_cap * dt,
                            v * dt,
                            "forward_speed_cap",
                        ));
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
                if matches!(u.mode, OrderMode::Disengage) {
                    if let Some(mt) = u.move_target {
                        let escape = mt - p;
                        let escape_len = escape.len();
                        if escape_len > 1e-3 {
                            let escape_dir = escape * (1.0 / escape_len);
                            let desired = escape_dir.y.atan2(escape_dir.x);
                            let escape_speed = soldier_surge_speed(&tun, u);
                            let escape_factor = drift_factor(desired, facings[i]).max(0.75);
                            let want = (escape_speed * escape_factor * ground).min(max_sp);
                            let along = v.dot(escape_dir);
                            if want > along {
                                #[cfg(feature = "force-trace")]
                                let pre_escape = v;
                                v = v + escape_dir * (want - along);
                                #[cfg(feature = "force-trace")]
                                force_records.push(ForceRecord::new(
                                    tick_now,
                                    i,
                                    soldier_unit[i] as usize,
                                    ForceChannel::DisengageEscape,
                                    (v - pre_escape) * dt,
                                    "disengage_escape_drive",
                                ));
                            }
                        }
                    }
                } else if advancing
                    && !engaged_i
                    && !seeking_flank
                    && !backing_off
                    && !formation_blocks_forward
                    && !gathering
                {
                    // (A GATHERING unit gets no cruise drive: it re-forms IN PLACE
                    // around its re-seated grid — you cannot tighten a blob while
                    // marching it forward, the slots race the laggards — then,
                    // formed, gathering ends and the cruise rides it off.)
                    let md = dir(u.facing);
                    let fwd = v.x * md.x + v.y * md.y;
                    let want = u.cruise.min(max_sp);
                    if want > fwd {
                        #[cfg(feature = "force-trace")]
                        let pre_cruise = v;
                        v = v + md * (want - fwd);
                        #[cfg(feature = "force-trace")]
                        force_records.push(ForceRecord::new(
                            tick_now,
                            i,
                            soldier_unit[i] as usize,
                            ForceChannel::Cruise,
                            (v - pre_cruise) * dt,
                            "frame_feed_forward",
                        ));
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
                            #[cfg(feature = "force-trace")]
                            let pre_cap = v;
                            v = v - eh * (fwd - tun.base_speed);
                            #[cfg(feature = "force-trace")]
                            force_records.push(ForceRecord::cap(
                                tick_now,
                                i,
                                soldier_unit[i] as usize,
                                ForceChannel::FightingPaceCap,
                                pre_cap * dt,
                                v * dt,
                                "toward_foe_base_speed",
                            ));
                        }
                    }
                }
                // FIGHTING TEMPO, tangential: you cannot CROSS a man's
                // front at speed. In blade-lock range, the velocity component
                // PERPENDICULAR to the nearest enemy's bearing is capped at
                // fighting tempo; radial motion stays free — closing is
                // already paced by the directional cap above and backing out
                // is how the wounded circulate (the survivability mechanism a
                // total cap measurably broke: HP2/HP1 hit 2.59x). Sliding
                // along the seam at full stride was the measured motor of the
                // mortal binary orbit (melee-blob slice 05): two casualty-
                // offset fronts thrust past each other's flanks and the pair
                // orbits. A trampler rides through and a routing man flees at
                // fear pace — both exempt; a man torn far out of place still
                // surges (same exemption as the directional cap above).
                let ne = nearest_enemy[i];
                if engaged_i
                    && err < tun.surge_err_threshold
                    && !u.routing
                    && !u.tramples()
                    && ne >= 0
                    && nearest_enemy_d[i] <= tun.fighting_tempo_radius
                {
                    let ep = Vec2::new(
                        prev_positions[2 * ne as usize],
                        prev_positions[2 * ne as usize + 1],
                    );
                    let e = ep - p;
                    let el = e.len();
                    if el > 1e-3 {
                        let eh = e * (1.0 / el);
                        let radial = eh * v.dot(eh);
                        let tangent = v - radial;
                        let tl = tangent.len();
                        let tmax = tun.base_speed * tun.fighting_tempo_tangent_mult;
                        if tl > tmax {
                            #[cfg(feature = "force-trace")]
                            let pre_cap = v;
                            v = radial + tangent * (tmax / tl);
                            #[cfg(feature = "force-trace")]
                            force_records.push(ForceRecord::cap(
                                tick_now,
                                i,
                                soldier_unit[i] as usize,
                                ForceChannel::FightingTempoCap,
                                pre_cap * dt,
                                v * dt,
                                "blade_lock_tangential_tempo",
                            ));
                        }
                    }
                }
                if u.mass_advance < tun.charge_spent_speed
                    && !u.is_mounted()
                    && u.engaged > 0
                    && !seeking_flank
                    && fighting[i] == 0
                {
                    // Packed contact lateral friction: a man wedged in a press
                    // cannot freely crab sideways without tangling weapons and
                    // neighbours — pike or sword alike. The spring/collision
                    // lattice otherwise rings side-to-side and the BACKLINE
                    // buzzes hardest despite taking no casualties (measured:
                    // rank 5 of an immortal grind carried MORE lateral speed
                    // than the front rank trading blows). Damp only the
                    // lateral component that reverses against the last TRUE
                    // step (trajectory frame — the ring closes through the
                    // separation solver, invisible to steer-only kin_v), so a
                    // steady shove is not dragged down and true flank wrap
                    // stays free (seeking_flank exempts it wholesale). Keyed
                    // on MEASURED advance, not the order (Move==Attack): a
                    // stalled grind gets the friction whatever its order
                    // says; a genuinely advancing mass stays loose. A man
                    // TRADING BLOWS keeps full lateral freedom (fighting[i]);
                    // the measured ring lives in the ranks behind the fight,
                    // and they alone pay the drag.
                    let lat = v.dot(r);
                    let last_lat = Vec2::new(last_disp_x[i], last_disp_y[i]).dot(r);
                    if lat * last_lat < 0.0 {
                        #[cfg(feature = "force-trace")]
                        let pre_friction = v;
                        v = v - r * (lat * (1.0 - tun.idle_settle_damp));
                        #[cfg(feature = "force-trace")]
                        force_records.push(ForceRecord::cap(
                            tick_now,
                            i,
                            soldier_unit[i] as usize,
                            ForceChannel::PackedLateralFriction,
                            pre_friction * dt,
                            v * dt,
                            "packed_contact_lateral_reversal",
                        ));
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
                //
                // The reversal is judged against the TRUE trajectory (total
                // displacement, separation solver included), not the steer-only
                // kin_v*: a limit cycle that closes THROUGH the solver — steer
                // onto an occupied spot, get shoved back out — never reverses
                // in the steer frame, so the old steer-frame damp was blind to
                // the friendly-overlap rest buzz by construction. The steady
                // friendly PUSH is the mirror trap: the pressed men's restoring
                // spring opposes the solver-carried motion forever, so
                // resistance alone must not trigger the damp — the drift term
                // below (sustained EMA vs instantaneous step) tells a man
                // being TAKEN somewhere from a man oscillating in place.
                if (u.at_ease || !mounted_threat_near)
                    && u.move_target.is_none()
                    && u.engaged == 0
                    && !engaged_i
                    && u.frame_speed < 0.5
                {
                    let last = Vec2::new(last_disp_x[i], last_disp_y[i]);
                    let ema = Vec2::new(ema_disp_x[i], ema_disp_y[i]);
                    // Oscillating = the spring resists the last step AND the
                    // trajectory carries no sustained drift (the EMA projects
                    // to less than half the instantaneous step — a shape
                    // factor, not a magnitude knob). A steady push has drift
                    // ~= step and is exempt; a solver cycle and a standing
                    // sway both average to nothing and die.
                    if v.dot(last) < 0.0 && last.dot(ema) < 0.5 * last.dot(last) {
                        #[cfg(feature = "force-trace")]
                        let pre_damp = v;
                        v = v * tun.idle_settle_damp;
                        #[cfg(feature = "force-trace")]
                        force_records.push(ForceRecord::cap(
                            tick_now,
                            i,
                            soldier_unit[i] as usize,
                            ForceChannel::IdleSettleDamp,
                            pre_damp * dt,
                            v * dt,
                            "idle_reversal_damp",
                        ));
                    }
                }
                let mut np = Vec2::new(p.x + v.x * dt, p.y + v.y * dt);
                #[cfg(feature = "force-trace")]
                let pre_terrain_np = np;
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
                #[cfg(feature = "force-trace")]
                if np.x != pre_terrain_np.x || np.y != pre_terrain_np.y {
                    force_records.push(ForceRecord::cap(
                        tick_now,
                        i,
                        soldier_unit[i] as usize,
                        ForceChannel::TerrainProject,
                        pre_terrain_np - p,
                        np - p,
                        "terrain_projection",
                    ));
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
                    // A MOUNTED rider faces so its WIELDED weapon bears (slice 04),
                    // not so it stares at the foe — a wide sabre is blind over the
                    // horse's head, so facing the foe puts it where the rider can't
                    // cut. RIDING (a charge / a pass at speed), it faces its TRAVEL
                    // direction: the lance bears forward, and a foe it rides PAST
                    // falls into its flank lobe — "cut who you pass." Bogged into a
                    // GRIND, it turns BROADSIDE so the standing foe sits in that
                    // flank lobe. Foot is unchanged (a front-lobe blade bears where
                    // the man already faces).
                    // A BOGGED mounted grinder (charge spent, the mass no longer
                    // driving through) turns BROADSIDE so a standing foe sits in its
                    // sabre's flank lobe and the blade bears — instead of staring
                    // the foe into the blind front where it cannot cut (slice 04).
                    // A RIDING mount (still driving through at speed) keeps the
                    // foe-facing drive: that forward bore is what shatters the line,
                    // and turning it broadside trades the disruption for nothing
                    // (measured). So the arc-facing is the STANDING cavalry's, not
                    // the charge's. Foot is unchanged.
                    if mounted[i] == 1 && u.mass_advance <= tun.charge_spent_speed {
                        // Face so the GRIND blade's zones bear (the sabre's flank
                        // lobes) — read from the weapon itself, not a global blind
                        // constant.
                        let grind_zones = u
                            .stats
                            .weapons
                            .iter()
                            .filter(|w| !w.is_charge())
                            .max_by(|a, b| a.zones.swing_arc().total_cmp(&b.zones.swing_arc()))
                            .map(|w| w.zones)
                            .unwrap_or(u.stats.weapons[0].zones);
                        crate::strike::face_foe_into_flank(raw, u.facing, grind_zones)
                    } else if wrap_angle(raw - u.facing).abs() < FACING_FRONT_ARC {
                        // A man faces the threat MASS deliberately and HOLDS it — he
                        // never servos his stance on the tick-to-tick separation
                        // churn of one body (that twitch IS the facing jitter). A foe
                        // already in the unit's FRONT arc is met by holding the
                        // commanded frontage; a foe OFF the front (a flanker) turns
                        // him outward — but toward the threatening unit's CENTROID (a
                        // stable direction), not the single foe's churning position.
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
                    // A man turns to a THREAT only as fast as he SEES it: scale the
                    // re-face by his awareness, so a buried interior man (low view)
                    // barely turns and holds his frontage while the exposed edge men
                    // wheel to meet a flanker. Non-threat re-aims (march heading, the
                    // last blow that landed) are unscaled — those he feels regardless.
                    let see = if aware_i { awareness[i] } else { 1.0 };
                    #[cfg(feature = "force-trace")]
                    let facing_before = facings[i];
                    facings[i] = rotate_toward(
                        facings[i],
                        desired_face,
                        tun.soldier_turn_rate * u.stats.turn_mult * see * dt,
                    );
                    #[cfg(feature = "force-trace")]
                    if facings[i] != facing_before {
                        force_records.push(ForceRecord::new(
                            tick_now,
                            i,
                            soldier_unit[i] as usize,
                            ForceChannel::SoldierFacing,
                            Vec2::new(wrap_angle(facings[i] - facing_before), 0.0),
                            "threat_or_motion_facing",
                        ));
                    }
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
        #[cfg(feature = "force-trace")]
        self.force_trace.extend(force_records);
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
                    // Geometric corner-speed cap only — cohesion does NOT throttle
                    // the turn (a disordered unit must still be able to wheel; the
                    // trample carry-through law holds without it).
                    let geom = tun.wheel_speed_factor * top / u.pivot_radius().max(1.0);
                    let center = u.center();
                    #[cfg(feature = "force-trace")]
                    let facing_before = u.facing;
                    #[cfg(feature = "force-trace")]
                    let anchor_before = u.anchor;
                    u.facing = rotate_toward(u.facing, desired, geom * dt);
                    u.anchor = center + dir(u.facing) * (0.5 * u.depth());
                    #[cfg(feature = "force-trace")]
                    {
                        if u.facing != facing_before {
                            self.force_trace.push(ForceRecord::new(
                                self.tick_count,
                                u.start,
                                ui,
                                ForceChannel::UnitFacing,
                                Vec2::new(wrap_angle(u.facing - facing_before), 0.0),
                                "contact_facing",
                            ));
                        }
                        let anchor_delta = u.anchor - anchor_before;
                        if anchor_delta.x != 0.0 || anchor_delta.y != 0.0 {
                            self.force_trace.push(ForceRecord::new(
                                self.tick_count,
                                u.start,
                                ui,
                                ForceChannel::UnitFrame,
                                anchor_delta,
                                "contact_anchor_reseat",
                            ));
                        }
                    }
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
