//! Melee: arc swings against whatever is in the envelope.
//!
//! A weapon is five numbers (reach, min_range, arc, interval, damage).
//! Everything else is geometry and measurement:
//! - cleave: every enemy inside the (reach × arc) envelope is struck;
//! - crush sensitivity: friendly bodies inside the envelope shrink the arc
//!   and slow the swing — big envelopes (long swords) die in a press,
//!   tiny ones (daggers, pike lines) thrive;
//! - riders: a mounted body's rider sits at its center — only weapons whose
//!   reach spans the horse's length can strike him frontally, anything can
//!   from the flanks. No anti-cavalry stats anywhere.
//! - pushes: every landed OR blocked strike displaces the defender by
//!   attacker/defender effective-mass ratio. Evasion avoids the push but
//!   needs room: it scales to zero under crush pressure.
//!
//! Runs at 10 Hz per soldier (round-robin thirds), deterministic.

use crate::class::Weapon;
#[cfg(feature = "force-trace")]
use crate::force_trace::{ForceChannel, ForceRecord};
use crate::math::{dir, wrap_angle, Vec2};
use crate::movement::stamina_factor;
use crate::sim::Sim;
use crate::tunables::DT;
use crate::unit::OrderMode;

mod damage;
mod resolution;
mod run;
mod targeting;

pub(crate) use run::{run_combat, Scratch};

/// Why a soldier died. Measurement only — lets tests split a unit's losses into
/// the charge's bodily shock, the lance going in, the standing grind, and arrows,
/// instead of one opaque kill total. `Scripted` is a hand-kill (tests/sandbox)
/// and is tallied to no combat bucket.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KillCause {
    Impact,
    ChargeMelee,
    GrindMelee,
    Missile,
    Scripted,
}

/// Alignment slack on top of arc/2 for striking the primary target.
const AIM_TOLERANCE: f32 = 0.35;
/// Victims struck by one swing, at most (sanity cap; arc decides reality).
const MAX_VICTIMS: usize = 5;
/// Engagement breaks beyond this surface distance (m). Doubles as the
/// local-fight-density radius (fight_near): one awareness bubble.
const DISENGAGE_DIST: f32 = 6.0;
/// A man covers this arc (rad from facing) with shield and eyes: full
/// block and full evade inside it. One arc for melee and missiles alike.
pub(crate) const FRONT_ARC: f32 = 1.05;
/// Canceling push (m/s) at which a man is fully WEDGED — the vice that
/// pins his elbows. Measured as scalar pressure minus the net push vector:
/// shoved from one side they nearly cancel out to zero (you yield a step
/// and keep your arms); pressed from opposing sides the magnitudes stay
/// and the net dies — that remainder is the vice. (Scaled to the FULL
/// received-push ledger — weapon pushes post too, roughly doubling melee
/// pressure readings relative to the collision-only era.)
const VICE_PIN: f32 = 1.0;
/// Crowding penalty an UNWEDGED man still pays: a comrade in your arc is
/// geometry you must work around even with room to step and time the sweep.
const OBSTRUCT_FLOOR: f32 = 0.7;
/// Out to here a blow comes side-on: evade degrades; behind it, a blow
/// lands on a man facing the wrong way.
pub(crate) const SIDE_ARC: f32 = 2.1;
/// Reach at which a FRONTAL blade still only reaches the horse's chest and the
/// rider's near edge (a hacking sword — the `RIDER_FRONT_FLOOR` base chance).
/// Above this, the rider's frontal exposure ramps up over the horse's front-half
/// depth (`HORSE_HALF_LEN`) — a long thrust (spear/pike) goes over the chest to
/// the man, up to `RIDER_FRONT_CAP`. The grind half of anti-cav.
const RIDER_HACK_REACH: f32 = 1.1;

/// Most of a flank/rear blow finds the rider — his leg, back, and side hang
/// over the horse, bare to a blade. But the horse's barrel still shields his
/// lower body, so even a clean side blow is a CHANCE at the man, never a
/// certainty: the share is capped below 1. Reach-INDEPENDENT — from the side a
/// sword reaches the bare man as well as a pike does (sword == pike on flank/back).
const RIDER_FLANK_EXPOSURE: f32 = 0.8;
/// Frontal base chance ANY blade has at the rider: a footman jammed against the
/// horse's chest can still stab up at the man (thigh, under the chin). A short
/// hack gets only this; reach earns the rest, up to twice this at `RIDER_FRONT_CAP`.
const RIDER_FRONT_FLOOR: f32 = 0.325;
/// Frontal ceiling: a long thrust spans over the horse's head and neck to the
/// rider, but the head is always partly in the way — the frontal share tops out
/// here, lower than the flank (the horse fronts the man head-on). Set to 2×
/// `RIDER_FRONT_FLOOR`: a pike grinds the rider HEAD-ON about twice as well as a
/// sword (David's anti-cav contract), while flank/back they are equal.
const RIDER_FRONT_CAP: f32 = 0.65;

/// What fraction of a FRONTAL blow on a horseman finds the RIDER vs the horse's
/// chest — a PROBABILITY, not a switch. A short hack still has a base chance
/// (`RIDER_FRONT_FLOOR`, stabbing up past the chest); reach earns more, the long
/// thrust spanning over the chest toward the man up to `RIDER_FRONT_CAP` — about
/// twice the hack's. The horse's bulk always shields part of the man, so it never
/// reaches a guaranteed rider hit. The standing grind reads this. From the
/// flank/rear it is the reach-independent `RIDER_FLANK_EXPOSURE` (at the call
/// site). The charge-impale also reads this (one rule for the front).
fn rider_exposure_frontal(reach: f32) -> f32 {
    let ramp = ((reach - RIDER_HACK_REACH) / crate::class::HORSE_HALF_LEN).clamp(0.0, 1.0);
    RIDER_FRONT_FLOOR + (RIDER_FRONT_CAP - RIDER_FRONT_FLOOR) * ramp
}
// Where a weapon can land is the weapon's own `zones` data (a sword = one front
// lobe, a mounted sabre = two flank lobes, blind over the horse's head and
// croup): see `crate::strike`.
// A MOVING target is hard to hit: every blow at a man (or horse) crossing in
// front of the striker has to lead a moving mark, and many miss. This is general
// — it applies to anyone in motion — but it is what lets a trampler carrying
// CLEAN through loose order come out light (it's galloping, almost nobody lands a
// blow), while one BOGGED in dense order (~stopped) is hit normally. Below the
// floor speed (a walk) there's no bump; it ramps with speed to a hard cap.
const MOVING_EVADE_FLOOR: f32 = 2.0; // m/s — below this, no bump (a walk doesn't dodge)
const MOVING_EVADE_GAIN: f32 = 0.06; // added evade per m/s above the floor
const MOVING_EVADE_CAP: f32 = 0.5; // a full gallop dodges at most half the blows

const MAX_NEARBY_FRIENDS: usize = 24;
type ScanPriority = (i32, i32, u32); // local forward cell, local lateral cell, local soldier

#[derive(Clone, Copy, Debug, PartialEq)]
struct NearbyFriend {
    owner: u32,
    bearing: f32,
    distance: f32,
    fighting: bool,
    priority: ScanPriority,
}

/// Record one nearby friendly soldier, independent of body/grid scan order.
/// Mounted soldiers contribute two collision bodies but only one pair of arms;
/// keep the nearer body geometry rather than counting the rider twice. When the
/// sanity cap fills, local-frame scan priority chooses the sample; fixed world
/// cell traversal must never decide who obstructs a swing.
fn record_friend(
    friends: &mut [Option<NearbyFriend>; MAX_NEARBY_FRIENDS],
    friends_len: &mut usize,
    friend: NearbyFriend,
    multiple_bodies: bool,
) {
    // A foot soldier has one body, and the caller visits each bucket once.
    // Only multi-body soldiers can already occupy a slot in this scan.
    if multiple_bodies {
        if let Some(existing) = friends[..*friends_len]
            .iter_mut()
            .flatten()
            .find(|f| f.owner == friend.owner)
        {
            if friend.distance < existing.distance {
                *existing = friend;
            }
            return;
        }
    }
    if *friends_len < MAX_NEARBY_FRIENDS {
        friends[*friends_len] = Some(friend);
        *friends_len += 1;
    } else {
        let least_preferred = friends
            .iter()
            .flatten()
            .enumerate()
            .max_by_key(|(_, f)| f.priority)
            .map(|(k, _)| k)
            .unwrap();
        if friend.priority < friends[least_preferred].unwrap().priority {
            friends[least_preferred] = Some(friend);
        }
    }
}

impl Sim {
    /// One strike: evade / block / wound, with push on anything not evaded.
    fn strike(
        &mut self,
        attacker: usize,
        victim: usize,
        weapon: &Weapon,
        bearing: f32,
        m_attacker: f32,
        can_wound: bool,
        tun: &crate::tunables::Tunables,
    ) {
        let uv = self.soldier_unit[victim] as usize;
        let vstats = self.units[uv].stats;
        // Effective cohesion: a trampler reads full (its blob doesn't fight
        // worse); every other class pays disorder in evade and block.
        let cohesion = self.units[uv].effective_cohesion();

        // Reactive facing memory + unit contact bookkeeping.
        let incoming = wrap_angle(bearing + std::f32::consts::PI);
        self.hit_dir[victim] = incoming;
        self.hit_ttl[victim] = 3.0;
        let bucket = crate::unit::bearing_bucket(incoming);
        self.units[uv].contact_hist[bucket] += 1.0;
        let ua = self.soldier_unit[attacker] as usize;
        let bucket_a = crate::unit::bearing_bucket(bearing);
        self.units[ua].contact_hist[bucket_a] += 0.4;

        // Evade (read: parry/dodge): needs room — crush pressure removes
        // it — and DIRECTION: you can't slip a blow you can't see. Full
        // rate across the front, weakened side-on, nearly gone from square
        // behind. (Block was always front-arc-only; this is its agile twin
        // for the shieldless classes.)
        let aspect_v = wrap_angle(incoming - self.facings[victim]).abs();
        let seen = if aspect_v < FRONT_ARC {
            1.0
        } else if aspect_v < SIDE_ARC {
            0.6
        } else {
            0.25
        };
        // (A horse's "charge protection" needs no special term: a moving horse is
        // hard to hit because it isn't yet mobbed — low crush pressure → the
        // pressure factor below keeps its evade high; a stalled horse is a mobbed
        // horse — high pressure → evade already gone. The same physics that makes
        // cavalry win the charge and lose the grind, measured ONCE, as pressure.)
        // GUARD FATIGUE: a tiring man cannot keep his guard up. As the unit's
        // stamina drains in a sustained grind both his shield (block, below) and
        // his footwork (evade) lose effectiveness, falling toward stamina_guard_floor
        // when spent. This is what RESOLVES a long stalemate — fresh shielded lines
        // block nearly everything, but a grind drains both sides until guards erode,
        // blows land, and one breaks. Full early (stamina starts at 1.0), so short
        // decisive fights are untouched; only the drawn-out grind opens up.
        let guard = tun.stamina_guard_floor
            + (1.0 - tun.stamina_guard_floor) * stamina_factor(self.units[uv].stamina);
        // A mark CROSSING the striker's front is hard to hit — a flat dodge ON
        // TOP of the stat evade, scaling with the victim's LATERAL speed (the part
        // of its motion perpendicular to the strike line). Only sideways motion
        // counts: a foe running straight AT you or away closes/opens the range but
        // is no harder to land on than a standing one — same as stationary. This
        // is general (anyone crossing), but biggest for a trampler riding PAST the
        // ranks; it's independent of the stat evade/cohesion (even a no-evade heavy
        // is hard to strike as it flashes by).
        let vmx = (self.positions[2 * victim] - self.prev_positions[2 * victim]) / DT;
        let vmy = (self.positions[2 * victim + 1] - self.prev_positions[2 * victim + 1]) / DT;
        let rdx = self.positions[2 * victim] - self.positions[2 * attacker];
        let rdy = self.positions[2 * victim + 1] - self.positions[2 * attacker + 1];
        let rl = (rdx * rdx + rdy * rdy).sqrt().max(1e-3);
        let radial = (vmx * rdx + vmy * rdy) / rl; // speed toward/away — does NOT count
        let lateral = (vmx * vmx + vmy * vmy - radial * radial).max(0.0).sqrt();
        let moving_evade =
            ((lateral - MOVING_EVADE_FLOOR).max(0.0) * MOVING_EVADE_GAIN).min(MOVING_EVADE_CAP);
        let evade = (vstats.evade
            * seen
            * cohesion
            * guard
            * (1.0 - self.pressure[victim] / 4.2).clamp(0.0, 1.0)
            + moving_evade)
            .min(0.95);
        if self.rng.chance(evade) {
            return; // dodged — the couched point passed by, lance NOT spent
        }
        // The charge weapon (lance) is one strike: the moment it COMMITS — past the
        // dodge, so it will either land or be turned on a shield — it SNAPS, and the
        // rider drops to his sidearm. Only a clean evade spares it (it never made
        // contact). Generalises to any weapon with the charge flag. (If the rider
        // slowed below charge before now, he never couched it — it's never reached.)
        if weapon.is_charge() {
            self.charge_wpn_spent[attacker] = true;
        }

        // A hit does not delete physics: a body moving at speed KEEPS its
        // momentum (p = m·v) and glides through the impact — this is how a
        // charging line crashes home through the spear hits of the final stride
        // instead of politely stopping at reach. (There is no melee "stagger"
        // stun: a landed blow does not freeze a man's strike or step — only a
        // real KNOCK-DOWN, from a charge or a missile, takes him off his feet.
        // The reach wall is held by the weapon-repel FORCE, not by stunning the
        // attacker mid-stride.)
        let vvx = (self.positions[2 * victim] - self.prev_positions[2 * victim]) / DT;
        let vvy = (self.positions[2 * victim + 1] - self.prev_positions[2 * victim + 1]) / DT;
        let vsp = (vvx * vvx + vvy * vvy).sqrt();
        if vsp > 2.0 {
            let m = self.mass[victim] * vsp * 0.8;
            let cur = (self.mom_x[victim].powi(2) + self.mom_y[victim].powi(2)).sqrt();
            if cur < m {
                #[cfg(feature = "force-trace")]
                let before = Vec2::new(self.mom_x[victim], self.mom_y[victim]);
                self.mom_x[victim] = vvx / vsp * m;
                self.mom_y[victim] = vvy / vsp * m;
                #[cfg(feature = "force-trace")]
                self.force_trace.push(ForceRecord::new(
                    self.tick_count,
                    victim,
                    uv,
                    ForceChannel::KnockbackMomentum,
                    Vec2::new(self.mom_x[victim], self.mom_y[victim]) - before,
                    "strike_preserves_fast_body_momentum",
                ));
            }
        }

        // Block: front shield arc only; still takes the push. A heavy shield works
        // against a leveled point as well as a sword's arc — a pike is fearsome for
        // its reach, first-strike, and file-overlapping hedge, not because it
        // bypasses shields.
        let shielded = aspect_v < FRONT_ARC;
        let blocked = shielded
            && self
                .rng
                .chance(vstats.block * (0.5 + 0.5 * cohesion) * guard);

        // Push: momentum through the weapon — a braced thruster hurls an
        // unbraced man back bodily; equal masses just rock each other.
        let m_v = self.mass[victim] * self.units[uv].brace();
        let push = tun.hit_push * (m_attacker / m_v).clamp(0.3, 3.5);
        let d = dir(bearing);
        // Stage the shove: all of a tick's shoves on this victim sum and land
        // together after the pass (the terrain clamp is applied there). The shove
        // IS the pressure input — it shortens his bonds, and the weave reads that
        // compression as crush next tick.
        #[cfg(not(feature = "force-trace"))]
        {
            self.push_acc[2 * victim] += d.x * push;
            self.push_acc[2 * victim + 1] += d.y * push;
        }
        #[cfg(feature = "force-trace")]
        {
            let push_vec = d * push;
            self.push_acc[2 * victim] += push_vec.x;
            self.push_acc[2 * victim + 1] += push_vec.y;
        }

        // Blocked, or gang-capped (no room to land the blade): the shove above
        // still happened — only the wound is denied.
        if blocked || !can_wound {
            return;
        }

        // Damage: rider vs mount. A foot soldier goes for the MAN, but the horse's
        // body shields him — and (like his own shield) only from the FRONT:
        //  - FLANK/REAR: his leg and back are bare → the blow is all RIDER.
        //  - FRONT: the chest is in the way. A short HACK (sword) reaches only
        //    horseflesh; a long THRUST (spear/pike) goes OVER the chest to the man.
        //    So the rider's frontal exposure RAMPS with reach above a hack's, over
        //    the horse's front-half depth — a clean monotone lever (reach). The wound
        //    SPLITS by exposure: a spear lands mostly on the rider, a sword mostly on
        //    the horse. This is the GRIND half of anti-cav (the spearman's role); the
        //    IMPALE (a charge fed onto the point) is separate.
        let rider_exposure = if aspect_v < FRONT_ARC {
            rider_exposure_frontal(weapon.reach)
        } else {
            RIDER_FLANK_EXPOSURE // flank/rear: most of the man is bare, never all
        };

        // A tiring attacker hits SOFTER: damage falls toward stamina_damage_floor
        // of its fresh value as he spends (~0.78 when fully blown). This is the
        // offence-POWER half of fatigue; the offence-RATE half (slower swings) is
        // the cadence coupling in the strike loop (stamina_cadence_floor).
        let dmg = weapon.damage
            * (tun.stamina_damage_floor
                + (1.0 - tun.stamina_damage_floor) * stamina_factor(self.units[ua].stamina));
        // A wound is charge-driven iff it came from the charge weapon (the lance) —
        // the couched point going in. The sword is the grind, even while the horse
        // is still rolling forward: a moving sabre is a man fighting his way through
        // the press, not a charge. Attribute by WEAPON, not by speed. (The lance is
        // already marked spent above, the instant it committed.)
        if weapon.is_charge() {
            self.dmg_from_charge[victim] += dmg;
        }
        // Stage the wound; it is applied (and the kill resolved) after the pass,
        // so a man mortally hit by a low-index foe still lands his simultaneous
        // strike this tick.
        if self.mounted[victim] == 1 {
            self.dmg_acc[victim] += dmg * rider_exposure;
            self.mount_dmg_acc[victim] += dmg * (1.0 - rider_exposure);
        } else {
            self.dmg_acc[victim] += dmg;
        }
    }

    /// Public for scenario tests and sandbox tooling: drop a soldier dead
    /// where he stands (bookkeeping included). A hand-kill is `Scripted` — it
    /// counts in the casualty totals but in no combat-cause bucket.
    pub fn kill(&mut self, i: usize) {
        self.kill_with(i, KillCause::Scripted);
    }

    /// Drop a soldier dead, recording WHY (for the per-unit loss-by-cause tally).
    pub(crate) fn kill_with(&mut self, i: usize, cause: KillCause) {
        if self.alive[i] == 0 {
            return;
        }
        self.alive[i] = 0;
        self.stun[i] = 0.0; // a corpse is not also stunned (one state, not flags)
        self.target[i] = -1;
        let routing = self.units[self.soldier_unit[i] as usize].routing;
        let u = &mut self.units[self.soldier_unit[i] as usize];
        u.alive_count = u.alive_count.saturating_sub(1);
        u.deaths_since_reform += 1;
        u.recent_casualties += 1.0;
        match cause {
            KillCause::Impact => u.lost_impact += 1,
            KillCause::ChargeMelee => u.lost_charge_melee += 1,
            KillCause::GrindMelee => u.lost_grind_melee += 1,
            KillCause::Missile => u.lost_missile += 1,
            KillCause::Scripted => {}
        }
        // A real (non-scripted) death after the unit has already broken is a
        // ride-down, not decisive killing — tracked apart so tests can exclude it.
        if routing && cause != KillCause::Scripted {
            u.lost_post_rout += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{record_friend, NearbyFriend, MAX_NEARBY_FRIENDS};

    fn normalized(order: impl IntoIterator<Item = NearbyFriend>) -> Vec<NearbyFriend> {
        let mut friends = [None; MAX_NEARBY_FRIENDS];
        let mut friends_len = 0usize;
        for friend in order {
            record_friend(&mut friends, &mut friends_len, friend, true);
        }
        let mut measured: Vec<_> = friends[..friends_len].iter().flatten().copied().collect();
        measured.sort_by_key(|f| f.owner);
        measured
    }

    #[test]
    fn nearby_friend_measure_is_body_scan_order_independent() {
        let bodies = [
            NearbyFriend {
                owner: 7,
                bearing: 0.3,
                distance: 1.2,
                fighting: true,
                priority: (0, 2, 7),
            },
            NearbyFriend {
                owner: 2,
                bearing: -0.1,
                distance: 0.8,
                fighting: false,
                priority: (0, 1, 2),
            },
            NearbyFriend {
                owner: 7,
                bearing: 0.2,
                distance: 0.6,
                fighting: true,
                priority: (0, 2, 7),
            }, // nearer body of the same mounted soldier
        ];
        assert_eq!(normalized(bodies), normalized(bodies.into_iter().rev()));
        assert_eq!(
            normalized(bodies)[1],
            NearbyFriend {
                owner: 7,
                bearing: 0.2,
                distance: 0.6,
                fighting: true,
                priority: (0, 2, 7)
            }
        );

        let crowded: Vec<_> = (0..40)
            .map(|i| NearbyFriend {
                owner: i,
                bearing: 0.0,
                distance: 1.0,
                fighting: true,
                priority: (i as i32 / 8, i as i32 % 8, i),
            })
            .collect();
        assert_eq!(
            normalized(crowded.clone()),
            normalized(crowded.into_iter().rev())
        );
    }
}

fn pick_weapon_index(weapons: &[Weapon], d: f32) -> Option<usize> {
    weapons
        .iter()
        .position(|w| d >= w.min_range && d <= w.reach)
        .or_else(|| {
            let last = weapons.len().checked_sub(1)?;
            (d <= weapons[last].reach).then_some(last)
        })
}
