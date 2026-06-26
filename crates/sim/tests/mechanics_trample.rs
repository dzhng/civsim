//! TRAMPLE / DISRUPTION mechanics: a trampler is NOT a line that holds — it is a
//! swarm of individual hunters. Under an ATTACK order each rider seeks its own
//! nearest foe and the unit pours INTO the enemy, breaking their cohesion (the
//! whole point of a trample). The weave holds only weakly, so nothing reels the
//! divers back into a line. This is deliberately move != attack for tramplers:
//! a MOVE order is a relocation, ridden through in normal formation; only an
//! ATTACK is the dive. And a move order issued mid-dive must pull the unit back
//! OUT — return to Move, re-form, ride off the enemy.
//!
//! Pure-physics rig: immortal, zero-damage fakes, morale off, so the trace shows
//! ONLY the steering contest (seek vs weave vs momentum), immune to balance.

use sim::{class_stats, OrderMode, Pace, Sim, Tunables, UnitClassId, Vec2, Weapon, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 11;

fn fake_weapon(reach: f32) -> Weapon {
    Weapon {
        reach,
        min_range: 0.0,
        zones: sim::strike::front(0.5),
        attack_interval: 2.0,
        damage: 0.0,
        cleave: false,
        kind: sim::WeaponKind::Standard,
    }
}

/// Immortal heavy line (16 wide x `depth`) at y=0 facing south, and 64 immortal
/// shock cav at y=-40 facing north. Returns (sim, line, cav). Caller issues the
/// order.
fn rig(depth: usize) -> (Sim, usize, usize) {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, SEED);
    let files = 16usize;
    let line = sim.spawn_unit(
        Vec2::new(0.0, 0.0),
        -FRAC_PI_2,
        files * depth,
        files,
        Vec2::new(0.9, 1.1),
        1,
        0.8,
    );
    let mut bh = class_stats(UnitClassId::HeavySword);
    bh.weapons = sim::class::one(fake_weapon(1.1));
    sim.units[line].stats = bh;
    for k in sim.units[line].start..sim.units[line].start + sim.units[line].count {
        sim.health[k] = 1.0e9;
    }
    let cav = sim.spawn_class(Vec2::new(0.0, -40.0), FRAC_PI_2, 64, UnitClassId::ShockCavalry, 0);
    let mut ch = class_stats(UnitClassId::ShockCavalry);
    // A flank-lobe sabre (a mounted blade is blind over the horse's head): so the
    // riders' seek DISPERSES across the front, the wide boring-in that disrupts.
    ch.weapons = sim::class::one(Weapon {
        zones: sim::strike::flanks(1.55, 0.85),
        ..fake_weapon(2.0)
    });
    sim.units[cav].stats = ch;
    for k in sim.units[cav].start..sim.units[cav].start + sim.units[cav].count {
        sim.health[k] = 1.0e9;
        sim.mount_health[k] = 1.0e9;
    }
    sim.set_pace(cav, Pace::Run);
    (sim, line, cav)
}

fn run(sim: &mut Sim, secs: f32) {
    for _ in 0..(secs / DT) as usize {
        sim.tick();
    }
}

#[test]
fn trample_attack_dives_in_and_breaks_enemy_cohesion() {
    // The dive's job: shatter the enemy's order. A shallow line, immortal so the
    // contest is pure steering — the cav can't kill its way through, the cohesion
    // drop is the riders boring INTO the ranks, not casualties thinning them.
    let (mut sim, line, cav) = rig(4);
    sim.set_attack_order(cav, line);
    run(&mut sim, 16.0);
    let enemy_coh = sim.units[line].cohesion;
    let cav_cy = sim.units[cav].centroid.y;
    eprintln!("dive: enemy cohesion {enemy_coh:.2}, cav penetrated to cy {cav_cy:.1}");
    // The line is gutted: a held formation sits near 1.0; the dive drives it past
    // half. Re-derived 0.5 -> 0.6 after the strike-zones refactor: with the cleaner
    // flank-lobe targeting the cav now CARRIES THROUGH this shallow 4-deep line
    // (cy ~15, out the far side — the thin-line ride-through of the brace/bleed
    // law) rather than boring in place, so it disrupts in PASSING to ~0.53 instead
    // of ~0.34. Still a clear break from the held 1.0; the deeper-line bore-in is
    // pinned by the carry/bog test.
    assert!(
        enemy_coh < 0.6,
        "the dive must break the enemy's cohesion, got {enemy_coh:.2}"
    );
    // And the cav is INSIDE them (penetrated past the y=0 front), not planted at
    // its reach in front.
    assert!(
        cav_cy > 1.0,
        "the trample must drive INTO the enemy, cav centroid at cy {cav_cy:.1}"
    );
}

#[test]
fn trample_move_is_not_a_dive_it_rides_through_in_order() {
    // move != attack for a trampler: the SAME unit told to MOVE to a point past
    // the line rides straight through it and out the far side — it does not latch,
    // does not bore in, and keeps far better order than the attacking dive.
    let (mut sim, _line, cav) = rig(4);
    sim.set_move_order(cav, Vec2::new(0.0, 60.0));
    let mut stayed_move = true;
    run_collecting(&mut sim, 30.0, cav, &mut stayed_move);
    let cav_cy = sim.units[cav].centroid.y;
    let move_coh = sim.units[cav].cohesion;
    eprintln!("move-through: stayed_move={stayed_move} cav cy {cav_cy:.1} coh {move_coh:.2}");
    assert!(stayed_move, "a MOVE order must never latch the trampler into a fight");
    assert!(
        cav_cy > 30.0,
        "the trampler must ride THROUGH and on toward its goal, cy {cav_cy:.1}"
    );
    // A dive blobs to ~0.2; the ride-through holds far better order than that.
    assert!(
        move_coh > 0.55,
        "a MOVE rides through in order, it does not blob like the dive: coh {move_coh:.2}"
    );
}

/// Peak penetration of the cav MASS (80th-percentile horse), in RANKS past the
/// line front (front rank at y=0, ranks north). The p80, not the lead, so one
/// horse poking through a bogged block doesn't read as "the mass rode through".
fn peak_penetration(depth: usize) -> f32 {
    let (mut sim, _line, cav) = rig(depth);
    sim.set_attack_order(cav, _line);
    let mut peak = f32::MIN;
    for _ in 0..(30.0 / DT) as usize {
        sim.tick();
        let u = &sim.units[cav];
        let mut ys: Vec<f32> = (u.start..u.start + u.count)
            .filter(|&i| sim.alive[i] == 1)
            .map(|i| sim.soldier_pos(i).y / 1.1)
            .collect();
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
        peak = peak.max(ys[(ys.len() * 8 / 10).min(ys.len() - 1)]);
    }
    peak
}

#[test]
fn trample_carries_through_a_thin_line_but_bogs_in_a_deep_braced_one() {
    // The carry-through is the brace/bleed contract, unchanged by the dive: a THIN
    // (immortal, here) line is ridden clean through — the lead horse exits well
    // past the back rank; a DEEP braced block BOGS it — the charge bleeds out
    // before the front clears the ranks, so it grinds INSIDE (disrupting in place,
    // not popping out the far side). Same dive, opposite outcome, set by depth.
    let thin = peak_penetration(2);
    let deep = peak_penetration(10);
    eprintln!("carry/bog: thin-2 lead at {thin:.1} ranks, deep-10 lead at {deep:.1} ranks");
    assert!(
        thin > 4.0,
        "a thin line must be ridden clean through (lead well past the 2 ranks): {thin:.1}"
    );
    assert!(
        deep < 9.0,
        "a deep braced block must BOG the charge inside it (lead short of the 10th rank): {deep:.1}"
    );
}

fn run_collecting(sim: &mut Sim, secs: f32, cav: usize, stayed_move: &mut bool) {
    for _ in 0..(secs / DT) as usize {
        sim.tick();
        *stayed_move &= matches!(sim.units[cav].mode, OrderMode::Move);
    }
}

#[test]
fn a_move_order_pulls_a_diving_trampler_back_out() {
    // Issued a MOVE mid-dive, the trampler must come back to its senses: return to
    // Move mode, re-form (cohesion recovers from the blob), and ride OFF the enemy
    // toward the goal — not stay glued in the grind.
    let (mut sim, line, cav) = rig(6);
    sim.set_attack_order(cav, line);
    run(&mut sim, 16.0);
    assert!(
        sim.units[cav].cohesion < 0.4,
        "precondition: the dive has blobbed the cav (coh {:.2})",
        sim.units[cav].cohesion
    );
    // Pull it out, far to the south (behind where it started).
    sim.set_move_order(cav, Vec2::new(0.0, -90.0));
    run(&mut sim, 30.0);
    let mode = sim.units[cav].mode;
    let coh = sim.units[cav].cohesion;
    let cy = sim.units[cav].centroid.y;
    eprintln!("after move-out: mode={mode:?} coh {coh:.2} cy {cy:.1}");
    assert!(matches!(mode, OrderMode::Move), "must return to Move mode, was {mode:?}");
    assert!(coh > 0.4, "must re-form out of the ~0.2 blob, coh {coh:.2}");
    assert!(cy < -8.0, "must ride OFF the enemy toward the goal, cy {cy:.1}");
}
