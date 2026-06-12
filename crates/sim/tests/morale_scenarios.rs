//! Morale emergence: breaks before annihilation, panic spreads through
//! physical proximity, charges terrify before they land, rallies scar.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 555;

fn run(sim: &mut Sim, seconds: f32) {
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
    }
}

#[test]
fn outnumbered_unit_breaks_before_annihilation() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let weak = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 150, UnitClassId::LightInfantry, 0);
    let strong = sim.spawn_class(Vec2::new(0.0, -14.0), FRAC_PI_2, 450, UnitClassId::HeavyInfantry, 1);
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
    // Two friendly units stand side by side; one's neighbor breaks and floods
    // past. Control: the same unit with a steady neighbor.
    let morale_with_neighbor = |neighbor_breaks: bool| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let watcher = sim.spawn_class(Vec2::new(40.0, 10.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
        let neighbor = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 150, UnitClassId::LightInfantry, 0);
        if neighbor_breaks {
            let crusher = sim.spawn_class(Vec2::new(0.0, -14.0), FRAC_PI_2, 450, UnitClassId::HeavyInfantry, 1);
            sim.set_attack_order(crusher, neighbor);
        }
        run(&mut sim, 120.0);
        let _ = neighbor;
        sim.units[watcher].morale
    };
    let steady = morale_with_neighbor(false);
    let shaken = morale_with_neighbor(true);
    assert!(
        shaken < steady - 0.05,
        "a neighbor's rout must shake the will: {shaken:.2} vs steady {steady:.2}"
    );
}

#[test]
fn incoming_charge_intimidates_before_contact() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let target = sim.spawn_class(Vec2::new(0.0, 60.0), -FRAC_PI_2, 200, UnitClassId::LightInfantry, 0);
    let cav = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, 150, UnitClassId::ShockCavalry, 1);
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
    let weak = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 200, UnitClassId::LightInfantry, 0);
    // A steady teammate keeps the battle CONTESTED: a verdict freezes all
    // morale (routs lock, the chase plays out), and a one-unit team that
    // breaks IS the verdict — it could never rally.
    sim.spawn_class(Vec2::new(400.0, 10.0), -FRAC_PI_2, 300, UnitClassId::HeavyInfantry, 0);
    let strong = sim.spawn_class(Vec2::new(0.0, -14.0), FRAC_PI_2, 450, UnitClassId::HeavyInfantry, 1);
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
            UnitClassId::LightInfantry,
            0,
        );
        let _ = w;
        let s = sim.spawn_class(
            Vec2::new(k as f32 * 40.0 - 40.0, -16.0),
            FRAC_PI_2,
            400,
            UnitClassId::HeavyInfantry,
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
    let mover = sim.spawn_unit(Vec2::new(0.0, -40.0), FRAC_PI_2, 200, 10, Vec2::new(0.9, 1.1), 0, 0.7);
    // A dense plug of friends, parked.
    sim.spawn_unit(Vec2::new(0.0, 10.0), FRAC_PI_2, 900, 30, Vec2::new(0.9, 1.1), 0, 0.7);
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
    let a = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 300, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, -14.0), FRAC_PI_2, 330, UnitClassId::HeavyInfantry, 1);
    // Far teammates on BOTH sides keep the field contested: a one-unit
    // team's break is the verdict itself, and the verdict freezes morale.
    sim.spawn_class(Vec2::new(420.0, 10.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    sim.spawn_class(Vec2::new(420.0, -14.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    let mut first_break: Option<usize> = None;
    let mut morale_at_break = 0.0;
    for _ in 0..(420.0 / DT) as usize {
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
    let strong = sim.spawn_class(Vec2::new(0.0, -20.0), FRAC_PI_2, 400, UnitClassId::HeavyInfantry, 0);
    // One prey: a second unit kept the field contested forever (the hunter
    // chases the router while the fresh unit stands at full morale).
    let weak_a = sim.spawn_class(Vec2::new(-25.0, 20.0), -FRAC_PI_2, 80, UnitClassId::LightInfantry, 1);
    sim.set_pursue(strong, true);
    sim.set_attack_order(strong, weak_a);
    sim.set_attack_order(weak_a, strong);
    let mut verdict_at = None;
    for step in 0..(420.0 / DT) as usize { // the new grind: lights endure ~2min of focused stomp
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
    // The sim keeps running: the routers keep fleeing (cornered prey may
    // only creep, but it MOVES) and the pursuit stays on them — though
    // blown heavy legs lose ground to fleeing light troops honestly
    // (~1.5 m/s over the 30s window), so "on them" is a leash, not a heel.
    assert!(
        (sim.units[weak_a].centroid - prey_then).len() > 1.5,
        "routers keep fleeing after the verdict"
    );
    assert!(
        (sim.units[strong].centroid - sim.units[weak_a].centroid).len() < 90.0,
        "the pursuit stays on the routers"
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
        let line = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
        let cav = sim.spawn_class(Vec2::new(0.0, 120.0), -FRAC_PI_2, horses, UnitClassId::ShockCavalry, 1);
        sim.set_pace(cav, sim::Pace::Run);
        // Let spawn morale settle to its baseline FIRST (the dip must
        // measure fear, not the spawn transient).
        for _ in 0..(3.0 / DT) as usize {
            sim.tick();
        }
        let baseline = sim.units[line].morale;
        sim.set_attack_order(cav, line);
        // Measure morale as the charge closes, before contact does damage.
        let mut lowest = baseline;
        for _ in 0..(20.0 / DT) as usize {
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
    let line = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let cav = sim.spawn_class(Vec2::new(-120.0, 45.0), 0.0, 160, UnitClassId::ShockCavalry, 1);
    sim.set_pace(cav, sim::Pace::Run);
    // Endless laps across the line's front at gallop, inside the fear radius.
    for lap in 0..12 {
        let x = if lap % 2 == 0 { 120.0 } else { -120.0 };
        sim.set_move_order(cav, Vec2::new(x, 45.0));
        for _ in 0..(25.0 / DT) as usize {
            sim.tick();
        }
    }
    let m = morale_after(&mut sim, line, 1.0);
    assert!(
        !sim.units[line].routing && m > 0.55,
        "five minutes of circus hasn't broken the line: morale {m:.2}"
    );
}

#[test]
fn contagion_spreads_from_fleeing_bodies_not_banners() {
    // A friendly unit breaks within sight: panic in the watchers scales
    // with the SIZE of the rout streaming past.
    let dip = |fleeing: usize| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let watchers = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
        let doomed = sim.spawn_class(Vec2::new(30.0, 20.0), FRAC_PI_2, fleeing, UnitClassId::LightInfantry, 0);
        // An enemy line standing off at 55m keeps the watchers ALERT
        // (recovery off) without fighting: in peacetime, rest masks panic.
        sim.spawn_class(Vec2::new(0.0, 55.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
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
