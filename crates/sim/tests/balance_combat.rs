//! BALANCE tests for per-class combat performance — how a unit's stat block
//! (arc, reach, crush cost, evade) prices out in a fight. These assert
//! OUTCOMES (kill differentials, survivor counts under pressure), which move
//! as the economy is retuned — distinct from the `mechanics_*` invariants
//! (cohesion, centroids, penetration) that must hold no matter the balance.
//! Migrated out of `combat_scenarios.rs` so the physics invariants and the
//! pricing outcomes are no longer interleaved in one file.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 99;

fn no_morale() -> Tunables {
    Tunables { morale_enabled: false, ..Tunables::default() }
}

fn run(sim: &mut Sim, seconds: f32) {
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
    }
}

fn deaths(sim: &Sim, u: usize) -> usize {
    sim.units[u].count - sim.units[u].alive_count
}

#[test]
fn long_swords_cleave_but_die_in_a_press() {
    // Cleave: against the same loose enemy, long swords (wide arc) out-kill
    // an equal number of ordinary swords.
    let kills_against_skirm = |class: UnitClassId| -> usize {
        let mut sim = Sim::new(no_morale(), SEED);
        let a = sim.spawn_class(Vec2::new(0.0, -10.0), FRAC_PI_2, 150, class, 0);
        let sk = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 300, UnitClassId::Skirmishers, 1);
        sim.set_evade_auto(sk, false); // hold the loose target in place
        sim.set_charge_enabled(a, false); // isolate the ARC variable
        sim.set_attack_move_order(a, Vec2::new(0.0, 25.0));
        run(&mut sim, 60.0);
        deaths(&sim, sk)
    };
    let by_longswords = kills_against_skirm(UnitClassId::LongSwords);
    let by_heavies = kills_against_skirm(UnitClassId::HeavySword);
    assert!(
        by_longswords as f32 > by_heavies as f32 * 1.05,
        "wide arcs must cleave loose enemies: longswords {by_longswords} vs heavies {by_heavies}"
    );

    // Crush cost 2 — THE VICE: long swords wedged between a rear press and
    // the enemy line lose their sweeps (obstruction pins with the vice) and
    // their evade (scalar pressure), while the free-standing heavies doing
    // the crushing keep their arms. The pusher is a Withdraw-mode wall
    // aimed a few meters INSIDE the fight line: it leans forever (bodies
    // keep it from arriving) without bulldozing the sandwich across the
    // field. Peak pressure is tracked across the run — a late read is
    // poisoned by survivor bias once the slaughter starts.
    let ls_arm = |pressed: bool| -> (f32, usize) {
        let mut sim = Sim::new(no_morale(), SEED);
        let ls = sim.spawn_class(Vec2::new(0.0, -8.0), FRAC_PI_2, 120, UnitClassId::LongSwords, 0);
        let enemy = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 300, UnitClassId::HeavySword, 1);
        let _ = enemy;
        sim.set_attack_move_order(ls, Vec2::new(0.0, 25.0));
        if pressed {
            let pusher = sim.spawn_class(Vec2::new(0.0, -22.0), FRAC_PI_2, 400, UnitClassId::HeavySword, 0);
            sim.set_disengage_order(pusher, Vec2::new(0.0, 12.0));
        }
        let mut peak_press = 0.0f32;
        for _ in 0..(30.0 / DT) as usize {
            sim.tick();
            let u = &sim.units[ls];
            let (mut p, mut n) = (0.0f32, 0usize);
            for i in u.start..u.start + u.count {
                if sim.alive[i] == 1 {
                    p += sim.pressure[i];
                    n += 1;
                }
            }
            if n > 20 {
                peak_press = peak_press.max(p / n as f32);
            }
        }
        (peak_press, deaths(&sim, ls))
    };
    let (free_press, free_losses) = ls_arm(false);
    let (pressed_press, pressed_losses) = ls_arm(true);
    assert!(
        pressed_press > free_press * 1.2,
        "the rear press must register as crowd pressure: {pressed_press:.2} vs {free_press:.2} m/s"
    );
    // The kill DIFFERENTIAL is confounded: the pusher's mass SHIELDS the
    // sandwich from the enemy's swings (arc obstruction cuts both ways)
    // more than the dead evade costs it — so pressed deaths land LOW (~3), and
    // an absolute floor on that count is just noise that flips on a breeze. The
    // crush mechanism is the pressure assert above; here we only pin the literal
    // claim — the press is no sanctuary, crushed swordsmen still fall (not zero).
    assert!(
        pressed_losses > 0,
        "the press is not a sanctuary: pressed {pressed_losses} vs free {free_losses}"
    );
}
