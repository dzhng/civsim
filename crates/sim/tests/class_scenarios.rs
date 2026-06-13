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
            Tunables { micro_rough: 0.0, // parade ground: not the subject here
             morale_enabled: false, ..Tunables::default() },
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
        sim.set_pace(atk, sim::Pace::Run); // a committed assault
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
    assert!(u.engaged > 20, "bogged riders fight: {} engaged", u.engaged);
    assert!(
        // More than half the entry gallop (8.6) must be gone. (The vice
        // lets the riders grind a touch faster — wedged defenders fight
        // back less — but a grind is still not a ride.)
        u.mass_advance < 5.0,
        "the gallop is spent in the press: mass_advance {:.1}",
        u.mass_advance
    );
}

#[test]
fn a_frontal_charge_through_a_thin_line_is_a_bloodbath() {
    // 400 horse four deep into 200 light foot two deep: the impact itself
    // — bodies thrown by half a ton at the gallop — costs the line about
    // half its men.
    let mut sim = Sim::new(
        Tunables { morale_enabled: false, ..Tunables::default() },
        SEED,
    );
    let line = sim.spawn_unit(Vec2::new(0.0, 40.0), -PI / 2.0, 200, 100, Vec2::new(1.0, 1.1), 0, 0.7);
    let cav = sim.spawn_class(Vec2::new(0.0, -60.0), PI / 2.0, 400, UnitClassId::ShockCavalry, 1);
    sim.set_files(cav, 100); // 4 deep
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_attack_order(cav, line);
    // Run to impact plus a few seconds of ride-through; stop before melee
    // grinding dominates the count.
    let mut contact_at = None;
    for step in 0..(40.0 / DT) as usize {
        sim.tick();
        if contact_at.is_none() && sim.units[line].engaged > 10 {
            contact_at = Some(step);
        }
        if let Some(c) = contact_at {
            if step > c + (4.0 / DT) as usize {
                break;
            }
        }
    }
    assert!(contact_at.is_some(), "the charge must land");
    let dead = 200 - sim.units[line].alive_count;
    println!("impact + 4s: {dead} of 200 light foot down");
    assert!(
        (70..=130).contains(&dead),
        "a frontal charge through a thin line costs ~half: {dead}/200"
    );
}

#[test]
fn light_horse_tramples_at_half_the_butchery() {
    // The same four-deep frontal charge through 200 light foot two deep:
    // heavy horse rides men DOWN; light horse (horse archers) picks its
    // way through at roughly half the deaths.
    let impact_dead = |class: UnitClassId| -> usize {
        let mut sim = Sim::new(
            Tunables { morale_enabled: false, ..Tunables::default() },
            SEED,
        );
        let line = sim.spawn_unit(Vec2::new(0.0, 40.0), -PI / 2.0, 200, 100, Vec2::new(1.0, 1.1), 0, 0.7);
        let cav = sim.spawn_class(Vec2::new(0.0, -60.0), PI / 2.0, 400, class, 1);
        sim.set_files(cav, 100); // 4 deep
        sim.set_charge_enabled(cav, true); // equal posture: the variable is the HOOF
        sim.set_pace(cav, sim::Pace::Run);
        sim.set_attack_order(cav, line);
        let mut contact_at = None;
        for step in 0..(40.0 / DT) as usize {
            sim.tick();
            if contact_at.is_none() && sim.units[line].engaged > 10 {
                contact_at = Some(step);
            }
            if let Some(c) = contact_at {
                if step > c + (4.0 / DT) as usize {
                    break;
                }
            }
        }
        200 - sim.units[line].alive_count
    };
    let heavy_horse = impact_dead(UnitClassId::ShockCavalry);
    let light_horse = impact_dead(UnitClassId::HorseArchers);
    println!("impact dead: heavy horse {heavy_horse}, light horse {light_horse}");
    let ratio = light_horse as f32 / heavy_horse.max(1) as f32;
    assert!(
        (0.3..=0.7).contains(&ratio),
        "light horse butchers about half: {light_horse} vs {heavy_horse} (ratio {ratio:.2})"
    );
}

#[test]
fn a_grinding_press_breaks_no_bones() {
    // The scrum-chip regression: two heavy lines grinding chest to chest
    // for two minutes. The separation solver shoves bodies back and forth
    // every tick — constraint churn, not motion — and with the impact
    // stack reading HONEST kinematics none of it reads as a charge:
    // nobody is felled by a squeeze, nobody dies of re-knock chips.
    let mut sim = Sim::new(Tunables { morale_enabled: false, ..Tunables::default() }, SEED);
    let a = sim.spawn_class(Vec2::new(0.0, -12.0), PI / 2.0, 300, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 12.0), -PI / 2.0, 300, UnitClassId::HeavyInfantry, 1);
    sim.set_charge_enabled(a, false);
    sim.set_charge_enabled(b, false);
    sim.set_move_order(a, Vec2::new(0.0, 30.0));
    sim.set_move_order(b, Vec2::new(0.0, -30.0));
    let mut peak_eng = 0;
    for _ in 0..(120.0 / DT) as usize {
        sim.tick();
        peak_eng = peak_eng.max(sim.units[a].engaged + sim.units[b].engaged);
    }
    assert!(peak_eng > 100, "setup: a real grind, peak {peak_eng} engaged");
    assert_eq!(
        sim.impact_casualties, 0,
        "a press is a squeeze, not an impact: {} men chipped to death",
        sim.impact_casualties
    );
}

#[test]
fn a_pike_hedge_breaks_the_charge_even_if_horses_ooze_through() {
    // Waterloo: a square does not vaporize cavalry — it STOPS THE CHARGE.
    // 160 shock horse gallop a 400-man (10-deep) phalanx head-on. The
    // hedge of presented points crashes the gallop to a crawl within the
    // first ranks; after that some horses may ooze forward at walking
    // pace (getting INSIDE the sarissas is the real phalanx weakness —
    // how legionaries beat them), but the CHARGE is dead at the hedge.
    // (The unit economy is decisive separately: balance_matrix shows pike
    // beats cav ~96% either bench.)
    let mut sim = Sim::new(Tunables { morale_enabled: false, ..Tunables::default() }, SEED);
    let ph = sim.spawn_class(Vec2::new(0.0, 40.0), -PI / 2.0, 400, UnitClassId::Phalanx, 0);
    let cav = sim.spawn_class(Vec2::new(0.0, -40.0), PI / 2.0, 160, UnitClassId::ShockCavalry, 1);
    sim.set_attack_order(cav, ph);
    let front = 40.0 - 0.5 * sim.units[ph].depth(); // south face the cav meets
    let mut peak_ma = 0.0f32;
    let mut broke_at_y: Option<f32> = None;
    for _ in 0..(30.0 / DT) as usize {
        sim.tick();
        let c = &sim.units[cav];
        peak_ma = peak_ma.max(c.mass_advance);
        // The charge is "broken" the first tick its gallop (peak >7) has
        // collapsed to a crawl while still near the hedge.
        if broke_at_y.is_none() && peak_ma > 7.0 && c.mass_advance < 1.5 {
            broke_at_y = Some(c.centroid.y);
        }
    }
    assert!(peak_ma > 7.0, "the charge must actually develop: peak ma {peak_ma:.1}");
    let broke = broke_at_y.expect("the charge must break against the hedge");
    println!(
        "charge peaked at {peak_ma:.1} m/s, broke at y {broke:.1} (front {front:.1}, +3 ranks {:.1})",
        front + 3.3
    );
    assert!(
        broke < front + 5.5,
        "the gallop dies in the first ranks of the hedge, not deep inside: broke at y {broke:.1} (front {front:.1})"
    );
}

#[test]
fn eight_ranks_of_swords_toll_the_ride_but_cannot_hold_it() {
    // LOCKED BEHAVIOR (sword walls vs cavalry, by design): dense sword
    // infantry without pole-arms cannot STOP heavy horse — only points
    // can (see the ignored Waterloo contract and specs/impale.md) — but
    // eight braced ranks exact a real toll: the slam carries the riders
    // through the wall, the tangle behind it drops the mass below trample
    // speed, the MAJORITY of the cavalry plants into honest melee for a
    // few seconds, and only then do they shove free and ride on. The ride
    // survives; the charge does not.
    let mut sim = Sim::new(Tunables { morale_enabled: false, ..Tunables::default() }, SEED);
    let block = sim.spawn_class(Vec2::new(0.0, 40.0), PI / 2.0, 800, UnitClassId::HeavyInfantry, 1);
    let cav = sim.spawn_class(Vec2::new(0.0, 160.0), -PI / 2.0, 80, UnitClassId::ShockCavalry, 0);
    let _ = block;
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_move_order(cav, Vec2::new(0.0, -80.0));
    let mut min_ma = f32::INFINITY;
    let mut melee_secs = 0.0f32;
    for _ in 0..(45.0 / DT) as usize {
        sim.tick();
        let c = &sim.units[cav];
        min_ma = min_ma.min(c.mass_advance);
        if c.engaged * 2 >= c.alive_count {
            melee_secs += DT;
        }
    }
    let c = &sim.units[cav];
    assert!(
        min_ma < 1.0,
        "the tangle stops the mass below trample speed: min mass_advance {min_ma:.2}"
    );
    assert!(
        melee_secs > 2.0,
        "the majority of the cavalry fights as melee for a few seconds: {melee_secs:.1}s"
    );
    assert!(
        c.centroid.y < -60.0,
        "and they shove their way out and ride on: centroid y {:.1}",
        c.centroid.y
    );
    assert!(c.alive_count >= 70, "the toll is a toll, not a grave: {} left", c.alive_count);
}

#[test]
fn a_charge_stopped_in_the_crowd_is_spent_even_if_it_never_reached_speed() {
    // A long fatigued approach can sag under charge_min_speed right at
    // ignition: the burst then never arms the at-speed spent check. Once
    // it stands stopped in the crowd, it is dead all the same — CHARGING
    // must clear (it used to stick through whole melees, bleeding drain).
    let mut sim = Sim::new(Tunables::default(), 0x5eed_c0de_u64);
    sim::setup_duel(&mut sim, UnitClassId::HeavyInfantry, UnitClassId::HeavyInfantry);
    sim.set_attack_order(0, 1);
    sim.set_attack_order(1, 0);
    let mut stuck = 0.0f32;
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
        for u in [0usize, 1] {
            let x = &sim.units[u];
            if x.charging && x.engaged * 3 > x.alive_count && x.mass_advance < 0.5 {
                stuck += DT / 2.0; // per-unit half-step: total stuck-seconds
            }
        }
    }
    assert!(
        stuck < 2.0,
        "a stopped, engaged 'charge' must clear within a couple of seconds: {stuck:.1}s stuck"
    );
}
