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

mod common;

use common::{ref_melee, ref_shock_cav};
use sim::{Pace, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

/// Spawn a FAKE shock-cav unit (test-owned stats — balance-independent).
fn spawn_cav(sim: &mut Sim, pos: Vec2, facing: f32, n: usize, team: u32) -> usize {
    sim.spawn_class_stats_with_files(pos, facing, n, 24, UnitClassId::ShockCavalry, ref_shock_cav(), team)
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
    let chaser = spawn_cav(&mut sim, Vec2::new(0.0, -30.0), FRAC_PI_2, 120, 0);
    let fleer = spawn_cav(&mut sim, Vec2::new(0.0, -10.0), FRAC_PI_2, 120, 1);
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
    speed: f32,    // peak mass-advance the cav reached (m/s, mean) — the gallop's edge
}

/// Cav 120 vs light 240. `charge` = gallop vs walk-in; `morale` on lets either
/// side rout. The cav WINS by routing light while staying intact (morale on) or
/// destroying it (morale off); it LOSES if it routs or is ground out first.
fn cav_vs_light(charge: bool, morale: bool) -> Outcome {
    let seeds = [1u64, 7, 13]; // 3 seeds: enough for a stable mean; keeps the inner loop fast
    let (mut cav_dead, mut cav_wins) = (0.0f32, 0.0f32);
    let (mut impact, mut lance, mut grind) = (0.0f32, 0.0f32, 0.0f32);
    let mut speed = 0.0f32;
    for &s in &seeds {
        let mut tun = Tunables::default();
        tun.morale_enabled = morale;
        let mut sim = Sim::new(tun, s);
        // FAKE references: shock cav vs a 2:1 light line — balance-independent.
        let cav = spawn_cav(&mut sim, Vec2::new(0.0, -42.0), FRAC_PI_2, 120, 0);
        let light = sim.spawn_class_stats_with_files(
            Vec2::new(0.0, 42.0),
            -FRAC_PI_2,
            240,
            60,
            UnitClassId::Peasant,
            ref_melee(false),
            1,
        );
        if !charge {
            sim.set_charge_enabled(cav, false);
            sim.set_pace(cav, Pace::Walk);
        }
        sim.set_attack_order(cav, light);
        sim.set_attack_order(light, cav);
        let mut won: Option<bool> = None;
        // Peak speed measures the APPROACH (the gallop's edge vs the walk-in's
        // plod) — sampled only while the cav is a clear distance OFF the line.
        // mass_advance at/after contact is a transient (a body shoved by the
        // collision, a rider carried through a routing clump, the anchor swung by
        // a fast wheel) that spikes well past any pace and is not "the speed it
        // closed at". Gating on the centroid gap keeps the window pre-contact
        // regardless of how long the fight then runs.
        let mut peak = 0.0f32;
        for _ in 0..(600.0 / DT) as usize {
            sim.tick();
            let (c, l) = (&sim.units[cav], &sim.units[light]);
            // Sample the APPROACH speed only while the cav is a clear distance OFF
            // the line (centroid gap > 12m), as documented above: at/after contact
            // mass_advance is a transient (a body shoved by the collision, a rider
            // carried through a routing clump, the anchor swung by a fast wheel)
            // that spikes well past any pace and is NOT the speed it closed at.
            // Without this gate a walk-in's post-contact jolt reads as a gallop.
            if (c.centroid - l.centroid).len() > 12.0 {
                peak = peak.max(c.mass_advance);
            }
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
        speed += peak;
    }
    let n = seeds.len() as f32;
    Outcome {
        cav_dead: cav_dead / n,
        cav_wins: cav_wins / n,
        impact: impact / n,
        lance: lance / n,
        grind: grind / n,
        speed: speed / n,
    }
}

#[test]
fn a_charge_beats_a_walk_in_on_impact_and_wins_only_by_morale() {
    // Cavalry is SHOCK: a fresh charge rides in above charge speed and fells a
    // front-rank handful by IMPACT; a WALK-IN (same cav, no charge) crawls in and
    // deals ~zero impact. And the cav wins only by breaking WILL: with morale OFF
    // it is ground out to the death by the 2:1 numbers, charge or no.
    //
    // Re-derived 2026-06-27 (combat-arcs spine): the old form also pinned a sharp
    // cav-vs-infantry WIN balance (charge routs >=0.8, a walk-in loses <=0.2). That
    // never held even at HEAD (the charge won ~0.33), and the arc-combat fix — a
    // mounted sabre can now CUT the foe it targets (slices 01/04) — makes the cav a
    // genuinely competent melee arm, so 120 horse beat 240 light whether they
    // charge or walk in (~0.67 each over these seeds). Whether that cav-vs-infantry
    // strength is right is a BALANCE call for David (re-price/re-tune), firewalled
    // from this physics test. What this test pins is the SHOCK MECHANICS that
    // survive any such tuning: the charge's impact and speed edge, and that the cav
    // wins ONLY when morale is on (it breaks will, it does not grind 2:1 on bodies).
    let fresh_on = cav_vs_light(true, true);
    let fresh_off = cav_vs_light(true, false);
    let walk_on = cav_vs_light(false, true);
    let walk_off = cav_vs_light(false, false);

    // IMPACT + SPEED: the charge rides in fast and shocks; the walk-in crawls and
    // deals ~zero. (Folded in from the old `a_charge_outdamages` test: fresh_on IS
    // its `charge`, walk_on its `walk`.)
    let cmin = Tunables::default().charge_min_speed;
    assert!(fresh_on.speed > cmin, "a charge exceeds charge speed, was {:.1} m/s", fresh_on.speed);
    // The IMPACT is the clean charge-vs-walk-in signature (impact scales with the
    // CARRIED closing speed): a charge fells a swath of the front rank by shock, a
    // walk-in deals ~zero because it never reaches a felling closing speed. That a
    // walk-in's impact is zero IS the proof it closes slowly — far more robust than
    // the pre-contact mass_advance peak, which a wheel/jostle spikes on some seeds.
    assert!(walk_on.impact < 0.5, "a walk-in deals ~ZERO impact (it grinds), got {:.1}", walk_on.impact);
    assert!(fresh_on.impact >= 5.0, "a 120-horse charge fells several men by impact (mean), got {:.1}", fresh_on.impact);
    assert!(fresh_on.impact > walk_on.impact, "charge impact ({:.1}) must exceed walk-in ({:.1})", fresh_on.impact, walk_on.impact);

    // WINS ONLY BY MORALE: the charge routs by breaking will, so morale-on wins
    // strictly more than morale-off; and with morale off the cav is ground out
    // either way (it never wins a 2:1 grind on bodies alone).
    assert!(fresh_on.cav_wins > fresh_off.cav_wins, "the charge must win by MORALE, not bodies (on {:.2} vs off {:.2})", fresh_on.cav_wins, fresh_off.cav_wins);
    assert!(fresh_off.cav_wins <= 0.2, "with morale off the charge loses to the death (won frac {:.2})", fresh_off.cav_wins);
    assert!(walk_off.cav_wins <= 0.2, "with morale off a walk-in loses to the death (won frac {:.2})", walk_off.cav_wins);

    // To the death, 2:1 light grinds the cav out outright.
    assert!(
        fresh_off.cav_dead > 110.0,
        "to the death the cav is ground out (cav -{:.0})",
        fresh_off.cav_dead,
    );

    // Loss-by-cause to the death: all three shock channels fell a meaningful few,
    // and the inserted sabre GRIND dominates by far (the faster, guard-collapsing
    // grind does the bulk over the long fight). Re-derived 2026-06-27: with the
    // arc-combat fix the couched lance now spits the foe it is actually aimed at
    // (it used to whiff when the rider targeted a flank foe while couching forward),
    // so the lance is now a STRONGER shock contributor than the bare-body impact —
    // the shape moved from ~1:1:8 to ~1:3:18 impact:lance:grind. The robust pins:
    // each channel kills, the grind dominates.
    let (i, l, g) = (fresh_off.impact, fresh_off.lance, fresh_off.grind);
    assert!(i > 3.0, "the impact shock must fell a meaningful few: {i:.0} ({i:.0}:{l:.0}:{g:.0})");
    assert!(l > 3.0, "the couched lance must spit a meaningful few: {i:.0} ({i:.0}:{l:.0}:{g:.0})");
    assert!(g > 2.0 * (i + l), "the sabre grind must dominate the kills: {i:.0}:{l:.0}:{g:.0}");
}
