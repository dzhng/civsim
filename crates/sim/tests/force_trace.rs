#![cfg(feature = "force-trace")]

mod common;

use common::force_trace::{cap_hit_histograms, per_soldier_ledger, seam_crossing_decomposition};
use common::no_morale_parade;
use sim::{ForceChannel, Pace, Sim, UnitClassId, Vec2, DT};
use std::collections::BTreeSet;
use std::f32::consts::PI;

fn traced_heavy_clash(seconds: f32) -> Sim {
    let mut sim = Sim::new(no_morale_parade(), 0x5150);
    let a = sim.spawn_class_with_files(
        Vec2::new(0.0, -9.0),
        PI * 0.5,
        96,
        12,
        UnitClassId::HeavySword,
        0,
    );
    let b = sim.spawn_class_with_files(
        Vec2::new(0.0, 9.0),
        -PI * 0.5,
        96,
        12,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_pace(a, Pace::Run);
    sim.set_pace(b, Pace::Run);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    sim.clear_force_trace();
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
    }
    sim
}

#[test]
fn force_trace_steering_conserves_pre_collision_displacement() {
    let mut sim = traced_heavy_clash(0.0);
    for _ in 0..(4.0 / DT) as usize {
        sim.tick();
        let tick = sim.tick_count - 1;
        for (soldier, residual) in sim.force_trace_steering_residuals(tick) {
            let err = residual.len();
            assert!(
                err < 2.0e-5,
                "untraced steering displacement at tick {tick} soldier {soldier}: {residual:?}"
            );
        }
    }
}

#[test]
fn force_trace_smoke_covers_expected_channels() {
    let mut sim = traced_heavy_clash(12.0);

    // Force the pure collision channels that a clean line clash may only touch
    // briefly or not at all.
    let c = sim.spawn_unit(
        Vec2::new(-1.0, -1.0),
        0.0,
        8,
        4,
        Vec2::new(0.2, 0.2),
        0,
        0.7,
    );
    let d = sim.spawn_unit(Vec2::new(-1.0, -1.0), PI, 8, 4, Vec2::new(0.2, 0.2), 1, 0.7);
    sim.set_attack_order(c, d);
    sim.set_attack_order(d, c);
    sim.tick();

    let _e = sim.spawn_class_with_files(
        Vec2::new(8.0, -0.9),
        PI * 0.5,
        48,
        12,
        UnitClassId::HeavySword,
        0,
    );
    let _f = sim.spawn_class_with_files(
        Vec2::new(8.0, 0.9),
        -PI * 0.5,
        48,
        12,
        UnitClassId::HeavySword,
        1,
    );
    for _ in 0..8 {
        sim.tick();
    }

    let _p = sim.spawn_class_with_files(
        Vec2::new(-9.0, -0.8),
        PI * 0.5,
        64,
        16,
        UnitClassId::HeavyPhalanx,
        0,
    );
    let _q = sim.spawn_class_with_files(
        Vec2::new(-8.2, 0.8),
        -PI * 0.5,
        64,
        16,
        UnitClassId::HeavyPhalanx,
        1,
    );
    for _ in 0..80 {
        sim.tick();
    }

    let seen: BTreeSet<ForceChannel> = sim
        .force_trace
        .records()
        .iter()
        .map(|r| r.channel)
        .collect();

    let expected = [
        ForceChannel::WeaveNet,
        ForceChannel::CompPush,
        ForceChannel::PivotSpring,
        ForceChannel::EnemyBondWeld,
        ForceChannel::EnemyBondInsideReachPush,
        ForceChannel::SlotPull,
        ForceChannel::CorridorClamp,
        ForceChannel::Magnet,
        ForceChannel::Cruise,
        ForceChannel::SpeedCap,
        ForceChannel::FightingPaceCap,
        ForceChannel::BodySeparationNormal,
        ForceChannel::BodySeparationFriendlySlide,
        ForceChannel::HardWall,
        ForceChannel::ProjectionPass,
        ForceChannel::WeaponRepel,
        ForceChannel::HitPush,
        ForceChannel::KnockbackMomentum,
        ForceChannel::SlotPullLean,
        ForceChannel::PackedLateralFriction,
        ForceChannel::SoldierFacing,
        ForceChannel::UnitFacing,
        ForceChannel::UnitFrame,
    ];
    for channel in expected {
        assert!(seen.contains(&channel), "missing force channel {channel:?}");
    }
    let soldier = sim.units[0].start;
    assert!(!per_soldier_ledger(&sim.force_trace, soldier).is_empty());
    assert!(!cap_hit_histograms(&sim.force_trace).is_empty());
    let crossing = seam_crossing_decomposition(&sim.force_trace, soldier, 0, Vec2::new(0.0, 1.0));
    assert!(crossing.values().all(|v| v.is_finite()));
}
