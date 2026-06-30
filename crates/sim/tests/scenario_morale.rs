//! Morale emergence: breaks before annihilation, panic spreads through
//! physical proximity, charges terrify before they land, rallies scar.

pub mod common;

use common::run;
use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 555;

#[test]
fn outnumbered_unit_breaks_before_annihilation() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let weak = sim.spawn_class(
        Vec2::new(0.0, 10.0),
        -FRAC_PI_2,
        150,
        UnitClassId::LightSpear,
        0,
    );
    let strong = sim.spawn_class(
        Vec2::new(0.0, -14.0),
        FRAC_PI_2,
        450,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_attack_move_order(strong, Vec2::new(0.0, 25.0));
    sim.set_pursue(strong, false); // measure the rout, not the chase
    let mut broke_with = None;
    for _ in 0..(240.0 / DT) as usize {
        sim.tick();
        if sim.units[weak].routing && broke_with.is_none() {
            broke_with = Some(sim.units[weak].alive_count);
        }
    }
    let broke_with = broke_with.expect("the outnumbered unit must break");
    assert!(
        broke_with > 150 * 25 / 100,
        "breaks should come well before annihilation (historical arc): broke with {broke_with}/150"
    ); // the retuned will endures deeper losses (low tier breaks ~half, outnumbered+flanked deeper)
       // Survivors flee AWAY from the enemy mass (direction varies with how
       // the press scrambled them — distance is the invariant).
    let u = &sim.units[weak];
    if u.alive_count > 10 {
        let d = (u.centroid - sim.units[strong].centroid).len();
        assert!(
            d > 50.0,
            "the broken unit must get away, {d:.0}m from the enemy"
        );
    }
}

#[test]
fn routing_neighbors_shake_a_units_will() {
    // Two friendly units stand side by side; one's neighbor routes and floods
    // past. Control: the same unit with a steady neighbor.
    let morale_with_neighbor = |neighbor_routes: bool| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let watcher = sim.spawn_class(
            Vec2::new(40.0, 10.0),
            -FRAC_PI_2,
            200,
            UnitClassId::HeavySword,
            0,
        );
        let neighbor = sim.spawn_class(
            Vec2::new(12.0, 10.0),
            -FRAC_PI_2,
            500,
            UnitClassId::LightSpear,
            0,
        );
        if neighbor_routes {
            // Isolate contagion from the combat needed to create it; routing
            // transitions are covered by the surrounding morale scenario tests.
            sim.units[neighbor].morale = 0.0;
            sim.units[neighbor].routing = true;
        }
        run(&mut sim, 30.0);
        sim.units[watcher].morale
    };
    let steady = morale_with_neighbor(false);
    let shaken = morale_with_neighbor(true);
    eprintln!("rout contagion morale: shaken {shaken:.3} vs steady {steady:.3}");
    assert!(
        shaken < steady - 0.01,
        "a neighbor's rout must shake the will: {shaken:.2} vs steady {steady:.2}"
    );
}

#[test]
fn incoming_charge_intimidates_before_contact() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let target = sim.spawn_class(
        Vec2::new(0.0, 60.0),
        -FRAC_PI_2,
        200,
        UnitClassId::LightSpear,
        0,
    );
    let cav = sim.spawn_class(
        Vec2::new(0.0, -40.0),
        FRAC_PI_2,
        150,
        UnitClassId::ShockCavalry,
        1,
    );
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_attack_order(cav, target);
    // Compare morale at the moment the threat enters awareness (~70m) to the
    // last pre-contact reading: the dip must happen BEFORE the impact.
    let mut at_70m = None;
    let mut pre_contact_morale = sim.units[target].morale;
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
        let d = (sim.units[cav].center() - sim.units[target].center()).len();
        if d < 70.0 && at_70m.is_none() {
            at_70m = Some(sim.units[target].morale);
        }
        if sim.units[target].engaged == 0 {
            pre_contact_morale = sim.units[target].morale;
        } else {
            break;
        }
    }
    let at_70m = at_70m.expect("the charge must approach");
    assert!(
        pre_contact_morale < at_70m - 0.03,
        "the thunder of a charge must be felt before it lands: {pre_contact_morale:.3} vs {at_70m:.3}"
    );
}

#[test]
fn routed_unit_rallies_scarred_when_left_alone() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let weak = sim.spawn_class(
        Vec2::new(0.0, 10.0),
        -FRAC_PI_2,
        200,
        UnitClassId::LightSpear,
        0,
    );
    // A steady teammate keeps the battle CONTESTED: a verdict freezes all
    // morale (routs lock, the chase plays out), and a one-unit team that
    // breaks IS the verdict — it could never rally.
    sim.spawn_class(
        Vec2::new(400.0, 10.0),
        -FRAC_PI_2,
        300,
        UnitClassId::HeavySword,
        0,
    );
    let strong = sim.spawn_class(
        Vec2::new(0.0, -14.0),
        FRAC_PI_2,
        450,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_attack_move_order(strong, Vec2::new(0.0, 20.0));
    let mut broke = false;
    for _ in 0..(180.0 / DT) as usize {
        sim.tick();
        if sim.units[weak].routing {
            broke = true;
            break;
        }
    }
    assert!(broke, "setup: must break first");
    // Call the attackers off properly: pursue off (attack-move had set it),
    // then march them away.
    sim.set_pursue(strong, false);
    sim.set_move_order(strong, Vec2::new(0.0, -250.0));
    run(&mut sim, 240.0);
    let u = &sim.units[weak];
    if (u.alive_count as f32) >= 0.16 * u.count as f32 {
        assert!(!u.routing, "left in peace, the unit must rally");
        assert!(
            u.morale_ceiling < 0.99,
            "but it carries the scar: ceiling {}",
            u.morale_ceiling
        );
    }
}

#[test]
fn one_sided_battle_produces_a_victor() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    for k in 0..3 {
        let w = sim.spawn_class(
            Vec2::new(k as f32 * 40.0 - 40.0, 12.0),
            -FRAC_PI_2,
            120,
            UnitClassId::LightSpear,
            0,
        );
        let _ = w;
        let s = sim.spawn_class(
            Vec2::new(k as f32 * 40.0 - 40.0, -16.0),
            FRAC_PI_2,
            400,
            UnitClassId::HeavySword,
            1,
        );
        sim.set_attack_move_order(s, Vec2::new(k as f32 * 40.0 - 40.0, 30.0));
    }
    let mut victor = None;
    for _ in 0..(300.0 / DT) as usize {
        sim.tick();
        victor = sim.victor();
        if victor.is_some() {
            break;
        }
    }
    assert_eq!(victor, Some(1), "the overwhelming side must win the field");
}

#[test]
fn anchor_never_outruns_a_jammed_column() {
    // March a unit straight through a parked friendly mass: the frame must
    // stay leashed to the men instead of sailing to the far side.
    let mut sim = Sim::new(Tunables::default(), SEED);
    let mover = sim.spawn_unit(
        Vec2::new(0.0, -40.0),
        FRAC_PI_2,
        200,
        10,
        Vec2::new(0.9, 1.1),
        0,
        0.7,
    );
    // A dense plug of friends, parked.
    sim.spawn_unit(
        Vec2::new(0.0, 10.0),
        FRAC_PI_2,
        900,
        30,
        Vec2::new(0.9, 1.1),
        0,
        0.7,
    );
    sim.set_move_order(mover, Vec2::new(0.0, 90.0));
    let mut worst_lag = 0.0f32;
    for _ in 0..(150.0 / DT) as usize {
        sim.tick();
        let u = &sim.units[mover];
        let f = sim::dir(u.facing);
        let expected = u.anchor + f * (-0.5 * u.depth());
        let lag = (expected - u.centroid).dot(f);
        worst_lag = worst_lag.max(lag);
    }
    let depth = sim.units[mover].depth();
    assert!(
        worst_lag < 0.6 * depth + 7.0,
        "the officer stays with his men: worst lag {worst_lag:.1} m (depth {depth:.1})"
    );
}

#[test]
fn enemy_rout_relieves_the_victor_no_mutual_collapse() {
    // A grinding, NEARLY even fight: without relief both sides cross the
    // break threshold within seconds of each other (the casualty tail keeps
    // draining after the enemy breaks). The sight of enemy backs must pay
    // the side that held one beat longer.
    let mut sim = Sim::new(Tunables::default(), SEED);
    let a = sim.spawn_class(
        Vec2::new(0.0, 10.0),
        -FRAC_PI_2,
        300,
        UnitClassId::HeavySword,
        0,
    );
    let b = sim.spawn_class(
        Vec2::new(0.0, -14.0),
        FRAC_PI_2,
        330,
        UnitClassId::HeavySword,
        1,
    );
    // Far teammates on BOTH sides keep the field contested: a one-unit
    // team's break is the verdict itself, and the verdict freezes morale.
    sim.spawn_class(
        Vec2::new(420.0, 10.0),
        -FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    sim.spawn_class(
        Vec2::new(420.0, -14.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    let mut first_break: Option<usize> = None;
    let mut morale_at_break = 0.0;
    // Longer window now: steady facings make the grind far less of a bloodbath
    // (men block what they're squared up to), so a near-even fight drains to a
    // break over ~6 minutes rather than ~4 — but it STILL resolves, one side
    // first, the held side relieved.
    for _ in 0..(600.0 / DT) as usize {
        sim.tick();
        if first_break.is_none() {
            if sim.units[a].routing {
                first_break = Some(a);
                morale_at_break = sim.units[b].morale;
            } else if sim.units[b].routing {
                first_break = Some(b);
                morale_at_break = sim.units[a].morale;
            }
        }
    }
    let loser = first_break.expect("a near-even grind must eventually break someone");
    let winner = if loser == a { b } else { a };
    assert!(
        !sim.units[winner].routing,
        "the side that held must NOT follow its enemy into rout (mutual collapse)"
    );
    assert!(
        sim.units[winner].morale > morale_at_break + 0.05,
        "the sight of enemy backs must rally the victor: {} from {morale_at_break} at the break",
        sim.units[winner].morale
    );
}

#[test]
fn the_verdict_is_final_routs_lock_and_the_chase_plays_out() {
    // A stomp: big fresh heavies onto a small light line, morale on.
    // The weak side is COMMITTED (attack orders): they break in contact,
    // where breaking is fatal — uncommitted light troops just outrun a
    // walking stomp now that the charge exit is honest (no blob kills).
    let mut sim = Sim::new(Tunables::default(), SEED);
    let strong = sim.spawn_class(
        Vec2::new(0.0, -20.0),
        FRAC_PI_2,
        400,
        UnitClassId::HeavySword,
        0,
    );
    // One prey: a second unit kept the field contested forever (the hunter
    // chases the router while the fresh unit stands at full morale).
    let weak_a = sim.spawn_class(
        Vec2::new(-25.0, 20.0),
        -FRAC_PI_2,
        80,
        UnitClassId::LightSpear,
        1,
    );
    sim.set_pursue(strong, true);
    sim.set_attack_order(strong, weak_a);
    sim.set_attack_order(weak_a, strong);
    let mut verdict_at = None;
    for step in 0..(420.0 / DT) as usize {
        // the new grind: lights endure ~2min of focused stomp
        sim.tick();
        if verdict_at.is_none() && sim.victor().is_some() {
            verdict_at = Some(step);
            break;
        }
    }
    assert!(verdict_at.is_some(), "the stomp must produce a verdict");
    let routing_then: Vec<bool> = sim.units.iter().map(|u| u.routing).collect();
    let prey_then = sim.units[weak_a].centroid;
    for _ in 0..(30.0 / DT) as usize {
        sim.tick();
    }
    let routing_now: Vec<bool> = sim.units.iter().map(|u| u.routing).collect();
    assert_eq!(
        routing_then, routing_now,
        "after the verdict nobody rallies and nobody newly breaks"
    );
    // The sim keeps running: the routers keep fleeing and the pursuit stays
    // on them — but a rout now flees as a COHESIVE MOB (one shared heading,
    // not a starburst), so the broken light troops cover real ground at a run
    // (~4 m/s) and blown heavy legs trail them honestly. "On them" is a leash
    // that lengthens, not a heel: ~100 m over the 30s window, the heavies
    // still chasing, just losing ground to fresher legs (you catch a coherent
    // rout with cavalry, not tired infantry).
    assert!(
        (sim.units[weak_a].centroid - prey_then).len() > 1.5,
        "routers keep fleeing after the verdict"
    );
    assert!(
        (sim.units[strong].centroid - sim.units[weak_a].centroid).len() < 135.0,
        "the pursuit stays on the routers"
    );
}

/// A broken unit flees for its OWN side — the map edge it deployed from — and
/// stays a clump while doing it, not a starburst sprayed across the field.
#[test]
fn a_rout_runs_for_its_own_edge_as_a_clump() {
    // A small committed light line is overmatched by a heavy block to its
    // NORTH; it deploys in the southern half, so home is the south (-y) edge.
    let mut sim = Sim::new(Tunables::default(), SEED);
    let strong = sim.spawn_class(
        Vec2::new(0.0, 40.0),
        -FRAC_PI_2,
        400,
        UnitClassId::HeavySword,
        1,
    );
    let weak = sim.spawn_class(
        Vec2::new(0.0, -40.0),
        FRAC_PI_2,
        80,
        UnitClassId::LightSpear,
        0,
    );
    sim.set_attack_order(strong, weak);
    sim.set_attack_order(weak, strong);

    let mut broke = false;
    for _ in 0..(300.0 / DT) as usize {
        sim.tick();
        if sim.units[weak].routing {
            broke = true;
            break;
        }
    }
    assert!(broke, "the overmatched light line must break");

    // (mean soldier distance from the unit centroid, centroid.y).
    let measure = |sim: &Sim| -> (f32, f32) {
        let u = &sim.units[weak];
        let c = u.centroid;
        let (mut sum, mut n) = (0.0f32, 0.0f32);
        for s in 0..u.count {
            let i = u.start + s;
            if sim.alive[i] == 0 {
                continue;
            }
            sum += (Vec2::new(sim.positions[2 * i], sim.positions[2 * i + 1]) - c).len();
            n += 1.0;
        }
        (sum / n.max(1.0), c.y)
    };

    let (_, y0) = measure(&sim);
    for _ in 0..(40.0 / DT) as usize {
        sim.tick();
    }
    let (spread, y1) = measure(&sim);

    // Runs for its OWN (south) edge: the centroid drops well to the -y side,
    // AWAY from the enemy it just fled — not sideways, not back into the fight.
    assert!(
        y1 < y0 - 30.0,
        "the rout heads for its home edge (south): centroid y {y0:.0} -> {y1:.0}"
    );
    // Stays a clump: an 80-man light unit is a few metres across; a routing
    // MOB holds within a tight knot, nowhere near a field-wide scatter (the old
    // per-man radial flee fanned them out unboundedly).
    assert!(
        spread < 30.0,
        "routers stay a clump (mean spread {spread:.1} m), not a starburst"
    );
}

/// Morale of `unit` after `secs` of whatever the setup put nearby.
fn morale_after(sim: &mut Sim, unit: usize, secs: f32) -> f32 {
    for _ in 0..(secs / DT) as usize {
        sim.tick();
    }
    sim.units[unit].morale
}

#[test]
fn intimidation_scales_with_the_mass_not_the_banner() {
    // The same charge bearing down: a full wing of horse vs five survivors
    // under the same flag. Fear reads MEN AND MASS, not the banner.
    let dip = |horses: usize| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let line = sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            200,
            UnitClassId::HeavySword,
            0,
        );
        let cav = sim.spawn_class(
            Vec2::new(0.0, 120.0),
            -FRAC_PI_2,
            horses,
            UnitClassId::ShockCavalry,
            1,
        );
        sim.set_pace(cav, sim::Pace::Run);
        // Let spawn morale settle to its baseline FIRST (the dip must
        // measure fear, not the spawn transient).
        for _ in 0..(3.0 / DT) as usize {
            sim.tick();
        }
        let baseline = sim.units[line].morale;
        sim.set_attack_order(cav, line);
        // Measure morale as the charge closes, before contact does damage. The
        // window must outlast the RUN-pace approach (~30s from 120m) — it breaks
        // at contact, so a generous cap just guarantees the wall arrives.
        let mut lowest = baseline;
        for _ in 0..(36.0 / DT) as usize {
            sim.tick();
            if sim.units[line].engaged > 5 {
                break;
            }
            lowest = lowest.min(sim.units[line].morale);
        }
        baseline - lowest
    };
    let wing = dip(200);
    let remnant = dip(5);
    println!("pre-contact morale dip: 200 horses {wing:.3}, 5 horses {remnant:.3}");
    assert!(
        wing > remnant * 3.0 + 0.005,
        "a wall of horse terrifies, five survivors do not: {wing:.3} vs {remnant:.3}"
    );
}

#[test]
fn threats_that_never_land_lose_their_terror() {
    // Cavalry sweeping back and forth at speed just outside reach, never
    // charging home: the first pass costs, the tenth is background noise.
    let mut sim = Sim::new(Tunables::default(), SEED);
    let line = sim.spawn_class(
        Vec2::new(0.0, 0.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    let cav = sim.spawn_class(
        Vec2::new(-120.0, 45.0),
        0.0,
        160,
        UnitClassId::ShockCavalry,
        1,
    );
    sim.set_pace(cav, sim::Pace::Run);
    // Feinted charges: diagonal passes that genuinely CLOSE on the line
    // (parallel sweeps have no closing and rightly frighten nobody), then
    // peel away before contact. Repeat for five minutes.
    let mut min_m = 1.0f32;
    for lap in 0..12 {
        let (x, y) = if lap % 2 == 0 {
            (120.0, 4.0)
        } else {
            (-120.0, 56.0)
        };
        sim.set_move_order(cav, Vec2::new(x, y));
        for _ in 0..(25.0 / DT) as usize {
            sim.tick();
            min_m = min_m.min(sim.units[line].morale);
        }
    }
    let m = morale_after(&mut sim, line, 1.0);
    println!("circus: min morale {min_m:.3}, final {m:.3}");
    // Each pass costs, and the lulls refill it: the equilibrium holds forever.
    // It settles a touch BELOW full (~0.77, not near 1.0) because "at ease" is
    // extent-aware — with horse genuinely swirling close, the line is never
    // fully at rest and so never fully recovers between passes; it just never
    // decays toward a rout either. Both halves matter — the feints REGISTER,
    // and they can never accumulate into a break.
    assert!(
        min_m < 0.94,
        "the feints must actually register as threats: min {min_m:.3}"
    );
    // The exact equilibrium is chaos-sensitive (it slides with any combat tweak
    // — the shield buff alone moved it ~0.3), so pin the ROBUST claim: the line
    // HOLDS, clear of the break, never spiralling to a rout. Not a tight number.
    assert!(
        !sim.units[line].routing && m > 0.35,
        "five minutes of circus hasn't broken the line: morale {m:.2}"
    );
}

#[test]
fn dying_from_two_directions_breaks_faster_than_frontal() {
    // The directions term: pressed from two sides, the will goes faster. The
    // SAME two attacker units, stacked in column at the front vs split
    // front-and-rear (a single wide wall would WRAP and contaminate the frontal
    // control). Measure the TIME to break, not casualties: the count is doubly
    // confounded — the shield sheds frontal blood but not rear, and the stacked
    // column QUEUES its second unit (one engages) while the split fights with
    // both — so the two setups take different blood for reasons other than the
    // morale term. The honest, robust observable is the one the name promises:
    // sandwiched, the line breaks SOONER. Both the directions amplifier and the
    // doubled press push the same way, which is exactly why the flank is worth
    // taking.
    let break_time = |split: bool, seed: u64| -> f32 {
        let mut sim = Sim::new(Tunables::default(), seed);
        let v = sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            240,
            UnitClassId::HeavySword,
            0,
        );
        let attackers = if split {
            vec![
                sim.spawn_class(
                    Vec2::new(0.0, 32.0),
                    -FRAC_PI_2,
                    220,
                    UnitClassId::HeavySword,
                    1,
                ),
                sim.spawn_class(
                    Vec2::new(0.0, -32.0),
                    FRAC_PI_2,
                    220,
                    UnitClassId::HeavySword,
                    1,
                ),
            ]
        } else {
            vec![
                sim.spawn_class(
                    Vec2::new(0.0, 32.0),
                    -FRAC_PI_2,
                    220,
                    UnitClassId::HeavySword,
                    1,
                ),
                sim.spawn_class(
                    Vec2::new(0.0, 95.0),
                    -FRAC_PI_2,
                    220,
                    UnitClassId::HeavySword,
                    1,
                ),
            ]
        };
        for a in attackers {
            sim.set_charge_enabled(a, false);
            sim.set_attack_order(a, v);
        }
        for step in 0..(420.0 / DT) as usize {
            sim.tick();
            if sim.units[v].routing {
                return step as f32 * DT;
            }
        }
        420.0
    };
    // Per-seed timing is chaos-marginal, so average over seeds.
    let seeds = [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4];
    let frontal = seeds.iter().map(|&s| break_time(false, s)).sum::<f32>() / seeds.len() as f32;
    let enveloped = seeds.iter().map(|&s| break_time(true, s)).sum::<f32>() / seeds.len() as f32;
    println!("mean time to break: frontal {frontal:.0}s, two directions {enveloped:.0}s");
    assert!(
        enveloped < frontal * 0.9,
        "two directions break the will sooner: {enveloped:.0}s vs {frontal:.0}s"
    );
}

#[test]
fn steady_friends_brace_recovery() {
    // Rattled men recover faster among steady comrades than alone.
    let recovered = |with_friends: bool| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let u = sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            200,
            UnitClassId::LightSpear,
            0,
        );
        if with_friends {
            sim.spawn_class(
                Vec2::new(-40.0, 0.0),
                FRAC_PI_2,
                240,
                UnitClassId::HeavySword,
                0,
            );
            sim.spawn_class(
                Vec2::new(40.0, 0.0),
                FRAC_PI_2,
                240,
                UnitClassId::HeavySword,
                0,
            );
        }
        sim.units[u].morale = 0.2; // badly rattled, not broken
        for _ in 0..(30.0 / DT) as usize {
            sim.tick();
        }
        sim.units[u].morale
    };
    let braced = recovered(true);
    let alone = recovered(false);
    println!("recovery from 0.2 after 30s: braced {braced:.3}, alone {alone:.3}");
    assert!(
        braced > alone + 0.05,
        "steady friends brace the will: {braced:.3} vs {alone:.3}"
    );
}

#[test]
fn even_remnants_rally_given_peace() {
    // No shatter floor: morale always recovers (scarred by RALLY_SCAR per
    // break, but a quiet field puts any survivor back in order).
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = sim.spawn_class(
        Vec2::new(0.0, 0.0),
        FRAC_PI_2,
        200,
        UnitClassId::LightSpear,
        0,
    );
    // A distant enemy AND a standing friendly keep the field CONTESTED on
    // both ledgers — a verdict (army broken) locks morale by design.
    sim.spawn_class(
        Vec2::new(400.0, 0.0),
        FRAC_PI_2,
        200,
        UnitClassId::LightSpear,
        1,
    );
    sim.spawn_class(
        Vec2::new(-400.0, 0.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    let (start, count) = (sim.units[u].start, sim.units[u].count);
    for s in (count / 10)..count {
        sim.kill(start + s);
    }
    sim.units[u].morale = 0.0;
    for _ in 0..(300.0 / DT) as usize {
        sim.tick();
    }
    assert!(
        !sim.units[u].routing,
        "a quiet field rallies even a remnant"
    );
    assert!(
        sim.units[u].morale_ceiling < 0.99,
        "scarred by the break, ceiling {:.2}",
        sim.units[u].morale_ceiling
    );
}

#[test]
fn contagion_spreads_from_fleeing_bodies_not_banners() {
    // A friendly unit breaks within sight: panic in the watchers scales
    // with the SIZE of the rout streaming past.
    let dip = |fleeing: usize| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let watchers = sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            200,
            UnitClassId::HeavySword,
            0,
        );
        let doomed = sim.spawn_class(
            Vec2::new(30.0, 20.0),
            FRAC_PI_2,
            fleeing,
            UnitClassId::LightSpear,
            0,
        );
        // An enemy line standing off at 55m keeps the watchers ALERT
        // (recovery off) without fighting: in peacetime, rest masks panic.
        sim.spawn_class(
            Vec2::new(0.0, 55.0),
            -FRAC_PI_2,
            200,
            UnitClassId::HeavySword,
            1,
        );
        for _ in 0..(3.0 / DT) as usize {
            sim.tick(); // settle the spawn transient
        }
        // Break them by hand: the experiment is the WATCHERS' reaction.
        sim.units[doomed].morale = 0.0;
        let before = sim.units[watchers].morale;
        // The panic is a TRANSIENT (habituation damps the lingering rout):
        // measure the deepest dip, not the endpoint.
        let mut lowest = before;
        for _ in 0..(25.0 / DT) as usize {
            sim.tick();
            lowest = lowest.min(sim.units[watchers].morale);
        }
        before - lowest
    };
    let big = dip(300);
    let small = dip(12);
    println!("watcher morale dip: 300-man collapse {big:.3}, 12-man remnant {small:.3}");
    assert!(
        big > small * 3.0 + 0.005,
        "a collapse panics, a remnant saddens: {big:.3} vs {small:.3}"
    );
}

#[test]
fn wavering_masses_do_not_thunder() {
    // The same 200-horse charge, but the riders themselves are shaken:
    // you fear units bolder than you, never shakier ones.
    let dip = |cav_morale: f32| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let line = sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            200,
            UnitClassId::HeavySword,
            0,
        );
        let cav = sim.spawn_class(
            Vec2::new(0.0, 120.0),
            -FRAC_PI_2,
            200,
            UnitClassId::ShockCavalry,
            1,
        );
        sim.set_pace(cav, sim::Pace::Run);
        for _ in 0..(3.0 / DT) as usize {
            sim.tick();
        }
        sim.units[cav].morale = cav_morale;
        let baseline = sim.units[line].morale;
        sim.set_attack_order(cav, line);
        let mut lowest = baseline;
        for _ in 0..(36.0 / DT) as usize {
            sim.tick();
            if sim.units[line].engaged > 5 {
                break;
            }
            lowest = lowest.min(sim.units[line].morale);
            // Hold the riders' morale down: the experiment pins THEIR nerve.
            let m = sim.units[cav].morale;
            sim.units[cav].morale = m.min(cav_morale);
        }
        baseline - lowest
    };
    let bold = dip(1.0);
    let shaken = dip(0.3);
    println!("charge dip: bold riders {bold:.3}, shaken riders {shaken:.3}");
    assert!(
        bold > shaken * 4.0 + 0.005,
        "only confidence thunders: bold {bold:.3} vs shaken {shaken:.3}"
    );
}

#[test]
fn intimidation_is_relative_strength_not_absolute() {
    // Fear projects the BATTLE: 400 horse closing on 100 foot is a coming
    // massacre; 20 horse closing on the same line, at full courage,
    // barely registers.
    let dip = |horses: usize| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let line = sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            100,
            UnitClassId::HeavySword,
            0,
        );
        let cav = sim.spawn_class(
            Vec2::new(0.0, 130.0),
            -FRAC_PI_2,
            horses,
            UnitClassId::ShockCavalry,
            1,
        );
        sim.set_pace(cav, sim::Pace::Run);
        for _ in 0..(3.0 / DT) as usize {
            sim.tick();
        }
        let baseline = sim.units[line].morale;
        sim.set_attack_order(cav, line);
        let mut lowest = baseline;
        for _ in 0..(36.0 / DT) as usize {
            sim.tick();
            if sim.units[line].engaged > 5 {
                break;
            }
            lowest = lowest.min(sim.units[line].morale);
        }
        baseline - lowest
    };
    let host = dip(400);
    let token = dip(20);
    println!("dip vs 100 foot: 400 horse {host:.3}, 20 horse {token:.3}");
    assert!(host > 0.10, "a projected massacre terrifies: {host:.3}");
    assert!(token < 0.03, "a token force barely registers: {token:.3}");
}

#[test]
fn depleted_units_feel_each_loss_more() {
    // The morale input is casualties per LIVING man: the same ten dead
    // hit a half-strength unit twice as hard as a full one.
    let dip_from_ten_dead = |pre_kill: bool| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let u = sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            200,
            UnitClassId::HeavySword,
            0,
        );
        // An enemy at 55m keeps the unit alert (no recovery masking).
        sim.spawn_class(
            Vec2::new(0.0, 55.0),
            -FRAC_PI_2,
            100,
            UnitClassId::LightSpear,
            1,
        );
        let (start, count) = (sim.units[u].start, sim.units[u].count);
        if pre_kill {
            for s in (count / 2)..count {
                sim.kill(start + s);
            }
        }
        for _ in 0..(20.0 / DT) as usize {
            sim.tick(); // settle (and decay the pre-kill casualty window)
        }
        sim.units[u].morale = 0.9;
        let before = 0.9f32;
        for s in 0..10 {
            sim.kill(start + s + if pre_kill { count / 4 } else { count / 2 });
        }
        let mut lowest = before;
        for _ in 0..(12.0 / DT) as usize {
            sim.tick();
            lowest = lowest.min(sim.units[u].morale);
        }
        before - lowest
    };
    let full = dip_from_ten_dead(false);
    let depleted = dip_from_ten_dead(true);
    println!("dip from 10 dead: at full strength {full:.3}, at half strength {depleted:.3}");
    assert!(
        depleted > full * 1.5,
        "each loss weighs more on fewer shoulders: {depleted:.3} vs {full:.3}"
    );
}

#[test]
fn a_hopeless_wall_of_horse_routs_the_token_line_before_contact() {
    // 400 heavy horse closing on 40 foot: the projection is a massacre at
    // 10:1 — the line breaks at FULL courage before the wall lands. (And
    // since fear is amplified by disorder, a bigger but raggeder line
    // breaks the same way.)
    let mut sim = Sim::new(Tunables::default(), SEED);
    let line = sim.spawn_class(
        Vec2::new(0.0, 0.0),
        FRAC_PI_2,
        40,
        UnitClassId::HeavySword,
        0,
    );
    let cav = sim.spawn_class(
        Vec2::new(0.0, 140.0),
        -FRAC_PI_2,
        400,
        UnitClassId::ShockCavalry,
        1,
    );
    sim.set_pace(cav, sim::Pace::Run);
    for _ in 0..(3.0 / DT) as usize {
        sim.tick();
    }
    sim.units[line].morale = 1.0; // full courage — it doesn't matter
    sim.set_attack_order(cav, line);
    let mut broke_with_dead = None;
    for _ in 0..(40.0 / DT) as usize {
        sim.tick();
        if sim.units[line].routing {
            broke_with_dead = Some(40 - sim.units[line].alive_count);
            break;
        }
    }
    let dead = broke_with_dead.expect("the token line must break");
    println!("token line broke having lost {dead} men");
    assert!(
        dead < 10,
        "it breaks from the PROJECTION, not the impact: {dead} dead"
    );
}

/// A HOLDING line of `class` (200 men, braced, no order) meets a frontal shock
/// cavalry charge (120) at a FAIR projection (not the hopeless 10:1 above).
/// Returns (routed_before_contact, horses_felled_by_the_time_it_breaks).
/// This is the tuning bench for "a charge terrifies, but only the BRITTLE
/// pre-rout to it" — re-run it when touching charge-fear or bravery.
fn holding_line_meets_a_charge(class: UnitClassId) -> (bool, usize) {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let line = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, 200, class, 0);
    let cav = sim.spawn_class(
        Vec2::new(0.0, 60.0),
        -FRAC_PI_2,
        120,
        UnitClassId::ShockCavalry,
        1,
    );
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_attack_order(cav, line);
    let cav0 = sim.units[cav].alive_count;
    // March the horse in; note whether the line breaks BEFORE it ever engages.
    let mut made_contact = false;
    for _ in 0..(40.0 / DT) as usize {
        sim.tick();
        if sim.units[line].engaged > 0 {
            made_contact = true;
            break;
        }
        if sim.units[line].routing {
            break;
        }
    }
    let routed_before_contact = sim.units[line].routing && !made_contact;
    // Fight on until the line breaks (or a generous cap); count horses felled.
    for _ in 0..(40.0 / DT) as usize {
        if sim.units[line].routing {
            break;
        }
        sim.tick();
    }
    (routed_before_contact, cav0 - sim.units[cav].alive_count)
}

#[test]
fn a_charge_pre_routs_a_levy_not_a_formed_line() {
    // The complement of the hopeless-wall test above. At a FAIR projection (not
    // 10:1), pre-routing to a frontal shock charge is the BRITTLE unit's panic: a
    // peasant mob breaks before the horses arrive and never lands a blow. A drilled
    // shield wall (HeavySword) holds its nerve to contact and fights — it is the
    // formed line the charge does NOT shatter on approach. This pins the morale
    // invariant, independent of who wins the ensuing fight: the thunder of a charge
    // breaks the BRITTLE early, never the formed. The TUNING bench for charge-fear
    // / bravery changes (see `holding_line_meets_a_charge`).
    //
    // A LEVY SPEAR sits between: it reaches contact (does not pre-rout) but, being
    // a levy with a short point, then LOSES the melee to top-tier shock cav by
    // design (see the reach gradient in class.rs / balance_matrix) — so we assert
    // it doesn't pre-rout, NOT that it wins.
    let (levy_pre, levy_kills) = holding_line_meets_a_charge(UnitClassId::Peasant);
    let (wall_pre, wall_kills) = holding_line_meets_a_charge(UnitClassId::HeavySword);
    let (lsp_pre, lsp_kills) = holding_line_meets_a_charge(UnitClassId::LightSpear);
    println!(
        "peasant: pre-rout={levy_pre} kills={levy_kills} | heavy wall: pre-rout={wall_pre} kills={wall_kills} | light spear: pre-rout={lsp_pre} kills={lsp_kills}"
    );
    assert!(
        levy_pre,
        "a peasant levy must break before a charge lands (it did not)"
    );
    assert!(
        !wall_pre,
        "a drilled shield wall must hold its nerve to contact (it pre-routed)"
    );
    assert!(
        !lsp_pre,
        "a formed spear line must not pre-rout either — it reaches the fight (then may lose it)"
    );
    assert!(
        wall_kills > levy_kills,
        "the formed line that holds inflicts more than the levy that flees: wall {wall_kills} vs levy {levy_kills}"
    );
}
