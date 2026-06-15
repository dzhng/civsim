//! Global gameplay-feel parameters, settable from JS at runtime so tuning
//! never requires a recompile. Per-class stats live in `class.rs`.

/// Fixed simulation timestep (seconds). The sim is deterministic given the
/// same seed and the same sequence of orders at the same tick counts.
pub const DT: f32 = 1.0 / 30.0;

/// Unit movement pace, ordered by the player. Surge (the catch-up sprint)
/// is not a pace: soldiers engage it automatically when out of position.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pace {
    Walk,
    Run,
}

#[derive(Clone, Copy, Debug)]
pub struct Tunables {
    /// Formation march speed (m/s).
    pub base_speed: f32,
    /// Double-time pace when the player orders Run (m/s, fresh unit).
    pub run_speed: f32,
    /// Catch-up sprint for out-of-position soldiers (m/s, fresh unit).
    pub surge_speed: f32,
    /// Slot error (m) beyond which a soldier SPRINTS to regain formation.
    /// Deliberately loose: formations are allowed to get genuinely ragged
    /// while running or wheeling — the surge is a last-ditch correction,
    /// not a constant tidying force.
    pub surge_err_threshold: f32,
    /// Unit fatigue drained per second while running (~90 s to empty).
    /// (Surging itself is drain-free: it is a CORRECTION the controller
    /// orders, not a pace anyone chose — taxing it punished units for
    /// being jostled, and churny motion like kiting paid double.)
    pub run_drain: f32,
    /// Fatigue recovered per second at rest (~4 min for a full bar).
    pub rest_recover: f32,
    /// Fatigue drained per second of fighting fully resistive ground
    /// (scaled by mean (1 - ground speed) over moving soldiers).
    pub terrain_drain: f32,
    /// Formation turn rate at full cohesion (rad/s).
    pub base_turn_rate: f32,
    /// Formation acceleration at full cohesion (m/s^2).
    pub base_accel: f32,
    /// Steering gain toward slot (1/s): higher = snappier seating.
    pub soldier_gain: f32,
    /// Soldier facing turn rate (rad/s).
    pub soldier_turn_rate: f32,
    /// Distance from move target at which the order completes (m).
    pub arrive_radius: f32,
    /// Slot error beyond which a soldier counts as a straggler (m).
    pub straggler_dist: f32,
    /// Slot error is normalized by this many multiples of file spacing.
    pub disorder_norm_spacings: f32,
    /// Time constant for disorder rising (s).
    pub disorder_rise_tau: f32,
    /// Time constant for disorder falling at training=0.5 (s); training divides it.
    pub disorder_fall_tau: f32,
    /// cohesion = exp(-k * disorder).
    pub cohesion_k: f32,
    /// Turn-rate multiplier at zero cohesion.
    pub min_turn_frac: f32,
    /// Acceleration multiplier at zero cohesion.
    pub min_accel_frac: f32,
    /// Personal-space radius per soldier (m); pairs closer than 2r push apart.
    pub soldier_radius: f32,
    /// Tangential fraction of the push: overlapping soldiers slide around
    /// each other instead of deadlocking in symmetric head-on shoving.
    pub separation_slide: f32,
    /// Cap on total separation displacement per soldier per tick (m).
    pub separation_max_push: f32,
    /// How strongly a soldier is pulled toward his ABSOLUTE formation slot,
    /// versus holding station on his live NEIGHBOURS (the draping-net cloth).
    /// Small: the formation is a net that bends and compresses around an
    /// obstacle as one coherent body — the slot is only a weak locating pull so
    /// the sheet stays on the frame. Large (→1): a rigid grid where each man
    /// chases his own slot independently and peels off around a block. The net
    /// coupling is the remainder (1 - slot_pull).
    pub slot_pull: f32,
    /// Heading error (rad) beyond which a unit halts and pivots in place,
    /// continuously re-forming ranks, instead of arcing while marching.
    pub pivot_facing_err: f32,
    /// Heading error (rad) below which a pivoting unit resumes marching.
    /// Well under pivot_facing_err: arcing out a large remainder while
    /// marching is glacial for deep blocks (the geometric cap is tight).
    pub pivot_exit_err: f32,
    /// Scales the geometric turn-rate cap: rotation may never ask the
    /// outermost soldiers to move faster than this fraction of their top speed.
    pub wheel_speed_factor: f32,
    /// Cohesion above this responds to orders immediately.
    pub order_delay_threshold: f32,
    /// Seconds of order delay per point of cohesion shortfall.
    pub order_delay_scale: f32,
    pub order_delay_max: f32,
    /// Pressure EMA time constant (s).
    pub press_tau: f32,
    /// Effective-mass gain per m/s of backpressure along the push axis:
    /// bodies transmit force like a medium (othismos, wedge penetration).
    pub press_drive: f32,
    /// Closing speed (m/s) above which an enemy contact is a charge impact.
    pub charge_min_speed: f32,
    /// Impact momentum (m_eff x closing speed) that knocks a body down, PER
    /// unit of the victim's effective mass (brace and backpressure included):
    /// felling is a contest of masses, and the press chain holds a man up.
    pub stun_momentum: f32,
    pub stun_time: f32,
    /// Extra displacement per m/s of closing speed at impact.
    pub impact_push: f32,
    /// Damage per m/s of knockback when a TRAMPLING mass (horse, chariot)
    /// fells you — the impulse, once per knockdown. Braced, backed men
    /// who keep their feet keep their bones; men bumping men just fall.
    pub impact_damage: f32,
    /// Micro-terrain strength: 1 = full stumble (speed x0.6 inside a
    /// disturbance), 0 = parade ground (tests that need a smooth field).
    pub micro_rough: f32,
    /// Displacement imparted by a landed or blocked strike, scaled by the
    /// attacker/defender effective-mass ratio.
    pub hit_push: f32,
    /// Unit fatigue per second when fully engaged in melee.
    pub combat_drain: f32,
    /// Facing-deviation tolerance (rad) before it counts as disorder.
    pub facing_tolerance: f32,
    /// "At ease" range (m): a unit with no living, non-routing enemy nearer
    /// than this is at ease — it recovers morale (see morale.rs), and the
    /// renderer reads the same range to relax its stance (pikes up). Inside it
    /// the unit is alert and recovers nothing. Combat mass (brace_mult) is a
    /// separate, distance-independent thing — see Unit::brace.
    pub at_ease_range: f32,
    /// Charge burst speed (m/s, fresh foot unit; class speed_mult applies).
    pub charge_speed: f32,
    /// Final-approach window: charge engages within this many seconds of
    /// contact at charge speed.
    pub charge_window: f32,
    /// An auto-latched chase gives up once the edge gap has OPENED this
    /// many meters past the best it ever achieved: measured loss of ground,
    /// with enough slack that wheeling and collision jitter don't spook a
    /// real pursuit. (Explicit attack orders never give up.)
    pub latch_slip: f32,
    /// Ram drag: commanded pace shed per (m/s of measured counter-press ×
    /// the unit's own speed in walking paces). Collision rate grows with
    /// speed, so a slow othismos press barely feels the crowd's answer
    /// while a gallop into a braced wall eats its whole drive.
    pub press_brake: f32,
    /// Counter-press where the crowd's GRIP begins: column jitter reads
    /// ~0.1, a deliberate othismos press ~0.3-0.5 (the press must NOT
    /// brake itself), a column gripping a trample 0.7+. The drag gates in
    /// above this and then the FULL counter-press counts — a wall is not
    /// taxed by the threshold that exists to spare the shove.
    pub press_brake_floor: f32,
    /// Mass speed (m/s) below which a landed charge counts as SPENT — the
    /// crowd has stopped the mass. Sits well under charge_min_speed
    /// (hysteresis): a plow grinding through a thin line keeps its burst,
    /// a mutual impact that stops dead loses it within a stride.
    pub charge_spent_speed: f32,
    /// Fatigue per second while charging.
    pub charge_drain: f32,
    /// Master switch (tests isolating combat mechanics turn it off).
    pub morale_enabled: bool,
}

impl Default for Tunables {
    fn default() -> Self {
        Self {
            base_speed: 1.7,
            run_speed: 3.4,
            surge_speed: 4.4,
            surge_err_threshold: 6.0,
            run_drain: 1.0 / 90.0,
            rest_recover: 1.0 / 240.0,
            terrain_drain: 1.0 / 70.0,
            base_turn_rate: 1.0,
            base_accel: 1.2,
            soldier_gain: 3.0,
            soldier_turn_rate: 8.0,
            arrive_radius: 1.5,
            straggler_dist: 3.0,
            disorder_norm_spacings: 3.0,
            disorder_rise_tau: 0.4,
            disorder_fall_tau: 1.6,
            cohesion_k: 2.5,
            min_turn_frac: 0.3,
            min_accel_frac: 0.4,
            soldier_radius: 0.33,
            separation_slide: 0.3,
            separation_max_push: 0.1,
            slot_pull: 0.2,
            pivot_facing_err: 0.9,
            pivot_exit_err: 0.15,
            wheel_speed_factor: 1.0,
            order_delay_threshold: 0.8,
            order_delay_scale: 6.0,
            order_delay_max: 4.0,
            press_tau: 0.4,
            press_drive: 0.5,
            charge_min_speed: 2.5,
            charge_speed: 4.6,
            charge_window: 2.0,
            latch_slip: 4.0,
            press_brake: 10.0,
            press_brake_floor: 0.45,
            charge_spent_speed: 1.0,
            charge_drain: 1.0 / 25.0,
            morale_enabled: true,
            stun_momentum: 14.0,
            stun_time: 1.3,
            impact_push: 0.2,
            impact_damage: 0.032,
            micro_rough: 1.0,
            hit_push: 0.3,
            combat_drain: 1.0 / 50.0,
            facing_tolerance: 0.3,
            at_ease_range: 60.0,
        }
    }
}
