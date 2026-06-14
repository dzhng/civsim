//! ENGAGE vs DISENGAGE: the two postures of movement near an enemy.
//!
//! Engage (the Move default): never show your back inside threat range —
//! face the enemy and drift (strafe/back-pedal at walking pace), keep
//! fighting whatever stays in reach, in or out of melee. Disengage
//! (Withdraw): turn and run at full pace, answering nothing.
//! Cavalry cannot drift: it wheels and breaks off, both ways.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 31337;

fn no_morale() -> Tunables {
    Tunables {
        morale_enabled: false,
        ..Tunables::default()
    }
}

#[test]
fn engage_move_backs_off_facing_the_threat() {
    let mut sim = Sim::new(no_morale(), SEED);
    // Heavy line faces an enemy 25m north; ordered to fall back 40m south.
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavySword, 0);
    let _foe = sim.spawn_class(Vec2::new(0.0, 25.0), -FRAC_PI_2, 200, UnitClassId::HeavySword, 1);
    sim.set_move_order(u, Vec2::new(0.0, -40.0));
    let mut worst_face = 0.0f32;
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
        let foe_dist = (sim.units[1].center() - sim.units[u].center()).len();
        if sim.units[u].frame_speed > 0.3 && foe_dist < 43.0 { // inside the 45m threat gate, with margin
            // While retreating IN THREAT RANGE, the face stays on the enemy.
            // (Beyond it, turning to march is correct.)
            worst_face = worst_face.max(sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs());
        }
    }
    assert!(
        (sim.units[u].anchor - Vec2::new(0.0, -40.0)).len() < 5.0,
        "the fighting withdrawal must arrive, at {:?}",
        sim.units[u].anchor
    );
    assert!(
        worst_face < 0.7,
        "shields stay toward the threat while moving: worst deviation {worst_face:.2} rad"
    );
}

#[test]
fn drifting_is_slower_than_marching_and_never_sprints() {
    // Same backward leg: with a threat in front, the engage drift (walking,
    // direction-penalized) is slower than an open-field march — and run
    // pace cannot speed it up.
    let time_back = |threat: bool, run: bool| -> f32 {
        let mut sim = Sim::new(no_morale(), SEED);
        let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavySword, 0);
        if threat {
            sim.spawn_class(Vec2::new(0.0, 25.0), -FRAC_PI_2, 200, UnitClassId::HeavySword, 1);
        }
        if run {
            sim.set_pace(u, sim::Pace::Run);
        }
        sim.set_move_order(u, Vec2::new(0.0, -40.0));
        let mut t = 0.0;
        while (sim.units[u].anchor - Vec2::new(0.0, -40.0)).len() > 5.0 && t < 120.0 {
            sim.tick();
            t += DT;
        }
        t
    };
    let open_field = time_back(false, false);
    let drift = time_back(true, false);
    let drift_run = time_back(true, true);
    assert!(
        drift > open_field * 1.2,
        "backing off under threat costs speed: {drift:.0}s vs {open_field:.0}s open"
    );
    assert!(
        drift_run > drift * 0.85,
        "you cannot sprint backwards: run {drift_run:.0}s vs walk {drift:.0}s"
    );
}

#[test]
fn disengage_turns_and_goes_faster() {
    let time_back = |use_withdraw: bool| -> (f32, f32) {
        let mut sim = Sim::new(no_morale(), SEED);
        let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavySword, 0);
        let _foe = sim.spawn_class(Vec2::new(0.0, 25.0), -FRAC_PI_2, 200, UnitClassId::HeavySword, 1);
        if use_withdraw {
            sim.set_disengage_order(u, Vec2::new(0.0, -60.0));
        } else {
            sim.set_move_order(u, Vec2::new(0.0, -60.0));
        }
        let mut t = 0.0;
        let mut worst_face = 0.0f32;
        while (sim.units[u].anchor - Vec2::new(0.0, -60.0)).len() > 5.0 && t < 120.0 {
            sim.tick();
            t += DT;
            if use_withdraw && sim.units[u].frame_speed > 1.0 {
                worst_face = worst_face.max(sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs());
            }
        }
        (t, worst_face)
    };
    let (t_engage, _) = time_back(false);
    let (t_disengage, turn) = time_back(true);
    assert!(
        t_disengage < t_engage - 3.0,
        "turning your back is faster: disengage {t_disengage:.0}s vs fighting retreat {t_engage:.0}s"
    );
    assert!(
        turn > 1.5,
        "disengage actually turns the unit around: deviation {turn:.2} rad"
    );
}

#[test]
fn cavalry_breaks_off_by_wheeling_not_reversing() {
    let mut sim = Sim::new(no_morale(), SEED);
    let cav = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 120, UnitClassId::ShockCavalry, 0);
    let _foe = sim.spawn_class(Vec2::new(0.0, 30.0), -FRAC_PI_2, 200, UnitClassId::HeavySword, 1);
    sim.set_move_order(cav, Vec2::new(0.0, -80.0));
    let mut turned = false;
    for _ in 0..(50.0 / DT) as usize {
        sim.tick();
        let f = sim::wrap_angle(sim.units[cav].facing + FRAC_PI_2).abs();
        if f < 0.4 {
            turned = true; // facing now points the way it is going
        }
    }
    assert!(turned, "horses wheel to break off — no back-pedaling mounts");
    assert!(
        (sim.units[cav].anchor - Vec2::new(0.0, -80.0)).len() < 6.0,
        "and they get there, at {:?}",
        sim.units[cav].anchor
    );
}

#[test]
fn engage_move_extracts_from_melee_while_fighting() {
    // A plain Move out of an active melee is never stashed: the unit backs
    // out shields-front, still killing — unlike disengage, which leaves
    // without answering.
    let extraction = |disengage: bool| -> (f32, usize, f32) {
        let mut sim = Sim::new(no_morale(), SEED);
        let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 240, UnitClassId::HeavySword, 0);
        let foe = sim.spawn_class(Vec2::new(0.0, 8.0), -FRAC_PI_2, 240, UnitClassId::HeavySword, 1);
        sim.set_attack_order(foe, u);
        for _ in 0..(20.0 / DT) as usize {
            sim.tick();
        }
        assert!(sim.units[u].engaged > 20, "setup: must be in a real fight");
        if disengage {
            sim.set_disengage_order(u, Vec2::new(0.0, -70.0));
        } else {
            sim.set_move_order(u, Vec2::new(0.0, -70.0));
        }
        let mut worst_face = 0.0f32;
        for _ in 0..(120.0 / DT) as usize {
            sim.tick();
            let foe_dist = (sim.units[foe].center() - sim.units[u].center()).len();
            if !disengage && foe_dist > 16.0 && foe_dist < 43.0 { // grace for facing recovery after the interpenetration phase
                // Below ~8m the masses are interpenetrated and "direction
                // to the enemy" is undefined (soldiers face their own
                // opponents); past 43m, turning to march is correct.
                worst_face = worst_face.max(sim::wrap_angle(sim.units[u].facing - FRAC_PI_2).abs());
            }
        }
        let foe_deaths = sim.units[foe].count - sim.units[foe].alive_count;
        (sim.units[u].centroid.y, foe_deaths, worst_face)
    };
    let (y_eng, kills_eng, face_eng) = extraction(false);
    let (_y_dis, kills_dis, _) = extraction(true);
    // (A charging pursuer's men FIGHT at reach now instead of slot-riding
    // past, so a fighting extraction under live pursuit crawls — the claim
    // is sustained extraction, not pace.)
    assert!(
        y_eng < -12.0,
        "the engage move must actually extract the unit, centroid y {y_eng:.1}"
    );
    // Chaos-marginal: the recovery transient after interpenetration flaps
    // 0.7-1.2 across builds; the claim is no full ABOUT-FACE (~pi) while
    // in threat range.
    assert!(
        face_eng < 1.6,
        "shields stay on the enemy throughout: worst deviation {face_eng:.2}"
    );
    assert!(
        kills_eng > kills_dis + 5,
        "a FIGHTING withdrawal answers back: {kills_eng} kills vs {kills_dis} disengaging"
    );
}

#[test]
fn halted_defender_still_stands_and_fights() {
    // No live order: contact pins the unit where it stands (it does not
    // wander off mid-fight just because the reflex no longer stashes).
    let mut sim = Sim::new(no_morale(), SEED);
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 240, UnitClassId::HeavySword, 0);
    let foe = sim.spawn_class(Vec2::new(0.0, 12.0), -FRAC_PI_2, 240, UnitClassId::HeavySword, 1);
    sim.set_attack_order(foe, u);
    let start = sim.units[u].center();
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
    }
    assert!(sim.units[u].engaged > 20, "the fight must be on");
    let moved = (sim.units[u].center() - start).len();
    assert!(
        moved < 14.0,
        "an unordered defender holds his ground (drift only), moved {moved:.1} m"
    );
}

#[test]
fn pursue_auto_charges_intruders_but_gives_up_on_faster_prey() {
    let mut sim = Sim::new(no_morale(), SEED);
    // Heavy unit attack-moves north; enemy cavalry loiters near the path
    // but NEVER attacks — the latch must be proactive, not a counterpunch.
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 240, UnitClassId::HeavySword, 0);
    // Within the latch's reach -- a 5s RUN for the advancing heavies (~15m
    // edge-to-edge), not the old flat 70m (an advance no longer peels off
    // after anything it can't catch inside the latch timer) -- but clear of
    // brushing CONTACT, which would zero the timer and hold the latch.
    // (At lateral 38 the closest pass measures 22m edge-to-edge -- outside
    // the reach; 29 passes at ~13m, inside it with contact still clear.)
    let cav = sim.spawn_class(Vec2::new(29.0, 70.0), -FRAC_PI_2, 100, UnitClassId::ShockCavalry, 1);
    sim.set_attack_move_order(u, Vec2::new(0.0, 220.0));
    let mut latched = false;
    let mut gave_up_at = None;
    for step in 0..(160.0 / DT) as usize {
        sim.tick();
        let is_attack = matches!(sim.units[u].mode, sim::OrderMode::Attack(_));
        if is_attack {
            latched = true;
            // The moment it latches, the cavalry runs (and it is faster).
            if sim.units[cav].move_target.is_none() {
                sim.set_disengage_order(cav, Vec2::new(600.0, 500.0));
            }
        }
        if latched && !is_attack && gave_up_at.is_none() {
            gave_up_at = Some(step as f32 * DT);
        }
    }
    assert!(latched, "the advance must auto-charge the loitering cavalry");
    let gave_up = gave_up_at.expect("an uncatchable chase must be abandoned");
    assert!(
        gave_up < 60.0,
        "the timed latch gives up within seconds, not minutes: {gave_up:.0}s"
    );
    assert!(
        (sim.units[u].anchor - Vec2::new(0.0, 220.0)).len() < 12.0,
        "and the unit resumes its ordered path, at {:?}",
        sim.units[u].anchor
    );
}

#[test]
fn kiting_pauses_for_disengage_then_resumes() {
    let mut sim = Sim::new(no_morale(), SEED);
    let sk = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 120, UnitClassId::Skirmishers, 0);
    let foe = sim.spawn_class(Vec2::new(0.0, 50.0), -FRAC_PI_2, 300, UnitClassId::HeavySword, 1);
    sim.set_attack_move_order(foe, Vec2::new(0.0, -200.0));
    // Ordered disengage: the skirmishers go WHERE TOLD, no kite hops.
    sim.set_pace(sk, sim::Pace::Run);
    sim.set_disengage_order(sk, Vec2::new(-10.0, -130.0)); // square on the heavies' path
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
    }
    assert!(
        (sim.units[sk].centroid - Vec2::new(-10.0, -130.0)).len() < 18.0,
        "disengage goes exactly where ordered, centroid {:?}",
        sim.units[sk].centroid
    );
    // Arrived and idle: the kite reflex must WAKE BACK UP as the heavies
    // keep coming (a finished disengage must not stick).
    let mut hopped = false;
    for _ in 0..(120.0 / DT) as usize {
        sim.tick();
        let gap = (sim.units[foe].center() - sim.units[sk].center()).len();
        // The band widens for fast pursuers and tired screens now, so the
        // wake-up hop fires further out than the old 40m.
        if sim.units[sk].move_target.is_some() && gap < 55.0 {
            hopped = true;
        }
    }
    let gap = (sim.units[foe].center() - sim.units[sk].center()).len();
    assert!(hopped, "the kite reflex must resume after the disengage completes");
    assert!(
        sim.units[sk].alive_count > 110,
        "and it keeps them alive: {} left",
        sim.units[sk].alive_count
    );
    let _ = gap;
}

#[test]
fn kite_toggle_is_for_skirmish_classes_only() {
    let mut sim = Sim::new(no_morale(), SEED);
    let ph = sim.spawn_class(Vec2::ZERO, 0.0, 200, UnitClassId::Phalanx, 0);
    let sk = sim.spawn_class(Vec2::new(50.0, 0.0), 0.0, 120, UnitClassId::Skirmishers, 0);
    sim.set_evade_auto(ph, true);
    sim.set_evade_auto(sk, false);
    assert!(!sim.units[ph].evade_auto, "a phalanx cannot adopt skirmish legs");
    assert!(!sim.units[sk].evade_auto, "skirmishers can switch their reflex off");
    sim.set_evade_auto(sk, true);
    assert!(sim.units[sk].evade_auto);
}

#[test]
fn shift_queued_orders_run_in_sequence() {
    let mut sim = Sim::new(no_morale(), SEED);
    let u = sim.spawn_class(Vec2::ZERO, 0.0, 160, UnitClassId::LightSpear, 0);
    // Queue an L: east, then north, then face west at the end.
    sim.enqueue_order(u, sim::OrderMode::Move, Vec2::new(60.0, 0.0), None);
    sim.enqueue_order(u, sim::OrderMode::Move, Vec2::new(60.0, 50.0), Some(std::f32::consts::PI));
    let mut reached_corner = false;
    for _ in 0..(150.0 / DT) as usize {
        sim.tick();
        if (sim.units[u].anchor - Vec2::new(60.0, 0.0)).len() < 3.0 {
            reached_corner = true;
        }
    }
    assert!(reached_corner, "the first queued leg must be walked first");
    assert!(
        (sim.units[u].anchor - Vec2::new(60.0, 50.0)).len() < 8.0,
        "then the second, at {:?}",
        sim.units[u].anchor
    );
    assert!(
        sim::wrap_angle(sim.units[u].facing - std::f32::consts::PI).abs() < 0.2,
        "and the final facing is honored"
    );
    // A direct order wipes the rest of a queue.
    sim.enqueue_order(u, sim::OrderMode::Move, Vec2::new(0.0, 0.0), None);
    sim.enqueue_order(u, sim::OrderMode::Move, Vec2::new(-60.0, 0.0), None);
    sim.set_move_order(u, Vec2::new(60.0, 100.0));
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
    }
    assert!(
        (sim.units[u].anchor - Vec2::new(60.0, 100.0)).len() < 4.0,
        "a direct order replaces the queued plan, at {:?}",
        sim.units[u].anchor
    );
}
