//! The balance harness: run a `Scenario` over N seeds against a `BalanceConfig`
//! and aggregate the outcome.
//!
//! This is the substrate both test families share (balance matrix and the
//! seed-wobble-prone behavior tests) and the seam an agent tunes through: vary
//! the config, read the `Aggregate`, judge, repeat. A single duel is RNG-
//! dependent — one seed chases noise — so every measurement is taken over a
//! fixed seed set and reported with its spread, so a coin-flip matchup is
//! visible as variance rather than a flapping pass/fail.

use crate::tunables::{Pace, DT};
use crate::{BalanceConfig, Sim, Tunables, UnitClassId, Vec2};
use std::f32::consts::FRAC_PI_2;

/// The committed seed set. Eight is enough to separate a real edge from RNG
/// jitter while keeping a full 81-cell matrix in the low hundreds of duels.
/// Arbitrary but fixed — changing it re-pins every aggregate, so don't.
pub const SEEDS: [u64; 8] = [11, 37, 73, 101, 146, 211, 307, 449];

/// A side's units, in lateral order: (class, soldier count).
pub type Force = Vec<(UnitClassId, usize)>;

/// A battle to measure: two forces on a flat field, head-on. Generalises the
/// 1v1 bench to N-v-M (combined arms, outnumbered stands, price-matched armies)
/// without changing the runner.
#[derive(Clone, Debug)]
pub struct Scenario {
    pub name: String,
    pub sides: [Force; 2],
    /// Committed clash (both advance at the run) vs a walk-in.
    pub run: bool,
    /// Hard time cap (sim seconds); a no-verdict at the cap is a real outcome
    /// (a standoff — e.g. kiters vs slow melee).
    pub dur_secs: f32,
}

/// `setup_duel`-strength head counts, mirrored here so the matrix owns its own
/// bench (battle.rs keeps the same numbers for the sandbox/UI). A duel is a
/// committed clash, so these are tuned to a fair single-unit meeting.
pub fn duel_strength(c: UnitClassId) -> usize {
    use UnitClassId::*;
    match c {
        HeavyInfantry => 240,
        LightInfantry => 220,
        LongSwords => 140,
        Phalanx => 240,
        Archers => 140,
        Skirmishers => 140,
        ShockCavalry => 120,
        HorseArchers => 100,
        ArtilleryCrew => 40,
        Peasant => 300,
    }
}

impl Scenario {
    /// The 1v1 matrix cell: each class at duel strength, head-on, committed.
    pub fn duel(a: UnitClassId, b: UnitClassId) -> Self {
        Self {
            name: format!("{a:?}_vs_{b:?}"),
            sides: [vec![(a, duel_strength(a))], vec![(b, duel_strength(b))]],
            run: true,
            dur_secs: 600.0,
        }
    }
}

/// One battle's result.
#[derive(Clone, Copy, Debug)]
pub struct Outcome {
    /// 0 = side 0 won, 1 = side 1 won, 2 = no verdict within the time cap.
    pub victor: u32,
    /// Survivor fraction per side (alive / spawned).
    pub surv: [f32; 2],
    /// Seconds to verdict (or the cap).
    pub secs: f32,
}

/// Spread of a quantity over the seed set.
#[derive(Clone, Copy, Debug, Default)]
pub struct Stat {
    pub mean: f32,
    pub median: f32,
    pub min: f32,
    pub max: f32,
    /// Population standard deviation — the variance that flags a coin-flip.
    pub stdev: f32,
}

/// A scenario's outcome over the seed set.
#[derive(Clone, Debug)]
pub struct Aggregate {
    pub name: String,
    pub seeds: usize,
    /// Fraction of seeds each side won.
    pub win_rate: [f32; 2],
    pub draw_rate: f32,
    /// Survivor-fraction spread per side.
    pub surv: [Stat; 2],
    pub secs_median: f32,
}

impl Aggregate {
    /// Which side won the majority of seeds (None on a tie/draw-heavy split).
    pub fn winner(&self) -> Option<usize> {
        if self.win_rate[0] > self.win_rate[1] && self.win_rate[0] > 0.5 {
            Some(0)
        } else if self.win_rate[1] > self.win_rate[0] && self.win_rate[1] > 0.5 {
            Some(1)
        } else {
            None
        }
    }
}

/// Run one battle deterministically from `seed`.
pub fn run_once(scn: &Scenario, balance: &BalanceConfig, tun: &Tunables, seed: u64) -> Outcome {
    use crate::terrain::Terrain;
    let mut sim = Sim::with_balance(tun.clone(), balance.clone(), seed);
    // The compact open field the duels and sandboxes share.
    sim.terrain = Terrain::flat(200, 150, 4.0, Vec2::new(-400.0, -300.0));

    // Spawn each side as a lateral row facing the other; record the spawned
    // head count per side for the survivor fraction.
    let mut spawned = [0f32; 2];
    let mut first_unit = [usize::MAX; 2];
    for (side, force) in scn.sides.iter().enumerate() {
        let y = if side == 0 { -90.0 } else { 90.0 };
        let facing = if side == 0 { FRAC_PI_2 } else { -FRAC_PI_2 };
        let n = force.len();
        for (k, &(class, count)) in force.iter().enumerate() {
            // Center the row on x = 0, 70 m between units.
            let x = (k as f32 - (n as f32 - 1.0) / 2.0) * 70.0;
            let u = sim.spawn_class(Vec2::new(x, y), facing, count, class, side as u32);
            if first_unit[side] == usize::MAX {
                first_unit[side] = u;
            }
            spawned[side] += count as f32;
            let pace = if scn.run { Pace::Run } else { Pace::Walk };
            sim.set_pace(u, pace);
        }
    }

    // Orders: every unit attacks the nearest enemy unit (a committed clash).
    let n_units = sim.units.len();
    for ui in 0..n_units {
        let my_team = sim.units[ui].team;
        let me = sim.units[ui].center();
        let mut best = (f32::MAX, usize::MAX);
        for uj in 0..n_units {
            if sim.units[uj].team == my_team {
                continue;
            }
            let d = (sim.units[uj].center() - me).len();
            if d < best.0 {
                best = (d, uj);
            }
        }
        if best.1 != usize::MAX {
            sim.set_attack_order(ui, best.1);
        }
    }

    let alive_frac = |sim: &Sim, side: usize| -> f32 {
        let team = side as u32;
        let alive: usize = sim
            .units
            .iter()
            .filter(|u| u.team == team)
            .map(|u| u.alive_count)
            .sum();
        if spawned[side] > 0.0 {
            alive as f32 / spawned[side]
        } else {
            0.0
        }
    };

    let steps = (scn.dur_secs / DT) as usize;
    for step in 0..steps {
        sim.tick();
        if let Some(v) = sim.victor() {
            return Outcome {
                victor: v,
                surv: [alive_frac(&sim, 0), alive_frac(&sim, 1)],
                secs: step as f32 * DT,
            };
        }
    }
    Outcome {
        victor: 2,
        surv: [alive_frac(&sim, 0), alive_frac(&sim, 1)],
        secs: scn.dur_secs,
    }
}

/// Run `scn` over a seed set and aggregate. The headline harness call.
pub fn run_over_seeds(
    scn: &Scenario,
    balance: &BalanceConfig,
    tun: &Tunables,
    seeds: &[u64],
) -> Aggregate {
    let outs: Vec<Outcome> = seeds
        .iter()
        .map(|&s| run_once(scn, balance, tun, s))
        .collect();
    let n = outs.len().max(1) as f32;

    let wins = |side: u32| outs.iter().filter(|o| o.victor == side).count() as f32 / n;
    let draws = outs.iter().filter(|o| o.victor == 2).count() as f32 / n;
    let surv = |side: usize| stat(outs.iter().map(|o| o.surv[side]));
    let secs_median = median(outs.iter().map(|o| o.secs).collect());

    Aggregate {
        name: scn.name.clone(),
        seeds: outs.len(),
        win_rate: [wins(0), wins(1)],
        draw_rate: draws,
        surv: [surv(0), surv(1)],
        secs_median,
    }
}

fn stat(xs: impl Iterator<Item = f32>) -> Stat {
    let v: Vec<f32> = xs.collect();
    if v.is_empty() {
        return Stat::default();
    }
    let n = v.len() as f32;
    let mean = v.iter().sum::<f32>() / n;
    let var = v.iter().map(|x| (x - mean).powi(2)).sum::<f32>() / n;
    Stat {
        mean,
        median: median(v.clone()),
        min: v.iter().cloned().fold(f32::MAX, f32::min),
        max: v.iter().cloned().fold(f32::MIN, f32::max),
        stdev: var.sqrt(),
    }
}

fn median(mut v: Vec<f32>) -> f32 {
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let m = v.len() / 2;
    if v.len() % 2 == 0 {
        0.5 * (v[m - 1] + v[m])
    } else {
        v[m]
    }
}
