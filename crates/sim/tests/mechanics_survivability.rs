//! MECHANICAL: how survivability scales with stats, and how long an equal grind
//! lasts — pinned on FAKE REFERENCE UNITS, not real classes.
//!
//! This is a MECHANICS test, not a balance test. Every assertion is on a fake
//! reference unit with stats and a weapon DEFINED HERE (`ref_stats` + `REF_BLADE`),
//! so David can retune any real class (light, heavy, …) freely and this test will
//! not move. The references answer two balance-independent questions:
//!   1. What attack level makes an equal LINE grind last ~3-4 minutes? (the
//!      lethality anchor — `REF_BLADE.damage`.)
//!   2. Does survivability scale the way it should with HP and block? (HP is
//!      ~linear; block is a real, bounded multiplier.)
//!
//! Real classes are printed alongside as DIAGNOSTICS so the current roster can be
//! read against the references — but they are never asserted on.
//!
//! Survivability is the compound of HP, front-arc block, and evade (see
//! `combat.rs::strike`: a hit is gated by evade, then block, then HP absorbs the
//! wound). The DESIGN (David): a heavy out-survives a levy ~4x (a peasant should
//! barely scratch a heavy — the shield earns it), the fighting classes stay within
//! ~2x, and a heavy holds the highest block. Those are balance numbers, checked by
//! eye against the diagnostic rows; the MECHANISM is what this test pins.

mod common;

use common::no_morale_parade;
use sim::{class, class_stats, Pace, Sim, UnitClass, UnitClassId, Vec2, Weapon, WeaponKind, DT};
use std::f32::consts::FRAC_PI_2;

const SEEDS: [u64; 4] = [1, 7, 13, 42];
const SURV_CAP: f32 = 240.0;
const GRIND_CAP: f32 = 600.0;
const REF_DEPTH: usize = 4; // references fight as a WIDE, shallow LINE, not a deep block

/// The test-owned blade: the attacker's weapon AND the reference units' weapon.
/// Balance-independent — real weapon tables can change without moving this test.
/// `damage` is the LETHALITY ANCHOR, tuned so an equal reference-line grind lasts
/// ~3-4 minutes (see `attack_lethality_*`). interval/reach/arc mirror a standard
/// one-handed sword.
const REF_BLADE: Weapon = Weapon {
    reach: 1.1,
    min_range: 0.0,
    zones: sim::strike::front(0.7),
    attack_interval: 4.1,
    // 0.32 lands an equal wide-LINE grind at ~3.5 min (the anchor). The stock game
    // sword is 0.5 — that grinds the same reference line in ~2.2 min, i.e. real
    // melee runs a touch HOTTER than the 3-4 min anchor at wide-line scale (and
    // the old "10 min" figure was a DEEP-block artifact, not a real battle line).
    damage: 0.32,
    cleave: false,
    kind: WeaponKind::Standard,
};

fn mean(v: &[f32]) -> f32 {
    v.iter().sum::<f32>() / v.len() as f32
}

/// A clean reference body: designed HP/block/evade, REF_BLADE, neutral physique.
/// Hard-coded fields (not inherited from any real class) keep it stable.
fn ref_stats(hp: f32, block: f32, evade: f32) -> UnitClass {
    let mut s = class_stats(UnitClassId::Peasant);
    s.health = hp;
    s.block = block;
    s.evade = evade;
    s.weapons = class::one(REF_BLADE);
    s.brace_mult = 1.5;
    s.mass = 1.0;
    s.soldier_radius = 0.32;
    s.spacing = Vec2::new(1.0, 1.0);
    s.default_depth = REF_DEPTH;
    s.training = 0.7;
    s
}

/// Spawn a fake reference (wide shallow line) at `(0,y)` facing `f`, on `team`.
fn spawn_ref(sim: &mut Sim, stats: UnitClass, count: usize, y: f32, f: f32, team: u32) -> usize {
    let files = (count / REF_DEPTH).max(4);
    sim.spawn_class_stats_with_files(Vec2::new(0.0, y), f, count, files, UnitClassId::Peasant, stats, team)
}

/// SURVIVABILITY: seconds for a 60-man victim to lose half its men under a fixed
/// immortal REF_BLADE attacker grinding it head-on. Higher = tougher. The victim
/// is produced by `spawn_victim` (a reference, or a real class for diagnostics).
fn seconds_to_half(seed: u64, spawn_victim: &dyn Fn(&mut Sim) -> usize) -> f32 {
    let mut sim = Sim::new(no_morale_parade(), seed);
    let victim = spawn_victim(&mut sim);
    let atk = spawn_ref(&mut sim, ref_stats(2.0, 0.0, 0.0), 240, -10.0, FRAC_PI_2, 0);
    let (s, e) = (sim.units[atk].start, sim.units[atk].start + sim.units[atk].count);
    for k in s..e {
        sim.health[k] = 1.0e9; // immortal: identical, unrelenting incoming for every victim
        sim.mount_health[k] = 1.0e9;
    }
    sim.set_pace(atk, Pace::Run);
    sim.set_attack_order(atk, victim);
    let half = sim.units[victim].count / 2;
    for n in 0..(SURV_CAP / DT) as usize {
        sim.tick();
        if sim.units[victim].count - sim.units[victim].alive_count >= half {
            return n as f32 * DT;
        }
    }
    SURV_CAP
}

/// GRIND LENGTH: seconds for an equal, mortal 1v1 of `stats` (wide shallow lines,
/// both sides identical, REF_BLADE both ways) to drive either side below half.
fn grind_seconds(seed: u64, stats: UnitClass) -> f32 {
    let mut sim = Sim::new(no_morale_parade(), seed);
    let n = 120;
    let a = spawn_ref(&mut sim, stats, n, 30.0, FRAC_PI_2, 0);
    let d = spawn_ref(&mut sim, stats, n, -30.0, -FRAC_PI_2, 1);
    sim.set_pace(a, Pace::Walk);
    sim.set_attack_order(a, d);
    sim.set_attack_order(d, a);
    let (ha, hd) = (sim.units[a].count / 2, sim.units[d].count / 2);
    for step in 0..(GRIND_CAP / DT) as usize {
        sim.tick();
        let da = sim.units[a].count - sim.units[a].alive_count;
        let dd = sim.units[d].count - sim.units[d].alive_count;
        if da >= ha || dd >= hd {
            return step as f32 * DT;
        }
    }
    GRIND_CAP
}

fn surv(spawn_victim: &dyn Fn(&mut Sim) -> usize) -> f32 {
    mean(&SEEDS.iter().map(|&s| seconds_to_half(s, spawn_victim)).collect::<Vec<_>>())
}

/// THE LETHALITY ANCHOR. An equal grind of a standard reference line (a typical
/// line soldier: 1.5 HP, a light shield) must resolve in ~3-4 minutes. This pins
/// `REF_BLADE.damage` as "about the attack level a 3-4 min grind needs" — the
/// range David tunes real weapons toward. Wide shallow lines (a battle line, not
/// a deep column), so the whole front is engaged.
#[test]
fn attack_lethality_grinds_a_reference_line_in_about_three_to_four_minutes() {
    let line = ref_stats(1.5, 0.3, 0.1);
    let t = mean(&SEEDS.iter().map(|&s| grind_seconds(s, line)).collect::<Vec<_>>());
    eprintln!(
        "REFERENCE GRIND (HP1.5 light-shield line, equal 1v1): {t:.0}s = {:.1} min  [REF_BLADE.damage={}]",
        t / 60.0,
        REF_BLADE.damage
    );
    assert!(
        (180.0..=240.0).contains(&t),
        "an equal reference-line grind should last ~3-4 min (180-240s), not {t:.0}s ({:.1} min) — \
         retune REF_BLADE.damage",
        t / 60.0
    );
}

/// SURVIVABILITY SCALES THE RIGHT WAY — on references only.
/// * HP is ~linear: a 4x-HP body lasts ~4x a 1x-HP body, a 2x ~2x.
/// * block is a real but BOUNDED defensive multiplier: it helps, and a 0.5 shield
///   is worth less than another whole body (< 2x) in a sustained grind (guard
///   fatigue erodes it — the reason a heavy reads ~4x in a grind, ~5x in a charge).
#[test]
fn survivability_scales_with_the_reference_stats() {
    let hp1 = surv(&|sim| spawn_ref(sim, ref_stats(1.0, 0.0, 0.0), 60, 0.0, -FRAC_PI_2, 1));
    let hp2 = surv(&|sim| spawn_ref(sim, ref_stats(2.0, 0.0, 0.0), 60, 0.0, -FRAC_PI_2, 1));
    let hp4 = surv(&|sim| spawn_ref(sim, ref_stats(4.0, 0.0, 0.0), 60, 0.0, -FRAC_PI_2, 1));
    let blk = surv(&|sim| spawn_ref(sim, ref_stats(1.0, 0.5, 0.0), 60, 0.0, -FRAC_PI_2, 1));

    eprintln!("REFERENCE SURVIVABILITY (mean s to lose half):");
    eprintln!("  HP1 {hp1:.1}  HP2 {hp2:.1}  HP4 {hp4:.1}  | HP1+block0.5 {blk:.1}");
    eprintln!(
        "  HP2/HP1 {:.2}x  HP4/HP1 {:.2}x  | block0.5 worth {:.2}x a bare body",
        hp2 / hp1,
        hp4 / hp1,
        blk / hp1
    );

    // Print the real roster against the references — DIAGNOSTIC ONLY, never asserted.
    eprintln!("  --- real classes (diagnostic, not asserted) ---");
    let mut diag: Vec<(&str, f32)> = [
        UnitClassId::Peasant,
        UnitClassId::LightSword,
        UnitClassId::MediumInfantry,
        UnitClassId::MediumSpear,
        UnitClassId::HeavySword,
        UnitClassId::HeavySpear,
        UnitClassId::HeavyPhalanx,
    ]
    .iter()
    .map(|&c| {
        let name = match c {
            UnitClassId::Peasant => "Peasant",
            UnitClassId::LightSword => "LightSword",
            UnitClassId::MediumInfantry => "MediumInfantry",
            UnitClassId::MediumSpear => "MediumSpear",
            UnitClassId::HeavySword => "HeavySword",
            UnitClassId::HeavySpear => "HeavySpear",
            UnitClassId::HeavyPhalanx => "HeavyPhalanx",
            _ => "?",
        };
        // Same wide-shallow width as the references, so the comparison is
        // stat-driven not formation-driven (real default depths vary 6-10).
        (name, surv(&move |sim| sim.spawn_class_with_files(Vec2::new(0.0, 0.0), -FRAC_PI_2, 60, 60 / REF_DEPTH, c, 1)))
    })
    .collect();
    diag.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
    for (name, t) in &diag {
        eprintln!("  {name:<16} {t:6.1}s   {:.2}x HP1-ref", t / hp1);
    }

    // HP is ~linear in survivability (pure-body references, no block/evade).
    // Mildly super-linear in practice — a tougher front rank holds formation
    // longer, so its later defence is a touch better; band allows that.
    assert!(
        (3.5..=5.3).contains(&(hp4 / hp1)),
        "4x HP should last ~4x as long (3.5-5.3x): got {:.2}x",
        hp4 / hp1
    );
    assert!(
        (1.7..=2.3).contains(&(hp2 / hp1)),
        "2x HP should last ~2x as long (1.7-2.3x): got {:.2}x",
        hp2 / hp1
    );
    // Block is a real but bounded multiplier on a single body.
    assert!(
        blk > hp1 * 1.15,
        "a 0.5 shield must meaningfully extend survival: {:.2}x a bare body",
        blk / hp1
    );
    assert!(
        blk < hp2,
        "a 0.5 shield (front-arc, fatigues) must be worth LESS than a whole extra body: \
         block {blk:.1}s vs +1 HP {hp2:.1}s"
    );
}
