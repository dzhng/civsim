//! Externally-driven battles: the campaign hands in a `BattleSetup`, this
//! runs the sim (interactively or headless) and hands back a `BattleResult`.
//! `Sim` itself stays pure; reinforcement scheduling and result bookkeeping
//! live here.

use crate::ai::ai_commander;
use crate::battle::deploy_resolved_roster;
use crate::class::UnitClass;
use crate::sim::Sim;
use crate::terrain::Terrain;
use crate::tunables::Tunables;
use contract::{BattleResult, BattleSetup, Deployment, Reinforcement, TerrainSource, UnitResult};

pub struct Battle {
    pub sim: Sim,
    /// (due tick, reinforcement) — spawned at the map edge when due.
    scheduled: Vec<ScheduledReinforcement>,
    /// (campaign unit id, team, sim unit index).
    unit_map: Vec<(u64, u32, usize)>,
    ai_teams: [bool; 2],
}

struct ScheduledReinforcement {
    due: u64,
    reinforcement: Reinforcement,
    stats: Vec<UnitClass>,
    render_looks: Vec<u32>,
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

    pub fn from_setup<F, G>(setup: &BattleSetup, stats_for: &F, render_look_for: &G) -> Battle
    where
        F: Fn(&contract::RosterUnit) -> UnitClass,
        G: Fn(&contract::RosterUnit) -> u32,
    {
        let mut sim = Sim::new(Tunables::default(), setup.seed);
        sim.terrain = terrain_from_source(&setup.terrain);
        let mut unit_map = Vec::new();
        for dep in &setup.deployments {
            for (id, idx) in deploy_resolved_roster(&mut sim, dep, stats_for, render_look_for) {
                unit_map.push((id, dep.team, idx));
            }
        }
        let mut scheduled: Vec<ScheduledReinforcement> = setup
            .reinforcements
            .iter()
            .map(|r| {
                let stats = r.units.iter().map(stats_for).collect();
                let render_looks = r.units.iter().map(render_look_for).collect();
                ScheduledReinforcement {
                    due: ((r.delay_secs / crate::tunables::DT) as u64).max(1),
                    reinforcement: r.clone(),
                    stats,
                    render_looks,
                }
            })
            .collect();
        scheduled.sort_by_key(|s| s.due);
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
        while let Some(first) = self.scheduled.first() {
            if first.due > self.sim.tick_count {
                break;
            }
            let scheduled = self.scheduled.remove(0);
            let r = scheduled.reinforcement;
            let stats = scheduled.stats;
            let render_looks = scheduled.render_looks;
            let dep = Deployment {
                team: r.team,
                units: r.units.clone(),
                center: r.entry,
                facing: r.facing,
                column: true,
            };
            let roster_index = |ru: &contract::RosterUnit| {
                r.units
                    .iter()
                    .position(|x| x.id == ru.id && x.class == ru.class)
            };
            for (id, idx) in deploy_resolved_roster(
                &mut self.sim,
                &dep,
                &|ru| {
                    roster_index(ru)
                        .and_then(|i| stats.get(i).copied())
                        .unwrap_or_else(|| crate::class::class_stats(ru.class))
                },
                &|ru| {
                    roster_index(ru)
                        .and_then(|i| render_looks.get(i).copied())
                        .unwrap_or(ru.class as u32)
                },
            ) {
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
        for s in &self.scheduled {
            let r = &s.reinforcement;
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

    /// Remaining alive headcount per team (tie-break for capped runs).
    fn strength(&self, team: u32) -> u32 {
        self.unit_map
            .iter()
            .filter(|&&(_, t, _)| t == team)
            .map(|&(_, _, idx)| self.sim.units[idx].alive_count as u32)
            .sum()
    }
}

fn terrain_from_source(source: &TerrainSource) -> Terrain {
    match source {
        TerrainSource::Ops(spec) => Terrain::from_spec(spec),
        TerrainSource::Recipe(recipe) => crate::genmap::generate(recipe),
    }
}
