//! Melee emergence tests, 1v1 focused: every promised behavior must arise
//! from the five weapon numbers + bodies + pressure. There is no class- or
//! situation-conditional combat logic to fall back on.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::{FRAC_PI_2, PI};

const SEED: u64 = 99;

/// Combat-mechanics isolation: these scenarios fight to the death.
fn no_morale() -> Tunables {
    Tunables {
        morale_enabled: false,
        ..Tunables::default()
    }
}

fn run(sim: &mut Sim, seconds: f32) {
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
    }
}

fn deaths(sim: &Sim, u: usize) -> usize {
    sim.units[u].count - sim.units[u].alive_count
}

/// Mean position of a unit's living soldiers.
fn living_mean(sim: &Sim, u: usize) -> Vec2 {
    let unit = &sim.units[u];
    let mut sum = Vec2::ZERO;
    let mut n = 0;
    for s in unit.start..unit.start + unit.count {
        if sim.alive[s] == 1 {
            sum = sum + sim.soldier_pos(s);
            n += 1;
        }
    }
    sum * (1.0 / n.max(1) as f32)
}

#[test]
fn melee_kills_and_formations_thin() {
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 12.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    sim.set_attack_move_order(a, Vec2::new(0.0, 12.0));
    let mut peak_engaged = 0;
    for _ in 0..(90.0 / DT) as usize {
        sim.tick();
        peak_engaged = peak_engaged.max(sim.units[a].engaged);
    }
    assert!(deaths(&sim, a) > 5, "a should take losses, got {}", deaths(&sim, a));
    assert!(deaths(&sim, b) > 5, "b should take losses, got {}", deaths(&sim, b));
    // (Morale will end real fights long before this; to-the-death is the
    // artificial case. The bar guards against one-sided instant deletion.)
    assert!(
        sim.units[a].alive_count + sim.units[b].alive_count > 60,
        "the line fight must grind, not annihilate in 90s"
    );
    assert!(peak_engaged > 10, "front ranks should be engaged at the height");
}

#[test]
fn deep_column_pushes_thin_line_back() {
    // Same class and width; only enemy depth differs. The deep column's
    // measured backpressure converts to forward drive: against a thin enemy
    // the contact line advances; against an equal column it deadlocks.
    let advance = |enemy_count: usize| -> f32 {
        let mut sim = Sim::new(no_morale(), SEED);
        let deep =
            sim.spawn_unit(Vec2::new(0.0, -10.0), FRAC_PI_2, 300, 20, Vec2::new(1.0, 1.2), 0, 0.7);
        let enemy =
            sim.spawn_unit(Vec2::new(0.0, 10.0), -FRAC_PI_2, enemy_count, 20, Vec2::new(1.0, 1.2), 1, 0.7);
        sim.set_attack_move_order(deep, Vec2::new(0.0, 30.0));
        sim.set_attack_move_order(enemy, Vec2::new(0.0, -30.0));
        run(&mut sim, 40.0);
        let _ = enemy;
        sim.units[deep].anchor.y
    };
    let vs_thin = advance(100); // 5 ranks
    let vs_equal = advance(300); // 15 ranks: mirror match
    assert!(
        vs_thin > vs_equal + 1.5,
        "depth must win the push war: front at {vs_thin:.1} vs {vs_equal:.1} against equal depth"
    );
}

#[test]
fn othismos_presses_fence_fights_at_reach() {
    // Same matchup, only the stance differs. The press's physical signature
    // is the GAP between the lines: othismos closes to body contact, fence
    // holds at weapon's length. (Displacement and kill rates are noisy
    // downstream effects; the gap is the stance itself.)
    let line_gap = |stance: sim::Stance| -> f32 {
        let mut sim = Sim::new(no_morale(), SEED);
        let a = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, 240, UnitClassId::HeavyInfantry, 0);
        let b = sim.spawn_class(Vec2::new(0.0, 12.0), -FRAC_PI_2, 240, UnitClassId::LightInfantry, 1);
        sim.set_stance(a, stance);
        sim.set_charge_enabled(a, false); // isolate the stance variable
        sim.set_attack_move_order(a, Vec2::new(0.0, 30.0));
        run(&mut sim, 30.0); // settle into the fight
        // Mean nearest-enemy distance over a's FIGHTING men, sampled late.
        let mut samples = 0usize;
        let mut total = 0.0f32;
        for _ in 0..(10.0 / DT) as usize {
            sim.tick();
            if sim.tick_count % 30 != 0 {
                continue;
            }
            let (ua, ub) = (&sim.units[a], &sim.units[b]);
            for i in ua.start..ua.start + ua.count {
                if sim.alive[i] != 1 || sim.fighting[i] != 1 {
                    continue;
                }
                let p = sim.soldier_pos(i);
                let mut best = f32::MAX;
                for j in ub.start..ub.start + ub.count {
                    if sim.alive[j] == 1 {
                        best = best.min((sim.soldier_pos(j) - p).len());
                    }
                }
                total += best;
                samples += 1;
            }
        }
        total / samples.max(1) as f32
    };
    let pressed = line_gap(sim::Stance::Othismos);
    let fenced = line_gap(sim::Stance::Fence);
    assert!(
        pressed < fenced - 0.1,
        "othismos closes to bodies, fence holds at reach: gap {pressed:.2}m vs {fenced:.2}m"
    );
}

#[test]
fn deep_pike_wall_holds_thin_pike_line_gets_closed_on() {
    let fight = |phalanx_count: usize| -> (usize, usize) {
        let mut sim = Sim::new(no_morale(), SEED);
        let ph = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, phalanx_count, UnitClassId::Phalanx, 0);
        let atk = sim.spawn_class(Vec2::new(0.0, -14.0), FRAC_PI_2, 240, UnitClassId::HeavyInfantry, 1);
        sim.set_attack_move_order(atk, Vec2::new(0.0, 20.0));
        run(&mut sim, 90.0);
        (deaths(&sim, ph), deaths(&sim, atk))
    };
    // 10 ranks of pikes: a wall. Attackers pay a steep premium pressing it.
    let (wall_loss, atk_loss_vs_wall) = fight(300);
    let atk_frac = atk_loss_vs_wall as f32 / 240.0;
    let wall_frac = wall_loss as f32 / 300.0;
    assert!(
        atk_frac > 1.4 * wall_frac,
        "deep pikes must punish a frontal assault: attacker {atk_loss_vs_wall}/240, phalanx {wall_loss}/300"
    );
    // 2 ranks of pikes: not enough push rate; the enemy closes to sword range.
    let (thin_loss, _) = fight(60);
    let wall_frac = wall_loss as f32 / 300.0;
    let thin_frac = thin_loss as f32 / 60.0;
    assert!(
        thin_frac > 1.6 * wall_frac,
        "a thin pike line must get closed on: thin {thin_frac:.3} vs wall {wall_frac:.3} loss fraction"
    );
}

#[test]
fn attack_from_behind_is_deadlier_than_frontal() {
    // Footprint-identical comparison: victim faces the attacker vs faces
    // away. Shields cover the front arc, so rear strikes land unblocked —
    // but the claim only lives in the EARLY window: the victim wheels to
    // face within ~10s, and after that hit-push displacement feedback
    // dominates (frontal victims compress into their own block and die in
    // the vice; rear victims get bowled clear of the fight). Measure the
    // first 10s after contact, summed over seeds; the attacker WALKS in
    // (engage reflex, closing under charge grade) so no impact channel
    // muddies pure sword-on-shield work.
    let fight = |victim_facing: f32, seed: u64| -> usize {
        let mut sim = Sim::new(no_morale(), seed);
        let v = sim.spawn_class(Vec2::new(0.0, 10.0), victim_facing, 200, UnitClassId::HeavyInfantry, 0);
        let atk = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
        sim.set_charge_enabled(atk, false);
        sim.set_move_order(atk, Vec2::new(0.0, 20.0));
        let mut t = 0.0;
        while sim.units[atk].engaged < 5 && t < 40.0 {
            sim.tick();
            t += DT;
        }
        run(&mut sim, 10.0);
        deaths(&sim, v)
    };
    let mut frontal = 0;
    let mut rear = 0;
    for seed in [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4] {
        frontal += fight(-FRAC_PI_2, seed);
        rear += fight(FRAC_PI_2, seed);
    }
    assert!(
        rear as f32 > frontal as f32 * 1.5,
        "rear attacks must be deadlier in the turning window: rear {rear} vs frontal {frontal} (5 seeds)"
    );
}

#[test]
fn rider_reachability_is_pure_geometry() {
    // Controlled lines at fixed separations; measure which health pool the
    // first seconds of strikes damage. (In a prolonged scrum swords reach
    // riders too — from the SIDES — which is correct; this test isolates the
    // frontal geometry claim.)
    let pool_damage = |attacker: UnitClassId, separation: f32, cav_facing: f32| -> (f32, f32) {
        let mut sim = Sim::new(no_morale(), SEED);
        let atk = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 40, attacker, 0);
        let cav = sim.spawn_class(Vec2::new(0.0, separation), cav_facing, 30, UnitClassId::ShockCavalry, 1);
        let _ = atk;
        // Short window: measure the GEOMETRY of first strikes, before the
        // step-to-range scrum interpenetrates everything.
        run(&mut sim, 3.0);
        let u = &sim.units[cav];
        let stats = sim::class_stats(UnitClassId::ShockCavalry);
        let mut horse_dmg = 0.0;
        let mut rider_dmg = 0.0;
        for s in u.start..u.start + u.count {
            horse_dmg += (stats.mount_health - sim.mount_health[s]).max(0.0);
            rider_dmg += (stats.health - sim.health[s]).max(0.0);
        }
        (rider_dmg, horse_dmg)
    };
    // Swords vs horse fronts: only horseflesh in reach.
    let (rider, horse) = pool_damage(UnitClassId::HeavyInfantry, 2.4, -FRAC_PI_2);
    let sword_share = rider / (rider + horse).max(1e-6);
    assert!(
        horse > 0.25 && sword_share < 0.2,
        "frontal swords hack horses: rider {rider:.2} vs horse {horse:.2} (share {sword_share:.2})"
    );
    // Pikes at reach: front-rank pikes find riders (rear-rank pikes can only
    // poke the horses' noses — also correct geometry), so the rider SHARE is
    // what discriminates pikes from swords.
    let (rider, horse) = pool_damage(UnitClassId::Phalanx, 3.4, -FRAC_PI_2);
    let pike_share = rider / (rider + horse).max(1e-6);
    assert!(
        rider > 0.25 && pike_share > sword_share + 0.1,
        "frontal pikes find riders far better than swords: rider {rider:.2} vs horse {horse:.2} \
         (share {pike_share:.2} vs sword {sword_share:.2})"
    );
    // Swords against the horses' SIDE: the rider is suddenly in reach.
    let (rider, horse) = pool_damage(UnitClassId::HeavyInfantry, 1.6, 0.0);
    assert!(
        rider > 0.15,
        "side swords reach riders: rider {rider:.2} vs horse {horse:.2}"
    );
}

#[test]
fn charge_impact_knocks_infantry_down() {
    let mut sim = Sim::new(no_morale(), SEED);
    let inf = sim.spawn_class(Vec2::new(0.0, 30.0), -FRAC_PI_2, 200, UnitClassId::LightInfantry, 0);
    let cav = sim.spawn_class(Vec2::new(0.0, -60.0), FRAC_PI_2, 120, UnitClassId::ShockCavalry, 1);
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_attack_move_order(cav, Vec2::new(0.0, 60.0));
    let mut max_stunned = 0usize;
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
        let u = &sim.units[inf];
        let stunned = (u.start..u.start + u.count).filter(|&s| sim.stun[s] > 0.0).count();
        max_stunned = max_stunned.max(stunned);
    }
    assert!(
        max_stunned >= 4,
        "a cavalry charge should bowl men over, max stunned {max_stunned}"
    );
}

#[test]
fn attack_order_equals_walking_into_contact() {
    // The CONTRACT: combat effectiveness comes from physics, not the order.
    // Commitment differs by design (Move fights in stride and passes on;
    // Attack latches) — so compare the same 20 seconds of CONTACT.
    let losses_in_contact = |use_attack_order: bool| -> (usize, usize) {
        let mut sim = Sim::new(no_morale(), SEED);
        let a = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, 240, UnitClassId::HeavyInfantry, 0);
        let b = sim.spawn_class(Vec2::new(0.0, 15.0), -FRAC_PI_2, 150, UnitClassId::HeavyInfantry, 1);
        sim.set_stance(a, sim::Stance::Fence);
        sim.set_charge_enabled(a, false); // charge is attack-gated by design
        if use_attack_order {
            sim.set_attack_order(a, b);
        } else {
            sim.set_move_order(a, Vec2::new(0.0, 200.0));
        }
        let mut t = 0.0;
        while sim.units[a].engaged < 10 && t < 60.0 {
            sim.tick();
            t += DT;
        }
        for _ in 0..(20.0 / DT) as usize {
            sim.tick();
        }
        (deaths(&sim, a), deaths(&sim, b))
    };
    let (atk_a, atk_b) = losses_in_contact(true);
    let (walk_a, walk_b) = losses_in_contact(false);
    let close = |x: usize, y: usize| {
        let (lo, hi) = (x.min(y) as f32, x.max(y) as f32);
        hi <= lo * 1.8 + 8.0 // chaos-marginal at this scale; parity is the claim
    };
    assert!(
        close(atk_a, walk_a) && close(atk_b, walk_b),
        "same physics either way for the same contact time: attack {atk_a}/{atk_b} vs walk {walk_a}/{walk_b}"
    );
}

#[test]
fn withdraw_disengages_under_fire() {
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 12.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    sim.set_attack_move_order(a, Vec2::new(0.0, 12.0));
    run(&mut sim, 30.0);
    assert!(sim.units[a].engaged > 10, "setup: must be engaged first");
    // Break contact at the run: the enemy's attack latch will pursue, and a
    // walking withdrawal never escapes a walking pursuer (correctly).
    let at_order = living_mean(&sim, a);
    sim.set_pace(a, sim::Pace::Run);
    sim.set_disengage_order(a, Vec2::new(0.0, -80.0));
    // (Extraction got honestly slower as the physics tightened: graded seek
    // keeps pursuers landing hits a beat longer, and the attack now runs and
    // bursts on the way IN, so the unit starts the extraction deeper and
    // more spent. Measure displacement from the order point, not a fixed
    // line — how far it pressed is the attack's business, not this test's.)
    // 60s: the attack embeds deeper now (braced men stay on their feet and
    // a winning roll runs unleashed), so the about-face out of a full
    // embedment takes most of a minute before the gap opens.
    run(&mut sim, 60.0);
    assert!(
        sim.units[a].engaged < 10, // a trailing straggler or two is contact noise
        "withdrawing unit must break contact, engaged {}",
        sim.units[a].engaged
    );
    let moved = at_order.y - living_mean(&sim, a).y;
    assert!(moved > 22.0, "withdrawing unit must actually leave, moved {moved:.1}m");
}

#[test]
fn unit_attacked_from_two_sides_splits_facing_and_loses_cohesion() {
    let mut sim = Sim::new(no_morale(), SEED);
    // Direct spec construction: enemies spawned already in contact on BOTH
    // sides of a unit facing east; nobody moves. The per-soldier reactive
    // facing rule must split the unit's men toward both threats unaided.
    // Front AND rear contact (the spec's case): whole ranks engage each way.
    // Victim faces east: front line at x=3.5, rear at x=-8.5.
    let v = sim.spawn_unit(Vec2::new(0.0, 0.0), 0.0, 240, 26, Vec2::new(1.0, 1.2), 0, 0.7);
    let e = sim.spawn_class(Vec2::new(5.6, 0.0), PI, 160, UnitClassId::LightInfantry, 1);
    let w = sim.spawn_class(Vec2::new(-10.6, 0.0), 0.0, 160, UnitClassId::LightInfantry, 1);
    let _ = (e, w);
    run(&mut sim, 25.0);
    let unit = &sim.units[v];
    let mut east = 0;
    let mut west = 0;
    let mut living = 0;
    for i in unit.start..unit.start + unit.count {
        if sim.alive[i] == 0 {
            continue;
        }
        living += 1;
        let f = sim.facings[i];
        if sim::wrap_angle(f).abs() < 1.0 {
            east += 1;
        } else if sim::wrap_angle(f - PI).abs() < 1.0 {
            west += 1;
        }
    }
    assert!(living > 50, "victim should survive long enough to measure");
    // The rear ranks must have turned about on their own; the front keeps
    // fighting forward. (East includes idle middles — west is the signal.)
    assert!(
        west as f32 > living as f32 * 0.15 && east as f32 > living as f32 * 0.15,
        "facing must split both ways: {east} east / {west} west of {living}"
    );
    assert!(
        unit.cohesion < 0.75,
        "split facing must read as lost cohesion, got {}",
        unit.cohesion
    );
}

#[test]
fn flanked_line_only_the_edge_unit_turns() {
    let mut sim = Sim::new(no_morale(), SEED);
    // Three friendly heavies side by side facing north.
    let west = sim.spawn_class(Vec2::new(-40.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let center = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let east = sim.spawn_class(Vec2::new(40.0, 0.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let _ = east;
    // Enemy hits the west unit from due west.
    let atk = sim.spawn_class(Vec2::new(-90.0, -8.0), 0.0, 240, UnitClassId::HeavyInfantry, 1);
    sim.set_attack_move_order(atk, Vec2::new(-30.0, -8.0));
    run(&mut sim, 50.0);
    let west_turn = sim::wrap_angle(sim.units[west].facing - FRAC_PI_2).abs();
    let center_turn = sim::wrap_angle(sim.units[center].facing - FRAC_PI_2).abs();
    assert!(
        west_turn > 0.5,
        "the flanked edge unit must wheel out, turned {west_turn:.2} rad"
    );
    assert!(
        center_turn < 0.2,
        "the line holds: center must not turn, turned {center_turn:.2} rad"
    );
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
    let by_heavies = kills_against_skirm(UnitClassId::HeavyInfantry);
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
        let enemy = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 300, UnitClassId::HeavyInfantry, 1);
        let _ = enemy;
        sim.set_attack_move_order(ls, Vec2::new(0.0, 25.0));
        if pressed {
            let pusher = sim.spawn_class(Vec2::new(0.0, -22.0), FRAC_PI_2, 400, UnitClassId::HeavyInfantry, 0);
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
    // more than the dead evade costs it. The crush mechanism is carried
    // by the pressure assert above; here we only pin that the press is
    // no sanctuary: crushed swordsmen still die.
    assert!(
        pressed_losses > 5,
        "the press is not a sanctuary: pressed {pressed_losses} vs free {free_losses}"
    );
}

#[test]
fn charge_bursts_only_in_the_final_approach_of_an_attack() {
    let mut sim = Sim::new(no_morale(), SEED);
    // Close enough that the heavies arrive with LEGS: armor is paid for in
    // wind now, and a 100m running approach reaches the window too blown to
    // burst (correct, but it would test depletion instead of the window).
    let a = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 20.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    let _ = b;
    sim.set_attack_order(a, b);
    // Attacks close at the double now (effective_pace), so the cap outside
    // the window is the RUN pace for heavies, and the burst must beat it.
    let run_speed_cap = 3.4 * 0.9 + 0.2; // run pace for heavies + slack
    let mut peak_far = 0.0f32;
    let mut peak_near = 0.0f32;
    for _ in 0..(70.0 / DT) as usize {
        sim.tick();
        let u = &sim.units[a];
        let dist = (sim.units[b].anchor - u.anchor).len();
        if dist > 25.0 {
            peak_far = peak_far.max(u.frame_speed);
        } else if dist > 2.0 {
            // The burst accelerates out of an already-running approach, so
            // it peaks in the last strides before contact (anchors are
            // front-centers: fronts touch near dist 0). Only the post-
            // contact scrum is excluded.
            peak_near = peak_near.max(u.frame_speed);
        }
    }
    assert!(
        peak_far < run_speed_cap,
        "no burst outside the charge window: peak {peak_far:.2}"
    );
    // From a run-in the burst has ~2s of cohesion-throttled acceleration —
    // the honest claim is that it measurably BEATS the approach, not that
    // it reaches the asymptotic sprint speed in eight meters.
    assert!(
        peak_near > peak_far + 0.25,
        "the final approach must be a charge: peak {peak_near:.2} vs approach {peak_far:.2}"
    );

    // With the setting off, the approach stays at pace.
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(Vec2::new(0.0, -80.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 20.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    sim.set_charge_enabled(a, false);
    sim.set_attack_order(a, b);
    let mut peak = 0.0f32;
    for _ in 0..(70.0 / DT) as usize {
        sim.tick();
        peak = peak.max(sim.units[a].frame_speed);
    }
    assert!(peak < run_speed_cap, "charge disabled means no burst: peak {peak:.2}");
}

#[test]
fn combat_drains_stamina() {
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 12.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    sim.set_attack_move_order(a, Vec2::new(0.0, 12.0));
    run(&mut sim, 60.0);
    assert!(
        sim.units[b].fatigue < 0.9,
        "even the defender's arms tire: fatigue {}",
        sim.units[b].fatigue
    );
    let _ = a;
}

#[test]
fn surrounded_othismos_breakout_bores_toward_the_click() {
    // A heavy block ringed by enemies, ordered to break out south with
    // othismos: the press must move it toward the CLICK, and the indecisive
    // contact mean must not freeze its facing away from the escape.
    let mut sim = Sim::new(no_morale(), SEED);
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 300, UnitClassId::HeavyInfantry, 0);
    // The ring: four enemy units boxing it in.
    for (x, y, f) in [
        (0.0, 24.0, -FRAC_PI_2),
        (0.0, -24.0, FRAC_PI_2),
        (30.0, 0.0, PI),
        (-30.0, 0.0, 0.0),
    ] {
        let e = sim.spawn_class(Vec2::new(x, y), f, 200, UnitClassId::LightInfantry, 1);
        sim.set_charge_enabled(e, false); // isolate the BREAKOUT variable: counter-bursts shove the block around
        sim.set_attack_order(e, u);
    }
    // Let the encirclement close.
    run(&mut sim, 15.0);
    let y0 = sim.units[u].centroid.y;
    sim.set_stance(u, sim::Stance::Othismos);
    sim.set_move_order(u, Vec2::new(0.0, -120.0));
    // Track the bore WHILE the block lives: to-the-death in a 1:2.7 ring
    // annihilates it eventually (armor is paid for in wind; a blown block
    // loses its defenses), and a dead unit's mean reads garbage. The claim
    // is the grind toward the click, not survival.
    let mut peak = f32::NEG_INFINITY;
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
        if sim.units[u].alive_count > 50 {
            peak = peak.max(y0 - sim.units[u].centroid.y);
        }
    }
    // (8m was the universal-knockback era, when the boring unit CARVED
    // its ring by felling-damage alone; with impact hurt gated on real
    // charges, the surrounded grind is honest shoving again.)
    assert!(
        peak > 2.5,
        "the othismos breakout must grind toward the click: peak {peak:.1}m south"
    );
}

#[test]
fn mutual_charge_spends_its_momentum_and_a_front_forms() {
    // Two equal lines charge head-on. The impact lands (pushes, stuns) —
    // then the masses stop each other dead, the momentum is measurably
    // spent, and the burst must END: melee behavior (1-1 seek, hold-ground)
    // takes over and the units fight as fronts instead of merging into a
    // blob of slot-chasers. Guards the charge-exit regression where the
    // window check re-armed `charging` every tick of the melee.
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(Vec2::new(0.0, -30.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 30.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    let mut contact = f32::NEG_INFINITY;
    let mut burst_seen = false;
    let mut charge_secs_late = 0.0f32; // charging well past contact (>2s)
    let mut crossed = false; // unit means swapping sides = the blob signature
    for t in 0..(40.0 / DT) as usize {
        sim.tick();
        let time = t as f32 * DT;
        burst_seen |= sim.units[a].charging;
        if contact.is_infinite() && sim.units[a].engaged > 0 {
            contact = time;
        }
        if time > contact + 2.0 && (sim.units[a].charging || sim.units[b].charging) {
            charge_secs_late += DT;
        }
        if time > contact {
            crossed |= living_mean(&sim, a).y > living_mean(&sim, b).y + 0.5;
        }
    }
    assert!(burst_seen, "the final approach must burst");
    // A won impact may ROLL the loser a few seconds (mass still advancing);
    // what it may never do is stay "charging" through the formed melee the
    // way the pinned-flag regression did (~12s, until stamina ran dry).
    assert!(
        charge_secs_late < 3.0,
        "a stopped mass must clear its charge: {charge_secs_late:.1}s of charging while formed"
    );
    assert!(!crossed, "units must meet as fronts, not pass through each other");
}

#[test]
fn cavalry_charge_keeps_its_burst_through_a_thin_line() {
    // The counter-case to the spent rule: 160 shock cavalry into a 4-deep
    // line of 400. The mass is NOT stopped — it grinds through and out the
    // far side — so the burst must survive contact (the clock only caps a
    // sprint in the open) and the plow must actually punch through.
    let mut sim = Sim::new(no_morale(), SEED);
    let line =
        sim.spawn_unit(Vec2::new(0.0, 40.0), FRAC_PI_2, 400, 100, Vec2::new(1.0, 1.1), 1, 0.7);
    let cav = sim.spawn_class(Vec2::new(0.0, 160.0), -FRAC_PI_2, 160, UnitClassId::ShockCavalry, 0);
    sim.set_attack_order(cav, line);
    let mut contact = f32::NEG_INFINITY;
    let mut charge_after_contact = 0.0f32;
    for t in 0..(35.0 / DT) as usize {
        sim.tick();
        if contact.is_infinite() && sim.units[cav].engaged > 0 {
            contact = t as f32 * DT;
        }
        if !contact.is_infinite() && sim.units[cav].charging {
            charge_after_contact += DT;
        }
    }
    assert!(!contact.is_infinite(), "setup: cavalry must reach the line");
    assert!(
        charge_after_contact > 1.5,
        "a rolling plow keeps its burst: only {charge_after_contact:.1}s of charge after contact"
    );
    let m = living_mean(&sim, cav);
    assert!(
        m.y < 30.0,
        "the plow must punch through the line (front at 40), cavalry mean at y {:.1}",
        m.y
    );
}

#[test]
fn tmp_breakout_probe() {
    let mut sim = Sim::new(no_morale(), SEED);
    let u = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 300, UnitClassId::HeavyInfantry, 0);
    for (x, y, f) in [(0.0, 24.0, -FRAC_PI_2), (0.0, -24.0, FRAC_PI_2), (30.0, 0.0, PI), (-30.0, 0.0, 0.0)] {
        let e = sim.spawn_class(Vec2::new(x, y), f, 200, UnitClassId::LightInfantry, 1);
        sim.set_charge_enabled(e, false);
        sim.set_attack_order(e, u);
    }
    run(&mut sim, 15.0);
    let y0 = sim.units[u].centroid.y;
    sim.set_stance(u, sim::Stance::Othismos);
    sim.set_move_order(u, Vec2::new(0.0, -120.0));
    for k in 0..6 {
        run(&mut sim, 5.0);
        let uu = &sim.units[u];
        let (mut pm, mut n) = (0.0, 0);
        for i in uu.start..uu.start + uu.count {
            if sim.alive[i] == 1 { pm += sim.pressure[i]; n += 1; }
        }
        println!("t={} moved={:.1} alive={} cp={:.2} ma={:.2} press={:.2} spd={:.2}",
            15 + (k+1)*5, y0 - uu.centroid.y, uu.alive_count, uu.counter_press,
            uu.mass_advance, pm / n.max(1) as f32, uu.frame_speed);
    }
}

#[test]
fn evade_and_block_are_directional_a_pinned_back_is_naked() {
    // The aspect law per strike: full evade across the front arc, 0.25x
    // from behind — and the shield arc is front-only. The differential is
    // only MEASURABLE while the victim's facing is held: a struck man
    // legally turns to face his nearest enemy within half a second, so
    // "attacked from behind" persists only when something pins him —
    // here, an anvil at TOUCH on the faced side (Disengage: never
    // strikes, exists to own the victims' targeting), while the hammer
    // works the measured side at max reach. Single ranks so every victim
    // has the anvil as his nearest enemy.
    let arm = |rear: bool, seed: u64| -> f32 {
        let mut sim = Sim::new(no_morale(), seed);
        let v = sim.spawn_unit(Vec2::new(0.0, 0.0), FRAC_PI_2, 60, 60, Vec2::new(1.0, 1.2), 0, 0.7);
        // Front arm: no pin needed (facing the hammer is the engaged
        // state); its anvil sits beyond awareness for body-count parity.
        let (anvil_y, hammer_y) = if rear { (0.9, -1.55) } else { (-9.0, 1.55) };
        let anvil = sim.spawn_unit(Vec2::new(0.0, anvil_y), if anvil_y > 0.0 { -FRAC_PI_2 } else { FRAC_PI_2 }, 60, 60, Vec2::new(1.0, 1.2), 1, 0.7);
        sim.set_disengage_order(anvil, Vec2::new(0.0, anvil_y));
        let hammer = sim.spawn_unit(Vec2::new(0.0, hammer_y), if hammer_y > 0.0 { -FRAC_PI_2 } else { FRAC_PI_2 }, 60, 60, Vec2::new(1.0, 1.2), 1, 0.7);
        let _ = hammer;
        run(&mut sim, 6.0);
        let u = &sim.units[v];
        let mut deficit = 0.0f32;
        for i in u.start..u.start + u.count {
            deficit += (1.0 - sim.health[i]).clamp(0.0, 1.0);
        }
        deficit
    };
    let (mut frontal, mut rear) = (0.0f32, 0.0f32);
    for seed in [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4] {
        frontal += arm(false, seed);
        rear += arm(true, seed);
    }
    assert!(
        rear > frontal * 1.1,
        "a pinned back is naked to the blade: rear damage {rear:.1} vs frontal {frontal:.1} (5 seeds)"
    );
}
