//! Ranged combat contracts, 1v1: archery softens and harasses — it does
//! not annihilate formed troops by itself. Kill ratios by target class,
//! by aspect (shields are a FRONT-arc fact), and the melee fate of
//! archers who let the line reach them.

mod common;

use common::no_morale_parade as no_morale;
use sim::{Sim, Tunables, UnitClassId, Vec2, DT};
use std::f32::consts::FRAC_PI_2;

const SEED: u64 = 1453;

/// Advancing target: kills the archers score BEFORE first contact.
fn kills_before_contact(target: UnitClassId, n: usize) -> (usize, f32) {
    let mut sim = Sim::new(no_morale(), SEED);
    let archers = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 140, UnitClassId::Archers, 0);
    let adv = sim.spawn_class(Vec2::new(0.0, 160.0), -FRAC_PI_2, n, target, 1);
    sim.set_pace(adv, sim::Pace::Run); // you cross a kill zone at the run
    sim.set_attack_order(adv, archers);
    let _ = archers;
    for step in 0..(120.0 / DT) as usize {
        sim.tick();
        if sim.units[archers].engaged > 5 {
            let dead = n - sim.units[adv].alive_count;
            return (dead, step as f32 * DT);
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
fn archery_softens_advances_but_gates_nobody() {
    // The board, contracted (see measure_the_board for the live numbers):
    // an advancing line pays a TOLL in arrows — it is never stopped by
    // them. Armored shields make the crossing cheaper per second but the
    // slow line is exposed longer; horse crosses nearly free.
    let (heavy, _) = kills_before_contact(UnitClassId::HeavySword, 240);
    let (light, _) = kills_before_contact(UnitClassId::LightSpear, 220);
    let (cav, _) = kills_before_contact(UnitClassId::ShockCavalry, 120);
    println!("tolls: heavy {heavy}/240, light {light}/220, cav {cav}/120");
    assert!(
        (4..=40).contains(&heavy),
        "a heavy advance pays a real but small toll — the shield wall sheds \
         most of the frontal arrows: {heavy}/240"
    );
    assert!(
        (4..=34).contains(&light), // lights lost their over-armored hp in the class rebalance: arrows bite them honestly now
        "a loose fast line pays in skin, not armor (2-15%): {light}/220"
    );
    assert!(cav <= 9, "horse crosses nearly free (<=8%): {cav}/120");
}

#[test]
fn shields_are_a_front_arc_fact_for_arrows() {
    let front = kills_by_aspect(UnitClassId::HeavySword, 240, Vec2::new(0.0, 90.0));
    let side = kills_by_aspect(UnitClassId::HeavySword, 240, Vec2::new(90.0, 0.0));
    let rear = kills_by_aspect(UnitClassId::HeavySword, 240, Vec2::new(0.0, -90.0));
    println!("heavy under fire 30s: front {front}, side {side}, rear {rear}");
    assert!(
        rear as f32 > front as f32 * 2.5,
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
    // under heavy fire, vs the heavy wall's ~3-4x above. The claim is the
    // CONTRAST — no shield, no real front.
    let pf = kills_by_aspect(UnitClassId::Peasant, 220, Vec2::new(0.0, 90.0));
    let pr = kills_by_aspect(UnitClassId::Peasant, 220, Vec2::new(0.0, -90.0));
    println!("shieldless peasant under fire 30s: front {pf}, rear {pr}");
    let pea_ratio = pr as f32 / pf.max(1) as f32;
    let heavy_ratio = rear as f32 / front.max(1) as f32;
    assert!(
        pea_ratio < 1.7 && pea_ratio < heavy_ratio * 0.6,
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
        let pik = sim.spawn_class(Vec2::new(0.0, 0.0), facing, 200, UnitClassId::Phalanx, 0);
        let har = sim.spawn_class(
            Vec2::new(0.0, 70.0),
            -FRAC_PI_2,
            160,
            UnitClassId::HorseArchers,
            1,
        );
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
    // the line crosses under fire and arrives BLOWN (fatigue ~0), bleeds
    // to the fresh swords for a minute — and then weight tells, and the
    // archers are destroyed. Expensive, decisive, historical. (Sampling
    // only the first 30s after contact shows the blown-arrival slice and
    // reads as 'archers beat heavies'; they don't.)
    let mut sim = Sim::new(no_morale(), SEED);
    let archers = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 140, UnitClassId::Archers, 0);
    let heavies = sim.spawn_class(
        Vec2::new(0.0, 160.0),
        -FRAC_PI_2,
        240,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_attack_order(heavies, archers);
    for _ in 0..(240.0 / DT) as usize {
        sim.tick();
    }
    let archers_left = sim.units[archers].alive_count;
    let heavies_left = sim.units[heavies].alive_count;
    println!("after 240s: archers {archers_left}/140, heavies {heavies_left}/240");
    assert!(
        archers_left < 20,
        "the archers are destroyed: {archers_left}/140 left"
    );
    assert!(
        heavies_left > 240 * 27 / 100,
        "the line wins with a quarter or more standing: {heavies_left}/240"
    );
    assert!(
        heavies_left < 240 * 75 / 100,
        "but pays dearly for the frontal approach: {heavies_left}/240"
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
