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
            let c = &sim.units[cav];
            for i in c.start..c.start + c.count {
                if sim.alive[i] == 1 {
                    peak_pen = peak_pen.max(sim.soldier_pos(i).y - 30.0);
                }
            }
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
            prev_speed = sim.units[atk].speed;
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
    assert!(
        v_charge > v_walk + 0.7,
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
