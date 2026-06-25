//! IMPACT mechanics: collision damage scales with the CARRIED closing speed (each
//! unit's measured mass_advance along its facing, not the brake-bled instantaneous
//! velocity), gate-free. Consequences pinned here:
//!
//!   - a CHARGE delivers real impact (shock that mostly STUNS — the kills come from
//!     the lance) — strictly more than a walk-in;
//!   - a WALK-IN (1.7 m/s) delivers ZERO impact — a slow horse only grinds;
//!   - a SAME-DIRECTION CHASE delivers ZERO — closing, not raw speed, is the measure
//!     (two riders carrying fast the same way barely close).
//!
//! Morale off so nobody routs mid-measurement; `lost_impact` only collisions raise.

use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// Shock cav (120) into an engaged light line (240), `charge` = gallop vs walk-in.
/// Returns the MEAN impact kills and mean cav peak forward speed over several
/// seeds — the per-charger impact is seed-variable, so we pin the average, not a
/// single run. The line fights back: a real charge's closing is against an
/// engaged line, not a passive one.
fn cav_into_line(charge: bool) -> (f32, f32) {
    let seeds = [1u64, 7, 13, 21, 42];
    let (mut impact, mut speed) = (0.0f32, 0.0f32);
    for &s in &seeds {
        // Morale ON: a charge's shock works on a line that can break — a solid
        // immortal wall just bogs the horse instantly and no impact develops.
        let mut sim = Sim::new(Tunables::default(), s);
        let cav = sim.spawn_class(Vec2::new(0.0, -42.0), FRAC_PI_2, 120, UnitClassId::ShockCavalry, 0);
        let line = sim.spawn_class(Vec2::new(0.0, 42.0), -FRAC_PI_2, 240, UnitClassId::LightSword, 1);
        if !charge {
            // walk-in: deny the charge and pace down to a walk. (A charging cav
            // uses its defaults — it ignites the gallop on its own approach.)
            sim.set_charge_enabled(cav, false);
            sim.set_pace(cav, Pace::Walk);
        }
        sim.set_attack_order(cav, line);
        sim.set_attack_order(line, cav);
        let mut peak = 0.0f32;
        for _ in 0..(60.0 / DT) as usize {
            sim.tick();
            peak = peak.max(sim.units[cav].mass_advance);
        }
        impact += sim.units[line].lost_impact as f32;
        speed += peak;
    }
    let n = seeds.len() as f32;
    (impact / n, speed / n)
}

#[test]
fn a_walk_in_does_no_collision_damage() {
    // A horse at a walk (1.7 m/s) is below charge_min_speed: it cannot impact,
    // only grind. Men do NOT die from a slow horse leaning into them.
    let (walk_impact, walk_speed) = cav_into_line(false);
    assert!(
        walk_speed < Tunables::default().charge_min_speed,
        "a walk-in must stay below charge speed, was {walk_speed:.1} m/s",
    );
    assert!(
        walk_impact < 0.5,
        "a walk-in must deal ~ZERO impact kills (it has to grind), got {walk_impact}",
    );
}

#[test]
fn a_charge_always_outdamages_a_walk_in_on_impact() {
    // The charge's whole edge is SPEED: riding in fast, it fells men on contact;
    // a walk-in cannot. So the charge must always do strictly more impact damage.
    let (charge_impact, charge_speed) = cav_into_line(true);
    let (walk_impact, _) = cav_into_line(false);
    assert!(
        charge_speed > Tunables::default().charge_min_speed,
        "a charge must exceed charge speed, was {charge_speed:.1} m/s",
    );
    assert!(
        charge_impact > walk_impact,
        "charge impact ({charge_impact}) must exceed walk-in impact ({walk_impact})",
    );
    // Cap is 1 kill/charger so the impact is front-rank only — a handful, not a
    // mow. We pin only that it's a real, non-trivial number above the walk's zero.
    assert!(
        charge_impact >= 5.0,
        "a 120-horse charge into a line should fell several men (mean), got {charge_impact}",
    );
}

#[test]
fn a_same_direction_chase_does_no_impact() {
    // Impact scales with CLOSING speed, not raw speed: a cav charging another that
    // flees the SAME way barely closes, however fast both gallop — so a stern chase
    // deals ZERO impact (the rider has to catch and grind, not shock). This is the
    // case that makes closing the right measure (a speed-only model would wrongly
    // score a full hit here).
    let mut tun = Tunables::default();
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, 7);
    let chaser = sim.spawn_class(Vec2::new(0.0, -30.0), FRAC_PI_2, 120, UnitClassId::ShockCavalry, 0);
    let fleer = sim.spawn_class(Vec2::new(0.0, -10.0), FRAC_PI_2, 120, UnitClassId::ShockCavalry, 1);
    sim.set_charge_enabled(chaser, true);
    sim.set_pace(chaser, Pace::Run);
    sim.set_attack_order(chaser, fleer);
    // The fleer runs the SAME way (+y), so the chaser closes only slowly.
    sim.set_pace(fleer, Pace::Run);
    sim.set_move_order(fleer, Vec2::new(0.0, 400.0));
    for _ in 0..(25.0 / DT) as usize {
        sim.tick();
    }
    assert_eq!(
        sim.units[fleer].lost_impact, 0,
        "a same-direction chase must deal ZERO impact (low closing), got {}",
        sim.units[fleer].lost_impact,
    );
}

struct Outcome {
    cav_dead: f32,
    cav_wins: f32, // fraction of seeds the cav won
    impact: f32,   // light deaths by cause (means)
    lance: f32,
    grind: f32,
}

/// Cav 120 vs light 240. `charge` = gallop vs walk-in; `morale` on lets either
/// side rout. The cav WINS by routing light while staying intact (morale on) or
/// destroying it (morale off); it LOSES if it routs or is ground out first.
fn cav_vs_light(charge: bool, morale: bool) -> Outcome {
    let seeds = [1u64, 7, 13, 21, 42];
    let (mut cav_dead, mut cav_wins) = (0.0f32, 0.0f32);
    let (mut impact, mut lance, mut grind) = (0.0f32, 0.0f32, 0.0f32);
    for &s in &seeds {
        let mut tun = Tunables::default();
        tun.morale_enabled = morale;
        let mut sim = Sim::new(tun, s);
        let cav = sim.spawn_class(Vec2::new(0.0, -42.0), FRAC_PI_2, 120, UnitClassId::ShockCavalry, 0);
        let light = sim.spawn_class(Vec2::new(0.0, 42.0), -FRAC_PI_2, 240, UnitClassId::LightSword, 1);
        if !charge {
            sim.set_charge_enabled(cav, false);
            sim.set_pace(cav, Pace::Walk);
        }
        sim.set_attack_order(cav, light);
        sim.set_attack_order(light, cav);
        let mut won: Option<bool> = None;
        for _ in 0..(600.0 / DT) as usize {
            sim.tick();
            let (c, l) = (&sim.units[cav], &sim.units[light]);
            if won.is_none() {
                // First decisive event: a side routs or is destroyed.
                if l.alive_count == 0 || (l.routing && !c.routing) {
                    won = Some(true); // cav broke/destroyed light
                } else if c.alive_count == 0 || c.routing {
                    won = Some(false); // cav broke or was ground out
                }
            }
            if c.alive_count == 0 || l.alive_count == 0 {
                break;
            }
        }
        cav_dead += (120 - sim.units[cav].alive_count) as f32;
        cav_wins += won.unwrap_or(false) as i32 as f32;
        impact += sim.units[light].lost_impact as f32;
        lance += sim.units[light].lost_charge_melee as f32;
        grind += sim.units[light].lost_grind_melee as f32;
    }
    let n = seeds.len() as f32;
    Outcome {
        cav_dead: cav_dead / n,
        cav_wins: cav_wins / n,
        impact: impact / n,
        lance: lance / n,
        grind: grind / n,
    }
}

#[test]
fn a_charge_wins_by_morale_not_by_grinding() {
    // The cleanest statement of "cavalry is SHOCK": a fresh charge BEATS a 2:1 light
    // line WITH morale (it breaks and routs it), but the SAME charge LOSES the exact
    // fight with morale off (no rout — its thin, flank-blind grind is ground out).
    // A walk-in, with no shock to break anyone, loses either way.
    let fresh_on = cav_vs_light(true, true);
    let fresh_off = cav_vs_light(true, false);
    let walk_on = cav_vs_light(false, true);
    let walk_off = cav_vs_light(false, false);

    assert!(fresh_on.cav_wins >= 0.8, "a fresh charge must rout light WITH morale (won frac {:.1})", fresh_on.cav_wins);
    assert!(fresh_off.cav_wins <= 0.2, "the SAME charge must lose to the death with morale off (won frac {:.1})", fresh_off.cav_wins);
    assert!(walk_on.cav_wins <= 0.2, "a walk-in must lose even WITH morale (won frac {:.1})", walk_on.cav_wins);
    assert!(walk_off.cav_wins <= 0.2, "a walk-in must lose to the death (won frac {:.1})", walk_off.cav_wins);

    // To the death, 2:1 light grinds the cav out outright.
    assert!(
        fresh_off.cav_dead > 110.0,
        "to the death the cav is ground out (cav -{:.0})",
        fresh_off.cav_dead,
    );

    // The charge's death tally holds a ~1:2:4 ratio of IMPACT : LANCE : GRIND kills
    // (measured ~18:33:76) — the shock fells few, the lance skewers the contact, and
    // the inserted sabre does the bulk over the long grind. Keep around that shape:
    // the lance ~doubles the impact, the grind ~doubles the lance.
    let (i, l, g) = (fresh_off.impact, fresh_off.lance, fresh_off.grind);
    assert!(i > 8.0 && l > i && g > l, "kills must order impact<lance<grind, got {i:.0}:{l:.0}:{g:.0}");
    assert!(
        (1.4..=2.8).contains(&(l / i)),
        "lance should be ~2x impact (1:2:4), got lance/impact {:.1} ({i:.0}:{l:.0}:{g:.0})",
        l / i,
    );
    assert!(
        (1.6..=3.0).contains(&(g / l)),
        "grind should be ~2x lance (1:2:4), got grind/lance {:.1} ({i:.0}:{l:.0}:{g:.0})",
        g / l,
    );
}
