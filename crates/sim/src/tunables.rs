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
    /// Unit stamina drained per second while running. Calibrated so a
    /// map-scale run (~550m, deployment line to mid) costs about HALF the
    /// tank (measured 170s trip -> 0.5/170 ~= 1/340): the fight, not the
    /// road, empties it — combat_drain (1/50) outdrains the road ~7:1.
    /// (Surging itself is drain-free: it is a CORRECTION the controller
    /// orders, not a pace anyone chose — taxing it punished units for
    /// being jostled, and churny motion like kiting paid double.)
    pub run_drain: f32,
    /// Stamina recovered per second at rest (~4 min for a full bar).
    pub rest_recover: f32,
    /// Stamina drained per second of fighting fully resistive ground
    /// (scaled by mean (1 - ground speed) over moving soldiers).
    pub terrain_drain: f32,
    /// Formation turn rate (rad/s), capped by the geometric corner-speed limit.
    /// Not throttled by cohesion — a disordered unit must still be able to wheel.
    pub base_turn_rate: f32,
    /// Formation acceleration at full cohesion (m/s^2).
    pub base_accel: f32,
    /// Steering gain toward slot (1/s): higher = snappier seating.
    pub soldier_gain: f32,
    /// Soldier facing turn rate (rad/s) — how fast a man pivots his OWN facing to
    /// meet a threat. ~1.6 rad/s ≈ 92°/s: a brisk but deliberate pivot (just under
    /// a second to face a flank), NOT the old parade-ground snap, so a flanked
    /// line's edge men wheel to face who's on them without the whole grind twitching
    /// as targets jostle — yet still quick enough that a shielded man keeps his
    /// front arc on the enemy in a press (drop it much lower and front-arc blockers
    /// lag the jostle and a shielded grind turns into a deletion). Per-class
    /// `turn_mult` scales it (a horse walks its turn at a fraction).
    pub soldier_turn_rate: f32,
    /// Distance from move target at which the order completes (m).
    pub arrive_radius: f32,
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
    /// bound — the weave can compress under depth pressure but NEVER collapses to a
    /// blob. This same resistance is what holds a contact line: backpressure
    /// can't shove the front man through his foe because the foe's weave
    /// won't crush flat. Peak push per unit of (rest - live) over scale.
    pub compress_strength: f32,
    /// Compression decay length (m): squeeze beyond this and the push-apart
    /// climbs steeply. Small = the lattice guards its spacing hard.
    pub compress_scale: f32,
    /// WEAVE STIFFNESS: multiplier on the draping-net REST-SHAPE spring only (the
    /// pull back to rest grid) — NOT the compression push-apart, which stays at
    /// baseline so a pressed block can still squeeze axially. A stiffer
    /// rest-spring is what keeps the back ranks from piling onto the front: only
    /// the frontline feels the enemy magnet, and a stiff enough lattice means that
    /// pull cannot drag the ranks behind it forward. Does NOT touch slot or magnet.
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
    /// Acceleration multiplier at zero cohesion.
    pub min_accel_frac: f32,
    /// Personal-space radius per soldier (m); pairs closer than 2r push apart.
    pub soldier_radius: f32,
    /// Tangential fraction of the push: overlapping soldiers slide around
    /// each other instead of deadlocking in symmetric head-on shoving.
    pub separation_slide: f32,
    /// Diagnostic scale for the deterministic coincident-body index tiebreak.
    /// Default preserves the historical 0.01m nudge; attribution probes may
    /// set this to zero to isolate slide chirality from index ordering.
    pub body_separation_tiebreak: f32,
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
    /// Closing speed (m/s) below which an impact does NOTHING — set ABOVE a walk-in
    /// / jog-in closing so light running itself onto a horse, or a near-matched
    /// same-direction chase, deals zero. Only a head-on charge clears it.
    pub impact_floor: f32,
    /// Closing speed (m/s) at which an impact is FULL — the top of the normalised
    /// ramp that runs from impact_floor (0) to here (1). A committed head-on charge
    /// sits at the top; the floor/full pair separates a charge's shock from a nudge.
    pub impact_full_speed: f32,
    /// Minimum NORMALISED impact dv (ramp·reduced-mass-share, in [0,1]) to knock a
    /// man down. Brace and backpressure fold into the share, so a backed man takes a
    /// smaller dv and keeps his feet; a half-speed clash jostles but never fells.
    pub impact_fell_min: f32,
    pub stun_time: f32,
    /// Weapon REPEL: how hard a man's leveled weapon pushes an enemy back out of
    /// its reach, per metre the foe is inside it. A real two-way force in the
    /// collision medium (not a wall): both fronts push each other, so the line
    /// holds at weapon's length — yet a deeper, better-backed enemy can overpower
    /// it and close. A pike (long reach) keeps men far; a sword (short) at arm's
    /// length. Same rule, the reach is the only difference.
    pub weapon_repel: f32,
    /// Most attackers that may WOUND one man at once. Beyond this a man is crowded
    /// but no further blade can reach him — the (cap+1)th attacker presses and
    /// shoves but cannot land a hit. Caps the local outnumbering that snowballs a
    /// thinning line into the attrition runaway (a wrapped flank ground far past
    /// even). A large value (≥99) is effectively uncapped.
    pub gang_cap: u16,
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
    /// Seconds a man stays BOWLED after a committed charge rides into him — his
    /// weave is suppressed and his neighbours skip him, so the charge opens a
    /// lane that heals this long after it passes (or bogs). Long enough to clear
    /// a path for a galloping rank, short enough that a SPENT charge gets re-
    /// formed around and pinned.
    pub trample_recover: f32,
    /// Extra displacement per m/s of closing speed at impact.
    pub impact_push: f32,
    /// Damage per m/s of knockback when a TRAMPLING mass (horse, chariot)
    /// fells you — the impulse, once per knockdown. Braced, backed men
    /// who keep their feet keep their bones; men bumping men just fall.
    pub impact_damage: f32,
    /// How many men one charger may ride down (kill on impact) per charge
    /// before it merely bowls the rest over. The charge's shock budget — the
    /// lever between "charge devastates the front ranks" and "charge mows".
    pub impact_kill_cap: u32,
    /// Stamina spent by the IMPACTOR for each body it rides down, scaled by the
    /// shock (closing speed / charge_min). Riding through a dense block is a string
    /// of bone-jarring collisions — a horse that plows a light line is blown after,
    /// so a charge is a once-in-a-while card, not a spammable button. (Physical, not
    /// a flat "charge cost": the more it plows, the more it tires.)
    pub impact_drain: f32,
    /// A charge taken on a raised front shield does this fraction of its impact
    /// wound — the brace/shield soaks the shock. Evade is separate (a clean dodge
    /// takes no wound); this is for the man who stands and catches it.
    pub impact_block_mult: f32,
    /// Micro-terrain strength: 1 = full stumble (speed x0.6 inside a
    /// disturbance), 0 = parade ground (tests that need a smooth field).
    pub micro_rough: f32,
    /// Displacement imparted by a landed or blocked strike, scaled by the
    /// attacker/defender effective-mass ratio.
    pub hit_push: f32,
    /// Unit stamina per second when fully engaged in melee.
    pub combat_drain: f32,
    /// How far a SPENT man's guard (block + evade) falls as he tires: at full
    /// stamina his guard is unscaled, at empty it is multiplied by this floor.
    /// This is the PRIMARY thing that resolves a long grind — fresh shielded lines
    /// block nearly everything, but a sustained stalemate drains both sides until
    /// guards COLLAPSE, blows land freely, and one breaks fast. Short, decisive
    /// fights are untouched (stamina is still full in the first ~15s). Set low so
    /// a fully-blown man barely defends — a tiring mirror kills itself FASTER.
    pub stamina_guard_floor: f32,
    /// How hard a SPENT attacker's blow lands, as a fraction of fresh: at full
    /// stamina damage is unscaled, at empty it is multiplied by this floor. The
    /// OFFENCE half of fatigue (the guard floor is the defence half). A tiring
    /// man swings just as often (cadence is stamina-independent) but each blow is
    /// gentler per blow — at full stamina damage is unscaled, fully blown it is
    /// ~0.78 of fresh. This is the OFFENCE-power half of fatigue; `stamina_cadence_floor`
    /// is the OFFENCE-rate half and the guard floor the defence half.
    pub stamina_damage_floor: f32,
    /// SWING RATE under fatigue, as a fraction of fresh: a tiring man swings
    /// SLOWER (the attack interval lengthens toward base / this floor). At full
    /// stamina the interval is unscaled; fully blown it is stretched by up to
    /// 1/floor (floor 0.75 → ~1.33× the interval, ~25% fewer swings). This is the
    /// OFFENCE-RATE half of fatigue, paired with the softer blow and collapsing
    /// guard. Kept GENTLE (0.75): a blown attacker's melee OUTPUT falls to ~60%
    /// (rate × damage), a real drain but not a halving — dropping toward 0.6 here
    /// halves it but ripples through every grind's pacing (lethality timing,
    /// survivability, AI scale-verdict). The floor also bounds the slowdown so a
    /// spent grind can't CRAWL forever (an earlier unbounded version never
    /// resolved an even fight); sweep it, don't nudge — the kill count is a
    /// threshold function of output and moves in cliffs.
    pub stamina_cadence_floor: f32,
    /// "At ease" range (m): a unit with no living, non-routing enemy nearer
    /// than this is at ease — it recovers morale (see morale.rs), and the
    /// renderer reads the same range to relax weapon posture (pikes up). Inside
    /// it the unit is alert and recovers nothing. Combat mass (brace_mult) is a
    /// separate, distance-independent thing — see Unit::brace.
    pub at_ease_range: f32,
    /// Velocity retained per tick by a HALTED, at-ease formation's steer (the
    /// rest is bled as viscous drag). A frictionless lattice would ring forever
    /// in a limit cycle; this turns it into a damped oscillator that settles to
    /// rest — the equilibrium a standing line must reach. Only an idle, enemy-
    /// free, unordered unit is damped, so it never touches a fight or a march.
    pub idle_settle_damp: f32,
    /// Diagnostic switch for the broad-contact engaged slot re-sort. Defaults
    /// on; attribution probes may disable it to test whether re-dress ratchets
    /// accumulated lattice rotation.
    pub engaged_deep_reform: bool,
    /// In blade-lock range a man cannot CROSS his nearest enemy's front
    /// faster than fighting tempo (multiplier on base_speed, tangential
    /// component only) — the melee-blob slice 05 orbit fix. f32::INFINITY
    /// disables (pre-fix behavior).
    pub fighting_tempo_tangent_mult: f32,
    /// The forward corridor a fighting formation contests is its DEPLOYED
    /// frontage, not its casualty-shrunken live width: dead files leave a
    /// notch, not a free lane, until the unit breaks or reforms narrower.
    /// The melee-blob slice 05 candidate for the mortal orbit (the couple
    /// forms when both corridors shrink and both flanks unblock).
    pub corridor_deployed_width: bool,
    /// Surface gap to the nearest enemy under which the tangential tempo cap
    /// binds — true blade-lock, tighter than the fighting flag's reach+0.3.
    pub fighting_tempo_radius: f32,
    /// Diagnostic cadence (ticks) for that re-sort. Default preserves the
    /// historical 60-tick beat; attribution probes sweep it to test whether
    /// rotation rate scales with relabel frequency.
    pub engaged_deep_reform_ticks: u64,
    /// Diagnostic switch for flank curl: when on, overhanging attackers drop
    /// frame feed-forward and let the enemy magnet curl them inward.
    pub seeking_flank_curl: bool,
    /// Charge burst speed (m/s, fresh foot unit; class pace_mult applies).
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
    /// speed, so a slow depth press barely feels the crowd's answer
    /// while a gallop into a braced wall eats its whole drive.
    pub press_brake: f32,
    /// Counter-press where the crowd's GRIP begins: column jitter reads
    /// Reads the SMOOTHED counter-press (sustained, not the contact spike). Set
    /// BETWEEN what a screen the cav rides through sustains (~3-8) and what a wall
    /// it bogs against sustains (~11+): a braced or deep-enough block grips, a thin
    /// or shallow screen is spared. Below the floor the drag is off entirely (a
    /// working slow shove never brakes itself); above it ramps to full over
    /// ~0.6× the floor.
    pub press_brake_floor: f32,
    /// Mass speed (m/s) below which a landed charge counts as SPENT — the
    /// crowd has stopped the mass. Sits well under charge_min_speed
    /// (hysteresis): a plow grinding through a thin line keeps its burst,
    /// a mutual impact that stops dead loses it within a stride.
    pub charge_spent_speed: f32,
    /// Stamina per second while charging.
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
            run_drain: 1.0 / 340.0,
            rest_recover: 1.0 / 480.0,
            terrain_drain: 1.0 / 70.0,
            base_turn_rate: 1.0,
            base_accel: 1.2,
            soldier_gain: 3.0,
            soldier_turn_rate: 1.6,
            arrive_radius: 1.5,
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
            min_accel_frac: 0.4,
            soldier_radius: 0.33,
            separation_slide: 0.3,
            body_separation_tiebreak: 0.01,
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
            charge_window: 5.0,
            latch_slip: 4.0,
            press_brake: 4.0,
            press_brake_floor: 6.0,
            charge_spent_speed: 1.0,
            charge_drain: 1.0 / 20.0,
            morale_enabled: true,
            impact_floor: 2.0,
            impact_full_speed: 8.0,
            impact_fell_min: 0.5,
            stun_time: 3.0,
            weapon_repel: 15.0,
            gang_cap: 3,
            brace_ramp_secs: 3.0,
            trample_bleed: 1.5,
            trample_recover: 0.4,
            impact_push: 0.2,
            impact_damage: 2.0,
            impact_kill_cap: 1,
            impact_drain: 0.0008,
            impact_block_mult: 0.4,
            micro_rough: 1.0,
            hit_push: 0.3,
            combat_drain: 1.0 / 50.0,
            stamina_guard_floor: 0.15,
            stamina_damage_floor: 0.75,
            stamina_cadence_floor: 0.75,
            at_ease_range: 60.0,
            idle_settle_damp: 0.5,
            engaged_deep_reform: true,
            fighting_tempo_tangent_mult: f32::INFINITY,
            corridor_deployed_width: false,
            fighting_tempo_radius: 0.55,
            engaged_deep_reform_ticks: 60,
            seeking_flank_curl: true,
        }
    }
}
