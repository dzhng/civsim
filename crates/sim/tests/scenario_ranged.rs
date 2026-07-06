//! Ranged combat contracts, 1v1: archery softens and harasses — it does
//! not annihilate formed troops by itself. The frontal toll is pinned as a
//! BAND (5%–20%) marked by two fake reference lines that bracket the legal
//! stat range, not as a per-class number; plus the aspect law (shields are a
//! FRONT-arc fact) and the melee fate of archers who let the line reach them.

pub mod common;

use common::no_morale_parade as no_morale;
use common::{ref_archer, ref_horse_archer, ref_melee, ref_pike, REF_BOW, REF_HORSE_BOW};
use sim::{Pace, Sim, Tunables, UnitClass, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 1453;

// Calibration instrument (run on demand): print the arrow toll for a grid of
// (health, block) so the floor/ceiling reference stat blocks below can be
// re-read off the live numbers after any missile or armor change.
//   cargo test -p sim --test scenario_ranged sweep_arrow_toll -- --ignored --nocapture
#[test]
#[ignore]
fn sweep_arrow_toll() {
    for &health in &[1.0f32, 1.5, 2.0, 2.5, 3.0] {
        for &block in &[0.0f32, 0.25, 0.35, 0.45, 0.55] {
            let n = 240;
            let t = arrow_toll(arrow_ref(health, block), n);
            println!(
                "health {health:>3} block {block:>4}: {t:>3}/{n}  ({:.1}%)",
                100.0 * t as f32 / n as f32
            );
        }
    }
}

/// A fake advancing line whose ONLY arrow-relevant axes are set explicitly:
/// body armor (`health`) and a front shield (`block`). Everything else is held
/// to a neutral foot reference so the toll reads as a pure function of these two.
fn arrow_ref(health: f32, block: f32) -> UnitClass {
    let mut s = ref_melee(true);
    s.health = health;
    s.block = block;
    s
}

/// Arrows-landed toll on an advancing fake line, measured BEFORE first contact:
/// 140 fake archers (REF_BOW) vs `n` of `target` crossing the kill zone at a run.
fn arrow_toll(target: UnitClass, n: usize) -> usize {
    let mut sim = Sim::new(no_morale(), SEED);
    let archers = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 140, UnitClassId::Archers, 0);
    sim.set_missile_spec(archers, REF_BOW);
    let adv = sim.spawn_class_stats_with_files(
        Vec2::new(0.0, 160.0),
        -FRAC_PI_2,
        n,
        n.div_ceil(6),
        UnitClassId::HeavySword,
        target,
        1,
    );
    sim.set_pace(adv, Pace::Run); // you cross a kill zone at the run
    sim.set_attack_order(adv, archers);
    for _ in 0..(120.0 / DT) as usize {
        sim.tick();
        if sim.units[archers].engaged > 5 {
            break; // first contact — stop counting, the sword takes over
        }
    }
    n - sim.units[adv].alive_count
}

/// Real-class advance, for `measure_the_board` only: read where a shipped unit
/// actually lands relative to the fake floor/ceiling references above.
fn kills_before_contact(target: UnitClassId, n: usize) -> (usize, f32) {
    let mut sim = Sim::new(no_morale(), SEED);
    let archers = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 140, UnitClassId::Archers, 0);
    let adv = sim.spawn_class(Vec2::new(0.0, 160.0), -FRAC_PI_2, n, target, 1);
    sim.set_pace(adv, Pace::Run);
    sim.set_attack_order(adv, archers);
    for step in 0..(120.0 / DT) as usize {
        sim.tick();
        if sim.units[archers].engaged > 5 {
            return (n - sim.units[adv].alive_count, step as f32 * DT);
        }
    }
    (n - sim.units[adv].alive_count, 120.0)
}

/// Stationary target, aspect study: kills in 30s of fire from a bearing.
fn kills_by_aspect(target: UnitClassId, n: usize, from: Vec2) -> usize {
    let mut sim = Sim::new(no_morale(), SEED);
    // Target faces NORTH; archers fire from `from`.
    let line = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, n, target, 1);
    let archers = sim.spawn_class(from, 0.0, 140, UnitClassId::Archers, 0);
    let _ = archers;
    for _ in 0..(30.0 / DT) as usize {
        sim.tick();
    }
    n - sim.units[line].alive_count
}

#[test]
fn arrows_dent_every_advance_but_gate_none() {
    // The legal toll envelope, marked by two FAKE reference lines that differ
    // in ONE axis — a shield. Same body armor (health 2.0), same kill-zone
    // crossing at a run; the only difference is whether they carry a shield.
    // Their tolls BRACKET the band every real unit must live inside, and —
    // because they are reference stats, not a real class — they tell the
    // balancer WHICH stat block sits at each edge, not just a magic percent:
    //
    //   • CEILING — no shield (block 0.0): ~10%. The softest legal line.
    //     Arrows dent it but never gate it: <=12% lost means it still arrives
    //     a whole fighting force. Past 20% archery would gate.
    //   • FLOOR — a light shield (block 0.35): ~3-6%. The protected end. Re-derived
    //     for melee-blob slice 05's torque-free pivot projection: corrected movement
    //     lowered the shielded reference from 13/240 to 8/240 while the bare ceiling
    //     and shield ordering stayed intact.
    //
    // A real unit's toll is a function of its (health, block) and crossing
    // speed; it must land between these two. The grid in `sweep_arrow_toll`
    // is how these two stat blocks were read off — re-run it to recalibrate.
    let ceiling = arrow_toll(arrow_ref(2.0, 0.0), 240);
    let floor = arrow_toll(arrow_ref(2.0, 0.35), 240);
    let ceil_frac = ceiling as f32 / 240.0;
    let floor_frac = floor as f32 / 240.0;
    println!(
        "envelope: floor(shielded) {floor}/240 ({:.1}%), ceiling(bare) {ceiling}/240 ({:.1}%)",
        100.0 * floor_frac,
        100.0 * ceil_frac
    );
    // re-derived for formation-settle 06-stamina (run_drain 1/90 -> 1/340): fresher runners cross the arrow lane faster, lowering the bare toll.
    assert!(
        (0.095..=0.12).contains(&ceil_frac),
        "the bare reference marks the no-gate CEILING — a dent that still never gates: {ceiling}/240"
    );
    assert!(
        (0.03..=0.062).contains(&floor_frac),
        "the shielded reference marks the protected FLOOR — arrows still bite the protected end: {floor}/240"
    );
    assert!(
        floor < ceiling,
        "a shield must shed arrows: floor {floor} < ceiling {ceiling}"
    );
}

#[test]
fn shields_are_a_front_arc_fact_for_arrows() {
    let front = kills_by_aspect(UnitClassId::HeavySword, 240, Vec2::new(0.0, 90.0));
    let side = kills_by_aspect(UnitClassId::HeavySword, 240, Vec2::new(90.0, 0.0));
    let rear = kills_by_aspect(UnitClassId::HeavySword, 240, Vec2::new(0.0, -90.0));
    println!("heavy under fire 30s: front {front}, side {side}, rear {rear}");
    assert!(
        rear as f32 > front as f32 * 1.5,
        "arrows from behind find no shields: rear {rear} vs front {front}"
    );
    assert!(
        side as f32 > front as f32 * 2.0,
        "the side arc is past the shields too: side {side} vs front {front}"
    );
    // Lights carry a real shield, but a light one: a meaningful front/back gap,
    // smaller than the heavy wall's.
    let lf = kills_by_aspect(UnitClassId::LightSpear, 220, Vec2::new(0.0, 90.0));
    let lr = kills_by_aspect(UnitClassId::LightSpear, 220, Vec2::new(0.0, -90.0));
    println!("light under fire 30s: front {lf}, rear {lr}");
    assert!(
        lr as f32 > lf as f32 * 1.2,
        "a light shield still sheds the front: rear {lr} vs front {lf}"
    );

    // The SHIELDLESS take ~the SAME from any face — a dodge has no arc, and
    // they have no shield to make a front of. The residual gap (a back-shot mob
    // frays a little harder) is FAR below a shield's: peasants land near 1x
    // under heavy fire, vs the heavy wall's ~1.5-2x above. The claim is the
    // CONTRAST — no shield, no real front.
    let pf = kills_by_aspect(UnitClassId::Peasant, 220, Vec2::new(0.0, 90.0));
    let pr = kills_by_aspect(UnitClassId::Peasant, 220, Vec2::new(0.0, -90.0));
    println!("shieldless peasant under fire 30s: front {pf}, rear {pr}");
    let pea_ratio = pr as f32 / pf.max(1) as f32;
    let heavy_ratio = rear as f32 / front.max(1) as f32;
    assert!(
        pea_ratio < 2.4 && heavy_ratio > pea_ratio * 1.15,
        "no shield, no real front: peasant {pea_ratio:.2} vs heavy wall {heavy_ratio:.2}"
    );
}

#[test]
fn a_phalanx_outlasts_the_quiver_frontally_but_not_from_behind() {
    // The balance of quiver depth (24/bow) and arrow damage (0.5) against the
    // shield wall, morale ON. A bow-horse that stands off and empties itself
    // into a phalanx's FRONT runs DRY before it breaks the wall: shields shed
    // most of the volleys (the blocked ones never even register as a threat)
    // and drilled troops eat the rest without bolting. The SAME fire into the
    // unshielded BACK routs it long before the quiver is spent. This is the
    // contract horse-archers live by — they beat formed foot by working a
    // flank, never by out-shooting a braced front.
    //
    // Neither unit is ordered: the HAR holds at range and auto-fires, the
    // phalanx stands. (A real phalanx would close or wheel; this isolates the
    // pure attrition-vs-quiver balance with the line pinned in the worst case.)
    let kite = |face_them: bool| -> (bool, Option<u32>) {
        let mut sim = Sim::new(Tunables::default(), SEED);
        let facing = if face_them { FRAC_PI_2 } else { -FRAC_PI_2 };
        // FAKE references: a shielded pike block vs a quivered horse-archer band.
        let pik = sim.spawn_class_stats_with_files(
            Vec2::new(0.0, 0.0),
            facing,
            200,
            40,
            UnitClassId::HeavyPhalanx,
            ref_pike(),
            0,
        );
        let har = sim.spawn_class_stats_with_files(
            Vec2::new(0.0, 70.0),
            -FRAC_PI_2,
            160,
            40,
            UnitClassId::HorseArchers,
            ref_horse_archer(),
            1,
        );
        sim.set_missile_spec(har, REF_HORSE_BOW);
        let mut dry_at = None;
        for step in 0..(220.0 / DT) as usize {
            sim.tick();
            if dry_at.is_none() && sim.units[har].ammo == 0 {
                dry_at = Some((step as f32 * DT) as u32);
            }
            if sim.units[pik].routing {
                return (true, dry_at);
            }
        }
        (false, dry_at)
    };
    let (front_routed, front_dry) = kite(true);
    let (back_routed, _) = kite(false);
    println!(
        "FRONT routed={front_routed} (quiver dry at {front_dry:?}s); BACK routed={back_routed}"
    );
    assert!(
        front_dry.is_some() && !front_routed,
        "frontally the bow-horse runs dry before it breaks the shield wall (dry={front_dry:?}, routed={front_routed})"
    );
    assert!(
        back_routed,
        "the same fire into the unshielded back routs the phalanx before the quiver is spent"
    );
}

#[test]
fn archer_mirrors_grind_and_neither_side_routs_free() {
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(
        Vec2::new(0.0, -60.0),
        FRAC_PI_2,
        140,
        UnitClassId::Archers,
        0,
    );
    let b = sim.spawn_class(
        Vec2::new(0.0, 60.0),
        -FRAC_PI_2,
        140,
        UnitClassId::Archers,
        1,
    );
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
    }
    let la = 140 - sim.units[a].alive_count;
    let lb = 140 - sim.units[b].alive_count;
    println!("archer mirror 60s: {la} vs {lb}");
    assert!(
        (30..=80).contains(&la) && (30..=80).contains(&lb),
        "a missile duel is a real exchange (~25-55%): {la} vs {lb}"
    );
    assert!(
        (la as i32 - lb as i32).unsigned_abs() <= 28,
        "and roughly even: {la} vs {lb}"
    );
}

#[test]
fn the_line_pays_dearly_but_breaks_the_archers() {
    // The full arc of a frontal, unsupported assault on massed archery:
    // the line crosses under fire and arrives BLOWN (stamina ~0), bleeds
    // to the fresh swords for a minute — and then weight tells, and the
    // archers are destroyed. Expensive, decisive, historical. (Sampling
    // only the first 30s after contact shows the blown-arrival slice and
    // reads as 'archers beat heavies'; they don't.)
    //
    // The new 3.8–5.0s attack cadence + fatigue-guard collapse paces the
    // grind slower, so the full arc needs ~360s to settle: by then the
    // archers are gone (3/140, decaying to 0 by 400s) and the line holds
    // ~69/240 — the heavy bleed is nearly done (69→67 over the next 60s).
    // FAKE references: a soft archer line (REF_BOW) and a heavy melee assault.
    let mut sim = Sim::new(no_morale(), SEED);
    let archers = sim.spawn_class_stats_with_files(
        Vec2::new(0.0, 0.0),
        FRAC_PI_2,
        140,
        35,
        UnitClassId::Archers,
        ref_archer(),
        0,
    );
    sim.set_missile_spec(archers, REF_BOW);
    let heavies = sim.spawn_class_stats_with_files(
        Vec2::new(0.0, 160.0),
        -FRAC_PI_2,
        240,
        40,
        UnitClassId::Peasant,
        ref_melee(true),
        1,
    );
    sim.set_attack_order(heavies, archers);
    for _ in 0..(360.0 / DT) as usize {
        sim.tick();
    }
    let archers_left = sim.units[archers].alive_count;
    let heavies_left = sim.units[heavies].alive_count;
    println!("after 360s: archers {archers_left}/140, heavies {heavies_left}/240");
    // Expensive but DECISIVE: weight tells — the archers are destroyed once the
    // line reaches them — but the frontal approach under fire costs real men.
    // (Re-derived on fakes: the absolute "< half standing" was a real-class
    // balance number; the robust mechanic is destroyed-archers + a real toll +
    // a clear win.)
    assert!(
        archers_left < 20,
        "the archers are destroyed: {archers_left}/140 left"
    );
    assert!(
        heavies_left > 240 / 2,
        "the line wins decisively, a majority standing: {heavies_left}/240"
    );
    assert!(
        heavies_left < 240 - 30,
        "but pays a real toll crossing the fire: lost {} of 240",
        240 - heavies_left
    );
}

#[test]
fn measure_the_board() {
    for (name, class, n) in [
        ("HEAVY", UnitClassId::HeavySword, 240),
        ("LIGHT", UnitClassId::LightSpear, 220),
        ("CAV  ", UnitClassId::ShockCavalry, 120),
    ] {
        let (dead, t) = kills_before_contact(class, n);
        println!("advance {name}: {dead}/{n} dead before contact (closed in {t:.0}s)");
    }
    for (aspect, from) in [
        ("front", Vec2::new(0.0, 90.0)),
        ("side ", Vec2::new(90.0, 0.0)),
        ("rear ", Vec2::new(0.0, -90.0)),
    ] {
        let heavy = kills_by_aspect(UnitClassId::HeavySword, 240, from);
        let light = kills_by_aspect(UnitClassId::LightSpear, 220, from);
        println!("aspect {aspect}: heavy {heavy}/240, light {light}/220 in 30s");
    }
    // archer mirror
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(
        Vec2::new(0.0, -60.0),
        FRAC_PI_2,
        140,
        UnitClassId::Archers,
        0,
    );
    let b = sim.spawn_class(
        Vec2::new(0.0, 60.0),
        -FRAC_PI_2,
        140,
        UnitClassId::Archers,
        1,
    );
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
    }
    println!(
        "archer mirror 60s: a lost {}, b lost {}",
        140 - sim.units[a].alive_count,
        140 - sim.units[b].alive_count
    );
}
