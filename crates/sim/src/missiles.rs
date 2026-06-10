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
            damage: 0.4,
            scatter_at_max: 6.0,
            mobile_fire: false,
        }),
        UnitClassId::Skirmishers => Some(MissileSpec {
            kind: MissileKind::Javelin,
            range: 32.0,
            launch_speed: 20.0,
            interval: 8.0,
            ammo: 6,
            damage: 0.55,
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
            damage: 0.32,
            scatter_at_max: 7.0,
            mobile_fire: true,
        }),
        UnitClassId::ArtilleryCrew => Some(MissileSpec {
            kind: MissileKind::Stone,
            range: 320.0,
            launch_speed: 60.0,
            interval: 14.0,
            ammo: 60,
            damage: 2.5,
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
            if u.alive_count == 0 || u.ammo == 0 || !u.fire_at_will {
                continue;
            }
            // Halted to shoot, unless shooting from the saddle.
            if !spec.mobile_fire && u.speed > 0.3 {
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
                if d < spec.range + 0.5 * v.width().max(v.depth())
                    && best.map_or(true, |(_, bd)| d < bd)
                {
                    // Hold fire into melees that involve OTHER friendly
                    // units. Our own fighting retreat is our own affair —
                    // peltasts threw over their own rear ranks.
                    let friends_engaged =
                        v.engaged > v.alive_count / 10 && v.contact_unit != ui as u32;
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
            let tu = &self.units[target_unit];
            let (t_start, t_count) = (tu.start, tu.count);
            let team = self.units[ui].team;
            let mut shots = 0u32;
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
                let _ = (t_start, t_count);
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
                shots += 1;
                self.units[ui].ammo = self.units[ui].ammo.saturating_sub(1);
            }
            let _ = shots;
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
                    self.hit_by_missile(victim, p, vel, dmg, true);
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
                    self.hit_by_missile(victim, p, vel, dmg, false);
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

    fn hit_by_missile(&mut self, victim: usize, from: Vec2, vel: Vec2, damage: f32, heavy: bool) {
        let uv = self.soldier_unit[victim] as usize;
        let vstats = crate::class::class_stats(self.units[uv].class);
        let incoming = wrap_angle(vel.y.atan2(vel.x) + std::f32::consts::PI);
        self.hit_dir[victim] = incoming;
        self.hit_ttl[victim] = 3.0;
        let bucket = crate::unit::bearing_bucket(incoming);
        self.units[uv].contact_hist[bucket] += 0.5;

        // Shields block arrows from the front arc; nothing blocks a stone.
        if !heavy {
            let shielded = wrap_angle(incoming - self.facings[victim]).abs() < 1.05;
            if shielded && self.rng.chance(vstats.block * (0.5 + 0.5 * self.units[uv].cohesion)) {
                return;
            }
        } else {
            // The stone bowls men over along its path.
            self.stun[victim] = self.stun[victim].max(1.0);
            let d = dir(vel.y.atan2(vel.x));
            self.positions[2 * victim] += d.x * 0.8;
            self.positions[2 * victim + 1] += d.y * 0.8;
        }
        let _ = from;

        if self.mounted[victim] == 1 && self.rng.chance(0.45) {
            self.rider_health[victim] -= damage;
            if self.rider_health[victim] <= 0.0 {
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
                || u.alive_count == 0
                || u.pending_target.is_some()
                || matches!(u.mode, OrderMode::Withdraw | OrderMode::Attack(_))
                || u.move_target.is_some()
            {
                continue;
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
            let mut threat: Option<(Vec2, f32)> = None;
            for v in &self.units {
                if v.team == my_team || v.alive_count == 0 {
                    continue;
                }
                // A pursuer closes front-first: its extent along the chase
                // axis is its DEPTH (width would make screens panic at
                // absurd distances and park out of throw range).
                let d = (v.center() - from).len() - 0.5 * v.depth() - my_ext;
                if d < 24.0 && threat.map_or(true, |(_, td)| d < td) {
                    threat = Some((v.center(), d));
                }
            }
            if let Some((tp, _)) = threat {
                // Short hops keep the fighting retreat INSIDE throw range.
                let away = from - tp;
                let l = away.len().max(0.1);
                let dest = from + away * (16.0 / l);
                let u = &mut self.units[ui];
                u.move_target = Some(dest);
                u.pace = crate::tunables::Pace::Run;
            }
        }
    }
}
