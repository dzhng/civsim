//! Unit (formation) state and slot geometry.
//!
//! All formation *shape* knowledge lives behind `slot_local`, `slot_world`,
//! and the extent/radius methods — wedge/diamond templates later are a change
//! here only, invisible to every other system.

use crate::class::UnitClassId;
use crate::math::{dir, Vec2};
use crate::tunables::Pace;

/// How a unit treats contact while executing its order.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum OrderMode {
    /// Halt-and-face while attacked; resume the path when contact ends.
    Move,
    /// Latched onto an enemy unit: anchor chases their anchor.
    Attack(u32),
    /// No reflexes, no attack initiation: just go (blocks/evades only).
    Disengage,
}

pub struct Unit {
    pub class: UnitClassId,
    /// Visual model id exposed to the renderer. Tactical class remains the
    /// physics/balance role; this lets campaign unit types later choose a
    /// distinct look inside the same class without touching combat.
    pub render_look: u32,
    /// This unit's resolved class stats under the battle's `BalanceConfig`,
    /// captured at spawn. Read instead of the `class_stats` consts so a tuned
    /// config flows into combat. (Fixed for the battle; the config can't change
    /// mid-fight.)
    pub stats: crate::class::UnitClass,
    /// Scales the ABOVE-walk speed range (run/surge/charge), not the walk floor:
    /// every class walks at ~base_speed, but a fast class (cavalry ≫ infantry)
    /// opens a wide gap at the run and a wider one at the charge.
    pub pace_mult: f32,
    /// Per-unit acceleration/braking scale (× base_accel), copied from the
    /// class. Mounted classes wind up harder than foot — see UnitClass.accel_mult.
    pub accel_mult: f32,
    /// Index of this unit's first soldier in the soldier arrays.
    pub start: usize,
    pub count: usize,
    /// Soldiers per rank (the formation as ordered).
    pub files: usize,
    /// Soldiers per rank RIGHT NOW: temporarily reduced to fit corridors
    /// (bridges, defiles); reverts to `files` on open ground.
    pub files_eff: usize,
    /// Waypoints the anchor follows around impassable terrain (last = goal).
    pub path: Vec<Vec2>,
    pub path_idx: usize,
    /// Halted behind same-flow friendly traffic in a corridor.
    pub waiting: bool,
    /// (lateral spacing, rank depth spacing) in meters.
    pub spacing: Vec2,
    /// Front-center of the formation; slots extend behind it.
    pub anchor: Vec2,
    pub facing: f32,
    /// Measured gross motion of the formation FRAME (anchor displacement in
    /// the movement pass, m/s). Honest in the open; blind to the anchor
    /// law's leash pullback, so in a stalled press it reads ~commanded pace
    /// while the men go nowhere — read `mass_advance` for that question.
    pub frame_speed: f32,
    /// CLEAN commanded cruise speed (m/s): ramps toward the unit's pace under a
    /// move order and decays to 0 otherwise. Unlike `frame_speed` it is the
    /// INTENDED speed, never the leash-corrupted measurement — so the men can
    /// feed it forward to track the frame without the loop death-spiralling.
    pub cruise: f32,
    /// How braced the unit currently is, 0..1: ramps toward "planted" while
    /// halted (over `brace_ramp_secs`), drops instantly when it gets moving. See
    /// `brace()`.
    pub brace_ramp: f32,
    pub move_target: Option<Vec2>,
    /// Order awaiting transmission: a disordered unit takes time to respond.
    /// (cohesion-gated; the pie timer in the UI reads these.)
    pub pending_target: Option<Vec2>,
    pub pending_mode: OrderMode,
    pub pending_timer: f32,
    pub pending_total: f32,
    pub pace: Pace,
    /// Shared stamina reservoir, 1 = fresh. Drained by running and by the
    /// fraction of soldiers surging; recovered at rest.
    pub stamina: f32,
    /// 0..1, scales how fast the unit re-seats and recovers order.
    pub training: f32,
    pub team: u32,
    /// Which way home lies along y: +1 if this unit deployed in the top half of
    /// the field, -1 in the bottom half — i.e. toward its own map edge (where
    /// campaign reinforcements also arrive). A broken unit flees straight this
    /// way. Fixed at spawn (a sign, so it holds even if the unit is later shoved
    /// past the edge).
    pub home_dir_y: f32,
    /// Smoothed, measured misalignment 0..1. Derived from soldier state.
    pub disorder: f32,
    /// exp(-k * disorder). Throttles turn rate, accel, order response.
    pub cohesion: f32,
    /// True while the unit is halted and rotating in place; slots are
    /// continuously reassigned to nearest soldiers during this.
    pub pivoting: bool,
    pub mode: OrderMode,
    /// Charge setting: burst in the final approach of an explicit attack.
    pub charge_enabled: bool,
    /// True only during that final approach (measured each tick).
    pub charging: bool,
    /// Seconds this burst has been running: a charge is a SPRINT, not a
    /// gait — it ends when the mass lands or the legs give out (~2x window).
    pub charge_time: f32,
    /// Stamina drain multiplier from the class (the cost of the kit in a FIGHT):
    /// the combat drain is scaled by it — armor is paid for in wind.
    pub fight_drain_mult: f32,
    /// Extra factor on MOVEMENT drain (run/terrain/charge), on top of `fight_drain_mult`.
    /// 1.0 for foot; <1 for cavalry (the horse carries the kit, so moving is cheap).
    pub move_drain_mult: f32,
    /// The burst has reached impact speed (mass_advance ≥ charge_min_speed),
    /// contact or not. Arms the spent check: from here, the mass falling
    /// back below charge_spent_speed means the crowd has bled the momentum
    /// dry — the physical end of the charge.
    pub charge_at_speed: bool,
    /// Path stashed by the engagement reflex, resumed when contact ends.
    pub resume_target: Option<Vec2>,
    /// Living soldiers (formation shrinks as men fall).
    pub alive_count: usize,
    pub deaths_since_reform: usize,
    /// Soldiers engaged in melee last tick (measured).
    pub engaged: usize,
    /// Decaying histogram of enemy-contact bearings (12 sectors, world frame):
    /// the contact-facing rule reads this after masking friendly sectors.
    pub contact_hist: [f32; 12],
    /// Enemy unit most recently contacted (latch target for pursue-moves).
    pub contact_unit: u32,
    /// Ticks with no contact, for the resume reflex.
    pub quiet_ticks: u32,
    /// A unit that has fought must later re-even laterally once contact has
    /// stayed clear for a short beat.
    pub disengage_reform_pending: bool,
    /// Recent casualty count, decaying (morale reads this later).
    pub recent_casualties: f32,
    /// Cumulative losses split by CAUSE — measurement only, never read by sim
    /// logic. Lets a test see HOW a unit died instead of one opaque total:
    /// `lost_impact` (felled by a charge's bodily shock), `lost_charge_melee`
    /// (cut down by a blade still carrying its charge — the lance going in),
    /// `lost_grind_melee` (killed in the standing press), `lost_missile` (shot).
    /// `lost_post_rout` counts those (any cause) that fell AFTER this unit broke
    /// — the ride-down, which should never be read as decisive killing power.
    pub lost_impact: u32,
    pub lost_charge_melee: u32,
    pub lost_grind_melee: u32,
    pub lost_missile: u32,
    pub lost_post_rout: u32,
    /// Remaining missiles for the whole unit.
    pub ammo: u32,
    /// Test-owned missile armament: when set, OVERRIDES the per-class
    /// `missile_spec` (so a scenario can pin a FAKE archer's range/ammo/damage
    /// and stay balance-independent). None = use the class table.
    pub missile_override: Option<crate::missiles::MissileSpec>,
    pub fire_at_will: bool,
    /// Skirmish reflex: automatically keep distance from approaching enemies.
    pub evade_auto: bool,
    /// Will to fight, 0..1. Psychology — but its inputs are all physical
    /// facts and its outputs all physical behaviors.
    pub morale: f32,
    /// Rallying scars: morale can never recover above this again.
    pub morale_ceiling: f32,
    /// Broken: control lost, soldiers flee as bodies through whatever is in
    /// the way.
    pub routing: bool,
    /// Recent missile strikes received (decaying) — being shot at without
    /// reply erodes the will.
    pub recent_missiles: f32,
    /// EMA of backward contact drift while ordered to stand/advance:
    /// "we are losing the push", the precise involuntary-displacement signal.
    pub losing_push: f32,
    /// SMOOTHED `counter_press` (~0.4s) — the SUSTAINED enemy resistance, used by
    /// the trampler ram-drag to tell a screen (low sustained press, ride through)
    /// from a wall (high, bog). The instantaneous press spikes alike on both for a
    /// frame; only the average separates them.
    pub ram_press: f32,
    /// Rank-depth of the enemy this unit is in contact with (copied each tick). A
    /// trampler rides clean through a SHALLOW screen no matter how WIDE it is (its
    /// per-man press is inflated by width into the wall band, but a few ranks have
    /// no depth to stop a horse), so the ram-drag is waived below a few ranks.
    pub foe_ranks: f32,
    /// Mean position of living soldiers (kept fresh; the rout frame).
    pub centroid: Vec2,
    /// No living, non-routing enemy within at_ease_range of this unit's
    /// formation (centroid distance less each unit's half-extent, so a long
    /// line's near edge counts). Drives morale recovery; the renderer derives
    /// the rest pose from the same range. Refreshed each tick (see
    /// Sim::mark_at_ease). Cheap O(units^2).
    pub at_ease: bool,
    /// Mean received push OPPOSING the facing (m/s, press EMAs): the
    /// crowd's measured answer to the unit's drive — the braking half of
    /// the trample force balance. All sources count: the wall brakes the
    /// front rank, the front rank brakes the ranks piling in behind.
    pub counter_press: f32,
    /// Habituation level for the fear inputs (intimidation, contagion):
    /// an EMA of the sustained stimulus. Fear drains on what EXCEEDS it —
    /// a fresh charge hits with full force, a threat that circles without
    /// landing fades to a quarter of its first impression.
    pub fear_adapt: f32,
    /// EMA of the MEN's forward motion (center-of-mass displacement along
    /// facing, m/s; negative = driven back). Downstream of every physical
    /// fact — collisions, stuns, deadlock — so unlike `frame_speed` it
    /// cannot re-walk a leash: if the mass stopped, this reads ~0. The
    /// charge exit reads this: momentum is what the mass actually did.
    pub mass_advance: f32,
    /// Final facing to pivot to on arrival (line-painting orders).
    pub final_facing: Option<f32>,
    /// Reform order: accelerated re-seating for this many seconds.
    pub reform_timer: f32,
    /// Chase routing enemies (true) or hold ground when they break (false).
    pub pursue: bool,
    /// Bearing of the nearest enemy mass while NOT at ease (within
    /// at_ease_range, edge to edge — the same gap that gates morale recovery;
    /// refreshed each tick) — foot units keep their face to it while
    /// maneuvering nearby.
    pub threat_bearing: Option<f32>,
    /// Nearest enemy unit + its edge gap, uncapped (refreshed with
    /// threat_bearing); the pursue latch gates its own reach off the gap.
    pub threat_unit: Option<(u32, f32)>,
    /// Best (smallest) edge gap measured since this auto-latch began: the
    /// chase gives up when the gap has OPENED past this by latch_slip —
    /// "am I gaining?" measured, not a clock. INFINITY = permanent latch
    /// (explicit player attack, or contact made); MAX = revocable latch
    /// armed, first measurement pending.
    pub latch_best: f32,
    /// After an expired chase, don't re-latch immediately.
    pub latch_cd: f32,
    /// Queued follow-up orders (shift-issued): executed in sequence as each
    /// completes. (mode, target, final facing).
    pub order_queue: Vec<(OrderMode, Vec2, Option<f32>)>,
}

/// Sector index for a world-frame bearing, 12 sectors over (-PI, PI].
pub fn bearing_bucket(bearing: f32) -> usize {
    use std::f32::consts::{PI, TAU};
    let t = (crate::math::wrap_angle(bearing) + PI) / TAU;
    ((t * 12.0) as usize).min(11)
}

pub(crate) fn slot_local(slot: usize, files: usize, spacing: Vec2) -> Vec2 {
    let file = slot % files;
    let rank = slot / files;
    Vec2::new(
        (file as f32 - (files as f32 - 1.0) * 0.5) * spacing.x,
        rank as f32 * spacing.y,
    )
}

impl Unit {
    /// Planted feet couple a man to the ground: a halted formation fights
    /// with brace-multiplied effective mass. Bracing RAMPS UP — a line has to
    /// stand a moment to set its feet, plant its shields, ground its butts — so
    /// `brace_ramp` (0..1, integrated over time while halted, dropped instantly
    /// when moving) is how braced it actually is. A unit caught on the move, or
    /// one that only just halted, isn't braced yet: a charge that arrives before
    /// the ramp completes rides through it. Pivoting men are mid-step: no plant.
    pub fn brace(&self) -> f32 {
        if self.pivoting {
            return 1.0;
        }
        1.0 + (self.stats.brace_mult - 1.0) * self.brace_ramp
    }

    pub fn width(&self) -> f32 {
        (self.files_eff.max(1) - 1) as f32 * self.spacing.x
    }

    pub fn depth(&self) -> f32 {
        self.alive_count.max(1).div_ceil(self.files_eff.max(1)) as f32 * self.spacing.y
    }

    /// Distance from the rotation center to the farthest slot, for the
    /// geometric wheel cap while pivoting about the formation center.
    pub fn pivot_radius(&self) -> f32 {
        0.5 * (self.width().powi(2) + self.depth().powi(2)).sqrt()
    }

    /// Farthest slot from the anchor (the rotation point while marching).
    pub fn march_turn_radius(&self) -> f32 {
        (0.25 * self.width().powi(2) + self.depth().powi(2)).sqrt()
    }

    /// World position of a slot: lateral offset along the unit's right axis,
    /// ranks extending backward from the anchor.
    pub fn slot_world(&self, slot: usize) -> Vec2 {
        let local = slot_local(slot, self.files_eff, self.spacing);
        let f = dir(self.facing);
        let r = Vec2::new(f.y, -f.x);
        self.anchor + r * local.x + f * (-local.y)
    }

    pub fn is_mounted(&self) -> bool {
        self.stats.mounted
    }

    /// Keeps driving through contact while charging (no plant at weapon's
    /// length) — the trample is the charge. See `Doctrine::Trample`.
    pub fn tramples(&self) -> bool {
        self.stats.doctrine == crate::class::Doctrine::Trample
    }

    /// Strict-file doctrine (the phalanx): won't freely crab sideways in a press.
    /// See `Doctrine::Strict`.
    pub fn strict_formation(&self) -> bool {
        self.stats.doctrine == crate::class::Doctrine::Strict
    }

    /// Cohesion as the disorder penalties that would otherwise erode a trampler's
    /// fighting read it: melee evade & block, missile evade, morale-drain
    /// amplification. A trampler fights and rides as a loose, constantly-reriding
    /// blob by design, so disorder must not make it a worse killer or break its
    /// nerve — it reads full here. (Turn rate no longer keys off cohesion at all,
    /// for any unit — a blobbed horse must be able to come about and charge back,
    /// and any disordered line must be able to about-face and flee a grind; the
    /// wheel is bounded only by geometry/ground. The ACCELERATION throttle and the
    /// command-order delay still key off real `cohesion` — a messy mob stays
    /// sluggish to build speed and slow to take new orders, its "older lag".)
    pub fn effective_cohesion(&self) -> f32 {
        if self.tramples() {
            1.0
        } else {
            self.cohesion
        }
    }

    /// The pace the legs actually use: an attack closes at the double
    /// regardless of the ordered pace — movement intent, not a combat
    /// bonus. (The charge burst overrides higher still, in pace_speed.
    /// In a stalled press the run drain self-gates on measured frame
    /// speed; the rear ranks' run-pace shove IS the attack pressing.)
    /// An attack advances at the player's ORDERED pace (the walk/run
    /// toggle) — no forced sprint. The charge BURST fires on its own near
    /// contact regardless of pace (sim.rs ignition reads distance, not
    /// gait), so a walked-in attack still charges home; a run-in attack
    /// arrives faster but tired. The player owns the trade.
    pub fn effective_pace(&self) -> Pace {
        self.pace
    }

    /// The formation's midpoint (anchor is the front-center).
    pub fn center(&self) -> Vec2 {
        self.anchor + dir(self.facing) * (-0.5 * self.depth())
    }
}

/// Give every soldier the nearest slot in the unit's current frame: sort by
/// depth behind the anchor, chunk into ranks, sort each rank laterally, and
/// assign slots in the current grid. Full ranks fill every file; a partial rank
/// keeps its nearest lateral files instead of being left-packed, so wrap/flank
/// casualties do not relabel survivors into artificial streamers. This is the
/// lateral formation re-form: run on pivot, explicit reform, corridor width
/// changes, at-ease recovery, and the clear beat after contact. O(n log n).
///
/// `fidget_offset[i]` (the idle-liveliness sway the steer pass added in place)
/// is SUBTRACTED before sorting, so the sort sees each man at his true settled
/// position. This is the whole reason a standing line stays stable: a raw sort
/// has no memory, so a man's ~6 cm idle drift could flip two near-level
/// neighbours' order and SWAP their slots — a full spacing of pointless motion
/// that cascades and, in a fight, flips whether a charge tramples through or
/// stalls (see README, "Visual tests are the ground truth"). Removing the
/// deterministic drift at the source is EXACT: a fighting man carries zero
/// offset, so the re-form is byte-for-byte the clean-formation sort and no
/// combat geometry is touched — unlike quantizing the keys, which can't help
/// but reshape dense scrums and tip matchups that should never move.
pub(crate) fn reassign_slots(
    u: &Unit,
    positions: &[f32],
    fidget_offset: &[Vec2],
    alive: &[u8],
    soldier_slot: &mut [u32],
) {
    let f = dir(u.facing);
    let r = Vec2::new(f.y, -f.x);
    let mut order: Vec<(f32, f32, u32)> = (0..u.count)
        .filter(|&s| alive[u.start + s] == 1)
        .map(|s| {
            let i = u.start + s;
            let pos = Vec2::new(positions[2 * i], positions[2 * i + 1]) - fidget_offset[i];
            let p = pos - u.anchor;
            (-p.dot(f), p.dot(r), s as u32)
        })
        .collect();
    order.sort_by(|a, b| a.0.total_cmp(&b.0));
    let files = u.files_eff.max(1);
    for (rank_idx, rank) in order.chunks_mut(files).enumerate() {
        rank.sort_by(|a, b| a.1.total_cmp(&b.1));
        let n = rank.len();
        let first_file = if n < files {
            let mean_lateral = rank.iter().map(|(_, lat, _)| *lat).sum::<f32>() / n as f32;
            let centered_file = mean_lateral / u.spacing.x.max(0.2) + (files as f32 - 1.0) * 0.5
                - (n as f32 - 1.0) * 0.5;
            (centered_file.round() as isize).clamp(0, (files - n) as isize) as usize
        } else {
            0
        };
        for (k, &(_, _, s)) in rank.iter().enumerate() {
            soldier_slot[u.start + s as usize] = (rank_idx * files + first_file + k) as u32;
        }
    }
}

/// Close casualty holes forward within each file while preserving each man's
/// column identity. A wiped file stays empty; lateral re-evening belongs to
/// `reassign_slots` on reform/disengage, not to a fighting line.
pub(crate) fn compact_columns(u: &Unit, alive: &[u8], soldier_slot: &mut [u32]) {
    let files = u.files_eff.max(1);
    let mut columns: Vec<Vec<(usize, usize)>> = (0..files).map(|_| Vec::new()).collect();
    for s in 0..u.count {
        let i = u.start + s;
        if alive[i] == 0 {
            continue;
        }
        let slot = soldier_slot[i] as usize;
        columns[slot % files].push((slot / files, s));
    }
    for (file, column) in columns.iter_mut().enumerate() {
        column.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
        for (rank, &(_, s)) in column.iter().enumerate() {
            soldier_slot[u.start + s] = (rank * files + file) as u32;
        }
    }
}

/// Seed large adjacent dead-file gaps with a tiny number of rear/deep donors
/// from neighbouring live files. This is not a re-form: most soldiers keep their
/// file, and donors enter the vacant file at their current depth so a later
/// column compaction, not this bridge, pulls them forward.
pub(crate) fn bridge_large_column_gaps(
    u: &Unit,
    alive: &[u8],
    fighting: &[u8],
    front_clear: &[u8],
    soldier_slot: &mut [u32],
) -> usize {
    const MIN_GAP_FILES: usize = 2;
    const MAX_DONORS_PER_GAP_RUN: usize = 6;

    let files = u.files_eff.max(1);
    let mut columns: Vec<Vec<(usize, usize)>> = (0..files).map(|_| Vec::new()).collect();
    for s in 0..u.count {
        let i = u.start + s;
        if alive[i] == 0 {
            continue;
        }
        let slot = soldier_slot[i] as usize;
        columns[slot % files].push((slot / files, s));
    }
    for column in &mut columns {
        column.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    }
    let occupied: Vec<bool> = columns.iter().map(|c| !c.is_empty()).collect();
    let mut moved = 0usize;
    let mut file = 0usize;
    while file < files {
        if occupied[file] {
            file += 1;
            continue;
        }
        let run_start = file;
        while file < files && !occupied[file] {
            file += 1;
        }
        let run_end = file;
        let run_len = run_end - run_start;
        if run_len < MIN_GAP_FILES {
            continue;
        }

        let left = (0..run_start).rev().find(|&f| occupied[f]);
        let right = (run_end..files).find(|&f| occupied[f]);
        let mut run_moved = 0usize;
        let run_cap = run_len.min(MAX_DONORS_PER_GAP_RUN);
        for offset in 0..run_len.div_ceil(2) {
            let left_target = run_start + offset;
            let right_target = run_end - 1 - offset;
            let targets = if left_target == right_target {
                [(left, left_target), (None, right_target)]
            } else {
                [(left, left_target), (right, right_target)]
            };
            for (source, target_file) in targets {
                if run_moved >= run_cap {
                    break;
                }
                if target_file < run_start || target_file >= run_end {
                    continue;
                }
                let Some(source_file) = source else {
                    continue;
                };
                if columns[source_file].len() <= 1 {
                    continue;
                }
                let Some((donor_idx, donor_rank, donor_s)) =
                    choose_gap_donor(u, &columns[source_file], fighting, front_clear)
                else {
                    continue;
                };
                columns[source_file].remove(donor_idx);
                soldier_slot[u.start + donor_s] = (donor_rank * files + target_file) as u32;
                moved += 1;
                run_moved += 1;
            }
            if run_moved >= run_cap {
                break;
            }
        }
    }

    moved
}

fn choose_gap_donor(
    u: &Unit,
    column: &[(usize, usize)],
    fighting: &[u8],
    front_clear: &[u8],
) -> Option<(usize, usize, usize)> {
    let preferred = column.iter().enumerate().rev().find(|&(_, &(_, s))| {
        let i = u.start + s;
        fighting[i] == 0 && front_clear[i] == 0
    });
    let (idx, &(rank, s)) = preferred.or_else(|| column.iter().enumerate().next_back())?;
    Some((idx, rank, s))
}

#[cfg(test)]
mod tests {
    use super::{bridge_large_column_gaps, compact_columns};
    use crate::{Sim, Tunables, Vec2};
    use std::f32::consts::FRAC_PI_2;

    const SEED: u64 = 7;

    fn block(files: usize, ranks: usize) -> (Sim, usize) {
        let mut tun = Tunables::default();
        tun.micro_rough = 0.0;
        tun.morale_enabled = false;
        let mut sim = Sim::new(tun, SEED);
        let unit = sim.spawn_unit(
            Vec2::ZERO,
            FRAC_PI_2,
            files * ranks,
            files,
            Vec2::new(1.0, 1.0),
            0,
            1.0,
        );
        (sim, unit)
    }

    fn kill_slot(sim: &mut Sim, unit: usize, slot: usize) {
        let u = &sim.units[unit];
        let soldier = (u.start..u.start + u.count)
            .find(|&i| sim.alive[i] == 1 && sim.soldier_slot[i] as usize == slot)
            .expect("slot should have a living soldier");
        sim.kill(soldier);
    }

    fn compact(sim: &mut Sim, unit: usize) {
        compact_columns(&sim.units[unit], &sim.alive, &mut sim.soldier_slot);
    }

    fn bridge(sim: &mut Sim, unit: usize) -> usize {
        bridge_large_column_gaps(
            &sim.units[unit],
            &sim.alive,
            &sim.fighting,
            &sim.front_clear,
            &mut sim.soldier_slot,
        )
    }

    fn unit_range(sim: &Sim, unit: usize) -> std::ops::Range<usize> {
        let u = &sim.units[unit];
        u.start..u.start + u.count
    }

    fn file_population(sim: &Sim, unit: usize, file: usize) -> usize {
        let files = sim.units[unit].files_eff.max(1);
        unit_range(sim, unit)
            .filter(|&i| sim.alive[i] == 1 && sim.soldier_slot[i] as usize % files == file)
            .count()
    }

    #[test]
    fn compact_columns_front_death_pulls_only_that_file_forward() {
        let files = 4;
        let killed_file = 2;
        let (mut sim, unit) = block(files, 4);
        let before = sim.soldier_slot.clone();
        kill_slot(&mut sim, unit, killed_file);

        compact(&mut sim, unit);

        for i in unit_range(&sim, unit) {
            if sim.alive[i] == 0 {
                continue;
            }
            let old = before[i] as usize;
            let new = sim.soldier_slot[i] as usize;
            if old % files == killed_file {
                assert_eq!(new % files, killed_file, "soldier {i} changed file");
                assert_eq!(
                    new / files,
                    old / files - 1,
                    "soldier {i} did not step forward exactly one rank"
                );
            } else {
                assert_eq!(new, old, "other files must not move");
            }
        }
    }

    #[test]
    fn compact_columns_mid_death_moves_only_men_behind_in_file() {
        let files = 5;
        let killed_file = 1;
        let killed_rank = 2;
        let (mut sim, unit) = block(files, 5);
        let before = sim.soldier_slot.clone();
        kill_slot(&mut sim, unit, killed_rank * files + killed_file);

        compact(&mut sim, unit);

        for i in unit_range(&sim, unit) {
            if sim.alive[i] == 0 {
                continue;
            }
            let old = before[i] as usize;
            let new = sim.soldier_slot[i] as usize;
            if old % files != killed_file || old / files < killed_rank {
                assert_eq!(new, old, "men ahead of the hole and other files stay put");
            } else {
                assert_eq!(new % files, killed_file, "soldier {i} changed file");
                assert_eq!(
                    new / files,
                    old / files - 1,
                    "soldier {i} did not step forward exactly one rank"
                );
            }
        }
    }

    #[test]
    fn compact_columns_wiped_file_stays_empty() {
        let files = 4;
        let wiped_file = 3;
        let (mut sim, unit) = block(files, 4);
        let before = sim.soldier_slot.clone();
        for rank in 0..4 {
            kill_slot(&mut sim, unit, rank * files + wiped_file);
        }

        compact(&mut sim, unit);

        for i in unit_range(&sim, unit) {
            if sim.alive[i] == 0 {
                continue;
            }
            let new = sim.soldier_slot[i] as usize;
            assert_ne!(new % files, wiped_file, "wiped file should stay empty");
            assert_eq!(
                new, before[i] as usize,
                "neighbouring files must not close sideways"
            );
        }
    }

    #[test]
    fn bridge_large_column_gaps_seeds_two_file_lane_from_rear_edges() {
        let files = 6;
        let ranks = 4;
        let (mut sim, unit) = block(files, ranks);
        let left_rear = sim.units[unit].start + (3 * files + 1);
        let right_rear = sim.units[unit].start + (3 * files + 4);
        for file in [2, 3] {
            for rank in 0..ranks {
                kill_slot(&mut sim, unit, rank * files + file);
            }
        }

        compact(&mut sim, unit);
        let moved = bridge(&mut sim, unit);

        assert_eq!(moved, 2, "a two-file lane should get bounded edge donors");
        assert_eq!(sim.soldier_slot[left_rear] as usize, 3 * files + 2);
        assert_eq!(sim.soldier_slot[right_rear] as usize, 3 * files + 3);
        for i in unit_range(&sim, unit) {
            if sim.alive[i] == 0 || i == left_rear || i == right_rear {
                continue;
            }
            let slot = sim.soldier_slot[i] as usize;
            assert!(
                slot % files != 2 && slot % files != 3,
                "only the bounded donors should seed the lane"
            );
        }
    }

    #[test]
    fn bridge_large_column_gaps_scales_donors_with_wide_lanes() {
        let files = 10;
        let ranks = 5;
        let (mut sim, unit) = block(files, ranks);
        for file in 3..=6 {
            for rank in 0..ranks {
                kill_slot(&mut sim, unit, rank * files + file);
            }
        }

        compact(&mut sim, unit);
        let before = sim.soldier_slot.clone();
        let moved = bridge(&mut sim, unit);

        assert_eq!(
            moved, 4,
            "a four-file lane should seed each dead file without moving a whole rank"
        );
        for file in 3..=6 {
            assert_eq!(
                file_population(&sim, unit, file),
                1,
                "file {file} should get one rear/deep donor"
            );
        }
        let lateral_movers: Vec<_> = unit_range(&sim, unit)
            .filter(|&i| {
                sim.alive[i] == 1
                    && sim.soldier_slot[i] as usize % files != before[i] as usize % files
            })
            .collect();
        assert_eq!(
            lateral_movers.len(),
            4,
            "only the bounded donors should change file"
        );
        for i in lateral_movers {
            let old_file = before[i] as usize % files;
            let old_rank = before[i] as usize / files;
            assert!(
                old_file == 2 || old_file == 7,
                "donor {i} should come from a live edge file, not from the whole unit"
            );
            assert!(
                old_rank >= ranks - 2,
                "donor {i} should come from rear/deep ranks"
            );
        }
    }

    #[test]
    fn bridge_large_column_gaps_leaves_single_file_notch_alone() {
        let files = 5;
        let ranks = 4;
        let (mut sim, unit) = block(files, ranks);
        for rank in 0..ranks {
            kill_slot(&mut sim, unit, rank * files + 2);
        }

        compact(&mut sim, unit);
        let moved = bridge(&mut sim, unit);

        assert_eq!(moved, 0, "single-file notch is still preserved mid-fight");
        for i in unit_range(&sim, unit) {
            if sim.alive[i] == 1 {
                assert_ne!(sim.soldier_slot[i] as usize % files, 2);
            }
        }
    }

    #[test]
    fn compact_columns_never_changes_file_and_is_deterministic_idempotent() {
        let files = 5;
        let (mut first, first_unit) = compacted_after_kills(files);
        let (second, _) = compacted_after_kills(files);
        assert_eq!(
            first.soldier_slot, second.soldier_slot,
            "same kills must produce the same slot map"
        );

        let before_second_compact = first.soldier_slot.clone();
        compact(&mut first, first_unit);
        assert_eq!(
            first.soldier_slot, before_second_compact,
            "a second compact is a no-op"
        );
    }

    fn compacted_after_kills(files: usize) -> (Sim, usize) {
        let (mut sim, unit) = block(files, 5);
        let before = sim.soldier_slot.clone();
        for (file, rank) in [(0, 0), (2, 1), (2, 3), (4, 2)] {
            kill_slot(&mut sim, unit, rank * files + file);
        }

        compact(&mut sim, unit);

        for i in unit_range(&sim, unit) {
            if sim.alive[i] == 1 {
                assert_eq!(
                    sim.soldier_slot[i] as usize % files,
                    before[i] as usize % files,
                    "living soldier {i} changed file"
                );
            }
        }
        (sim, unit)
    }
}
