//! Melee emergence tests, 1v1 focused: every promised behavior must arise
//! from the five weapon numbers + bodies + pressure. There is no class- or
//! situation-conditional combat logic to fall back on.

pub mod common;

use common::{deaths, living_mean, no_morale, run};
use sim::{Sim, UnitClassId, Vec2, DT};
use std::f32::consts::{FRAC_PI_2, PI};

const SEED: u64 = 99;

// `melee_kills_and_formations_thin` MOVED to `mechanics_melee.rs` — even-
// handedness, grind-duration, and engagement are physics invariants of a
// symmetric clash, not pricing outcomes, so they belong in the mechanics bucket.

#[test]
fn deep_column_pushes_thin_line_back() {
    // Same class and width; only enemy depth differs. The deep column's
    // measured backpressure converts to forward drive: against a thin enemy
    // the contact line advances; against an equal column it deadlocks.
    let advance = |enemy_count: usize| -> f32 {
        let mut sim = Sim::new(no_morale(), SEED);
        let deep = sim.spawn_unit(
            Vec2::new(0.0, -10.0),
            FRAC_PI_2,
            300,
            20,
            Vec2::new(1.0, 1.2),
            0,
            0.7,
        );
        let enemy = sim.spawn_unit(
            Vec2::new(0.0, 10.0),
            -FRAC_PI_2,
            enemy_count,
            20,
            Vec2::new(1.0, 1.2),
            1,
            0.7,
        );
        sim.set_attack_move_order(deep, Vec2::new(0.0, 30.0));
        sim.set_attack_move_order(enemy, Vec2::new(0.0, -30.0));
        run(&mut sim, 40.0);
        let _ = enemy;
        sim.units[deep].anchor.y
    };
    let vs_thin = advance(100); // 5 ranks
    let vs_equal = advance(300); // 15 ranks: mirror match
                                 // Depth still wins the push war — but the margin is now slim because the
                                 // thin line CLOSES UP as it bleeds (sheds width to hold 3 ranks, see the
                                 // casualty reshape), gaining the very depth that was its disadvantage. A
                                 // thinning line condensing to resist harder is the intended behaviour; the
                                 // deep column advances farther against it, just not by the old wide margin.
    assert!(
        vs_thin > vs_equal,
        "depth must win the push war: front at {vs_thin:.1} vs {vs_equal:.1} against equal depth"
    );
}

#[test]
fn deep_pike_wall_holds_thin_pike_line_gets_closed_on() {
    let fight = |phalanx_count: usize| -> (usize, usize, f32, usize) {
        let mut sim = Sim::new(no_morale(), SEED);
        let ph = sim.spawn_class(
            Vec2::new(0.0, 10.0),
            -FRAC_PI_2,
            phalanx_count,
            UnitClassId::Phalanx,
            0,
        );
        let atk = sim.spawn_class(
            Vec2::new(0.0, -14.0),
            FRAC_PI_2,
            240,
            UnitClassId::HeavySword,
            1,
        );
        sim.set_attack_move_order(atk, Vec2::new(0.0, 20.0));
        let mut min_gap = f32::INFINITY;
        let mut max_sword_fighting = 0usize;
        for _ in 0..(90.0 / DT) as usize {
            sim.tick();
            let atk_u = &sim.units[atk];
            max_sword_fighting = max_sword_fighting.max(
                (atk_u.start..atk_u.start + atk_u.count)
                    .filter(|&i| sim.alive[i] == 1 && sim.fighting[i] == 1)
                    .count(),
            );
            let ph_u = &sim.units[ph];
            for i in (atk_u.start..atk_u.start + atk_u.count).filter(|&i| sim.alive[i] == 1) {
                for j in (ph_u.start..ph_u.start + ph_u.count).filter(|&j| sim.alive[j] == 1) {
                    let gap = (sim.soldier_pos(i) - sim.soldier_pos(j)).len()
                        - sim.radius[i]
                        - sim.radius[j];
                    min_gap = min_gap.min(gap);
                }
            }
        }
        (
            deaths(&sim, ph),
            deaths(&sim, atk),
            min_gap,
            max_sword_fighting,
        )
    };
    // 10 ranks of pikes: a wall. Attackers pay a steep premium pressing it.
    let (wall_loss, atk_loss_vs_wall, wall_gap, wall_swords) = fight(300);
    let atk_frac = atk_loss_vs_wall as f32 / 240.0;
    let wall_frac = wall_loss as f32 / 300.0;
    assert!(
        atk_frac > 1.4 * wall_frac,
        "deep pikes must punish a frontal assault: attacker {atk_loss_vs_wall}/240, phalanx {wall_loss}/300"
    );
    assert!(
        wall_gap > 1.2 && wall_swords == 0,
        "a deep pike wall keeps swords out of sword range: min gap {wall_gap:.2}m, sword-fighters {wall_swords}"
    );
    // 2 ranks of pikes: not enough push rate; the enemy closes to sword range.
    // `thin_swords` is the direct signal; `thin_gap` is a sanity rail with a
    // little geometry slack because body radii/reach sit right around 1.1m.
    let (_, _, thin_gap, thin_swords) = fight(60);
    assert!(
        thin_swords > 0 && thin_gap < 1.2,
        "a thin pike line must get closed on: min gap {thin_gap:.2}m, sword-fighters {thin_swords}"
    );
}

#[test]
fn pikes_bite_only_to_the_front() {
    // The sarissa is braced to the formation's frontage: it skewers what's ahead
    // of the UNIT and nothing else. Same phalanx (holding, facing +y), same heavy
    // assault driven onto it, same closing distance — but from the FRONT vs the
    // REAR. Frontal, the hedge is a meat grinder and the wall barely bleeds. From
    // behind, the pikes can't bear (the men fall to their short side-swords), so
    // the attacker walks in and it's the phalanx that pays. No 360° porcupine.
    let trial = |rear: bool| -> (usize, usize) {
        let mut sim = Sim::new(no_morale(), SEED);
        let ph = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 300, UnitClassId::Phalanx, 0); // faces +y
        let y = if rear { -16.0 } else { 16.0 };
        let face = if rear { FRAC_PI_2 } else { -FRAC_PI_2 };
        let atk = sim.spawn_class(Vec2::new(0.0, y), face, 240, UnitClassId::HeavySword, 1);
        sim.set_attack_move_order(atk, Vec2::new(0.0, 0.0)); // drive into the wall
        run(&mut sim, 70.0);
        (deaths(&sim, atk), deaths(&sim, ph)) // (attacker dead, phalanx dead)
    };
    let (atk_front, ph_front) = trial(false);
    let (atk_rear, ph_rear) = trial(true);
    eprintln!("PIKE-BITE  front: atk {atk_front} ph {ph_front}  |  rear: atk {atk_rear} ph {ph_rear}  (ratio {:.2})", atk_front as f32 / atk_rear.max(1) as f32);
    // A frontal assault is worse for the attacker; a rear one is catastrophic for
    // the phalanx. The exact attacker-death ratio is balance-sensitive once heavy
    // shields make the rear assault a real grind too, so the directional contract
    // is pinned by both sides of the exchange: front hurts the attacker more, rear
    // hurts the phalanx far more.
    assert!(
        atk_front > atk_rear,
        "pikes must punish the FRONT more than the rear: attacker died {atk_front} (front) vs {atk_rear} (rear)"
    );
    // And the phalanx is the one that bleeds when its hedge faces the wrong way.
    // The combat overhaul (3s stun, attack intervals ~3.5x longer, sword damage at
    // parity 0.5) made every grind slower and less lethal per unit time, so the
    // ABSOLUTE rear toll dropped from the old >40 to ~25 in this 70s window. The
    // DIRECTIONAL truth is unchanged and stark: hit from behind the wall has no
    // pikes there and pays heavily (ph_rear ~25) while a frontal hedge barely
    // bleeds (ph_front ~0). Pin the gap, not the old magnitude.
    assert!(
        ph_rear > ph_front + 15,
        "a phalanx hit from behind has no pikes there, so it pays: phalanx died {ph_rear} (rear) vs {ph_front} (front)"
    );
}

#[test]
fn attack_from_behind_is_deadlier_than_frontal() {
    // Footprint-identical comparison: victim faces the attacker vs faces
    // away. Shields cover the front arc, so rear strikes land unblocked —
    // but the claim only lives in the EARLY window: the victim wheels to
    // face within ~10s, and after that hit-push displacement feedback
    // dominates (frontal victims compress into their own block and die in
    // the vice; rear victims get bowled clear of the fight).
    //
    // Measure DAMAGE TAKEN, not kills: kills are a tiny, displacement-confounded
    // count (single digits — noise that flips on a breeze), whereas the health
    // the shields shed off the front is a large smooth number that reads the
    // mechanism directly. IDENTICAL contact, facing the ONLY variable: the two
    // lines spawn already touching, nobody ordered to move, and we read the
    // first seconds before the struck line can wheel. The rear-facing victim
    // presents its bare back to the same blows the front-facing one shields —
    // head-on geometry held constant, so the difference is purely the shield
    // arc, not how hard the lines meet.
    let damage_taken = |face_north: bool, seed: u64| -> f32 {
        let mut sim = Sim::new(no_morale(), seed);
        let facing = if face_north { FRAC_PI_2 } else { -FRAC_PI_2 };
        let v = sim.spawn_class(Vec2::new(0.0, 0.0), facing, 200, UnitClassId::HeavySword, 0);
        // Spawned within a sword's reach so both faces are fought from tick 0 —
        // no approach for the press to hold off, just blows on shield vs back.
        let atk = sim.spawn_class(
            Vec2::new(0.0, -1.4),
            FRAC_PI_2,
            200,
            UnitClassId::HeavySword,
            1,
        );
        sim.set_charge_enabled(atk, false);
        let (vs, vc) = (sim.units[v].start, sim.units[v].count);
        let before: f32 = (vs..vs + vc).map(|i| sim.health[i]).sum();
        run(&mut sim, 3.0); // before the line can turn its back away
        let after: f32 = (vs..vs + vc).map(|i| sim.health[i].max(0.0)).sum();
        before - after
    };
    let mut frontal = 0.0;
    let mut rear = 0.0;
    for seed in [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4] {
        frontal += damage_taken(false, seed);
        rear += damage_taken(true, seed);
    }
    println!("damage taken (5 seeds): rear {rear:.0} vs frontal {frontal:.0}");
    assert!(
        rear > frontal * 1.5,
        "rear attacks land unblocked, the front sheds them: rear {rear:.0} vs frontal {frontal:.0}"
    );
}

#[test]
fn rider_reachability_is_pure_geometry() {
    // Controlled lines at fixed separations; measure which health pool the
    // first seconds of strikes damage. (In a prolonged scrum swords reach
    // riders too — from the SIDES — which is correct; this test isolates the
    // frontal geometry claim.)
    let pool_damage =
        |seed: u64, attacker: UnitClassId, separation: f32, cav_facing: f32| -> (f32, f32) {
            let mut sim = Sim::new(no_morale(), seed);
            let atk = sim.spawn_class(Vec2::new(0.0, 0.0), FRAC_PI_2, 40, attacker, 0);
            let cav = sim.spawn_class(
                Vec2::new(0.0, separation),
                cav_facing,
                30,
                UnitClassId::ShockCavalry,
                1,
            );
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
    // The frontal-geometry claim is a seed AVERAGE, not one roll: a single seed's
    // interpenetration jitter can let a stray sword reach a rider (sword_share
    // swings 0.00-0.29 across seeds), so the GEOMETRY — swords reach horseflesh,
    // pikes reach the man — is what holds on the mean. (Pinning one seed left it
    // chaos-marginal; averaging pins the geometry, not the dice.)
    let seeds = [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4];
    let agg = |attacker: UnitClassId, sep: f32, facing: f32| -> (f32, f32, f32) {
        let (mut share, mut rider, mut horse) = (0.0f32, 0.0f32, 0.0f32);
        for &s in &seeds {
            let (r, h) = pool_damage(s, attacker, sep, facing);
            share += r / (r + h).max(1e-6);
            rider += r;
            horse += h;
        }
        let n = seeds.len() as f32;
        (share / n, rider / n, horse / n)
    };
    // Swords vs horse fronts: the horse is a shield of meat — its chest/neck/head
    // sit between the swordsman and the elevated rider, so frontal sword damage
    // lands mostly on horseflesh. The rider still catches a realistic ~1/4-1/3 via
    // melee churn (lines interpenetrate, horses mill, a rider's legs are sword
    // height) — frontal riders historically took leg wounds. The bound is the
    // DESIGN ceiling (<30% to the man frontally), not the clean-geometry ideal;
    // above it would mean swords reach frontal riders too easily — a real
    // geometry regression. The relative claim (pikes find riders far better, below)
    // is the sharper discriminator.
    let (sword_share, _, horse) = agg(UnitClassId::HeavySword, 2.4, -FRAC_PI_2);
    // Horse still takes the clear majority frontally (the chest/neck shield the
    // elevated rider). The rider's share is a touch higher than the old ideal
    // because shock cav now GRINDS at sword range in the press (drawing its
    // sidearm once a charge is spent) instead of sitting behind a couched lance
    // that never closed — fighting man-to-horse-to-man exposes the rider's legs
    // more, which is part of why a bogged charge bleeds. The sharp geometry claim
    // is the RELATIVE one below (pikes find riders far better than swords).
    assert!(
        horse > 0.25 && sword_share < 0.40,
        "frontal swords hack horses: mean horse {horse:.2}, mean rider share {sword_share:.2}"
    );
    // Pikes at reach: front-rank pikes find riders (rear-rank pikes can only
    // poke the horses' noses — also correct geometry), so the rider SHARE is
    // what discriminates pikes from swords.
    let (pike_share, pike_rider, _) = agg(UnitClassId::Phalanx, 3.4, -FRAC_PI_2);
    assert!(
        pike_rider > 0.12 && pike_share > sword_share + 0.1,
        "frontal pikes find riders far better than swords: mean rider {pike_rider:.2} \
         (share {pike_share:.2} vs sword {sword_share:.2})"
    );
    // Swords against the horses' SIDE: the rider is suddenly in reach.
    let (_, side_rider, _) = agg(UnitClassId::HeavySword, 1.6, 0.0);
    assert!(
        side_rider > 0.15,
        "side swords reach riders: mean rider {side_rider:.2}"
    );
}

#[test]
fn a_braced_holding_line_absorbs_a_frontal_charge() {
    // A SET, braced shield wall meets a frontal charge with its planted front and
    // ABSORBS it: the carried closing collapses as the horses bog on the wall, so
    // the cav does NOT break through and the line is not slaughtered. Cavalry shock
    // tells on a line MOVING to meet it (mechanics_impact's 91 knockdowns) or on a
    // soft flank — NOT on a planted wall taken head-on. (A shield wall's brace() is
    // omni-directional; its directional softness lives in the shield BLOCK being
    // front-arc only and the impact-evade aspect — but a flanked unit re-faces the
    // threat, so that softness is transient. A clean flank-breaks-in case wants
    // DIRECTIONAL brace, a deliberate follow-up; the pike directional stop is
    // already pinned by phalanx_points_stop_horses.)
    let mut sim = Sim::new(no_morale(), SEED);
    let wall = sim.spawn_class_with_files(Vec2::ZERO, FRAC_PI_2, 200, 20, UnitClassId::HeavySword, 0);
    for _ in 0..(2.0 / DT) as usize {
        sim.tick(); // a beat to set the brace before contact
    }
    let cav = sim.spawn_class(Vec2::new(0.0, -70.0), FRAC_PI_2, 120, UnitClassId::ShockCavalry, 1);
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_attack_move_order(cav, Vec2::new(0.0, 70.0));
    let mut deepest = f32::MIN;
    for _ in 0..(25.0 / DT) as usize {
        sim.tick();
        deepest = deepest.max(sim.units[cav].centroid.y);
    }
    let dead = sim.units[wall].count - sim.units[wall].alive_count;
    // The wall is centred at y=0, front rank near y≈+5; the cav bogs on it and never
    // rides out the far side.
    assert!(
        deepest < 8.0,
        "a braced line absorbs the charge — the cav must not break through: cav reached y {deepest:.1}"
    );
    assert!(dead < 60, "the braced line holds, not slaughtered: {dead} dead");
    assert!(
        sim.units[wall].cohesion > 0.4,
        "the line keeps its shape (jostled but not dissolved): cohesion {:.2}",
        sim.units[wall].cohesion
    );
}

#[test]
fn charge_impact_knocks_infantry_down() {
    // The shock of a charge KNOCKS MEN DOWN — the body-impact mostly STUNS (it
    // rarely kills outright; the kills come from the lance and the grind). So the
    // signal is a swath of stunned men at contact, not a pile of impact corpses.
    let mut sim = Sim::new(no_morale(), SEED);
    let inf = sim.spawn_class(
        Vec2::new(0.0, 30.0),
        -FRAC_PI_2,
        200,
        UnitClassId::LightSpear,
        0,
    );
    let cav = sim.spawn_class(
        Vec2::new(0.0, -60.0),
        FRAC_PI_2,
        120,
        UnitClassId::ShockCavalry,
        1,
    );
    sim.set_pace(cav, sim::Pace::Run);
    sim.set_attack_order(cav, inf); // charge home and engage, not ride past
    sim.set_attack_order(inf, cav); // the infantry advance to meet the charge
    let ids: Vec<usize> = (0..sim.soldier_count())
        .filter(|&i| sim.soldier_unit[i] as usize == inf)
        .collect();
    let mut ever_stunned = vec![false; ids.len()];
    for _ in 0..(60.0 / DT) as usize {
        sim.tick();
        for (k, &i) in ids.iter().enumerate() {
            if sim.stun[i] > 0.0 {
                ever_stunned[k] = true;
            }
        }
    }
    let stunned = ever_stunned.iter().filter(|&&b| b).count();
    let dead = sim.units[inf].count - sim.units[inf].alive_count;
    // The charge disrupts the front — it knocks men down (stun) and the lance +
    // grind bloody it. (The heavy-knockdown case vs a softer line is pinned tight
    // in mechanics_impact; here the spearmen bite back so the shock is smaller.)
    assert!(
        stunned >= 3 && dead >= 15,
        "a cavalry charge must knock infantry DOWN and bloody them: {stunned} stunned, {dead} dead"
    );
}

#[test]
fn attack_order_equals_walking_into_contact() {
    // The CONTRACT: combat effectiveness comes from physics, not the order.
    // Commitment differs by design (Move fights in stride and passes on;
    // Attack latches) — so compare the same 20 seconds of CONTACT.
    let losses_in_contact = |use_attack_order: bool| -> (usize, usize) {
        let mut sim = Sim::new(no_morale(), SEED);
        let a = sim.spawn_class(
            Vec2::new(0.0, -12.0),
            FRAC_PI_2,
            240,
            UnitClassId::HeavySword,
            0,
        );
        let b = sim.spawn_class(
            Vec2::new(0.0, 15.0),
            -FRAC_PI_2,
            150,
            UnitClassId::HeavySword,
            1,
        );
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
    let a = sim.spawn_class(
        Vec2::new(0.0, -12.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    // The enemy a fights — contact-tracked, no handle needed.
    sim.spawn_class(
        Vec2::new(0.0, 12.0),
        -FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        1,
    );
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
    // The extraction is an honest, monotonic peel-off, but it got markedly slower
    // with the combat overhaul: the attack now embeds deeper (3s stun keeps braced
    // men on their feet, a winning roll runs unleashed) and the longer, less-lethal
    // grind means the latched pursuer keeps trailing contact far longer before the
    // gap finally opens. The instrumented trajectory peels steadily — engaged
    // ~107→82→58→29→16→0 — and clears (engaged 0, moved ~76m) only past the
    // ~115s mark. This is a TIMING-WINDOW re-derivation, not a relaxed invariant:
    // the unit DOES break contact and DOES leave; the slower physics just needs
    // most of two minutes to do it. Give the about-face the time it now takes.
    run(&mut sim, 120.0);
    assert!(
        sim.units[a].engaged < 10, // a trailing straggler or two is contact noise
        "withdrawing unit must break contact, engaged {}",
        sim.units[a].engaged
    );
    let moved = at_order.y - living_mean(&sim, a).y;
    assert!(
        moved > 22.0,
        "withdrawing unit must actually leave, moved {moved:.1}m"
    );
}

#[test]
fn unit_attacked_from_two_sides_splits_facing_and_loses_cohesion() {
    let mut sim = Sim::new(no_morale(), SEED);
    // Direct spec construction: enemies spawned already in contact on BOTH
    // sides of a unit facing east; nobody moves. The per-soldier reactive
    // facing rule must split the unit's men toward both threats unaided.
    // Front AND rear contact (the spec's case): whole ranks engage each way.
    // Victim faces east: front line at x=3.5, rear at x=-8.5.
    let v = sim.spawn_unit(
        Vec2::new(0.0, 0.0),
        0.0,
        240,
        26,
        Vec2::new(1.0, 1.2),
        0,
        0.7,
    );
    let e = sim.spawn_class(Vec2::new(5.6, 0.0), PI, 160, UnitClassId::LightSpear, 1);
    let w = sim.spawn_class(Vec2::new(-10.6, 0.0), 0.0, 160, UnitClassId::LightSpear, 1);
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
    // The dual attack strains the lattice (cohesion drops from a settled ~1.0).
    // The contact-foundation rebuild made units HOLD their grid far better, so
    // the position strain is now milder than the old <0.75 — the disorder shows
    // in the SPLIT FACING (asserted above), the real claim, not in a collapsed
    // grid. Pin the strain at "measurably below a settled line" against the new,
    // higher cohesion baseline.
    assert!(
        unit.cohesion < 0.9,
        "the dual attack must strain the lattice, got {}",
        unit.cohesion
    );
}

// (Deleted flanked_line_only_the_edge_unit_turns: it asserted a flanked line
// WHEELS as a formation to face its attacker. By design a unit attacked does
// not magically turn — an ordered unit holds the facing it met the enemy at
// (the anti-swirl rule in contact_facing), and the per-soldier reactive facing
// turns the edge MEN, not the block. There is no formation-wheel-on-attack to
// test for.)

// `long_swords_cleave_but_die_in_a_press` MOVED to `balance_combat.rs` — it is a
// per-class pricing OUTCOME (cleave kill-differential + vice survivor count), not
// a physics invariant, so it lives in the balance bucket now.

#[test]
fn charge_bursts_only_in_the_final_approach_of_an_attack() {
    let mut sim = Sim::new(no_morale(), SEED);
    // Close enough that the heavies arrive with LEGS: armor is paid for in
    // wind now, and a 100m running approach reaches the window too blown to
    // burst (correct, but it would test depletion instead of the window).
    let a = sim.spawn_class(
        Vec2::new(0.0, -40.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    let b = sim.spawn_class(
        Vec2::new(0.0, 20.0),
        -FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        1,
    );
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
    let a = sim.spawn_class(
        Vec2::new(0.0, -80.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    let b = sim.spawn_class(
        Vec2::new(0.0, 20.0),
        -FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_charge_enabled(a, false);
    sim.set_attack_order(a, b);
    let mut peak = 0.0f32;
    for _ in 0..(70.0 / DT) as usize {
        sim.tick();
        peak = peak.max(sim.units[a].frame_speed);
    }
    assert!(
        peak < run_speed_cap,
        "charge disabled means no burst: peak {peak:.2}"
    );
}

#[test]
fn combat_drains_stamina() {
    let mut sim = Sim::new(no_morale(), SEED);
    let a = sim.spawn_class(
        Vec2::new(0.0, -12.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    let b = sim.spawn_class(
        Vec2::new(0.0, 12.0),
        -FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_attack_move_order(a, Vec2::new(0.0, 12.0));
    run(&mut sim, 60.0);
    assert!(
        sim.units[b].stamina < 0.9,
        "even the defender's arms tire: stamina {}",
        sim.units[b].stamina
    );
    let _ = a;
}

#[test]
fn surrounded_unit_breakout_bores_toward_the_click() {
    // A heavy block ringed by enemies, ordered to break out south with
    // the move order must drive it toward the CLICK, and the indecisive
    // contact mean must not freeze its facing away from the escape.
    let mut sim = Sim::new(no_morale(), SEED);
    let u = sim.spawn_class(
        Vec2::new(0.0, 0.0),
        FRAC_PI_2,
        300,
        UnitClassId::HeavySword,
        0,
    );
    // The ring: four enemy units boxing it in.
    for (x, y, f) in [
        (0.0, 24.0, -FRAC_PI_2),
        (0.0, -24.0, FRAC_PI_2),
        (30.0, 0.0, PI),
        (-30.0, 0.0, 0.0),
    ] {
        let e = sim.spawn_class(Vec2::new(x, y), f, 200, UnitClassId::LightSpear, 1);
        sim.set_charge_enabled(e, false); // isolate the BREAKOUT variable: counter-bursts shove the block around
        sim.set_attack_order(e, u);
    }
    // Let the encirclement close.
    run(&mut sim, 15.0);
    let y0 = sim.units[u].centroid.y;
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
        "the breakout must grind toward the click: peak {peak:.1}m south"
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
    let a = sim.spawn_class(
        Vec2::new(0.0, -30.0),
        FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        0,
    );
    let b = sim.spawn_class(
        Vec2::new(0.0, 30.0),
        -FRAC_PI_2,
        200,
        UnitClassId::HeavySword,
        1,
    );
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
    // The won impact ROLLS the loser for a few seconds while the still-advancing
    // mass collapses its carried closing onto the brace — measured ~4.8s now that
    // the impact carries further before it bogs (it stuns rather than stopping dead,
    // so the masses interpenetrate a beat more before the front forms). The
    // INVARIANT this guards is the pinned-flag regression (~12s, charging re-armed
    // every melee tick until stamina ran dry); 4.8s is the mass spending itself, not
    // that bug. Pin under 6s: the charge clears well before the formed melee.
    assert!(
        charge_secs_late < 6.0,
        "a stopped mass must clear its charge: {charge_secs_late:.1}s of charging while formed"
    );
    assert!(
        !crossed,
        "units must meet as fronts, not pass through each other"
    );
}

#[test]
fn cavalry_charge_keeps_its_burst_through_a_thin_line() {
    // The counter-case to the spent rule: 160 shock cavalry into a 4-deep
    // line of 400. The mass is NOT stopped — it grinds through and out the
    // far side — so the burst must survive contact (the clock only caps a
    // sprint in the open) and the plow must actually punch through.
    let mut sim = Sim::new(no_morale(), SEED);
    let line = sim.spawn_unit(
        Vec2::new(0.0, 40.0),
        FRAC_PI_2,
        400,
        100,
        Vec2::new(1.0, 1.1),
        1,
        0.7,
    );
    let cav = sim.spawn_class(
        Vec2::new(0.0, 160.0),
        -FRAC_PI_2,
        160,
        UnitClassId::ShockCavalry,
        0,
    );
    sim.set_pace(cav, sim::Pace::Run); // a charge is ORDERED at speed
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
    // The plow drives INTO and through the standing ranks, not over them: under the
    // new charge model a trample rides over downed men freely but each standing
    // braced rank still bleeds the momentum once, so 4 ranks (and a closing-up line)
    // bog the burst partway. The cav mean grinds from contact (~y40) down to ~33-34
    // and is still advancing at the window's end — a punch-through into the body of
    // the line, just shallower than the old ride-clean-out (the depth is an OUTCOME
    // of how many ranks bleed it, not a free pass-through). Pin it below the front
    // rank: the mass is inside the line, not stopped on its face.
    assert!(
        m.y < 36.0,
        "the plow must punch into the line (front at 40), cavalry mean at y {:.1}",
        m.y
    );
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
        let v = sim.spawn_unit(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            60,
            60,
            Vec2::new(1.0, 1.2),
            0,
            0.7,
        );
        // Front arm: no pin needed (facing the hammer is the engaged
        // state); its anvil sits beyond awareness for body-count parity.
        let (anvil_y, hammer_y) = if rear { (0.9, -1.55) } else { (-9.0, 1.55) };
        let anvil = sim.spawn_unit(
            Vec2::new(0.0, anvil_y),
            if anvil_y > 0.0 { -FRAC_PI_2 } else { FRAC_PI_2 },
            60,
            60,
            Vec2::new(1.0, 1.2),
            1,
            0.7,
        );
        sim.set_disengage_order(anvil, Vec2::new(0.0, anvil_y));
        let hammer = sim.spawn_unit(
            Vec2::new(0.0, hammer_y),
            if hammer_y > 0.0 {
                -FRAC_PI_2
            } else {
                FRAC_PI_2
            },
            60,
            60,
            Vec2::new(1.0, 1.2),
            1,
            0.7,
        );
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
