//! Missile emergence tests: projectiles are physical objects — density,
//! shields, and geometry decide everything.

use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 1234;

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

#[test]
fn archers_kill_at_range_and_spend_ammo() {
    let mut sim = Sim::new(no_morale(), SEED);
    let archers = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 240, UnitClassId::Archers, 0);
    let target = sim.spawn_class(Vec2::new(0.0, 100.0), -FRAC_PI_2, 400, UnitClassId::LightSpear, 1);
    let ammo0 = sim.units[archers].ammo;
    run(&mut sim, 60.0);
    assert!(
        deaths(&sim, target) > 20,
        "sustained volleys must kill: {} dead",
        deaths(&sim, target)
    );
    assert!(sim.units[archers].ammo < ammo0, "ammo must be spent");
    assert_eq!(deaths(&sim, archers), 0, "no melee, no archer losses");
}

#[test]
fn dense_blocks_take_more_arrows_than_loose_order() {
    // Same headcount, same frontage exposure time; only spacing differs.
    let losses = |spacing: f32| -> usize {
        let mut sim = Sim::new(no_morale(), SEED);
        let archers = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 240, UnitClassId::Archers, 0);
        let target =
            sim.spawn_unit(Vec2::new(0.0, 90.0), -FRAC_PI_2, 300, 20, Vec2::new(spacing, spacing), 1, 0.6);
        let _ = archers;
        run(&mut sim, 50.0);
        deaths(&sim, target)
    };
    let dense = losses(0.8);
    let loose = losses(2.0);
    assert!(
        dense as f32 > loose as f32 * 1.4,
        "density is the missile's friend: dense {dense} vs loose {loose}"
    );
}

#[test]
fn shields_block_frontal_volleys_not_rear_ones() {
    let losses = |facing: f32| -> usize {
        let mut sim = Sim::new(no_morale(), SEED);
        // Heavy infantry: big shields (block 0.45).
        let target = sim.spawn_class(Vec2::new(0.0, 90.0), facing, 300, UnitClassId::HeavySword, 1);
        let archers = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 240, UnitClassId::Archers, 0);
        let _ = archers;
        run(&mut sim, 50.0);
        deaths(&sim, target)
    };
    let shields_front = losses(-FRAC_PI_2); // facing the archers
    let shields_away = losses(FRAC_PI_2); // backs turned
    assert!(
        shields_away as f32 > shields_front as f32 * 1.35,
        "arrows in the back: {shields_away} vs shielded {shields_front}"
    );
}

#[test]
fn volleys_near_a_melee_hold_but_arrows_do_not_discriminate() {
    // Fire discipline: a target unit tangled with friends is not volleyed.
    let mut sim = Sim::new(no_morale(), SEED);
    let archers = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 200, UnitClassId::Archers, 0);
    let friend = sim.spawn_class(Vec2::new(0.0, 80.0), FRAC_PI_2, 200, UnitClassId::HeavySword, 0);
    let enemy = sim.spawn_class(Vec2::new(0.0, 95.0), -FRAC_PI_2, 200, UnitClassId::HeavySword, 1);
    sim.set_attack_move_order(friend, Vec2::new(0.0, 95.0));
    run(&mut sim, 40.0);
    assert!(sim.units[enemy].engaged > 10, "setup: melee underway");
    // Volleys before contact were legal; once friends are in the tangle the
    // captain holds fire.
    let ammo_at_contact = sim.units[archers].ammo;
    run(&mut sim, 25.0);
    assert_eq!(
        sim.units[archers].ammo, ammo_at_contact,
        "the captain holds fire into a melee that involves friends"
    );
}

#[test]
fn skirmishers_kite_heavy_infantry() {
    let mut sim = Sim::new(no_morale(), SEED);
    let sk = sim.spawn_class(Vec2::new(0.0, 30.0), -FRAC_PI_2, 240, UnitClassId::Skirmishers, 0);
    let heavy = sim.spawn_class(Vec2::new(0.0, -10.0), FRAC_PI_2, 300, UnitClassId::HeavySword, 1);
    // Isolate the KITING variable: with charge bursts on, the pursuers run
    // down the screen's slow tail (leg jitter) — real, but a different
    // claim. Burst-vs-screen warfare is the cavalry tests' subject.
    sim.set_charge_enabled(heavy, false);
    sim.set_attack_order(heavy, sk);
    run(&mut sim, 120.0);
    // Attacks close at the double, so this is a 2-minute RUNNING pursuit —
    // and the stamina economy decides it: armor is paid for in wind
    // (drain_mult 1.35 vs the screen's 0.65), so the heavies blow out and
    // the screen, whose surging laggards no longer bill the pool, keeps
    // its legs and its distance.
    assert!(
        deaths(&sim, sk) < 12,
        "skirmishers must stay out of reach, lost {}",
        deaths(&sim, sk)
    );
    assert!(
        deaths(&sim, heavy) > 8,
        "javelins must tell on the pursuer, killed {}",
        deaths(&sim, heavy)
    );
}

#[test]
fn artillery_stones_plow_through_deep_columns() {
    let mut sim = Sim::new(no_morale(), SEED);
    let art = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 60, UnitClassId::ArtilleryCrew, 0);
    // A deep column end-on: the furrow's dream target.
    let column = sim.spawn_unit(Vec2::new(0.0, 220.0), -FRAC_PI_2, 600, 10, Vec2::new(0.9, 1.1), 1, 0.6);
    let _ = art;
    run(&mut sim, 90.0);
    let dead = deaths(&sim, column);
    assert!(
        dead > 25,
        "bouncing stones through a column must be devastating: {dead} dead"
    );
    // Stuns along the furrow at some point.
    let mut sim2 = Sim::new(no_morale(), SEED);
    let _art = sim2.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 60, UnitClassId::ArtilleryCrew, 0);
    let column2 = sim2.spawn_unit(Vec2::new(0.0, 220.0), -FRAC_PI_2, 600, 10, Vec2::new(0.9, 1.1), 1, 0.6);
    let mut max_stunned = 0;
    for _ in 0..(90.0 / DT) as usize {
        sim2.tick();
        let u = &sim2.units[column2];
        let stunned = (u.start..u.start + u.count).filter(|&s| sim2.stun[s] > 0.0).count();
        max_stunned = max_stunned.max(stunned);
    }
    assert!(max_stunned >= 2, "stones bowl men over, max stunned {max_stunned}");
}

#[test]
fn horse_archers_shoot_on_the_move() {
    // Parade ground: the subject is mobile fire, not footing.
    let mut sim = Sim::new(Tunables { micro_rough: 0.0, ..no_morale() }, SEED);
    let ha = sim.spawn_class(Vec2::new(0.0, 0.0), 0.0, 120, UnitClassId::HorseArchers, 0);
    let target = sim.spawn_class(Vec2::new(60.0, 60.0), -FRAC_PI_2, 300, UnitClassId::LightSpear, 1);
    // Ride across the target's front while loosing.
    sim.set_move_order(ha, Vec2::new(160.0, 0.0));
    let ammo_before = sim.units[ha].ammo;
    run(&mut sim, 50.0);
    // The CLAIM is the mechanism — arrows fly WHILE RIDING (foot archers
    // must halt). Lethality lives in the volley tests; hardier bodies
    // (pacing retune) mean a drive-by wounds many and drops few.
    let ammo_after = sim.units[ha].ammo;
    assert!(
        ammo_before - ammo_after > 200,
        "the ride looses arrows: {} spent",
        ammo_before - ammo_after
    );
    assert!(
        deaths(&sim, target) >= 1,
        "and they hurt: {} dead",
        deaths(&sim, target)
    );
}
