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
    // Same matchup, only the stance differs: the pressing unit walks the
    // enemy line back farther than the fencing one.
    let enemy_displacement = |stance: sim::Stance| -> f32 {
        let mut sim = Sim::new(no_morale(), SEED);
        let a = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, 240, UnitClassId::HeavyInfantry, 0);
        let b = sim.spawn_class(Vec2::new(0.0, 12.0), -FRAC_PI_2, 120, UnitClassId::LightInfantry, 1);
        sim.set_stance(a, stance);
        sim.set_charge_enabled(a, false); // isolate the stance variable
        let before = living_mean(&sim, b).y;
        sim.set_attack_move_order(a, Vec2::new(0.0, 30.0));
        run(&mut sim, 40.0);
        living_mean(&sim, b).y - before
    };
    let pressed = enemy_displacement(sim::Stance::Othismos);
    let fenced = enemy_displacement(sim::Stance::Fence);
    assert!(
        pressed > fenced + 0.8,
        "othismos must out-shove fencing: pressed {pressed:.2} m vs fenced {fenced:.2} m"
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
    // Footprint-identical comparison (a rotated facing would also rotate the
    // formation rectangle): victim faces the attacker vs faces away.
    // Shields cover the front arc and turning takes time, so rear attacks
    // land unblocked on men facing the wrong way.
    let fight = |victim_facing: f32| -> usize {
        let mut sim = Sim::new(no_morale(), SEED);
        let v = sim.spawn_class(Vec2::new(0.0, 10.0), victim_facing, 200, UnitClassId::HeavyInfantry, 0);
        let atk = sim.spawn_class(Vec2::new(0.0, -12.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
        sim.set_attack_move_order(atk, Vec2::new(0.0, 20.0));
        run(&mut sim, 60.0);
        deaths(&sim, v)
    };
    let frontal = fight(-FRAC_PI_2); // facing the attacker
    let rear = fight(FRAC_PI_2); // facing away
    assert!(
        rear as f32 > frontal as f32 * 1.2,
        "rear attacks must be deadlier: rear {rear} vs frontal {frontal}"
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
        let mut horse_dmg = 0.0;
        let mut rider_dmg = 0.0;
        for s in u.start..u.start + u.count {
            horse_dmg += (1.8 - sim.health[s]).max(0.0);
            rider_dmg += (1.1 - sim.rider_health[s]).max(0.0);
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
    // Both arms in Fence stance: the press lean is itself an explicit posture
    // (Othismos) tied to attack intent, so the clean invariant comparison is
    // fencing-attack vs fencing-walk-in. No hidden combat bonuses allowed.
    let build = |use_attack_order: bool| -> Sim {
        let mut sim = Sim::new(no_morale(), SEED);
        let a = sim.spawn_class(Vec2::new(0.0, -15.0), FRAC_PI_2, 150, UnitClassId::HeavyInfantry, 0);
        let b = sim.spawn_class(Vec2::new(0.0, 15.0), -FRAC_PI_2, 150, UnitClassId::HeavyInfantry, 1);
        sim.set_stance(a, sim::Stance::Fence);
        sim.set_charge_enabled(a, false); // charge is attack-gated by design
        if use_attack_order {
            sim.set_attack_order(a, b);
        } else {
            sim.set_move_order(a, sim.units[b].anchor);
        }
        run(&mut sim, 60.0);
        sim
    };
    let via_attack = build(true);
    let via_walk = build(false);
    // The latch re-chases a drifting anchor mid-fight, so paths can differ by
    // centimeters — but combat effectiveness must be equivalent: no hidden
    // bonuses on the attack order.
    let (a_atk, b_atk) = (deaths(&via_attack, 0), deaths(&via_attack, 1));
    let (a_walk, b_walk) = (deaths(&via_walk, 0), deaths(&via_walk, 1));
    let close = |x: usize, y: usize| {
        let hi = x.max(y) as f32;
        let lo = x.min(y) as f32;
        hi - lo <= (0.2 * hi).max(4.0)
    };
    assert!(
        close(a_atk, a_walk) && close(b_atk, b_walk),
        "attack order must equal walking in: attacker losses {a_atk} vs {a_walk}, victim {b_atk} vs {b_walk}"
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
    sim.set_pace(a, sim::Pace::Run);
    sim.set_disengage_order(a, Vec2::new(0.0, -80.0));
    run(&mut sim, 40.0);
    assert!(
        sim.units[a].engaged < 5,
        "withdrawing unit must break contact, engaged {}",
        sim.units[a].engaged
    );
    let mean = living_mean(&sim, a);
    assert!(mean.y < -25.0, "withdrawing unit must actually leave, at y {:.1}", mean.y);
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
        sim.set_attack_move_order(a, Vec2::new(0.0, 25.0));
        run(&mut sim, 60.0);
        deaths(&sim, sk)
    };
    let by_longswords = kills_against_skirm(UnitClassId::LongSwords);
    let by_heavies = kills_against_skirm(UnitClassId::HeavyInfantry);
    assert!(
        by_longswords as f32 > by_heavies as f32 * 1.2,
        "wide arcs must cleave loose enemies: longswords {by_longswords} vs heavies {by_heavies}"
    );

    // Crush cost 1 — pressure kills evade: long swords shoved onto the enemy
    // by a rear press (Withdraw-mode pusher parked on their backs, never
    // attacking) die faster than a free-fighting line.
    let ls_losses = |pressed: bool| -> (usize, f32) {
        let mut sim = Sim::new(no_morale(), SEED);
        let ls = sim.spawn_class(Vec2::new(0.0, -8.0), FRAC_PI_2, 120, UnitClassId::LongSwords, 0);
        let enemy = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 300, UnitClassId::HeavyInfantry, 1);
        let _ = enemy;
        sim.set_attack_move_order(ls, Vec2::new(0.0, 25.0));
        if pressed {
            // The long swords FIGHT at the enemy line (y near 8-10), so the
            // press destination is there: the pusher's front ranks bodily
            // overlap their fighting rear ranks all fight long.
            let pusher = sim.spawn_class(Vec2::new(0.0, -22.0), FRAC_PI_2, 400, UnitClassId::HeavyInfantry, 0);
            sim.set_pace(pusher, sim::Pace::Run); // drive the press home
            sim.set_disengage_order(pusher, Vec2::new(0.0, 7.0));
        }
        run(&mut sim, 35.0);
        let u = &sim.units[ls];
        let mut press = 0.0;
        let mut n = 0;
        for i in u.start..u.start + u.count {
            if sim.alive[i] == 1 {
                press += sim.pressure[i];
                n += 1;
            }
        }
        let mid_pressure = press / n.max(1) as f32;
        run(&mut sim, 25.0);
        (deaths(&sim, ls), mid_pressure)
    };
    let (free_losses, free_press) = ls_losses(false);
    let (pressed_losses, pressed_press) = ls_losses(true);
    assert!(
        pressed_press > free_press * 1.5,
        "the rear press must register as crowd pressure: {pressed_press:.2} vs {free_press:.2} m/s"
    );
    assert!(
        pressed_losses as f32 > free_losses as f32 * 1.05,
        "crushed swordsmen cannot evade: pressed losses {pressed_losses} vs free {free_losses}"
    );

    // Crush cost 2 — lateral packing obstructs the swing: two long-sword
    // units interleaved in the same ground kill far less than twice one.
    let kills = |doubled: bool| -> usize {
        let mut sim = Sim::new(no_morale(), SEED);
        let a = sim.spawn_class(Vec2::new(0.0, -8.0), FRAC_PI_2, 120, UnitClassId::LongSwords, 0);
        let mut bsel = None;
        if doubled {
            bsel = Some(sim.spawn_class(Vec2::new(0.75, -8.7), FRAC_PI_2, 120, UnitClassId::LongSwords, 0));
        }
        let enemy = sim.spawn_class(Vec2::new(0.0, 10.0), -FRAC_PI_2, 400, UnitClassId::HeavyInfantry, 1);
        sim.set_attack_move_order(a, Vec2::new(0.0, 25.0));
        if let Some(b) = bsel {
            sim.set_attack_move_order(b, Vec2::new(0.0, 25.0));
        }
        run(&mut sim, 60.0);
        deaths(&sim, enemy)
    };
    let solo = kills(false);
    let packed = kills(true);
    assert!(
        (packed as f32) < solo as f32 * 1.6,
        "packed great swords obstruct each other: doubled force killed {packed} vs solo {solo}"
    );
}

#[test]
fn charge_bursts_only_in_the_final_approach_of_an_attack() {
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(Vec2::new(0.0, -80.0), FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 0);
    let b = sim.spawn_class(Vec2::new(0.0, 20.0), -FRAC_PI_2, 200, UnitClassId::HeavyInfantry, 1);
    let _ = b;
    sim.set_attack_order(a, b);
    let run_speed_cap = 1.7 * 0.9 + 0.2; // walk pace for heavies + slack
    let mut peak_far = 0.0f32;
    let mut peak_near = 0.0f32;
    for _ in 0..(70.0 / DT) as usize {
        sim.tick();
        let u = &sim.units[a];
        let dist = (sim.units[b].anchor - u.anchor).len();
        if dist > 25.0 {
            peak_far = peak_far.max(u.speed);
        } else if dist > 6.0 {
            peak_near = peak_near.max(u.speed);
        }
    }
    assert!(
        peak_far < run_speed_cap,
        "no burst outside the charge window: peak {peak_far:.2}"
    );
    assert!(
        peak_near > run_speed_cap + 0.8,
        "the final approach must be a charge: peak {peak_near:.2}"
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
        peak = peak.max(sim.units[a].speed);
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
