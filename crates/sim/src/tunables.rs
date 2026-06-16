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
    /// Disorder per metre of mean bond STRETCH (men torn from the lattice).
    pub cohesion_stretch: f32,
    /// Disorder per radian of mean bond PIVOT (the lattice bent/sheared/wrapped
    /// off its rest grid). Tuned so a line wrapped into a U sheds ~20% cohesion.
    pub cohesion_pivot: f32,
    /// Bond COMPRESSION resistance: the push-apart force grows as
    /// exp(compress/scale) - 1, so a slightly squeezed lattice barely
    /// resists but one crushed toward zero spacing pushes back without
    /// bound — the weave can compress (othismos) but NEVER collapses to a
    /// blob. This same resistance is what holds a contact line: backpressure
    /// can't shove the front man through his foe because the foe's weave
    /// won't crush flat. Peak push per unit of (rest - live) over scale.
    pub compress_strength: f32,
    /// Compression decay length (m): squeeze beyond this and the push-apart
    /// climbs steeply. Small = the lattice guards its spacing hard.
    pub compress_scale: f32,
    /// WEAVE STIFFNESS: one multiplier on the whole neighbour lattice — both the
    /// draping-net spring (pull to rest shape) AND the compression resistance
    /// (the push-back that holds a rank against the press). The RESISTANCE that
    /// keeps the back ranks from piling onto the front: only the frontline feels
    /// the enemy magnet, and a stiff enough lattice means that pull cannot drag
    /// the ranks behind it forward. Does NOT touch the slot tether or the magnet.
    pub weave_stiffness: f32,
    /// PIVOT STIFFNESS: the angular spring that snaps a BENT formation straight.
    /// The net/compression springs only police bond LENGTH, so a shear or splay
    /// that keeps its spacings is invisible to them. A frontline man has three
    /// bonds (two lateral + one to the rank behind); when the block PANCAKES
    /// (depth shears into width) that back bond — perpendicular to the lateral
    /// pair — PIVOTS, and only this force feels it. Restores each bond's heading
    /// toward rest (length untouched): a conservative angular spring.
    pub pivot_stiffness: f32,
    /// Enemy MAGNET: peak pull (at weapon reach) toward the nearest enemy body.
    pub magnet_strength: f32,
    /// Magnet decay length (m): the pull falls off as exp(-(dist-reach)/scale),
    /// so the front man is drawn in hard and the ranks behind barely feel it —
    /// the front line is geometry, not a flag.
    pub magnet_scale: f32,
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
    /// Slot attraction for a unit that is NOT attacking (no forward order): much
    /// stronger than `slot_pull`. A holding/defending unit grips its grid, so a
    /// single corner touching an enemy does NOT drag the whole formation out to
    /// wrap him — only a unit with attacking INTENT loosens its slots enough to
    /// drape and envelop. Attacking = weak slots (the wrap); holding = stiff.
    pub slot_pull_hold: f32,
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
    /// Closing speed (m/s) above which an enemy contact is a charge impact.
    pub charge_min_speed: f32,
    /// Impact momentum (m_eff x closing speed) that knocks a body down, PER
    /// unit of the victim's effective mass (brace and backpressure included):
    /// felling is a contest of masses, and the press chain holds a man up.
    pub stun_momentum: f32,
    pub stun_time: f32,
    /// Weapon REPEL: how hard a man's leveled weapon pushes an enemy back out of
    /// its reach, per metre the foe is inside it. A real two-way force in the
    /// collision medium (not a wall): both fronts push each other, so the line
    /// holds at weapon's length — yet a deeper, better-backed enemy can overpower
    /// it and close. A pike (long reach) keeps men far; a sword (short) at arm's
    /// length. Same rule, the reach is the only difference.
    pub weapon_repel: f32,
    /// Seconds a halted formation takes to set its feet and reach full brace
    /// (it drops instantly when moving). A charge landing inside this window
    /// hits a not-yet-braced line and rides through.
    pub brace_ramp_secs: f32,
    /// How fast a trampler bleeds its INTO-the-foe momentum per tick of contact,
    /// per unit of the foe's brace above 1 — a still, braced body brakes the
    /// charge with its mass; a man on the move barely slows it. Scaled by the
    /// mass share, so a LIGHTER charger (smaller mass in the denominator) bleeds
    /// faster and bogs in fewer ranks for free — no per-class knob needed. A few
    /// ranks of braced infantry bog the charge below trample speed; a moving line
    /// lets it ride deeper. The grip is the BODY (brace), not the weapon.
    pub trample_bleed: f32,
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
            cohesion_stretch: 0.5,
            cohesion_pivot: 0.055,
            compress_strength: 1.2,
            compress_scale: 0.22,
            weave_stiffness: 3.0,
            pivot_stiffness: 4.0,
            magnet_strength: 3.0,
            magnet_scale: 0.7,
            min_turn_frac: 0.3,
            min_accel_frac: 0.4,
            soldier_radius: 0.33,
            separation_slide: 0.3,
            separation_max_push: 0.25,
            slot_pull: 0.2,
            slot_pull_hold: 0.8,
            pivot_facing_err: 0.9,
            pivot_exit_err: 0.15,
            wheel_speed_factor: 1.0,
            order_delay_threshold: 0.8,
            order_delay_scale: 6.0,
            order_delay_max: 4.0,
            press_tau: 0.4,
            charge_min_speed: 2.5,
            charge_speed: 4.6,
            charge_window: 2.0,
            latch_slip: 4.0,
            press_brake: 10.0,
            press_brake_floor: 0.45,
            charge_spent_speed: 1.0,
            charge_drain: 1.0 / 25.0,
            morale_enabled: true,
            stun_momentum: 16.0,
            stun_time: 1.3,
            weapon_repel: 15.0,
            brace_ramp_secs: 3.0,
            trample_bleed: 1.5,
            impact_push: 0.2,
            impact_damage: 0.040,
            micro_rough: 1.0,
            hit_push: 0.3,
            combat_drain: 1.0 / 50.0,
            facing_tolerance: 0.3,
            at_ease_range: 60.0,
        }
    }
}
