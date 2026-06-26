//! The strike field: where a wielded weapon can actually land a blow, owned by
//! the weapon itself as DATA.
//!
//! A weapon declares its strike ZONES — one or more angular LOBES, in the
//! wielder's own frame (offset from facing), each with a center and half-width:
//!   - a sword / spear / lance / pike is ONE front lobe (`center 0`), as wide as
//!     the blade sweeps (a pike a sliver, a great sword wide);
//!   - a mounted SABRE is TWO flank lobes (`center ±~89°`) — blind over the
//!     horse's head and croup, it cuts down to either side.
//! This replaces the old single `arc` width plus a `mounted ? flank : front`
//! heuristic and the global blind-angle constants: the geometry is now the
//! weapon's own data, and target/face/strike all read the same zones.

use crate::math::wrap_angle;

/// One angular lobe a weapon reaches, in the wielder's frame (rad). `center` is
/// the lobe's mid-bearing off the facing (0 = dead ahead), `half` its half-width.
#[derive(Clone, Copy, Debug)]
pub struct Lobe {
    pub center: f32,
    pub half: f32,
}

/// A weapon's strike zones: 1 or 2 lobes. Replaces the `arc` field. `Copy` and
/// const-constructible so it sits inline in a `Weapon` stat block.
#[derive(Clone, Copy, Debug)]
pub struct Zones {
    lobes: [Lobe; 2],
    len: u8,
}

/// One FRONT lobe of half-width `half` (so a full swing width of `2*half`): a
/// sword, spear, pike, lance — anything aimed where the man faces.
pub const fn front(half: f32) -> Zones {
    Zones {
        lobes: [Lobe { center: 0.0, half }, Lobe { center: 0.0, half }],
        len: 1,
    }
}

/// TWO flank lobes at `±center`, each half-width `half`: a mounted sabre, blind
/// over the horse's head and croup, cutting down to either side.
pub const fn flanks(center: f32, half: f32) -> Zones {
    Zones {
        lobes: [Lobe { center, half }, Lobe { center: -center, half }],
        len: 2,
    }
}

impl Zones {
    fn slice(&self) -> &[Lobe] {
        &self.lobes[..self.len as usize]
    }
    /// The widest lobe's full swing extent (`2*half`) — the "how wide do I sweep"
    /// a crush press chokes (crush sensitivity). For a front weapon this is the
    /// old `arc`; for a flank sabre it is one flank lobe's sweep.
    pub fn swing_arc(&self) -> f32 {
        2.0 * self.slice().iter().fold(0.0f32, |m, l| m.max(l.half))
    }
    /// True if these are FLANK zones (a mounted sabre) — any lobe off the front.
    /// A front-lobe weapon (sword/spear/pike/lance) is false.
    pub fn is_flank(&self) -> bool {
        self.slice().iter().any(|l| l.center.abs() > 1e-3)
    }
    /// Half-width of the primary (front, else widest) lobe — what the obstruction
    /// narrows and the braced-pike bearing checks.
    pub fn primary_half(&self) -> f32 {
        // Prefer a front lobe (center ~0); else the widest.
        self.slice()
            .iter()
            .find(|l| l.center.abs() < 1e-3)
            .map(|l| l.half)
            .unwrap_or_else(|| self.slice().iter().fold(0.0f32, |m, l| m.max(l.half)))
    }
}

/// A weapon's reachable set in the wielder's frame: its `zones` (angular lobes,
/// with the front lobe optionally crowd-narrowed) over a reach band `[min_r,
/// max_r]`. Built per strike/target/face from the wielded weapon.
#[derive(Clone, Copy, Debug)]
pub struct StrikeField {
    zones: Zones,
    pub min_r: f32,
    pub max_r: f32,
}

impl StrikeField {
    /// A foe at SIGNED angular offset `off` (rad, foe bearing − facing) and
    /// surface distance `dist` (m) is in the field: inside some lobe and in reach.
    #[inline]
    pub fn contains(&self, off: f32, dist: f32) -> bool {
        dist >= self.min_r
            && dist <= self.max_r
            && self
                .zones
                .slice()
                .iter()
                .any(|l| wrap_angle(off - l.center).abs() <= l.half)
    }

    /// How far (rad) the wielder must turn to bring the NEAREST lobe edge onto a
    /// foe at signed offset `off`. 0 if the foe is already in a lobe. For a front
    /// lobe this is `max(0, |off| − half)`; for a sabre a foe dead-ahead costs the
    /// swing onto the near flank.
    #[inline]
    pub fn turn_to_edge(&self, off: f32) -> f32 {
        self.zones
            .slice()
            .iter()
            .map(|l| (wrap_angle(off - l.center).abs() - l.half).max(0.0))
            .fold(f32::MAX, f32::min)
    }
}

/// Build the field for a weapon wielding `zones`, with the FRONT lobe narrowed by
/// `front_narrow` (1.0 = none; crowd obstruction shrinks it at strike time) and a
/// uniform aim `tolerance` added to every lobe, over reach `min_r..=max_r`.
#[inline]
pub fn field(
    zones: Zones,
    min_r: f32,
    max_r: f32,
    front_narrow: f32,
    tolerance: f32,
) -> StrikeField {
    let mut z = zones;
    for l in z.lobes.iter_mut() {
        // Only a FRONT lobe chokes in a press and carries the aim tolerance (a man
        // aiming a forward blade gets slack to either side). A flank sabre's
        // geometry is FIXED — blind front and croup are hard edges, no slack, no
        // crowd-narrow — so its lobes pass through untouched.
        if l.center.abs() < 1e-3 {
            l.half = l.half / front_narrow + tolerance;
        }
    }
    StrikeField {
        zones: z,
        min_r,
        max_r,
    }
}

/// The facing that brings a foe at world-bearing `raw` into a mounted sabre's
/// FLANK lobe — the rider turns broadside so the blade bears, instead of staring
/// the foe into the blind front where it cannot cut. Holds the current facing
/// when the foe is already in a lobe (the deadzone keeps it from twitching), else
/// swings to the nearer flank edge. Reads the sabre's own zones (slice 04).
#[inline]
pub fn face_foe_into_flank(raw: f32, current_facing: f32, zones: Zones) -> f32 {
    let off = wrap_angle(raw - current_facing);
    // Already bearing in some lobe → hold.
    if zones
        .slice()
        .iter()
        .any(|l| wrap_angle(off - l.center).abs() <= l.half)
    {
        return current_facing;
    }
    // Turn to the nearest lobe's near edge.
    let mut best = current_facing;
    let mut best_turn = f32::MAX;
    for l in zones.slice() {
        // The lobe sits at `l.center` off facing; its near edge to the foe is at
        // center ± half on the side toward the foe.
        let d = wrap_angle(off - l.center);
        let edge = l.center + d.signum() * l.half; // edge nearest the foe (off-frame)
        let want = raw - edge; // facing that puts the foe at that edge
        let turn = wrap_angle(want - current_facing).abs();
        if turn < best_turn {
            best_turn = turn;
            best = want;
        }
    }
    best
}
