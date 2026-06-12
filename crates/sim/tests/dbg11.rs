use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;
#[test]
fn t() {
    let mut sim = Sim::new(Tunables::default(), 9001);
    let a = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 40.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    sim.set_charge_enabled(a, false);
    sim.set_charge_enabled(b, false);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    for step in 0..(100.0 / DT) as usize {
        sim.tick();
        if step % 300 == 299 {
            for &u in &[a, b] {
                let x = &sim.units[u];
                println!("t={:>3.0} u{} lp={:.2} morale={:.2} coh={:.2} dead={}",
                    step as f32 * DT, u, x.losing_push, x.morale, x.cohesion, x.count - x.alive_count);
            }
        }
        if sim.units[a].routing || sim.units[b].routing { println!("rout at {:.0}", step as f32 * DT); break; }
    }
}
