//! Golden-state regression: a scripted scenario must produce bit-identical
//! state forever. Any intended behavior change updates EXPECTED deliberately
//! (run with --nocapture to see the new hash); unintended changes fail loudly.

use sim::{Pace, Sim, Tunables, Vec2, DT};
use std::f32::consts::PI;

#[test]
fn golden_state_hash_stable() {
    let mut sim = Sim::new(Tunables::default(), 0xBEEF);
    let a = sim.spawn_unit(
        Vec2::new(-30.0, 0.0),
        0.0,
        400,
        40,
        Vec2::new(0.9, 1.1),
        0,
        0.7,
    );
    let b = sim.spawn_unit(
        Vec2::new(30.0, 10.0),
        PI,
        300,
        30,
        Vec2::new(1.0, 1.2),
        1,
        0.6,
    );
    sim.set_move_order(a, Vec2::new(50.0, 5.0));
    sim.set_pace(b, Pace::Run);
    sim.set_move_order(b, Vec2::new(-50.0, -10.0));
    for _ in 0..(45.0 / DT) as usize {
        sim.tick();
    }
    let h = sim.state_hash();
    const EXPECTED: u64 = 0x68f4569d1cc8116f;
    assert_eq!(
        h, EXPECTED,
        "sim behavior changed: golden hash {h:#018x} != pinned {EXPECTED:#018x}. \
         If the change is intentional, update EXPECTED."
    );
}
