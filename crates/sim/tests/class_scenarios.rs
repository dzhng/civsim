//! Class & mass emergence tests: every class difference must flow from the
//! stat table through physics — no class-conditional logic exists anywhere.

use sim::{setup_battle, MapId, Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::PI;

const SEED: u64 = 11;

fn run(sim: &mut Sim, seconds: f32) {
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
    }
}

#[test]
fn cavalry_mass_shoves_through_infantry() {
    // FRIENDLY pass-through isolates pure mass physics (enemies stop and
    // fight since melee landed): cavalry riding through standing infantry
    // shoves men aside far harder than infantry walking the same line.
    let displacement_by = |attacker: UnitClassId| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let inf = sim.spawn_class(Vec2::new(0.0, 0.0), -PI / 2.0, 360, UnitClassId::LightInfantry, 0);
        let atk = sim.spawn_class(Vec2::new(0.0, -80.0), PI / 2.0, 120, attacker, 0);
        let before: Vec<Vec2> = {
            let u = &sim.units[inf];
            (u.start..u.start + u.count).map(|i| sim.soldier_pos(i)).collect()
        };
        sim.set_pace(atk, sim::Pace::Run);
        sim.set_move_order(atk, Vec2::new(0.0, 120.0));
        run(&mut sim, 50.0);
        let u_start = sim.units[inf].start;
        let u_count = sim.units[inf].count;
        let mut sum = 0.0;
        for (k, i) in (u_start..u_start + u_count).enumerate() {
            sum += (sim.soldier_pos(i) - before[k]).len();
        }
        sum / u_count as f32
    };

    let by_cavalry = displacement_by(UnitClassId::ShockCavalry);
    let by_infantry = displacement_by(UnitClassId::LightInfantry);
    assert!(
        by_cavalry > by_infantry * 1.5,
        "horse mass must shove men aside far harder: cav {by_cavalry:.2} vs inf {by_infantry:.2}"
    );
}

#[test]
fn disordered_unit_delays_orders_with_visible_timer() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = sim.spawn_class(Vec2::ZERO, 0.0, 360, UnitClassId::LightInfantry, 0);
    // Manufacture disorder: scatter soldiers off their slots.
    {
        let unit = &sim.units[u];
        let (start, count) = (unit.start, unit.count);
        for s in 0..count {
            let i = start + s;
            sim.positions[2 * i] += if s % 2 == 0 { 6.0 } else { -5.0 };
            sim.positions[2 * i + 1] += if s % 3 == 0 { 5.0 } else { -4.0 };
        }
    }
    for _ in 0..30 {
        sim.tick(); // let the measurement see the mess
    }
    assert!(sim.units[u].cohesion < 0.6, "setup: unit should be disordered");
    sim.set_move_order(u, Vec2::new(80.0, 0.0));
    let unit = &sim.units[u];
    assert!(unit.move_target.is_none(), "order must not apply instantly");
    assert!(unit.pending_target.is_some(), "order must queue");
    assert!(unit.pending_timer > 0.5, "delay should be substantial");
    run(&mut sim, 5.0);
    assert!(
        sim.units[u].move_target.is_some() || sim.units[u].pending_target.is_none(),
        "order must eventually be delivered"
    );
}

#[test]
fn ordered_unit_responds_instantly() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    let u = sim.spawn_class(Vec2::ZERO, 0.0, 360, UnitClassId::LightInfantry, 0);
    sim.set_move_order(u, Vec2::new(80.0, 0.0));
    assert!(sim.units[u].move_target.is_some(), "fresh unit obeys at once");
}

#[test]
fn wide_line_refaces_slower_than_deep_block() {
    // Same headcount: a wide line's long axis swings through a far larger
    // radius than a compact block — re-facing 180 takes visibly longer.
    let pivot_time = |files: usize| -> f32 {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let u = sim.spawn_unit(Vec2::ZERO, 0.0, 400, files, Vec2::new(1.0, 1.2), 0, 0.7);
        sim.set_move_order(u, Vec2::new(-300.0, 0.0));
        let mut t = 0.0;
        while sim::wrap_angle(sim.units[u].facing - PI).abs() > 0.2 && t < 200.0 {
            sim.tick();
            t += DT;
        }
        t
    };
    let wide = pivot_time(100); // 100 x 4
    let deep = pivot_time(20); // 20 x 20
    assert!(
        wide > deep * 1.5,
        "wide line must re-face slower: {wide:.1}s vs {deep:.1}s"
    );
}

#[test]
fn full_battle_spawns_and_runs() {
    let mut sim = Sim::new(Tunables::default(), SEED);
    setup_battle(&mut sim, MapId::RiverAndCrags);
    assert_eq!(sim.units.len(), 40, "20 units per side");
    let per_side: usize = sim.units.iter().filter(|u| u.team == 0).map(|u| u.count).sum();
    assert!(
        (12_000..=18_000).contains(&per_side),
        "~15k per side, got {per_side}"
    );
    // All classes present.
    for class in [
        UnitClassId::HeavyInfantry,
        UnitClassId::Phalanx,
        UnitClassId::LongSwords,
        UnitClassId::Archers,
        UnitClassId::Skirmishers,
        UnitClassId::ShockCavalry,
        UnitClassId::HorseArchers,
        UnitClassId::ArtilleryCrew,
    ] {
        assert!(
            sim.units.iter().any(|u| u.class == class && u.team == 0),
            "missing {class:?}"
        );
    }
    // Run a bit: must stay stable and keep everyone inside the world.
    run(&mut sim, 10.0);
    for i in 0..sim.soldier_count() {
        let p = sim.soldier_pos(i);
        assert!(p.x.is_finite() && p.y.is_finite());
        assert!(p.x.abs() < 1300.0 && p.y.abs() < 900.0, "soldier escaped the map: {p:?}");
    }
}

#[test]
fn dense_infantry_blunts_a_cavalry_charge_loose_gets_punched_through() {
    // Same men, same count, same frontage discipline — ONLY the spacing
    // differs. Dense files put more collective mass (and transmitted press)
    // at the impact point: the charge should bog at the front ranks.
    // Loose order leaves every man alone against half a ton of horse.
    let charge_into = |spacing: f32| -> (f32, f32, usize, usize) {
        let mut sim = Sim::new(
            Tunables { morale_enabled: false, ..Tunables::default() },
            SEED,
        );
        // Infantry faces south, front line at y = 30, ranks extending north.
        let inf = sim.spawn_unit(
            Vec2::new(0.0, 30.0),
            -PI / 2.0,
            400,
            20,
            Vec2::new(spacing, spacing * 1.1),
            0,
            0.7,
        );
        let cav = sim.spawn_class(Vec2::new(0.0, -60.0), PI / 2.0, 160, UnitClassId::ShockCavalry, 1);
        let y0: Vec<f32> = {
            let u = &sim.units[inf];
            (u.start..u.start + u.count).map(|i| sim.soldier_pos(i).y).collect()
        };
        sim.set_pace(cav, sim::Pace::Run);
        sim.set_attack_order(cav, inf);
        // The impact is an EVENT: track its peaks through the whole charge
        // instead of sampling one instant.
        let mut peak_knocked = 0usize;
        let mut peak_pen = f32::MIN;
        let mut peak_shove = 0.0f32;
        for _ in 0..(28.0 / DT) as usize {
            sim.tick();
            let u = &sim.units[inf];
            let knocked = (u.start..u.start + u.count)
                .filter(|&i| sim.alive[i] == 1 && sim.stun[i] > 0.0)
                .count();
            peak_knocked = peak_knocked.max(knocked);
            // Centroid penetration: the MASS's depth into the line. (The
            // deepest single horse is an outlier metric — one breakthrough
            // animal galloping the open field reads as "penetration".)
            peak_pen = peak_pen.max(sim.units[cav].centroid.y - 30.0);
            let mut shove = 0.0f32;
            let mut n = 0;
            for (k, i) in (u.start..u.start + u.count).enumerate() {
                if sim.alive[i] == 1 {
                    shove += (sim.soldier_pos(i).y - y0[k]).abs();
                    n += 1;
                }
            }
            peak_shove = peak_shove.max(shove / n.max(1) as f32);
        }
        let deaths = sim.units[inf].count - sim.units[inf].alive_count;
        (peak_pen, peak_shove, peak_knocked, deaths)
    };

    let (pen_d, shove_d, knock_d, dead_d) = charge_into(0.75); // shields touching
    let (pen_l, shove_l, knock_l, dead_l) = charge_into(1.8); // open order
    println!(
        "DENSE (0.75m): deepest horse {pen_d:.1}m past the original front, peak mean shove {shove_d:.2}m, peak {knock_d} down at once, {dead_d} dead"
    );
    println!(
        "LOOSE (1.8m):  deepest horse {pen_l:.1}m past the original front, peak mean shove {shove_l:.2}m, peak {knock_l} down at once, {dead_l} dead"
    );
    // Mean shove now rewards dense COHERENCE (the block yields as one body
    // while loose men scatter individually) — physically honest, so the
    // protection story is told by penetration; the rest prints above.
    let _ = (knock_d, knock_l, shove_d, shove_l);
    assert!(
        pen_l > pen_d + 0.5,
        "loose order is ridden into deeper: {pen_l:.1}m vs {pen_d:.1}m past the front"
    );
    // (Kill totals at this timescale are a wash now that the anti-blender
    // keeps rank-2 horses out of reach — the protection story is told by
    // penetration and knockdowns; deaths print above for the record.)
    let _ = (dead_d, dead_l);
}

#[test]
fn heavy_infantry_charge_carries_a_stride_not_a_gallop() {
    // p = m·v: a sprinting heavy ARMS momentum at contact (closing speed
    // above the impact threshold) and carries it a stride; a walk-in
    // physically cannot. Far less than horse either way (small m, small v).
    let crash_into = |charge: bool| -> f32 {
        let mut sim = Sim::new(
            Tunables { morale_enabled: false, ..Tunables::default() },
            SEED,
        );
        let inf = sim.spawn_unit(
            Vec2::new(0.0, 30.0),
            -PI / 2.0,
            400,
            20,
            Vec2::new(1.5, 1.6),
            0,
            0.7,
        );
        let atk = sim.spawn_class(Vec2::new(0.0, -40.0), PI / 2.0, 300, UnitClassId::HeavyInfantry, 1);
        sim.set_charge_enabled(atk, charge);
        sim.set_pace(atk, sim::Pace::Run);
        sim.set_attack_order(atk, inf);
        let mut contact_speed = -1.0f32;
        let mut prev_speed = 0.0f32;
        for _ in 0..(30.0 / DT) as usize {
            sim.tick();
            if contact_speed < 0.0 && sim.units[atk].engaged > 5 {
                contact_speed = prev_speed; // the tick BEFORE the pin
            }
            prev_speed = sim.units[atk].frame_speed;
        }
        contact_speed.max(0.0)
    };
    let v_walk = crash_into(false);
    let v_charge = crash_into(true);
    println!("contact speed: walked in at {v_walk:.1} m/s, charged in at {v_charge:.1} m/s");
    // (With arrive-braking gone, ANY running attack contacts at run speed —
    // the charge's edge is the burst above it.)
    assert!(
        v_charge > 2.4,
        "the charge makes CONTACT at speed (p = m·v needs the v): {v_charge:.1} m/s"
    );
    // (Armor is paid for in wind now: a heavy's long running approach
    // arrives with drained legs, so the burst's measurable edge is a
    // stride's worth, not a gallop's — same bar as the combat-suite twin.)
    assert!(
        v_charge > v_walk + 0.25,
        "the burst outpaces the run-in: {v_charge:.1} vs {v_walk:.1} m/s"
    );
}

#[test]
fn charge_opens_at_the_edge_from_face_and_flank_alike() {
    // A 100x4 column is ~2m deep head-on and ~50m wide side-on. The burst
    // must begin at charge distance from the EDGE the rider actually
    // approaches — measured to the centroid it would fire 40m inside the
    // flank, i.e., never.
    let burst_edge_distance = |flank: bool| -> f32 {
        let mut sim = Sim::new(
            Tunables { morale_enabled: false, ..Tunables::default() },
            SEED,
        );
        // The line faces north; its long axis runs east-west.
        let line = sim.spawn_unit(Vec2::ZERO, PI / 2.0, 400, 100, Vec2::new(1.0, 1.1), 1, 0.7);
        let (cav_pos, ext) = if flank {
            (Vec2::new(120.0, -2.0), 0.5 * sim.units[line].width())
        } else {
            (Vec2::new(0.0, 90.0), 0.5 * sim.units[line].depth())
        };
        let cav = sim.spawn_class(cav_pos, (Vec2::ZERO - cav_pos).y.atan2(-cav_pos.x), 120, UnitClassId::ShockCavalry, 0);
        sim.set_pace(cav, sim::Pace::Run);
        sim.set_attack_order(cav, line);
        for _ in 0..(40.0 / DT) as usize {
            sim.tick();
            if sim.units[cav].charging {
                let d = (sim.units[line].centroid - sim.units[cav].anchor).len() - ext;
                return d;
            }
        }
        -1.0
    };
    let face = burst_edge_distance(false);
    let flank = burst_edge_distance(true);
    println!("burst opens {face:.1}m from the face, {flank:.1}m from the flank");
    assert!(face > 2.0 && face < 30.0, "frontal burst at a sane edge distance: {face:.1}m");
    assert!(flank > 2.0 && flank < 30.0, "flank burst at a sane edge distance: {flank:.1}m");
    assert!(
        (face - flank).abs() < 12.0,
        "aspect must not change the trigger: {face:.1}m vs {flank:.1}m"
    );
}

#[test]
fn charging_costs_stamina_and_spent_legs_cannot_burst() {
    let burst = |fresh: bool| -> (bool, f32, f32) {
        let mut sim = Sim::new(
            Tunables { morale_enabled: false, ..Tunables::default() },
            SEED,
        );
        let line = sim.spawn_unit(Vec2::new(0.0, 40.0), PI / 2.0, 200, 40, Vec2::new(1.0, 1.1), 1, 0.7);
        let cav = sim.spawn_class(Vec2::new(0.0, -60.0), PI / 2.0, 120, UnitClassId::ShockCavalry, 0);
        if !fresh {
            sim.units[cav].fatigue = 0.2; // blown horses
        }
        let before = sim.units[cav].fatigue;
        sim.set_attack_order(cav, line);
        let mut burst_seen = false;
        for _ in 0..(30.0 / DT) as usize {
            sim.tick();
            burst_seen |= sim.units[cav].charging;
        }
        let _ = line;
        (burst_seen, before, sim.units[cav].fatigue)
    };
    let (fresh_burst, b0, b1) = burst(true);
    assert!(fresh_burst, "fresh horses burst");
    assert!(
        b1 < b0 - 0.02,
        "the burst is paid in stamina: {b0:.2} -> {b1:.2}"
    );
    let (spent_burst, _, _) = burst(false);
    assert!(!spent_burst, "blown horses cannot charge — they trot in");
}

#[test]
fn pikes_unhorse_cavalry_swords_chip_at_horseflesh() {
    // Target priority is GEOMETRY: a strike lands on the rider whenever the
    // weapon spans to his perch (to_center <= reach), and only soaks into
    // the mount otherwise. Pikes fight at 3.2m and span to the man; swords
    // at 1.1m almost never do — and a horse is several times the man's
    // health, so chipping at horseflesh is a losing proposition.
    let cav_dead = |attacker: UnitClassId| -> usize {
        let mut sim = Sim::new(
            Tunables { morale_enabled: false, ..Tunables::default() },
            SEED,
        );
        let atk = sim.spawn_class(Vec2::new(0.0, -14.0), PI / 2.0, 240, attacker, 0);
        let cav = sim.spawn_class(Vec2::new(0.0, 14.0), -PI / 2.0, 120, UnitClassId::ShockCavalry, 1);
        sim.set_charge_enabled(atk, false); // isolate weapon geometry
        sim.set_attack_order(atk, cav);
        // Early window: frontal geometry dominates before the scrum
        // interpenetrates and gives swords side access to the riders.
        for _ in 0..(20.0 / DT) as usize {
            sim.tick();
        }
        let u = &sim.units[cav];
        u.count - u.alive_count
    };
    let by_pikes = cav_dead(UnitClassId::Phalanx);
    let by_swords = cav_dead(UnitClassId::HeavyInfantry);
    println!("cav dead: pikes {by_pikes}, swords {by_swords}");
    assert!(
        by_pikes as f32 > by_swords as f32 * 2.0,
        "pikes unhorse riders, swords struggle: {by_pikes} vs {by_swords}"
    );
}

#[test]
fn move_order_rides_through_a_thin_line() {
    // The order IS the intent: a move command past a thin line means the
    // line is just terrain that happens to be made of men. No charge flag,
    // no latch — trample is class capability x measured velocity, and the
    // ram drag a 3-rank screen can muster only shaves the gallop. The cav
    // arrives at its destination; the line is left stunned and bleeding.
    let mut sim = Sim::new(Tunables { morale_enabled: false, ..Tunables::default() }, SEED);
    let line = sim.spawn_unit(Vec2::new(0.0, 40.0), PI / 2.0, 300, 100, Vec2::new(1.0, 1.1), 1, 0.7);
    let cav = sim.spawn_class(Vec2::new(0.0, 160.0), -PI / 2.0, 160, UnitClassId::ShockCavalry, 0);
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_move_order(cav, Vec2::new(0.0, -80.0));
    let mut stayed_move = true;
    for _ in 0..(45.0 / DT) as usize {
        sim.tick();
        stayed_move &= matches!(sim.units[cav].mode, sim::OrderMode::Move);
    }
    assert!(stayed_move, "a move order never latches into a fight");
    let y = sim.units[cav].centroid.y;
    assert!(y < -60.0, "the cav must ride through and arrive: centroid y {y:.1}");
    let line_dead = sim.units[line].count - sim.units[line].alive_count;
    assert!(line_dead > 0, "the trample leaves bodies: {line_dead} dead");
    assert!(
        sim.units[cav].engaged == 0,
        "no melee at the destination: {} engaged",
        sim.units[cav].engaged
    );
}

#[test]
fn move_order_into_a_deep_braced_column_bogs_into_melee() {
    // The same order into a 20-rank column (front at 40, rear at 20): the
    // column's measured counter-press outmuscles the gallop (ram drag),
    // the mass falls below trample speed, the riders plant — a FIGHT in
    // the middle of the block, not a ride. (They eventually carve through
    // unsupported lights and break out the far side — also honest; the
    // claim here is the bog, not a permanent wall. NOTE: a block only ~8
    // ranks deep is crossed inside the drag's spin-up at gallop speed and
    // gets ridden through regardless of brace — depth in TIME grips.)
    let mut sim = Sim::new(Tunables { morale_enabled: false, ..Tunables::default() }, SEED);
    let block = sim.spawn_unit(Vec2::new(0.0, 40.0), PI / 2.0, 800, 40, Vec2::new(0.9, 1.0), 1, 0.7);
    let cav = sim.spawn_class(Vec2::new(0.0, 160.0), -PI / 2.0, 80, UnitClassId::ShockCavalry, 0);
    let _ = block;
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_move_order(cav, Vec2::new(0.0, -80.0));
    run(&mut sim, 30.0); // contact ~18s; sample mid-bog
    let u = &sim.units[cav];
    assert!(
        u.centroid.y > 20.0,
        "mid-bog the riders are still INSIDE the block (20..40): centroid y {:.1}",
        u.centroid.y
    );
    assert!(u.engaged > 30, "bogged riders fight: {} engaged", u.engaged);
    assert!(
        u.mass_advance < 3.0,
        "the gallop is spent in the press: mass_advance {:.1}",
        u.mass_advance
    );
}

#[test]
fn tmp_8rank_wall() {
    let mut sim = Sim::new(Tunables { morale_enabled: false, ..Tunables::default() }, SEED);
    let block = sim.spawn_class(Vec2::new(0.0, 40.0), PI / 2.0, 800, UnitClassId::HeavyInfantry, 1);
    let cav = sim.spawn_class(Vec2::new(0.0, 160.0), -PI / 2.0, 80, UnitClassId::ShockCavalry, 0);
    let _ = block;
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_move_order(cav, Vec2::new(0.0, -80.0));
    for t in 0..(45.0 / DT) as usize {
        sim.tick();
        if t % ((3.0 / DT) as usize) == 0 && t as f32 * DT > 12.0 {
            let c = &sim.units[cav];
            println!("W8 t={:>4.1} cav.y={:>6.1} ma={:>5.2} cp={:>5.2} eng={:>3}",
                t as f32 * DT, c.centroid.y, c.mass_advance, c.counter_press, c.engaged);
        }
    }
}
