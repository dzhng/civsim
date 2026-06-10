//! Sim orchestration: world state, spawning, orders, and the tick pipeline.
//!
//! Tick order: unit motion -> pivot re-forming -> soldier steering (+ disorder
//! measurement) -> collision separation -> unit-state integration (disorder,
//! cohesion, stamina).

use crate::class::{class_stats, UnitClassId};
use crate::grid::SpatialHash;
use crate::math::{dir, rotate_toward, Vec2};
use crate::movement::{pace_speed, soldier_surge_speed, update_unit_motion};
use crate::rng::Pcg32;
use crate::terrain::{stagger01, Terrain};
use crate::tunables::{Pace, Tunables, DT};
use crate::unit::{reassign_slots, slot_local, Unit};

pub struct Sim {
    pub tun: Tunables,
    /// Interleaved soldier positions [x0, y0, x1, y1, ...].
    pub positions: Vec<f32>,
    pub facings: Vec<f32>,
    pub health: Vec<f32>,
    /// Collision/push mass per soldier (from class; bracing multiplies it).
    pub mass: Vec<f32>,
    /// Personal-space radius per soldier (cavalry is much bigger than men).
    pub radius: Vec<f32>,
    pub(crate) max_radius: f32,
    /// 1 = alive. Dead soldiers stay in the arrays as corpses; the slot
    /// machinery reshuffles the living around them.
    pub alive: Vec<u8>,
    /// Unit index per soldier (static after spawn).
    pub soldier_unit: Vec<u32>,
    /// Formation slot per soldier; remapped while a unit pivots/re-forms.
    pub soldier_slot: Vec<u32>,
    pub units: Vec<Unit>,
    pub terrain: Terrain,
    pub tick_count: u64,
    pub rng: Pcg32,
    pub(crate) grid: SpatialHash,
    pub(crate) scratch: Vec<f32>,
}

impl Sim {
    pub fn new(tun: Tunables, seed: u64) -> Self {
        Self {
            tun,
            positions: Vec::new(),
            facings: Vec::new(),
            health: Vec::new(),
            mass: Vec::new(),
            radius: Vec::new(),
            max_radius: tun.soldier_radius,
            alive: Vec::new(),
            soldier_unit: Vec::new(),
            soldier_slot: Vec::new(),
            units: Vec::new(),
            terrain: Terrain::flat(1, 1, 4.0, Vec2::ZERO),
            tick_count: 0,
            rng: Pcg32::new(seed, 0xda3e),
            grid: SpatialHash::new(),
            scratch: Vec::new(),
        }
    }

    pub fn soldier_count(&self) -> usize {
        self.facings.len()
    }

    pub fn soldier_pos(&self, i: usize) -> Vec2 {
        Vec2::new(self.positions[2 * i], self.positions[2 * i + 1])
    }

    /// Distance from soldier `i` to its currently assigned slot.
    pub fn slot_error(&self, i: usize) -> f32 {
        let u = &self.units[self.soldier_unit[i] as usize];
        (u.slot_world(self.soldier_slot[i] as usize) - self.soldier_pos(i)).len()
    }

    /// Spawn a unit in perfect formation. `anchor` is the front-center.
    pub fn spawn_unit(
        &mut self,
        anchor: Vec2,
        facing: f32,
        count: usize,
        files: usize,
        spacing: Vec2,
        team: u32,
        training: f32,
    ) -> usize {
        let unit_index = self.units.len();
        let unit = Unit {
            class: UnitClassId::LightInfantry,
            speed_mult: 1.0,
            start: self.soldier_count(),
            count,
            files: files.max(1),
            spacing,
            anchor,
            facing,
            speed: 0.0,
            move_target: None,
            pending_target: None,
            pending_timer: 0.0,
            pending_total: 0.0,
            pace: Pace::Walk,
            fatigue: 1.0,
            training: training.clamp(0.0, 1.0),
            team,
            disorder: 0.0,
            cohesion: 1.0,
            pivoting: false,
        };
        for s in 0..count {
            let p = unit.slot_world(s);
            self.positions.push(p.x);
            self.positions.push(p.y);
            self.facings.push(facing);
            self.health.push(1.0);
            self.mass.push(1.0);
            self.radius.push(self.tun.soldier_radius);
            self.alive.push(1);
            self.soldier_unit.push(unit_index as u32);
            self.soldier_slot.push(s as u32);
        }
        self.units.push(unit);
        unit_index
    }

    /// Spawn a unit of a class: stats, body size, mass, spacing, and depth
    /// all come from the class table.
    pub fn spawn_class(
        &mut self,
        anchor: Vec2,
        facing: f32,
        count: usize,
        class: UnitClassId,
        team: u32,
    ) -> usize {
        let stats = class_stats(class);
        let files = count.div_ceil(stats.default_depth.max(1));
        let idx = self.spawn_unit(anchor, facing, count, files, stats.spacing, team, stats.training);
        let start = self.units[idx].start;
        for s in 0..count {
            self.health[start + s] = stats.health;
            self.mass[start + s] = stats.mass;
            self.radius[start + s] = stats.soldier_radius;
        }
        self.max_radius = self.max_radius.max(stats.soldier_radius);
        let u = &mut self.units[idx];
        u.class = class;
        u.speed_mult = stats.speed_mult;
        idx
    }

    /// Issue a move order. Well-ordered units respond at once; a disordered
    /// unit's leader needs time to transmit it (the pie timer in the UI).
    pub fn set_move_order(&mut self, unit: usize, target: Vec2) {
        let Some(u) = self.units.get_mut(unit) else {
            return;
        };
        let shortfall = (self.tun.order_delay_threshold - u.cohesion).max(0.0);
        let delay = (shortfall * self.tun.order_delay_scale).min(self.tun.order_delay_max);
        if delay < 0.05 {
            u.move_target = Some(target);
            u.pending_target = None;
        } else {
            u.pending_target = Some(target);
            u.pending_timer = delay;
            u.pending_total = delay;
        }
    }

    pub fn set_pace(&mut self, unit: usize, pace: Pace) {
        if let Some(u) = self.units.get_mut(unit) {
            u.pace = pace;
        }
    }

    /// Nearest unit (by formation midpoint) within max_dist, or None.
    pub fn pick_unit(&self, p: Vec2, max_dist: f32) -> Option<usize> {
        let mut best: Option<(usize, f32)> = None;
        for (i, u) in self.units.iter().enumerate() {
            let d = (u.center() - p).len();
            if d <= max_dist && best.map_or(true, |(_, bd)| d < bd) {
                best = Some((i, d));
            }
        }
        best.map(|(i, _)| i)
    }

    pub fn tick(&mut self) {
        let dt = DT;
        let tun = self.tun;

        for u in &mut self.units {
            // Deliver queued orders once the transmission delay elapses.
            if let Some(t) = u.pending_target {
                u.pending_timer -= dt;
                if u.pending_timer <= 0.0 {
                    u.move_target = Some(t);
                    u.pending_target = None;
                }
            }
            // The formation as a whole moves at the pace of the ground under
            // its anchor (clamped: an anchor grazing a wall mustn't freeze).
            let ground = self.terrain.speed_at(u.anchor).max(0.15);
            update_unit_motion(&tun, u, dt, ground);
        }

        // Pivoting units continuously re-form: every soldier takes the
        // nearest slot in the rotating frame, so an about-face relabels
        // ranks instead of dragging soldiers across the formation.
        for ui in 0..self.units.len() {
            if self.units[ui].pivoting {
                reassign_slots(&self.units[ui], &self.positions, &mut self.soldier_slot);
            }
        }

        // Soldier steering + per-unit disorder measurement in one pass.
        // Destructured so the borrow checker sees disjoint field borrows.
        let Sim {
            units,
            positions,
            facings,
            soldier_slot,
            terrain,
            tick_count,
            ..
        } = self;
        let tick_now = *tick_count;

        let mut measures: Vec<(f32, usize, usize, f32)> = Vec::with_capacity(units.len());
        for u in units.iter() {
            let f = dir(u.facing);
            let r = Vec2::new(f.y, -f.x);
            let surge_sp = soldier_surge_speed(&tun, u);
            // Small margin over the unit's pace lets soldiers close gradual
            // gaps without breaking into a (fatigue-draining) surge.
            let keep_up_sp = pace_speed(&tun, u) + 0.5;
            let mut err_sum = 0.0f32;
            let mut stragglers = 0usize;
            let mut surging = 0usize;
            let mut effort = 0.0f32;
            // Straggling scales with formation extent: a wheeling wing file
            // of a 140m line is meters from its slot while obeying perfectly;
            // a tiny unit still measures absolutely.
            let strag_thresh = tun.straggler_dist.max(0.04 * u.depth().max(u.width()));

            for s in 0..u.count {
                let i = u.start + s;
                let local = slot_local(soldier_slot[i] as usize, u.files, u.spacing);
                let slot = u.anchor + r * local.x + f * (-local.y);
                let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
                let to = slot - p;
                let err = to.len();
                err_sum += err;
                if err > strag_thresh {
                    stragglers += 1;
                }
                let mut max_sp = if err > tun.surge_err_threshold {
                    surging += 1;
                    surge_sp
                } else {
                    keep_up_sp
                };

                // Ground underfoot: slow going is slow, rough going staggers
                // each man differently (which the disorder measurement then
                // sees), and walls stop legs entirely.
                let ground = terrain.speed_at(p);
                if ground < 1.0 {
                    max_sp *= ground;
                }
                let rough = terrain.rough_at(p);
                if rough > 0.0 {
                    max_sp *= 1.0 - 0.5 * rough * stagger01(i, tick_now);
                }

                // Arrive steering: proportional, clamped to soldier top speed.
                let mut v = to * tun.soldier_gain;
                let vl = v.len();
                if vl > max_sp {
                    v = v * (max_sp / vl);
                }
                if vl > 0.2 {
                    effort += 1.0 - ground;
                }
                let mut np = Vec2::new(p.x + v.x * dt, p.y + v.y * dt);
                if ground <= 0.0 {
                    // Standing in a wall (e.g. shoved in by the crowd):
                    // legs are useless, get pushed toward open ground.
                    np = p + terrain.escape_dir(p) * (3.0 * dt);
                } else if terrain.speed_at(np) <= 0.0 {
                    // Never walk into a wall; slide along it if one axis works.
                    let slide_x = Vec2::new(np.x, p.y);
                    let slide_y = Vec2::new(p.x, np.y);
                    np = if terrain.speed_at(slide_x) > 0.0 {
                        slide_x
                    } else if terrain.speed_at(slide_y) > 0.0 {
                        slide_y
                    } else {
                        p
                    };
                }
                positions[2 * i] = np.x;
                positions[2 * i + 1] = np.y;

                let desired_face = if err > 0.5 { v.y.atan2(v.x) } else { u.facing };
                facings[i] = rotate_toward(facings[i], desired_face, tun.soldier_turn_rate * dt);
            }
            measures.push((err_sum, stragglers, surging, effort));
        }

        self.apply_separation();

        for (u, (err_sum, stragglers, surging, effort)) in self.units.iter_mut().zip(measures) {
            let n = u.count.max(1) as f32;
            let mean_err = err_sum / n;
            // Normalize by the formation's larger extent: wheeling swings the
            // far soldiers proportionally to size — for a deep block that's
            // the rear ranks, for a wide line it's the wing files. Neither is
            // disorder; a tiny unit still measures in absolute meters.
            let extent = u.depth().max(u.width());
            let scale = (0.5 * extent).max(tun.disorder_norm_spacings * u.spacing.x.max(0.25));
            let norm = (mean_err / scale).min(1.0);
            let strag_frac = stragglers as f32 / n;
            let observed = (0.7 * norm + 0.3 * strag_frac).clamp(0.0, 1.0);

            // Disorder is a low-pass filter over the measurement: rises fast,
            // recovers at a rate set by training. It is never mutated directly.
            let tau = if observed > u.disorder {
                tun.disorder_rise_tau
            } else {
                tun.disorder_fall_tau / (0.5 + u.training)
            };
            let alpha = 1.0 - (-dt / tau).exp();
            u.disorder += (observed - u.disorder) * alpha;
            u.cohesion = (-tun.cohesion_k * u.disorder).exp();

            // Stamina economy: running and surging spend the shared reserve;
            // standing still refills it slowly.
            let surge_frac = surging as f32 / n;
            let mut drain = tun.surge_drain * surge_frac;
            if u.pace == Pace::Run && u.speed > tun.base_speed * 1.05 {
                drain += tun.run_drain;
            }
            // Hard going (mud, slopes, woods) costs stamina in proportion to
            // how much the ground fights each moving soldier.
            drain += tun.terrain_drain * (effort / n);
            // Recovery is the net of rest vs residual exertion: a halted
            // unit whose last stragglers are still shuffling in must not be
            // locked out of recovering forever.
            if u.speed < 0.1 && u.move_target.is_none() {
                drain -= tun.rest_recover;
            }
            u.fatigue = (u.fatigue - drain * dt).clamp(0.0, 1.0);
        }

        self.tick_count += 1;
    }
}
