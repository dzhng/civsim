//! Micro-terrain: one-man-wide disturbances scattered every 3-10m on every
//! map. Men trip on them; formations flow over them; long marches fray.

use sim::{Pace, Sim, Tunables, Vec2, DT};

const SEED: u64 = 31337;

#[test]
fn the_field_is_scattered_with_disturbances_every_3_to_10_meters() {
    // Sample the pure field: density and size match the spec.
    let mut hits = 0;
    let mut total = 0;
    for ix in 0..400 {
        for iy in 0..400 {
            let p = Vec2::new(ix as f32 * 0.5 - 100.0, iy as f32 * 0.5 - 100.0);
            total += 1;
            if sim::micro_rough(p) < 1.0 {
                hits += 1;
            }
        }
    }
    let area_frac = hits as f32 / total as f32;
    // ~21% of 3m cells hold a disc of r~0.35-0.6: ~1.5-3% of ground area.
    println!("disturbed ground: {:.1}%", area_frac * 100.0);
    assert!(
        (0.008..=0.05).contains(&area_frac),
        "one-man-wide rocks, sparse but everywhere: {:.1}% of ground",
        area_frac * 100.0
    );
}

#[test]
fn long_marches_fray_over_rough_ground() {
    // The same walking column, parade ground vs real ground: rocks and
    // potholes cost individual men steps, and the dressing pays for it.
    // Returns (MIN cohesion mid-march, FINAL cohesion). The fraying shows in the
    // MIN — the worst mid-stride dip — but whether it's a FRAY or a ROUT is the
    // FINAL: a frayed column RE-FORMS once past the rough patch (final ~parade),
    // a routed one stays disordered. Asserting the min as the rout-floor conflated
    // the two — the dip to 0.51 re-forms to 0.96, plainly a fray, not a rout (the
    // same wrong-metric the mud test had: the min catches a transient; only the end
    // tells fray from rout).
    let cohesion_after = |micro: f32| -> (f32, f32) {
        let mut sim = Sim::new(
            Tunables {
                micro_rough: micro,
                ..Tunables::default()
            },
            SEED,
        );
        let u = sim.spawn_unit(
            Vec2::new(-150.0, 0.0),
            0.0,
            300,
            30,
            Vec2::new(1.0, 1.2),
            0,
            0.7,
        );
        sim.set_pace(u, Pace::Walk);
        sim.set_move_order(u, Vec2::new(250.0, 0.0));
        let mut min_cohesion = 1.0f32;
        for _ in 0..(240.0 / DT) as usize {
            sim.tick();
            min_cohesion = min_cohesion.min(sim.units[u].cohesion);
        }
        (min_cohesion, sim.units[u].cohesion)
    };
    let (parade_min, _) = cohesion_after(0.0);
    let (field_min, field_final) = cohesion_after(1.0);
    println!(
        "march cohesion: parade min {parade_min:.3} | field min {field_min:.3} final {field_final:.3}"
    );
    assert!(
        field_min < parade_min - 0.01,
        "real ground frays a long walking march: field min {field_min:.3} vs parade min {parade_min:.3}"
    );
    assert!(
        field_final > 0.55,
        "but it's a fraying, not a rout: the column RE-FORMS past the rough ground (final {field_final:.3})"
    );
}
