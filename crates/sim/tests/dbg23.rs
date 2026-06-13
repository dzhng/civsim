use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::PI;
// Fixed FRONTAGE (20 files), vary DEPTH via count. How far past the front
// does an 80-horse charge push?
fn penetration(n: usize) -> f32 {
    let mut sim = Sim::new(Tunables { morale_enabled: false, ..Tunables::default() }, 146);
    let wall = sim.spawn_class(Vec2::new(0.0, 40.0), -PI / 2.0, n, UnitClassId::Phalanx, 0);
    sim.set_files(wall, 20);
    let front = 40.0 - 0.5 * sim.units[wall].depth();
    let cav = sim.spawn_class(Vec2::new(0.0, -40.0), PI / 2.0, 80, UnitClassId::ShockCavalry, 1);
    sim.set_attack_order(cav, wall);
    let mut deepest = f32::NEG_INFINITY;
    for _ in 0..(24.0 / DT) as usize {
        sim.tick();
        deepest = deepest.max(sim.units[cav].centroid.y - front);
    }
    deepest
}
#[test]
fn t() {
    for n in [60usize, 120, 200, 300] {
        let depth_ranks = n / 20;
        println!("pike {n} men ({depth_ranks} ranks): cav reached {:.1}m past the front", penetration(n));
    }
}
