use crate::math::Vec2;
use std::collections::{BTreeMap, BTreeSet};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub enum ForceChannel {
    WeaveNet,
    CompPush,
    PivotSpring,
    EnemyBondWeld,
    EnemyBondInsideReachPush,
    SlotPull,
    SlotPullLean,
    CorridorClamp,
    Magnet,
    Cruise,
    SpeedCap,
    FightingPaceCap,
    PikeLateralFriction,
    IdleSettleDamp,
    BodySeparationNormal,
    BodySeparationFriendlySlide,
    BodySeparationTieBreak,
    HardWall,
    ProjectionPass,
    WeaponRepel,
    HitPush,
    KnockbackMomentum,
    ImpactPush,
    Routing,
    DisengageEscape,
    Fidget,
    TerrainProject,
    SoldierFacing,
    UnitFacing,
    UnitFrame,
}

impl ForceChannel {
    pub const ALL: &'static [ForceChannel] = &[
        ForceChannel::WeaveNet,
        ForceChannel::CompPush,
        ForceChannel::PivotSpring,
        ForceChannel::EnemyBondWeld,
        ForceChannel::EnemyBondInsideReachPush,
        ForceChannel::SlotPull,
        ForceChannel::SlotPullLean,
        ForceChannel::CorridorClamp,
        ForceChannel::Magnet,
        ForceChannel::Cruise,
        ForceChannel::SpeedCap,
        ForceChannel::FightingPaceCap,
        ForceChannel::PikeLateralFriction,
        ForceChannel::IdleSettleDamp,
        ForceChannel::BodySeparationNormal,
        ForceChannel::BodySeparationFriendlySlide,
        ForceChannel::BodySeparationTieBreak,
        ForceChannel::HardWall,
        ForceChannel::ProjectionPass,
        ForceChannel::WeaponRepel,
        ForceChannel::HitPush,
        ForceChannel::KnockbackMomentum,
        ForceChannel::ImpactPush,
        ForceChannel::Routing,
        ForceChannel::DisengageEscape,
        ForceChannel::Fidget,
        ForceChannel::TerrainProject,
        ForceChannel::SoldierFacing,
        ForceChannel::UnitFacing,
        ForceChannel::UnitFrame,
    ];

    pub fn source_site(self) -> &'static str {
        match self {
            ForceChannel::WeaveNet => "sim.rs/steer_soldiers/weave_net",
            ForceChannel::CompPush => "sim.rs/steer_soldiers/comp_push",
            ForceChannel::PivotSpring => "sim.rs/steer_soldiers/pivot_spring",
            ForceChannel::EnemyBondWeld => "sim.rs/steer_soldiers/enemy_bond_weld",
            ForceChannel::EnemyBondInsideReachPush => {
                "sim.rs/steer_soldiers/enemy_bond_inside_reach_push"
            }
            ForceChannel::SlotPull => "sim.rs/steer_soldiers/slot_pull",
            ForceChannel::SlotPullLean => "sim.rs/steer_soldiers/slot_pull_lean_0_65",
            ForceChannel::CorridorClamp => "sim.rs/steer_soldiers/forward_corridor_clamp",
            ForceChannel::Magnet => "sim.rs/steer_soldiers/enemy_magnet",
            ForceChannel::Cruise => "sim.rs/steer_soldiers/frame_cruise",
            ForceChannel::SpeedCap => "sim.rs/steer_soldiers/soldier_speed_cap",
            ForceChannel::FightingPaceCap => "sim.rs/steer_soldiers/fighting_pace_cap",
            ForceChannel::PikeLateralFriction => "sim.rs/steer_soldiers/pike_lateral_friction",
            ForceChannel::IdleSettleDamp => "sim.rs/steer_soldiers/idle_settle_damp",
            ForceChannel::BodySeparationNormal => "collision.rs/apply_separation/body_normal",
            ForceChannel::BodySeparationFriendlySlide => {
                "collision.rs/apply_separation/friendly_slide"
            }
            ForceChannel::BodySeparationTieBreak => "collision.rs/apply_separation/index_tiebreak",
            ForceChannel::HardWall => "collision.rs/apply_separation/hard_wall",
            ForceChannel::ProjectionPass => "collision.rs/apply_separation/projection_pass",
            ForceChannel::WeaponRepel => "collision.rs/apply_separation/weapon_repel",
            ForceChannel::HitPush => "combat.rs/strike/hit_push",
            ForceChannel::KnockbackMomentum => "collision.rs/apply_separation/charge_momentum",
            ForceChannel::ImpactPush => "collision.rs/apply_separation/impact_push",
            ForceChannel::Routing => "sim.rs/steer_soldiers/routing",
            ForceChannel::DisengageEscape => "sim.rs/steer_soldiers/disengage_escape",
            ForceChannel::Fidget => "sim.rs/steer_soldiers/idle_fidget",
            ForceChannel::TerrainProject => "sim.rs/steer_soldiers/terrain_projection",
            ForceChannel::SoldierFacing => "sim.rs/steer_soldiers/soldier_facing",
            ForceChannel::UnitFacing => "sim.rs/contact_facing/unit_facing",
            ForceChannel::UnitFrame => "movement.rs/update_unit_motion/unit_frame",
        }
    }

    pub fn is_steering(self) -> bool {
        matches!(
            self,
            ForceChannel::WeaveNet
                | ForceChannel::CompPush
                | ForceChannel::PivotSpring
                | ForceChannel::EnemyBondWeld
                | ForceChannel::EnemyBondInsideReachPush
                | ForceChannel::SlotPull
                | ForceChannel::SlotPullLean
                | ForceChannel::CorridorClamp
                | ForceChannel::Magnet
                | ForceChannel::Cruise
                | ForceChannel::SpeedCap
                | ForceChannel::FightingPaceCap
                | ForceChannel::PikeLateralFriction
                | ForceChannel::IdleSettleDamp
                | ForceChannel::Routing
                | ForceChannel::DisengageEscape
                | ForceChannel::Fidget
                | ForceChannel::TerrainProject
        )
    }

    pub fn is_cap(self) -> bool {
        matches!(
            self,
            ForceChannel::CorridorClamp
                | ForceChannel::SpeedCap
                | ForceChannel::FightingPaceCap
                | ForceChannel::PikeLateralFriction
                | ForceChannel::IdleSettleDamp
                | ForceChannel::WeaponRepel
                | ForceChannel::BodySeparationNormal
        )
    }
}

#[derive(Clone, Debug)]
pub struct ForceRecord {
    pub tick: u64,
    pub soldier: usize,
    pub unit: usize,
    pub channel: ForceChannel,
    pub vec: Vec2,
    pub pre: Option<Vec2>,
    pub post: Option<Vec2>,
    pub meta: &'static str,
}

impl ForceRecord {
    pub fn new(
        tick: u64,
        soldier: usize,
        unit: usize,
        channel: ForceChannel,
        vec: Vec2,
        meta: &'static str,
    ) -> Self {
        Self {
            tick,
            soldier,
            unit,
            channel,
            vec,
            pre: None,
            post: None,
            meta,
        }
    }

    pub fn cap(
        tick: u64,
        soldier: usize,
        unit: usize,
        channel: ForceChannel,
        pre: Vec2,
        post: Vec2,
        meta: &'static str,
    ) -> Self {
        Self {
            tick,
            soldier,
            unit,
            channel,
            vec: post - pre,
            pre: Some(pre),
            post: Some(post),
            meta,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct ForceTraceFilter {
    pub units: Option<BTreeSet<usize>>,
    pub soldiers: Option<BTreeSet<usize>>,
    pub tick_range: Option<(u64, u64)>,
    pub channels: Option<BTreeSet<ForceChannel>>,
}

impl ForceTraceFilter {
    pub fn matches(&self, record: &ForceRecord) -> bool {
        if let Some(units) = &self.units {
            if !units.contains(&record.unit) {
                return false;
            }
        }
        if let Some(soldiers) = &self.soldiers {
            if !soldiers.contains(&record.soldier) {
                return false;
            }
        }
        if let Some((lo, hi)) = self.tick_range {
            if record.tick < lo || record.tick > hi {
                return false;
            }
        }
        if let Some(channels) = &self.channels {
            if !channels.contains(&record.channel) {
                return false;
            }
        }
        true
    }
}

#[derive(Clone, Debug, Default)]
pub struct ForceTrace {
    records: Vec<ForceRecord>,
    filter: ForceTraceFilter,
}

impl ForceTrace {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_filter(&mut self, filter: ForceTraceFilter) {
        self.filter = filter;
    }

    pub fn clear(&mut self) {
        self.records.clear();
    }

    pub fn push(&mut self, record: ForceRecord) {
        if self.filter.matches(&record) {
            self.records.push(record);
        }
    }

    pub fn extend(&mut self, records: Vec<ForceRecord>) {
        for record in records {
            self.push(record);
        }
    }

    pub fn records(&self) -> &[ForceRecord] {
        &self.records
    }

    pub fn filtered(&self, filter: &ForceTraceFilter) -> Vec<&ForceRecord> {
        self.records.iter().filter(|r| filter.matches(r)).collect()
    }

    pub fn ledger_for_soldier(&self, soldier: usize) -> Vec<&ForceRecord> {
        self.records
            .iter()
            .filter(|r| r.soldier == soldier)
            .collect()
    }

    pub fn net_force_by_channel(&self, unit: usize, tick: u64) -> BTreeMap<ForceChannel, Vec2> {
        let mut out = BTreeMap::new();
        for record in &self.records {
            if record.unit == unit && record.tick == tick {
                let entry = out.entry(record.channel).or_insert(Vec2::ZERO);
                *entry = *entry + record.vec;
            }
        }
        out
    }

    pub fn torque_about_centroid_by_channel(
        &self,
        unit: usize,
        tick: u64,
        positions: &[(usize, Vec2)],
    ) -> BTreeMap<ForceChannel, f32> {
        let mut centroid = Vec2::ZERO;
        let mut n = 0.0;
        for &(_, p) in positions {
            centroid = centroid + p;
            n += 1.0;
        }
        if n > 0.0 {
            centroid = centroid * (1.0 / n);
        }

        let mut by_soldier = BTreeMap::new();
        for &(soldier, p) in positions {
            by_soldier.insert(soldier, p);
        }

        let mut out = BTreeMap::new();
        for record in &self.records {
            if record.unit != unit || record.tick != tick {
                continue;
            }
            let Some(&p) = by_soldier.get(&record.soldier) else {
                continue;
            };
            let arm = p - centroid;
            let torque = arm.x * record.vec.y - arm.y * record.vec.x;
            *out.entry(record.channel).or_insert(0.0) += torque;
        }
        out
    }

    pub fn cap_histogram(&self) -> BTreeMap<ForceChannel, usize> {
        let mut out = BTreeMap::new();
        for record in &self.records {
            if record.channel.is_cap() && record.pre.is_some() {
                *out.entry(record.channel).or_insert(0) += 1;
            }
        }
        out
    }

    pub fn dump_jsonl(&self, path: impl AsRef<Path>) -> std::io::Result<()> {
        let file = File::create(path)?;
        let mut out = BufWriter::new(file);
        for record in &self.records {
            writeln!(
                out,
                "{{\"tick\":{},\"soldier\":{},\"unit\":{},\"channel\":\"{:?}\",\"source\":\"{}\",\"x\":{},\"y\":{},\"pre\":{},\"post\":{},\"meta\":\"{}\"}}",
                record.tick,
                record.soldier,
                record.unit,
                record.channel,
                record.channel.source_site(),
                record.vec.x,
                record.vec.y,
                fmt_vec(record.pre),
                fmt_vec(record.post),
                record.meta,
            )?;
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ForceBudget {
    pub channel: ForceChannel,
    pub net: Vec2,
    pub torque: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct CapSample {
    pub tick: u64,
    pub soldier: usize,
    pub unit: usize,
    pub channel: ForceChannel,
    pub pre: Vec2,
    pub post: Vec2,
}

fn fmt_vec(v: Option<Vec2>) -> String {
    match v {
        Some(v) => format!("{{\"x\":{},\"y\":{}}}", v.x, v.y),
        None => "null".to_string(),
    }
}
