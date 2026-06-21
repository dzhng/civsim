//! Externally-driven battles: the campaign hands in a `BattleSetup`, this
//! runs the sim (interactively or headless) and hands back a `BattleResult`.
//! `Sim` itself stays pure; reinforcement scheduling and result bookkeeping
//! live here.

use crate::ai::ai_commander;
use crate::battle::deploy_roster;
use crate::sim::Sim;
use crate::terrain::Terrain;
use crate::tunables::Tunables;
use contract::{BattleResult, BattleSetup, Deployment, Reinforcement, UnitResult};

pub struct Battle {
    pub sim: Sim,
    /// (due tick, reinforcement) — spawned at the map edge when due.
    scheduled: Vec<(u64, Reinforcement)>,
    /// (campaign unit id, team, sim unit index).
    unit_map: Vec<(u64, u32, usize)>,
    ai_teams: [bool; 2],
}

impl Battle {
    /// Wrap a bare sim (quick battles / sandboxes): no schedule, no campaign
    /// unit mapping — `result()` is meaningless, `victor` comes from the sim.
    pub fn from_sim(sim: Sim) -> Battle {
        Battle {
            sim,
            scheduled: Vec::new(),
            unit_map: Vec::new(),
            ai_teams: [false, false],
        }
    }

    /// Result with the victor forced by remaining strength — for battles cut
    /// short (player quit, tick cap) before the sim declared one.
    pub fn forced_result(&self) -> BattleResult {
        let v = if self.strength(0) >= self.strength(1) {
            0
        } else {
            1
        };
        self.result_with_victor(v)
    }

    pub fn from_setup(setup: &BattleSetup) -> Battle {
        let mut sim = Sim::new(Tunables::default(), setup.seed);
        sim.terrain = Terrain::from_spec(&setup.terrain);
        let mut unit_map = Vec::new();
        for dep in &setup.deployments {
            for (id, idx) in deploy_roster(&mut sim, dep) {
                unit_map.push((id, dep.team, idx));
            }
        }
        let mut scheduled: Vec<(u64, Reinforcement)> = setup
            .reinforcements
            .iter()
            .map(|r| {
                (
                    ((r.delay_secs / crate::tunables::DT) as u64).max(1),
                    r.clone(),
                )
            })
            .collect();
        scheduled.sort_by_key(|(due, _)| *due);
        Battle {
            sim,
            scheduled,
            unit_map,
            ai_teams: [false, false],
        }
    }

    pub fn set_ai(&mut self, team: u32, on: bool) {
        self.ai_teams[team as usize] = on;
    }

    pub fn tick(&mut self) {
        // Spawn due reinforcements at their road's map-edge entry, in column —
        // they arrive marching, not formed.
        while let Some((due, _)) = self.scheduled.first() {
            if *due > self.sim.tick_count {
                break;
            }
            let (_, r) = self.scheduled.remove(0);
            let dep = Deployment {
                team: r.team,
                units: r.units.clone(),
                center: r.entry,
                facing: r.facing,
                column: true,
            };
            for (id, idx) in deploy_roster(&mut self.sim, &dep) {
                self.unit_map.push((id, r.team, idx));
            }
        }
        self.sim.tick();
        for team in 0..2u32 {
            if self.ai_teams[team as usize] {
                ai_commander(&mut self.sim, team);
            }
        }
    }

    /// Some(result) once the sim declares a victor.
    pub fn result(&self) -> Option<BattleResult> {
        self.sim.victor().map(|v| self.result_with_victor(v))
    }

    /// Result snapshot with an explicit victor (for the capped headless run).
    pub fn result_with_victor(&self, victor: u32) -> BattleResult {
        let mut units: Vec<UnitResult> = Vec::new();
        // Deployed units: aggregate battle units back onto campaign ids.
        for &(id, team, idx) in &self.unit_map {
            let u = &self.sim.units[idx];
            match units.iter_mut().find(|r| r.id == id && r.team == team) {
                Some(r) => {
                    r.survivors += u.alive_count as u32;
                    r.routed &= u.routing || u.alive_count == 0;
                    r.morale_cap = r.morale_cap.min(u.morale_ceiling);
                    r.deployed = true;
                }
                None => units.push(UnitResult {
                    id,
                    team,
                    survivors: u.alive_count as u32,
                    routed: u.routing || u.alive_count == 0,
                    morale_cap: u.morale_ceiling,
                    deployed: true,
                }),
            }
        }
        // Reinforcements that never arrived: untouched, full strength.
        for (_, r) in &self.scheduled {
            for ru in &r.units {
                units.push(UnitResult {
                    id: ru.id,
                    team: r.team,
                    survivors: ru.count,
                    routed: false,
                    morale_cap: ru.morale_cap,
                    deployed: false,
                });
            }
        }
        BattleResult { victor, units }
    }

    /// Remaining cost-weighted strength per team (tie-break for capped runs).
    fn strength(&self, team: u32) -> u32 {
        self.unit_map
            .iter()
            .filter(|&&(_, t, _)| t == team)
            .map(|&(_, _, idx)| self.sim.units[idx].alive_count as u32)
            .sum()
    }

    /// Headless auto-resolve: the real sim, both commanders on, as fast as it
    /// goes. If the cap lands first, the stronger remainder wins.
    pub fn auto_resolve(setup: &BattleSetup, max_ticks: u64) -> BattleResult {
        let mut b = Battle::from_setup(setup);
        b.set_ai(0, true);
        b.set_ai(1, true);
        for _ in 0..max_ticks {
            b.tick();
            if let Some(r) = b.result() {
                return r;
            }
        }
        let v = if b.strength(0) >= b.strength(1) { 0 } else { 1 };
        b.result_with_victor(v)
    }
}
