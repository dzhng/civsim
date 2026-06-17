//! Missiles: real projectiles in flight. An arrow is launched on a ballistic
//! arc at a POINT — whoever occupies the landing spot when it comes down is
//! hit, friend or foe. Density is the defense the player controls: loose
//! order takes fewer hits per volley. Shields block from the front arc only.
//!
//! Artillery stones land, then keep going: they plow a furrow, breaking
//! whatever they roll through — deep columns are catastrophic targets.

use crate::class::UnitClassId;
use crate::math::{dir, wrap_angle, Vec2};
use crate::sim::Sim;
use crate::tunables::DT;
use crate::unit::OrderMode;

const GRAVITY: f32 = 9.81;

#[derive(Clone, Copy, PartialEq)]
pub enum MissileKind {
    Arrow,
    Javelin,
    Stone,
}

/// Of the missiles that strike a mounted element, the share that finds the
/// RIDER rather than the horse. A tuning constant, deliberately not derived
/// from sprite geometry: it sets how archer-fragile cavalry feels, and the
/// horse is the big pool — keep this low or arrows delete the expensive arm.
const RIDER_HIT_SHARE: f32 = 0.2;

/// Per-class missile armament (None = melee only). Data, not code.
pub struct MissileSpec {
    pub kind: MissileKind,
    pub range: f32,
    pub launch_speed: f32,
    /// Seconds between shots per soldier.
    pub interval: f32,
    pub ammo: u32,
    pub damage: f32,
    /// Landing scatter at maximum range (m, 1-sigma).
    pub scatter_at_max: f32,
    /// Can shoot on the move (mounted archery).
    pub mobile_fire: bool,
}

pub fn missile_spec(class: UnitClassId) -> Option<MissileSpec> {
    match class {
        UnitClassId::Archers => Some(MissileSpec {
            kind: MissileKind::Arrow,
            range: 150.0,
            launch_speed: 42.0,
            interval: 6.0,
            ammo: 30,
            damage: 0.62,
            scatter_at_max: 6.0,
            mobile_fire: false,
        }),
        UnitClassId::Skirmishers => Some(MissileSpec {
            kind: MissileKind::Javelin,
            range: 32.0,
            launch_speed: 20.0,
            interval: 8.0,
            ammo: 6,
            damage: 0.86,
            scatter_at_max: 2.5,
            // Peltasts throw on the run — the fighting retreat IS the class.
            mobile_fire: true,
        }),
        UnitClassId::HorseArchers => Some(MissileSpec {
            kind: MissileKind::Arrow,
            range: 110.0,
            launch_speed: 38.0,
            interval: 7.0,
            ammo: 24,
            damage: 0.5,
            scatter_at_max: 7.0,
            mobile_fire: true,
        }),
        UnitClassId::ArtilleryCrew => Some(MissileSpec {
            kind: MissileKind::Stone,
            range: 320.0,
            launch_speed: 60.0,
            interval: 14.0,
            ammo: 60,
            damage: 3.9,
            scatter_at_max: 14.0,
            mobile_fire: false,
        }),
        _ => None,
    }
}

/// SoA projectile pool.
#[derive(Default)]
pub struct Projectiles {
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub z: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub vz: Vec<f32>,
    pub kind: Vec<u8>,
    pub team: Vec<u8>,
    pub damage: Vec<f32>,
}

impl Projectiles {
    pub fn len(&self) -> usize {
        self.x.len()
    }

    pub fn is_empty(&self) -> bool {
        self.x.is_empty()
    }

    fn push(&mut self, p: Vec2, v: Vec2, vz: f32, kind: MissileKind, team: u32, damage: f32) {
        self.x.push(p.x);
        self.y.push(p.y);
        // Near-ground ballistic origin: the solve assumes launch and landing
        // at the same height, so a tall origin would overshoot the aim by
        // height/tan(impact angle) — meters, at flat trajectories.
        self.z.push(0.2);
        self.vx.push(v.x);
        self.vy.push(v.y);
        self.vz.push(vz);
        self.kind.push(kind as u8);
        self.team.push(team as u8);
        self.damage.push(damage);
    }

    fn remove(&mut self, i: usize) {
        self.x.swap_remove(i);
        self.y.swap_remove(i);
        self.z.swap_remove(i);
        self.vx.swap_remove(i);
        self.vy.swap_remove(i);
        self.vz.swap_remove(i);
        self.kind.swap_remove(i);
        self.team.swap_remove(i);
        self.damage.swap_remove(i);
    }
}

impl Sim {
    /// Shooters loose their missiles; projectiles fly; landings hit whoever
    /// is there. Runs every tick (soldier cadence is round-robin thirds).
    pub(crate) fn run_missiles(&mut self) {
        self.launch_missiles();
        self.fly_and_land();
    }

    fn launch_missiles(&mut self) {
        let phase = (self.tick_count % 3) as usize;
        for ui in 0..self.units.len() {
            let Some(spec) = missile_spec(self.units[ui].class) else {
                continue;
            };
            let u = &self.units[ui];
            // A unit in a REAL melee has swords out, not bows — point-blank
            // volleys into the men fighting your own front rank were
            // deleting heavy infantry at zero scatter. A fighting RETREAT
            // (skirmish hops, a brushed flank: <25% engaged) still throws
            // over its own rear ranks — that part is the peltast's craft.
            if u.alive_count == 0
                || u.ammo == 0
                || !u.fire_at_will
                || u.routing
                || u.engaged * 4 > u.alive_count
            {
                continue;
            }
            if u.weapon_pref == 1 {
                continue; // swords drawn: the bows are slung
            }
            // Halted to shoot, unless shooting from the saddle.
            if !spec.mobile_fire && u.frame_speed > 0.3 {
                continue;
            }
            // Pick a target unit: nearest enemy in range that is NOT in a
            // melee tangle with friends (the arrows don't care, the captain
            // does).
            let my_team = u.team;
            let from = u.center();
            let mut best: Option<(usize, f32)> = None;
            for (vi, v) in self.units.iter().enumerate() {
                if v.team == my_team || v.alive_count == 0 {
                    continue;
                }
                let d = (v.center() - from).len();
                // A bow has a MINIMUM arc: nobody volleys across a contact
                // gap (point-blank fire into the men at your shields read
                // as laser accuracy — scatter scales with range). Measured
                // along the contact axis (DEPTHS, not widths: wide loose
                // lines would read negative at honest throw range). The
                // peltast hop band starts ~16m; 10m of gap clears it.
                let gap = d - 0.5 * v.depth() - 0.5 * u.depth();
                if gap > 10.0
                    && d < spec.range + 0.5 * v.width().max(v.depth())
                    && best.map_or(true, |(_, bd)| d < bd)
                {
                    // Hold fire into melees that involve OTHER friendly
                    // units. Our own fighting retreat is our own affair —
                    // peltasts threw over their own rear ranks. The threshold
                    // is LOW: even a handful of friends in the tangle (~5% of
                    // the foe's line in contact) is enough to stay the captain's
                    // hand — you do not loose into your own men to thin a few.
                    let friends_engaged =
                        v.engaged > v.alive_count / 20 && v.contact_unit != ui as u32;
                    if !friends_engaged {
                        best = Some((vi, d));
                    }
                }
            }
            let Some((target_unit, _)) = best else {
                continue;
            };

            // Each armed soldier shoots on his own cadence at a soldier-sized
            // point in the target: scatter does the rest.
            let (start, count) = (self.units[ui].start, self.units[ui].count);
            let team = self.units[ui].team;
            for s in 0..count {
                let i = start + s;
                if i % 3 != phase || self.alive[i] == 0 || self.stun[i] > 0.0 {
                    continue;
                }
                if self.target[i] >= 0 {
                    continue; // in melee: no bow work
                }
                self.attack_cd[i] -= 3.0 * DT;
                if self.attack_cd[i] > 0.0 {
                    continue;
                }
                if self.units[ui].ammo == 0 {
                    break;
                }
                // Volley the block's AREA: a random point inside the target
                // formation's footprint. Density decides how many arrows find
                // flesh — loose order is the defense.
                let (t_anchor, t_facing, t_w, t_d) = {
                    let tu = &self.units[target_unit];
                    (tu.anchor, tu.facing, tu.width().max(2.0), tu.depth().max(2.0))
                };
                let tf = crate::math::dir(t_facing);
                let tr = Vec2::new(tf.y, -tf.x);
                let lx = (self.rng.unit_f32() - 0.5) * t_w;
                let ly = self.rng.unit_f32() * t_d;
                let mut aim = t_anchor + tr * lx + tf * (-ly);
                let p = self.soldier_pos(i);
                // Lead a marching target: an arrow is seconds in the air and
                // a walking block moves meters in that time.
                let (t_speed, t_face) = {
                    let tu = &self.units[target_unit];
                    (tu.frame_speed, tu.facing)
                };
                if t_speed > 0.2 {
                    let flight_t = (aim - p).len() / (spec.launch_speed * 0.85);
                    aim = aim + crate::math::dir(t_face) * (t_speed * flight_t);
                }
                let d = (aim - p).len();
                if d > spec.range || d < 4.0 {
                    continue;
                }
                let scatter = spec.scatter_at_max * (d / spec.range);
                aim.x += (self.rng.unit_f32() - 0.5) * 2.0 * scatter;
                aim.y += (self.rng.unit_f32() - 0.5) * 2.0 * scatter;

                // Ballistics: solve launch elevation for this range (low arc).
                let dist = (aim - p).len();
                let s2 = (dist * GRAVITY / (spec.launch_speed * spec.launch_speed)).clamp(-1.0, 1.0);
                let theta = 0.5 * s2.asin();
                let horiz = spec.launch_speed * theta.cos();
                let vert = spec.launch_speed * theta.sin();
                let to = (aim - p) * (1.0 / dist.max(0.01));
                self.projectiles.push(p, to * horiz, vert, spec.kind, team, spec.damage);
                self.attack_cd[i] = spec.interval * (0.8 + 0.4 * self.rng.unit_f32());
                self.units[ui].ammo = self.units[ui].ammo.saturating_sub(1);
            }
        }
    }

    fn fly_and_land(&mut self) {
        let mut i = 0;
        while i < self.projectiles.len() {
            self.projectiles.x[i] += self.projectiles.vx[i] * DT;
            self.projectiles.y[i] += self.projectiles.vy[i] * DT;
            self.projectiles.z[i] += self.projectiles.vz[i] * DT;
            self.projectiles.vz[i] -= GRAVITY * DT;

            let grounded = self.projectiles.z[i] <= 0.0;
            if !grounded {
                i += 1;
                continue;
            }
            let kind = self.projectiles.kind[i];
            let p = Vec2::new(self.projectiles.x[i], self.projectiles.y[i]);
            let vel = Vec2::new(self.projectiles.vx[i], self.projectiles.vy[i]);

            if kind == MissileKind::Stone as u8 {
                // The stone lands and keeps rolling: a furrow of broken men.
                let speed = vel.len();
                if speed < 3.0 {
                    self.projectiles.remove(i);
                    continue;
                }
                if let Some(victim) = self.body_at(p, 0.8) {
                    let dmg = self.projectiles.damage[i];
                    self.hit_by_missile(victim, vel, dmg, true);
                    // SPLASH: men just beside the furrow are BOWLED OVER (stunned),
                    // not killed — a near-miss from a rolling boulder knocks a man
                    // flat. Without this, the furrow only ever kills (the man it
                    // hits dies), so a deep column is never left stunned-and-living.
                    let cell = self.grid.cell_size;
                    let cx = (p.x / cell).floor() as i32;
                    let cy = (p.y / cell).floor() as i32;
                    let st = self.tun.stun_time;
                    for oy in -1..=1i32 {
                        for ox in -1..=1i32 {
                            let b = self.grid.bucket(cx + ox, cy + oy);
                            let (lo, hi) = (self.grid.starts[b] as usize, self.grid.starts[b + 1] as usize);
                            for ei in lo..hi {
                                let bj = self.grid.entries[ei] as usize;
                                let owner = self.body_owner[bj] as usize;
                                if owner == victim || self.alive[owner] == 0 {
                                    continue;
                                }
                                let dx = self.body_pos[2 * bj] - p.x;
                                let dy = self.body_pos[2 * bj + 1] - p.y;
                                if dx * dx + dy * dy < 1.8 * 1.8 {
                                    self.stun[owner] = self.stun[owner].max(st);
                                }
                            }
                        }
                    }
                }
                // Roll on: decelerate, stay grounded.
                let nv = vel * (1.0 - 4.0 * DT / speed.max(1.0)).max(0.0);
                self.projectiles.vx[i] = nv.x;
                self.projectiles.vy[i] = nv.y;
                self.projectiles.z[i] = 0.0;
                self.projectiles.vz[i] = 0.0;
                if nv.len() < 3.0 {
                    self.projectiles.remove(i);
                    continue;
                }
                i += 1;
            } else {
                // Arrow/javelin: strikes a BODY at the landing spot — the
                // hit window is body-sized, so loose order (below saturation
                // density) genuinely sheds volleys.
                let window = if kind == MissileKind::Javelin as u8 { 0.25 } else { 0.18 };
                if let Some(victim) = self.body_at(p, window) {
                    let dmg = self.projectiles.damage[i];
                    self.hit_by_missile(victim, vel, dmg, false);
                    self.missile_hits += 1;
                } else {
                    self.missile_misses += 1;
                }
                self.projectiles.remove(i);
            }
        }
    }

    /// Nearest living body within `radius` of a ground point (uses the body
    /// grid built by the collision pass this tick).
    fn body_at(&self, p: Vec2, radius: f32) -> Option<usize> {
        let cell = self.grid.cell_size;
        let cx = (p.x / cell).floor() as i32;
        let cy = (p.y / cell).floor() as i32;
        let mut best: Option<(usize, f32)> = None;
        let mut seen = [usize::MAX; 9];
        let mut seen_len = 0;
        for oy in -1..=1i32 {
            for ox in -1..=1i32 {
                let b = self.grid.bucket(cx + ox, cy + oy);
                if seen[..seen_len].contains(&b) {
                    continue;
                }
                seen[seen_len] = b;
                seen_len += 1;
                let (lo, hi) = (self.grid.starts[b] as usize, self.grid.starts[b + 1] as usize);
                for &bj in &self.grid.entries[lo..hi] {
                    let bj = bj as usize;
                    let owner = self.body_owner[bj] as usize;
                    if self.alive[owner] == 0 {
                        continue;
                    }
                    let d = (Vec2::new(self.body_pos[2 * bj], self.body_pos[2 * bj + 1]) - p).len()
                        - self.body_r[bj];
                    if d < radius && best.map_or(true, |(_, bd)| d < bd) {
                        best = Some((owner, d));
                    }
                }
            }
        }
        best.map(|(o, _)| o)
    }

    fn hit_by_missile(&mut self, victim: usize, vel: Vec2, damage: f32, heavy: bool) {
        let uv = self.soldier_unit[victim] as usize;
        let vstats = self.units[uv].stats;
        let incoming = wrap_angle(vel.y.atan2(vel.x) + std::f32::consts::PI);

        // Shields block arrows from the front arc BEFORE anything registers: a
        // cleanly-shielded arrow neither wounds nor frightens nor turns a head
        // — it thunks off the boss and is gone. Nothing blocks a stone. NOT
        // cohesion-scaled (unlike melee block): a shield is between you and the
        // sky however ragged the dressing — without this, fraying lines lost
        // their shields exactly when the volleys mattered, and armored blocks
        // melted FASTER than loose skirmish lines. The early return is also why
        // a shield wall doesn't BREAK under frontal fire it's shrugging off:
        // the blocked arrows never reach recent_missiles, so the morale drain
        // tracks the volleys that actually land, not the volleys that arrive.
        if !heavy {
            let shielded =
                wrap_angle(incoming - self.facings[victim]).abs() < crate::combat::FRONT_ARC;
            if shielded && self.rng.chance(vstats.block) {
                return;
            }
        }

        self.hit_dir[victim] = incoming;
        self.hit_ttl[victim] = 3.0;
        let bucket = crate::unit::bearing_bucket(incoming);
        self.units[uv].contact_hist[bucket] += 0.5;
        self.units[uv].recent_missiles += 1.0;

        // Dodge: an arrow sidestepped or knocked from the air. UNLIKE the
        // shield (front-arc only), a dodge has NO arc — a missile is seen
        // coming from any quarter — so it shaves the SAME off front and back.
        // It is the only missile defense the shieldless have, which is why a
        // nimble skirmisher (high evade, no block) eats arrows about equally
        // from either face while a shield wall is a fortress only to its front.
        // Cohesion-scaled like its melee twin; stones can't be dodged.
        if !heavy && self.rng.chance(vstats.evade * self.units[uv].cohesion) {
            return;
        }

        if heavy {
            // The stone bowls men over along its path.
            self.stun[victim] = self.stun[victim].max(1.0);
            let d = dir(vel.y.atan2(vel.x));
            self.positions[2 * victim] += d.x * 0.8;
            self.positions[2 * victim + 1] += d.y * 0.8;
        }

        if self.mounted[victim] == 1 && !self.rng.chance(RIDER_HIT_SHARE) {
            // The arrow finds the horse, not the man.
            self.mount_health[victim] -= damage;
            if self.mount_health[victim] <= 0.0 {
                self.kill(victim);
            }
        } else {
            self.health[victim] -= damage;
            if self.health[victim] <= 0.0 {
                self.kill(victim);
            }
        }
    }

    /// Auto-evade for skirmish classes: keep distance from approaching
    /// enemies unless the player has explicitly ordered otherwise.
    pub(crate) fn run_skirmish_evade(&mut self) {
        for ui in 0..self.units.len() {
            let u = &self.units[ui];
            if !u.evade_auto
                || u.routing
                || u.alive_count == 0
                || u.pending_target.is_some()
                // Committed to an explicit attack: no hopping away. (A
                // finished Withdraw must NOT stick: any idle skirmisher
                // kites again.)
                || matches!(u.mode, OrderMode::Attack(_))
            {
                continue;
            }
            // Live travel is covered by move_target — but only until the
            // ARRIVE BRAKING cone at its end. A pressed screen must chain
            // the next hop BEFORE braking: a hop-stop-hop saw-tooth
            // averages under a pursuer's flat run and gets walked down,
            // 16 meters at a time.
            if let Some(t) = u.move_target {
                if (t - u.center()).len() > 8.0 {
                    continue;
                }
            }
            // Kite band: hop away at 28m, stop ~18m further out — close
            // enough to keep throwing, far enough that even a charge burst
            // can't span the gap before the skirmishers are at full flight.
            let my_team = u.team;
            let from = u.center();
            // Edge-to-edge along the FLEE axis: the pursuer closes on the
            // screen's rear ranks (depth), not its far wings — a width-based
            // trigger would keep a wide screen running forever, never
            // stopping to throw.
            let my_ext = 0.5 * u.depth();
            let mut threat: Option<(Vec2, f32, f32)> = None; // (center, dist, band)
            for v in &self.units {
                if v.team == my_team || v.alive_count == 0 {
                    continue;
                }
                // A pursuer closes front-first: its extent along the chase
                // axis is its DEPTH (width would make screens panic at
                // absurd distances and park out of throw range).
                let d = (v.center() - from).len() - 0.5 * v.depth() - my_ext;
                // The screen breaks earlier the FASTER the threat closes:
                // a walker at 24m, a runner proportionally further, a
                // burst at the full 38m — MEASURED speed only (a flag is a
                // banner, and a pinned unit must not read as galloping; the
                // ~1s a real burst takes to develop is covered by the hop
                // chaining below). And a BLOWN screen gives ground: with no
                // burst left in the legs, holding javelin range on a runner
                // is suicide, so the standoff grows as the reserve drains.
                let sp = v.frame_speed;
                let tired = 12.0 * (1.0 - crate::movement::fatigue_capacity(u.fatigue));
                // Break EARLY even from a slow walker: a screen that waits until
                // the foe is at 24m loses its rear tail before it is at full
                // flight (a hop-stop saw-tooth averages under the closing pace).
                // Bolt at 32m, sooner against a faster close.
                let band = (32.0 + tired + 2.5 * (sp - self.tun.base_speed).max(0.0))
                    .clamp(32.0, 55.0);
                if d < band && threat.map_or(true, |(_, td, _)| d < td) {
                    threat = Some((v.center(), d, band));
                }
            }
            if let Some((tp, _, band)) = threat {
                // Short hops keep the fighting retreat INSIDE throw range —
                // but a hop that doesn't clear a fast pursuer is a death
                // sentence, so the leap grows with the band that tripped.
                let hop = 16.0 + (band - 24.0);
                let away = from - tp;
                let l = away.len().max(0.1);
                let dest = from + away * (hop / l);
                let u = &mut self.units[ui];
                u.move_target = Some(dest);
                u.pace = crate::tunables::Pace::Run;
            }
        }
    }
}
