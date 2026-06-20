//! CHARGE-ABSORPTION mechanics: how a trample bleeds against bodies.
//!
//! A trampler (cavalry) is exempt from the body wall while it charges — it
//! rides THROUGH bodies. What stops it is a BLEED: every enemy body it rides
//! into spends a slice of its carried momentum, scaled by that man's BRACE.
//! Rank by rank the charge bleeds; once its measured mass-advance falls below
//! trample speed the trample ends and the body wall pins it. So one quantity —
//! BRACE — sets everything:
//!   - a STILL, braced line (brace ramped to its full multiplier) brakes the
//!     charge hard, so a few ranks bog it;
//!   - a MOVING or just-halted line (brace ~1, ramp not built) barely brakes
//!     it, so the horse rides deeper / through;
//!   - enough DEPTH bogs it regardless (even brace ~1 bleeds a little).
//!
//! Pure-physics rig: immortal, zero-damage fake units. Nobody dies, so the
//! trace shows ONLY the bleed-vs-momentum contest, immune to weapon/damage
//! balance. (A felling blow resolves to ONE state — kill XOR knock-down — and
//! brace RAMPS over a few seconds, so a line caught on the move isn't braced.)

use sim::{class_stats, Pace, Sim, Tunables, UnitClassId, Vec2, Weapon, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 11;

/// 60 immortal charging horse from y=-40 into an immortal `depth`-rank heavy
/// block centred on y=0 (front rank at y=0, ranks north). Both sides immortal,
/// zero-damage. `brace_mult` is the block's bracing (2.0 = a real braced line,
/// 1.0 = a body that can never brace — the "moving line" stand-in). Returns the
/// peak depth (in ranks) reached by the leading horse and by the 80th-percentile
/// horse. The projection solver can leave a single lead body poking past the rear;
/// the p80 readout asks whether the charge MASS rode through.
fn charge_penetration(depth: usize, brace_mult: f32) -> (f32, f32) {
    let mut tun = Tunables::default();
    tun.micro_rough = 0.0;
    tun.morale_enabled = false;
    let mut sim = Sim::new(tun, SEED);
    let files = 20usize;
    let block = sim.spawn_unit(
        Vec2::new(0.0, 0.0),
        -FRAC_PI_2,
        files * depth,
        files,
        Vec2::new(0.9, 1.1),
        1,
        0.8,
    );
    let mut bh = class_stats(UnitClassId::HeavySword);
    bh.brace_mult = brace_mult;
    bh.weapons = sim::class::one(Weapon {
        reach: 1.1,
        min_range: 0.0,
        arc: 1.4,
        attack_interval: 1.79,
        damage: 0.0,
        braced: false,
    });
    sim.units[block].stats = bh;
    for k in sim.units[block].start..sim.units[block].start + sim.units[block].count {
        sim.health[k] = 1.0e9;
        sim.mass[k] = bh.mass;
        sim.radius[k] = bh.soldier_radius;
    }
    let cav = sim.spawn_class(
        Vec2::new(0.0, -40.0),
        FRAC_PI_2,
        60,
        UnitClassId::ShockCavalry,
        0,
    );
    let mut ch = class_stats(UnitClassId::ShockCavalry);
    ch.weapons = sim::class::one(Weapon {
        reach: 2.4,
        min_range: 0.0,
        arc: 0.6,
        attack_interval: 2.2,
        damage: 0.0,
        braced: false,
    });
    sim.units[cav].stats = ch;
    for k in sim.units[cav].start..sim.units[cav].start + sim.units[cav].count {
        sim.health[k] = 1.0e9;
        sim.mount_health[k] = 1.0e9;
    }
    sim.set_pace(cav, Pace::Run);
    sim.set_attack_order(cav, block);
    let mut peak_front = f32::MIN;
    let mut peak_p80 = f32::MIN;
    for _ in 0..(20.0 / DT) as usize {
        sim.tick();
        let u = &sim.units[cav];
        let mut ys = Vec::with_capacity(u.alive_count);
        for i in u.start..u.start + u.count {
            if sim.alive[i] == 1 {
                ys.push(sim.soldier_pos(i).y / 1.1);
            }
        }
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
        peak_front = peak_front.max(*ys.last().unwrap());
        peak_p80 = peak_p80.max(ys[(ys.len() * 8 / 10).min(ys.len() - 1)]);
    }
    (peak_front, peak_p80)
}

/// Did the charge MASS ride clean through — most horses out the back, not just
/// one lead body poking through while the formation bogged?
fn mass_rode_through(depth: usize, brace_mult: f32) -> bool {
    charge_penetration(depth, brace_mult).1 > depth as f32 + 1.5
}

/// Did at least the leading horses pierce out the rear?
fn front_rode_through(depth: usize, brace_mult: f32) -> bool {
    charge_penetration(depth, brace_mult).0 > depth as f32 + 1.5
}

/// A braced block deep enough bogs the charge: the cav bleeds out before its
/// front reaches the rear — it never rides clean through.
#[test]
fn a_charge_bogs_in_a_deep_braced_block() {
    let (front, mass) = charge_penetration(8, 2.0);
    eprintln!("braced-8: cav front peaked at {front:.1} ranks, mass at {mass:.1} (rear = 8)");
    assert!(
        front > 1.0,
        "the charge must ride in a few ranks, not stop at the face: {front:.1}"
    );
    assert!(
        !mass_rode_through(8, 2.0),
        "a deep braced block must bog the charge mass: front {front:.1}, mass {mass:.1}"
    );
}

/// A SHALLOW braced block is ridden clean through — the charge clears the few
/// ranks before it bleeds out, exactly the ride-through that IS cavalry.
#[test]
fn a_charge_rides_through_a_shallow_braced_block() {
    let (front, mass) = charge_penetration(3, 2.0);
    eprintln!("braced-3: cav front peaked at {front:.1} ranks, mass at {mass:.1} (rear = 3)");
    assert!(
        mass_rode_through(3, 2.0),
        "a shallow braced block must be ridden clean through: front {front:.1}, mass {mass:.1}"
    );
}

/// BRACE is the lever. At a depth where a BRACED line bogs the charge, the SAME
/// line that cannot brace (brace_mult 1 — the moving / not-yet-set stand-in) is
/// ridden through. Same count, same depth — only the brace differs.
#[test]
fn bracing_is_what_stops_the_charge() {
    let (braced_front, braced_mass) = charge_penetration(6, 2.0);
    let (unbraced_front, unbraced_mass) = charge_penetration(6, 1.0);
    eprintln!(
        "depth 6: braced front/mass {braced_front:.1}/{braced_mass:.1} ranks | unbraced {unbraced_front:.1}/{unbraced_mass:.1}"
    );
    assert!(
        !mass_rode_through(6, 2.0),
        "the braced line must bog the charge mass at depth 6: front {braced_front:.1}, mass {braced_mass:.1}"
    );
    assert!(
        front_rode_through(6, 1.0),
        "the un-braceable line must let the leading horses pierce through at depth 6: front {unbraced_front:.1}, mass {unbraced_mass:.1}"
    );
    assert!(
        unbraced_mass > braced_mass + 1.0,
        "the horse mass must ride deeper through the unbraced line: {unbraced_mass:.1} vs {braced_mass:.1}",
    );
}

/// Depth bogs it REGARDLESS of brace: a man on the move still bleeds the charge
/// a little, so a deep ENOUGH block (even one that never braces) spends it.
#[test]
fn enough_depth_bogs_the_charge_even_unbraced() {
    let (front, mass) = charge_penetration(8, 1.0);
    eprintln!("unbraced-8: cav front peaked at {front:.1} ranks, mass at {mass:.1} (rear = 8)");
    assert!(
        !mass_rode_through(8, 1.0),
        "8 ranks must bog the charge mass even with no bracing: front {front:.1}, mass {mass:.1}"
    );
}

/// The RAMP: a line needs a few seconds halted to set its brace. A unit caught
/// on the move, or one that only just stopped, isn't braced yet — which is why
/// a fast charge rides through it. Measured directly on `brace()` over time.
#[test]
fn a_line_takes_a_few_seconds_to_set_its_brace() {
    let brace_after = |secs: f32| -> f32 {
        let mut sim = Sim::new(
            Tunables {
                micro_rough: 0.0,
                morale_enabled: false,
                ..Tunables::default()
            },
            SEED,
        );
        let u = sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            200,
            UnitClassId::HeavySword,
            0,
        );
        for _ in 0..(secs / DT) as usize {
            sim.tick();
        }
        sim.units[u].brace()
    };
    let mult = class_stats(UnitClassId::HeavySword).brace_mult; // 2.0
    let (early, late) = (brace_after(0.5), brace_after(4.0));
    eprintln!("brace at 0.5s = {early:.2}, at 4.0s = {late:.2} (mult {mult:.1})");
    assert!(
        early < 1.0 + 0.5 * (mult - 1.0),
        "a line just halted is NOT yet braced: {early:.2}"
    );
    assert!(
        late > mult - 0.1,
        "after a few seconds it is fully braced: {late:.2} vs {mult:.1}"
    );
}
