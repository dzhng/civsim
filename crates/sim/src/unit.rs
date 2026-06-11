//! Unit (formation) state and slot geometry.
//!
//! All formation *shape* knowledge lives behind `slot_local`, `slot_world`,
//! and the extent/radius methods — wedge/diamond templates later are a change
//! here only, invisible to every other system.

use crate::class::UnitClassId;
use crate::math::{dir, Vec2};
use crate::tunables::Pace;

/// Combat stance: what the rear ranks do while the front fights.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stance {
    /// Press: the formation leans into contact — rear ranks pile weight on
    /// the front, transmitting pressure and walking the enemy back (push of
    /// shields/pikes). The cost is the front rank's room: their own side's
    /// press crushes their evade.
    Othismos,
    /// Fight at weapon's length: no sustained lean, room to work the blade,
    /// evade preserved — but no shove. Open-order fencing.
    Fence,
}

/// How a unit treats contact while executing its order.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum OrderMode {
    /// Halt-and-face while attacked; resume the path when contact ends.
    Move,
    /// Latch onto whatever it meets; resume the path when the target is gone.
    AttackMove,
    /// Latched onto an enemy unit: anchor chases their anchor.
    Attack(u32),
    /// No reflexes, no attack initiation: just go (blocks/evades only).
    Withdraw,
}

pub struct Unit {
    pub class: UnitClassId,
    /// Multiplies the global walk/run/surge speeds (cavalry ≫ infantry).
    pub speed_mult: f32,
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
    pub speed: f32,
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
    pub fatigue: f32,
    /// 0..1, scales how fast the unit re-seats and recovers order.
    pub training: f32,
    pub team: u32,
    /// Smoothed, measured misalignment 0..1. Derived from soldier state.
    pub disorder: f32,
    /// exp(-k * disorder). Throttles turn rate, accel, order response.
    pub cohesion: f32,
    /// True while the unit is halted and rotating in place; slots are
    /// continuously reassigned to nearest soldiers during this.
    pub pivoting: bool,
    pub mode: OrderMode,
    pub stance: Stance,
    /// Charge setting: burst in the final approach of an explicit attack.
    pub charge_enabled: bool,
    /// True only during that final approach (measured each tick).
    pub charging: bool,
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
    /// Enemy unit most recently contacted (latch target for AttackMove).
    pub contact_unit: u32,
    /// Ticks with no contact, for the resume reflex.
    pub quiet_ticks: u32,
    /// Recent casualty count, decaying (morale reads this later).
    pub recent_casualties: f32,
    /// Remaining missiles for the whole unit.
    pub ammo: u32,
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
    /// Mean position of living soldiers (kept fresh; the rout frame).
    pub centroid: Vec2,
    /// Final facing to pivot to on arrival (line-painting orders).
    pub final_facing: Option<f32>,
    /// Reform order: accelerated re-seating for this many seconds.
    pub reform_timer: f32,
    /// Chase routing enemies (true) or hold ground when they break (false).
    pub pursue: bool,
    /// Bearing of the nearest enemy mass within threat range (refreshed each
    /// tick) — foot units keep their face to it while maneuvering nearby.
    pub threat_bearing: Option<f32>,
    /// Reverse-move order: drift to the target WITHOUT turning (back-pedal /
    /// strafe at a penalty, walk only). Foot classes only; horses wheel.
    pub hold_facing: bool,
}

/// Sector index for a world-frame bearing, 12 sectors over (-PI, PI].
pub fn bearing_bucket(bearing: f32) -> usize {
    use std::f32::consts::{PI, TAU};
    let t = (crate::math::wrap_angle(bearing) + PI) / TAU;
    ((t * 12.0) as usize).min(11)
}

/// Center bearing of a sector.
pub fn bucket_bearing(bucket: usize) -> f32 {
    use std::f32::consts::{PI, TAU};
    (bucket as f32 + 0.5) / 12.0 * TAU - PI
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
        crate::class::class_stats(self.class).mounted
    }

    /// The formation's midpoint (anchor is the front-center).
    pub fn center(&self) -> Vec2 {
        self.anchor + dir(self.facing) * (-0.5 * self.depth())
    }
}

/// Give every soldier the nearest slot in the unit's current frame: sort by
/// depth behind the anchor, chunk into ranks, sort each rank laterally.
/// O(n log n), and run every tick while pivoting so ranks relabel themselves
/// around mostly stationary soldiers.
pub(crate) fn reassign_slots(u: &Unit, positions: &[f32], alive: &[u8], soldier_slot: &mut [u32]) {
    let f = dir(u.facing);
    let r = Vec2::new(f.y, -f.x);
    let mut order: Vec<(f32, f32, u32)> = (0..u.count)
        .filter(|&s| alive[u.start + s] == 1)
        .map(|s| {
            let i = u.start + s;
            let p = Vec2::new(positions[2 * i], positions[2 * i + 1]) - u.anchor;
            let depth = -p.dot(f);
            let lateral = p.dot(r);
            (depth, lateral, s as u32)
        })
        .collect();
    order.sort_by(|a, b| a.0.total_cmp(&b.0));
    for rank in order.chunks_mut(u.files_eff.max(1)) {
        rank.sort_by(|a, b| a.1.total_cmp(&b.1));
    }
    for (slot, &(_, _, s)) in order.iter().enumerate() {
        soldier_slot[u.start + s as usize] = slot as u32;
    }
}
