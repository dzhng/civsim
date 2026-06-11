//! Commander + control-order tests: the AI fights with the same verbs as the
//! player, and the discipline orders behave per the contract.

use sim::{ai_commander, setup_battle, MapId, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 4242;

#[test]
fn ai_brings_a_battle_to_a_verdict() {
    // Compact battle (the full 30k field is exercised in browser verify).
    let mut sim = Sim::new(Tunables::default(), SEED);
    let lay = |sim: &mut Sim, team: u32, y: f32, facing: f32| {
        sim.spawn_class(Vec2::new(-60.0, y), facing, 300, UnitClassId::HeavyInfantry, team);
        sim.spawn_class(Vec2::new(0.0, y), facing, 320, UnitClassId::Phalanx, team);
        sim.spawn_class(Vec2::new(60.0, y), facing, 300, UnitClassId::LightInfantry, team);
        sim.spawn_class(Vec2::new(0.0, y - facing.sin() * 30.0), facing, 160, UnitClassId::Archers, team);
        sim.spawn_class(Vec2::new(120.0, y), facing, 100, UnitClassId::ShockCavalry, team);
    };
    lay(&mut sim, 0, -80.0, FRAC_PI_2);
    lay(&mut sim, 1, 80.0, -FRAC_PI_2);
    // Slight asymmetry so somebody wins.
    sim.spawn_class(Vec2::new(-120.0, -80.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let mut victor = None;
    for _ in 0..(900.0 / DT) as usize {
        sim.tick();
        ai_commander(&mut sim, 0);
        ai_commander(&mut sim, 1);
        victor = sim.victor();
        if victor.is_some() {
            break;
        }
    }
    let _ = MapId::WalledPlain;
    let _: fn(&mut Sim, MapId) = setup_battle;
    assert!(victor.is_some(), "two AI armies must produce a verdict");
    let total: usize = sim.units.iter().map(|u| u.count).sum();
    let dead: usize = sim.units.iter().map(|u| u.count - u.alive_count).sum();
    assert!(dead > total / 10, "a real battle was fought: {dead} dead");
    assert!(
        dead < total * 9 / 10,
        "morale ends battles before extermination: {dead} dead of {total}"
    );
}

#[test]
fn reform_recovers_order_faster() {
    let recovery = |reform: bool| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let u = sim.spawn_class(Vec2::ZERO, 0.0, 300, UnitClassId::LightInfantry, 0);
        // Scatter them.
        for s in 0..sim.units[u].count {
            let i = sim.units[u].start + s;
            sim.positions[2 * i] += ((s % 7) as f32 - 3.0) * 4.5;
            sim.positions[2 * i + 1] += ((s % 5) as f32 - 2.0) * 5.5;
        }
        for _ in 0..30 {
            sim.tick();
        }
        if reform {
            sim.set_reform(u);
        }
        for _ in 0..(6.0 / DT) as usize {
            sim.tick();
        }
        sim.units[u].cohesion
    };
    let with = recovery(true);
    let without = recovery(false);
    assert!(
        with > without + 0.04,
        "reform must speed recovery: {with:.2} vs {without:.2}"
    );
}

#[test]
fn hold_ground_stops_when_the_enemy_breaks_pursue_chases() {
    let chase = |pursue: bool| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let hunter = sim.spawn_class(Vec2::new(0.0, -14.0), FRAC_PI_2, 400, UnitClassId::HeavyInfantry, 0);
        let prey = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 140, UnitClassId::LightInfantry, 1);
        let _ = prey;
        sim.set_pursue(hunter, pursue);
        sim.set_attack_order(hunter, prey);
        for _ in 0..(200.0 / DT) as usize {
            sim.tick();
        }
        sim.units[hunter].anchor.y
    };
    let held = chase(false);
    let chased = chase(true);
    assert!(
        chased > held + 12.0,
        "pursuit must follow the rout, holding must not: chased to {chased:.0} vs held at {held:.0}"
    );
}

#[test]
fn facing_orders_pivot_on_arrival() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = sim.spawn_class(Vec2::ZERO, 0.0, 200, UnitClassId::LightInfantry, 0);
    sim.set_move_order_facing(u, Vec2::new(40.0, 0.0), FRAC_PI_2);
    for _ in 0..(120.0 / DT) as usize {
        sim.tick();
    }
    // The anchor orbits the formation center during the arrival pivot, so
    // the CENTER is the stable arrival reference.
    let expected_center = Vec2::new(40.0 - 0.5 * sim.units[u].depth(), 0.0);
    assert!(
        (sim.units[u].center() - expected_center).len() < 5.0,
        "arrives at the ordered spot (center {:?})",
        sim.units[u].center()
    );
    assert!(
        sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs() < 0.15,
        "then pivots to the commanded facing, got {}",
        sim.units[u].facing
    );
}

#[test]
fn width_orders_reshape_the_formation() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = sim.spawn_class(Vec2::ZERO, 0.0, 240, UnitClassId::LightInfantry, 0);
    let before = sim.units[u].width();
    sim.set_files(u, 12);
    for _ in 0..(30.0 / DT) as usize {
        sim.tick();
    }
    let after = sim.units[u].width();
    assert!(
        after < before * 0.5,
        "the frontage narrows: {after:.1} from {before:.1}"
    );
    assert!(sim.units[u].cohesion > 0.7, "and the men settle into it");
}
