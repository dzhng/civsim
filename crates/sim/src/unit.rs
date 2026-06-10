//! Unit (formation) state and slot geometry.
//!
//! All formation *shape* knowledge lives behind `slot_local`, `slot_world`,
//! and the extent/radius methods — wedge/diamond templates later are a change
//! here only, invisible to every other system.

use crate::class::UnitClassId;
use crate::math::{dir, Vec2};
use crate::tunables::Pace;

pub struct Unit {
    pub class: UnitClassId,
    /// Multiplies the global walk/run/surge speeds (cavalry ≫ infantry).
    pub speed_mult: f32,
    /// Index of this unit's first soldier in the soldier arrays.
    pub start: usize,
    pub count: usize,
    /// Soldiers per rank.
    pub files: usize,
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
        (self.files.max(1) - 1) as f32 * self.spacing.x
    }

    pub fn depth(&self) -> f32 {
        self.count.div_ceil(self.files.max(1)) as f32 * self.spacing.y
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
        let local = slot_local(slot, self.files, self.spacing);
        let f = dir(self.facing);
        let r = Vec2::new(f.y, -f.x);
        self.anchor + r * local.x + f * (-local.y)
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
pub(crate) fn reassign_slots(u: &Unit, positions: &[f32], soldier_slot: &mut [u32]) {
    let f = dir(u.facing);
    let r = Vec2::new(f.y, -f.x);
    let mut order: Vec<(f32, f32, u32)> = (0..u.count)
        .map(|s| {
            let i = u.start + s;
            let p = Vec2::new(positions[2 * i], positions[2 * i + 1]) - u.anchor;
            let depth = -p.dot(f);
            let lateral = p.dot(r);
            (depth, lateral, s as u32)
        })
        .collect();
    order.sort_by(|a, b| a.0.total_cmp(&b.0));
    for rank in order.chunks_mut(u.files) {
        rank.sort_by(|a, b| a.1.total_cmp(&b.1));
    }
    for (slot, &(_, _, s)) in order.iter().enumerate() {
        soldier_slot[u.start + s as usize] = slot as u32;
    }
}
