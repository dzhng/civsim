//! Predefined battle setup: terrain + both armies deployed. ~15,000 soldiers
//! in 20 units per side, mixed classes, mirrored rosters.

use crate::class::{class_stats, UnitClass, UnitClassId};
use crate::genmap::certify::{DEPLOYMENT_CENTER_Y_M, DEPLOYMENT_FRONTAGE_HALF_W};
use crate::maps::{build, MapId};
use crate::math::{dir, Vec2};
use crate::sim::Sim;
use crate::terrain::Terrain;

use UnitClassId::*;

/// Soldiers per unit by class (data, freely tunable).
/// Soldiers in one deployed unit — the shared `contract::unit_size` (one campaign
/// slot = one battle unit). INDEPENDENT of the balance test bench
/// (`balance::duel_strength`, a stable 2:1 inf:cav bench) ON PURPOSE: the game can
/// retune unit sizes without moving any balance test.
pub fn unit_size(class: UnitClassId) -> usize {
    contract::unit_size(class) as usize
}

fn unit_width(class: UnitClassId) -> f32 {
    let s = class_stats(class);
    unit_width_with_stats(class, s)
}

fn unit_width_with_stats(class: UnitClassId, stats: UnitClass) -> f32 {
    let files = unit_size(class).div_ceil(stats.default_depth.max(1));
    files as f32 * stats.spacing.x
}

#[derive(Clone, Copy)]
struct SpawnPlan {
    id: u64,
    class: UnitClassId,
    render_look: u32,
    stats: UnitClass,
    count: usize,
    training: f32,
    morale_cap: f32,
}

impl SpawnPlan {
    fn width(self) -> f32 {
        unit_width_with_stats(self.class, self.stats)
    }
}

fn role(c: UnitClassId) -> usize {
    match c {
        Skirmishers => 0,
        HeavySword | HeavyPhalanx | LongSwords | HeavySpear | MediumInfantry | MediumSpear
        | MediumPhalanx => 1,
        LightSpear | Peasant | LightSword => 2,
        Archers => 3,
        ArtilleryCrew => 4,
        ShockCavalry | HorseArchers => 5,
    }
}

fn spawn_plan(
    sim: &mut Sim,
    dep_team: u32,
    plan: SpawnPlan,
    anchor: Vec2,
    face: f32,
    out: &mut Vec<(u64, usize)>,
) {
    let files = plan.count.div_ceil(plan.stats.default_depth.max(1));
    let idx = sim.spawn_class_stats_look_with_files(
        anchor,
        face,
        plan.count,
        files,
        plan.class,
        plan.stats,
        plan.render_look,
        dep_team,
    );
    let u = &mut sim.units[idx];
    u.training = plan.training.clamp(0.05, 1.0);
    u.morale_ceiling = plan.morale_cap.clamp(0.2, 1.0);
    u.morale = u.morale.min(u.morale_ceiling);
    out.push((plan.id, idx));
}

fn unit_depth(plan: SpawnPlan) -> f32 {
    let files = unit_size(plan.class).div_ceil(plan.stats.default_depth.max(1));
    (plan.count.div_ceil(files.max(1))) as f32 * plan.stats.spacing.y
}

/// Lay one row of units centered on `center`, fronts on the row line,
/// left-to-right along the facing's right axis.
fn deploy_row(sim: &mut Sim, classes: &[UnitClassId], center: Vec2, facing: f32, team: u32) {
    const GAP: f32 = 14.0;
    let total: f32 =
        classes.iter().map(|&c| unit_width(c)).sum::<f32>() + GAP * (classes.len() - 1) as f32;
    let f = dir(facing);
    let right = Vec2::new(f.y, -f.x);
    let mut x = -0.5 * total;
    for &c in classes {
        let w = unit_width(c);
        let anchor = center + right * (x + 0.5 * w);
        sim.spawn_class(anchor, facing, unit_size(c), c, team);
        x += w + GAP;
    }
}

/// Deploy one army: skirmish screen, main line, second line, archers,
/// artillery, cavalry on the wings. `base` is the main-line center;
/// `facing` points at the enemy.
fn deploy_army(sim: &mut Sim, base: Vec2, facing: f32, team: u32) {
    let f = dir(facing);
    let right = Vec2::new(f.y, -f.x);
    let row = |fwd: f32| base + f * fwd;

    deploy_row(sim, &[Skirmishers, Skirmishers], row(45.0), facing, team);
    deploy_row(
        sim,
        &[
            HeavySword,
            HeavyPhalanx,
            HeavySword,
            HeavyPhalanx,
            HeavySword,
        ],
        row(0.0),
        facing,
        team,
    );
    deploy_row(
        sim,
        &[LightSpear, HeavySword, LongSwords, HeavySword, LightSpear],
        row(-55.0),
        facing,
        team,
    );
    deploy_row(
        sim,
        &[Archers, LightSpear, Archers, Archers],
        row(-110.0),
        facing,
        team,
    );
    deploy_row(sim, &[ArtilleryCrew], row(-150.0), facing, team);
    // Cavalry wings, slightly refused.
    // Wings must fit inside the sealed flanks (open corridor |y| < ~360).
    sim.spawn_class(
        row(-20.0) + right * -300.0,
        facing,
        unit_size(ShockCavalry),
        ShockCavalry,
        team,
    );
    sim.spawn_class(
        row(-20.0) + right * 300.0,
        facing,
        unit_size(ShockCavalry),
        ShockCavalry,
        team,
    );
    sim.spawn_class(
        row(-60.0) + right * 340.0,
        facing,
        unit_size(HorseArchers),
        HorseArchers,
        team,
    );
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CustomLine {
    Front,
    Second,
    Third,
    Cavalry,
}

fn custom_line(c: UnitClassId) -> CustomLine {
    match c {
        HeavySword | HeavyPhalanx | HeavySpear | MediumInfantry | MediumSpear | MediumPhalanx => {
            CustomLine::Front
        }
        ShockCavalry | HorseArchers => CustomLine::Cavalry,
        Archers | ArtilleryCrew => CustomLine::Third,
        LightSpear | LongSwords | Skirmishers | Peasant | LightSword => CustomLine::Second,
    }
}

fn terrain_index(t: &Terrain, p: Vec2) -> Option<usize> {
    let cx = ((p.x - t.origin.x) / t.cell).floor();
    let cy = ((p.y - t.origin.y) / t.cell).floor();
    if cx < 0.0 || cy < 0.0 || cx >= t.w as f32 || cy >= t.h as f32 {
        return None;
    }
    Some(cy as usize * t.w + cx as usize)
}

fn seat_passable(t: &Terrain, p: Vec2) -> bool {
    if p.x.abs() > DEPLOYMENT_FRONTAGE_HALF_W {
        return false;
    }
    let Some(i) = terrain_index(t, p) else {
        return false;
    };
    t.speed[i] > 0.0 && !matches!(t.tint[i], 1 | 2 | 4)
}

fn footprint_passable(t: &Terrain, class: UnitClassId, anchor: Vec2, facing: f32) -> bool {
    let stats = class_stats(class);
    let count = unit_size(class);
    let files = count.div_ceil(stats.default_depth.max(1));
    let f = dir(facing);
    let right = Vec2::new(f.y, -f.x);
    for slot in 0..count {
        let file = slot % files;
        let rank = slot / files;
        let local = Vec2::new(
            (file as f32 - (files as f32 - 1.0) * 0.5) * stats.spacing.x,
            rank as f32 * stats.spacing.y,
        );
        let p = anchor + right * local.x + f * -local.y;
        if !seat_passable(t, p) {
            return false;
        }
    }
    true
}

fn find_passable_anchor(sim: &Sim, class: UnitClassId, anchor: Vec2, facing: f32) -> Vec2 {
    if footprint_passable(&sim.terrain, class, anchor, facing) {
        return anchor;
    }

    let step = sim.terrain.cell.max(1.0);
    let max_steps = (DEPLOYMENT_FRONTAGE_HALF_W / step).ceil() as i32;
    for s in 1..=max_steps {
        let dx = s as f32 * step;
        for candidate in [
            Vec2::new(anchor.x + dx, anchor.y),
            Vec2::new(anchor.x - dx, anchor.y),
        ] {
            if footprint_passable(&sim.terrain, class, candidate, facing) {
                return candidate;
            }
        }
    }
    anchor
}

/// Depth between successive wrapped rows within one deployed foot line.
const CUSTOM_ROW_BACKSTEP: f32 = 14.0;
/// Frontage kept clear of foot units on each flank so the cavalry wings,
/// anchored at the frontage edges, always end up the outermost element.
const CUSTOM_WING_CLEARANCE: f32 = 40.0;

/// Lays out one foot line, wrapping into extra rows behind the first when the
/// roster outgrows the frontage. Returns the number of rows laid.
fn deploy_custom_row(
    sim: &mut Sim,
    classes: &[UnitClassId],
    center: Vec2,
    facing: f32,
    team: u32,
) -> usize {
    const GAP: f32 = 10.0;
    const MAX_ROW_W: f32 = (DEPLOYMENT_FRONTAGE_HALF_W - CUSTOM_WING_CLEARANCE) * 2.0;

    if classes.is_empty() {
        return 0;
    }

    let f = dir(facing);
    let right = Vec2::new(f.y, -f.x);
    let mut rows: Vec<Vec<UnitClassId>> = vec![Vec::new()];
    let mut width = 0.0;
    for &class in classes {
        let w = unit_width(class);
        let next = if rows.last().unwrap().is_empty() {
            w
        } else {
            width + GAP + w
        };
        if next > MAX_ROW_W && !rows.last().unwrap().is_empty() {
            rows.push(Vec::new());
            width = 0.0;
        }
        width = if rows.last().unwrap().is_empty() {
            w
        } else {
            width + GAP + w
        };
        rows.last_mut().unwrap().push(class);
    }

    for (row_idx, row) in rows.iter().enumerate() {
        let total = row.iter().map(|&c| unit_width(c)).sum::<f32>()
            + GAP * row.len().saturating_sub(1) as f32;
        let row_center = center - f * (row_idx as f32 * CUSTOM_ROW_BACKSTEP);
        let mut x = -0.5 * total;
        for &class in row {
            let w = unit_width(class);
            let anchor = row_center + right * (x + 0.5 * w);
            let anchor = find_passable_anchor(sim, class, anchor, facing);
            sim.spawn_class(anchor, facing, unit_size(class), class, team);
            x += w + GAP;
        }
    }
    rows.len()
}

fn deploy_custom_cavalry(
    sim: &mut Sim,
    classes: &[UnitClassId],
    center: Vec2,
    facing: f32,
    team: u32,
) {
    const GAP: f32 = 12.0;
    const ROW_BACKSTEP: f32 = 18.0;
    const MAX_WING_W: f32 = DEPLOYMENT_FRONTAGE_HALF_W - 20.0;

    let split = classes.len().div_ceil(2);
    let wings = [(&classes[..split], -1.0f32), (&classes[split..], 1.0f32)];
    let f = dir(facing);
    let right = Vec2::new(f.y, -f.x);

    for (members, side) in wings {
        if members.is_empty() {
            continue;
        }
        let mut rows: Vec<Vec<UnitClassId>> = vec![Vec::new()];
        let mut width = 0.0;
        for &class in members {
            let w = unit_width(class);
            let next = if rows.last().unwrap().is_empty() {
                w
            } else {
                width + GAP + w
            };
            if next > MAX_WING_W && !rows.last().unwrap().is_empty() {
                rows.push(Vec::new());
                width = 0.0;
            }
            width = if rows.last().unwrap().is_empty() {
                w
            } else {
                width + GAP + w
            };
            rows.last_mut().unwrap().push(class);
        }

        for (row_idx, row) in rows.iter().enumerate() {
            let total = row.iter().map(|&c| unit_width(c)).sum::<f32>()
                + GAP * row.len().saturating_sub(1) as f32;
            let left_edge = if side < 0.0 {
                -DEPLOYMENT_FRONTAGE_HALF_W
            } else {
                DEPLOYMENT_FRONTAGE_HALF_W - total
            };
            let mut x = left_edge;
            let row_center = center - f * (row_idx as f32 * ROW_BACKSTEP);
            for &class in row {
                let w = unit_width(class);
                let anchor = row_center + right * (x + 0.5 * w);
                let anchor = find_passable_anchor(sim, class, anchor, facing);
                sim.spawn_class(anchor, facing, unit_size(class), class, team);
                x += w + GAP;
            }
        }
    }
}

/// Deploy a custom-battle army from class ids chosen by the frontend. The sim
/// owns the formation: three role lines inside the generated-map deployment
/// frontage, with cavalry wings on their own line one backstep behind the
/// front block — anchored at the frontage edges the foot lines keep clear of,
/// so the wings stay the outermost element — and every footprint nudged onto
/// passable, non-blocking ground.
pub fn deploy_custom_army(sim: &mut Sim, team: u32, classes: &[UnitClassId]) {
    use std::f32::consts::FRAC_PI_2;

    let team = team.min(1);
    let facing = if team == 0 { FRAC_PI_2 } else { -FRAC_PI_2 };
    let base_y = if team == 0 {
        -DEPLOYMENT_CENTER_Y_M
    } else {
        DEPLOYMENT_CENTER_Y_M
    };
    let base = Vec2::new(0.0, base_y);
    let f = dir(facing);
    let front_center = base + f * 40.0;
    let second_center = base;
    let third_center = base - f * 40.0;

    let mut front = Vec::new();
    let mut second = Vec::new();
    let mut third = Vec::new();
    let mut cavalry = Vec::new();
    for &class in classes {
        match custom_line(class) {
            CustomLine::Front => front.push(class),
            CustomLine::Second => second.push(class),
            CustomLine::Third => third.push(class),
            CustomLine::Cavalry => cavalry.push(class),
        }
    }

    let front_rows = deploy_custom_row(sim, &front, front_center, facing, team);
    deploy_custom_row(sim, &second, second_center, facing, team);
    deploy_custom_row(sim, &third, third_center, facing, team);
    let cavalry_center = front_center - f * (front_rows as f32 * CUSTOM_ROW_BACKSTEP);
    deploy_custom_cavalry(sim, &cavalry, cavalry_center, facing, team);
}

/// Deploy a campaign roster: one roster slot is one battle unit (no split),
/// grouped into the same role rows as the hand-built armies. `column: true`
/// lays the army strung out along the march axis instead — marching order,
/// the corridor machinery's natural prey. Returns (campaign unit id, sim unit
/// index) for result mapping.
pub fn deploy_roster(sim: &mut Sim, dep: &contract::Deployment) -> Vec<(u64, usize)> {
    let balance = sim.balance.clone();
    deploy_roster_with_stats_and_looks(sim, dep, &|r| balance.get(r.class), &|r| r.class as u32)
}

pub fn deploy_roster_with_stats_and_looks<F, G>(
    sim: &mut Sim,
    dep: &contract::Deployment,
    stats_for: &F,
    render_look_for: &G,
) -> Vec<(u64, usize)>
where
    F: Fn(&contract::RosterUnit) -> UnitClass,
    G: Fn(&contract::RosterUnit) -> u32,
{
    let center = Vec2::new(dep.center[0], dep.center[1]);
    let facing = dep.facing;
    let mut out: Vec<(u64, usize)> = Vec::new();

    // One roster slot is one battle unit — no split. A campaign unit and a battle
    // unit are the same thing; the slot's strength is already capped at the unit
    // establishment (= `unit_size` × the 1x/2x/3x builder), so a 1x slot is one
    // full-size unit and a 2x/3x slot is one bigger unit.
    let units: Vec<SpawnPlan> = dep
        .units
        .iter()
        .map(|r| SpawnPlan {
            id: r.id,
            class: r.class,
            render_look: render_look_for(r),
            stats: stats_for(r),
            count: r.count as usize,
            training: r.training,
            morale_cap: r.morale_cap,
        })
        .collect();

    if dep.column {
        // Marching order: a single file of units down the road behind center.
        let f = dir(facing);
        let mut fwd = 0.0;
        for &plan in &units {
            let depth = unit_depth(plan);
            spawn_plan(
                sim,
                dep.team,
                plan,
                center - f * (fwd + 0.5 * depth),
                facing,
                &mut out,
            );
            fwd += depth + 18.0;
        }
        return out;
    }

    // Formed: group by role, lay rows like deploy_army does.
    let f = dir(facing);
    let right = Vec2::new(f.y, -f.x);
    const MAX_ROW_W: f32 = 1500.0;
    const GAP: f32 = 14.0;
    let row_fwd = [45.0, 0.0, -55.0, -110.0, -150.0];
    for r in 0..5 {
        let members: Vec<&SpawnPlan> = units.iter().filter(|u| role(u.class) == r).collect();
        if members.is_empty() {
            continue;
        }
        // Chunk into rows that fit the open corridor.
        let mut rows: Vec<Vec<&SpawnPlan>> = vec![Vec::new()];
        let mut w_acc = 0.0;
        for m in members {
            let w = m.width() + GAP;
            if w_acc + w > MAX_ROW_W && !rows.last().unwrap().is_empty() {
                rows.push(Vec::new());
                w_acc = 0.0;
            }
            rows.last_mut().unwrap().push(m);
            w_acc += w;
        }
        for (k, row_members) in rows.iter().enumerate() {
            let fwd = row_fwd[r] - k as f32 * 45.0;
            let total: f32 = row_members.iter().map(|m| m.width() + GAP).sum::<f32>() - GAP;
            let mut x = -0.5 * total;
            for &&plan in row_members {
                let w = plan.width();
                spawn_plan(
                    sim,
                    dep.team,
                    plan,
                    center + f * fwd + right * (x + 0.5 * w),
                    facing,
                    &mut out,
                );
                x += w + GAP;
            }
        }
    }
    // Cavalry wings, alternating sides.
    let wings: Vec<&SpawnPlan> = units.iter().filter(|u| role(u.class) == 5).collect();
    for (k, &&plan) in wings.iter().enumerate() {
        let side = if k % 2 == 0 { 1.0 } else { -1.0 };
        let lane = 300.0 + (k / 2) as f32 * 60.0;
        spawn_plan(
            sim,
            dep.team,
            plan,
            center + f * -20.0 + right * (side * lane),
            facing,
            &mut out,
        );
    }
    out
}

/// Configurable head-to-head: one unit per side on an open field. The
/// classes are the player's choice — this is the testing bench.
pub fn setup_duel(sim: &mut Sim, a: UnitClassId, b: UnitClassId) {
    use crate::terrain::Terrain;
    use std::f32::consts::FRAC_PI_2;
    // The same compact open field as the sandboxes — without this the duel
    // runs on the default terrain and the camera frames an ocean of grass.
    sim.terrain = Terrain::flat(200, 150, 4.0, Vec2::new(-400.0, -300.0));
    // One canonical duel bench — the same numbers the balance matrix uses.
    let duel_count = crate::balance::duel_strength;
    let ua = sim.spawn_class(Vec2::new(0.0, -90.0), FRAC_PI_2, duel_count(a), a, 0);
    let ub = sim.spawn_class(Vec2::new(0.0, 90.0), -FRAC_PI_2, duel_count(b), b, 1);
    // A duel is a COMMITTED clash: both advance at the run (the matrix
    // measures the meeting of two charges, not two strolls).
    sim.set_pace(ua, crate::tunables::Pace::Run);
    sim.set_pace(ub, crate::tunables::Pace::Run);
}

/// Small open fields for quick vibe checks: 0 = 1v1 heavies,
/// 1 = 5v5 mixed line, 2 = cavalry charge vs a wide line FACE-ON,
/// 3 = the same charge into the line's FLANK (pure 1v1, nothing else).
pub fn setup_sandbox(sim: &mut Sim, kind: u32) {
    use crate::terrain::Terrain;
    use std::f32::consts::FRAC_PI_2;
    let mut t = Terrain::flat(200, 150, 4.0, Vec2::new(-400.0, -300.0));
    // A touch of scenery; the field stays open.
    t.paint_circle(Vec2::new(-220.0, 130.0), 60.0, 0.7, 0.6);
    t.paint_circle(Vec2::new(240.0, -90.0), 55.0, 0.55, 0.35);
    sim.terrain = t;

    if kind == 0 {
        sim.spawn_class(
            Vec2::new(0.0, -90.0),
            FRAC_PI_2,
            240,
            UnitClassId::HeavySword,
            0,
        );
        sim.spawn_class(
            Vec2::new(0.0, 90.0),
            -FRAC_PI_2,
            240,
            UnitClassId::HeavySword,
            1,
        );
        return;
    }
    if kind == 4 {
        // SURROUND gut-check: a long-sword BLOCK (deepened to a ~square so it's
        // a compact body, not a wide line) encircled by heavy infantry on all
        // four sides — a true envelopment, the scenario behind the surround-
        // sensitivity check.
        {
            let mut s = sim.balance.get(UnitClassId::LongSwords);
            s.default_depth = 13; // 169 men -> ~13x13 block instead of a 40-wide line
            sim.balance.set(UnitClassId::LongSwords, s);
        }
        sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            169,
            UnitClassId::LongSwords,
            0,
        );
        sim.spawn_class(
            Vec2::new(0.0, 26.0),
            -FRAC_PI_2,
            90,
            UnitClassId::HeavySword,
            1,
        );
        sim.spawn_class(
            Vec2::new(0.0, -26.0),
            FRAC_PI_2,
            90,
            UnitClassId::HeavySword,
            1,
        );
        sim.spawn_class(
            Vec2::new(26.0, 0.0),
            std::f32::consts::PI,
            90,
            UnitClassId::HeavySword,
            1,
        );
        sim.spawn_class(Vec2::new(-26.0, 0.0), 0.0, 90, UnitClassId::HeavySword, 1);
        return;
    }
    if kind == 5 {
        // PIN + FLANK: a Heavy (team 1) pinned frontally by ANOTHER Heavy — a
        // real threat it can't safely turn from — and flanked on its right by a
        // compact Long-sword block. Divided defense: it can't face both, so the
        // flank lands and the pinned heavy is cracked. The long sword's role.
        {
            let mut s = sim.balance.get(UnitClassId::LongSwords);
            s.default_depth = 12; // a compact block that concentrates on the flank, not a thin line
            sim.balance.set(UnitClassId::LongSwords, s);
        }
        sim.spawn_class(
            Vec2::new(0.0, 0.0),
            FRAC_PI_2,
            240,
            UnitClassId::HeavySword,
            1,
        );
        sim.spawn_class(
            Vec2::new(0.0, 30.0),
            -FRAC_PI_2,
            240,
            UnitClassId::HeavySword,
            0,
        );
        sim.spawn_class(
            Vec2::new(30.0, 2.0),
            std::f32::consts::PI,
            190,
            UnitClassId::LongSwords,
            0,
        );
        return;
    }
    if kind == 2 || kind == 3 {
        // A 100x4 line facing north; blue cavalry charges its face (kind 2)
        // or its eastern flank (kind 3).
        sim.spawn_unit(
            Vec2::new(0.0, 40.0),
            FRAC_PI_2,
            400,
            100,
            Vec2::new(1.0, 1.1),
            1,
            0.7,
        );
        let (p, f) = if kind == 2 {
            (Vec2::new(0.0, 160.0), -FRAC_PI_2)
        } else {
            (Vec2::new(160.0, 38.0), std::f32::consts::PI)
        };
        sim.spawn_class(p, f, 160, UnitClassId::ShockCavalry, 0);
        return;
    }
    // Clash of Arms: the full roster, one of everything per side — a
    // combined-arms field battle in miniature. Skirmish screen out front,
    // a four-unit line of battle, archers and engines behind, both kinds
    // of horse on the wing.
    let side = |sim: &mut Sim, y: f32, facing: f32, team: u32| {
        let f = dir(facing);
        let right = Vec2::new(f.y, -f.x);
        let row = |o: f32, lat: f32| Vec2::new(0.0, y) + f * o + right * lat;
        sim.spawn_class(row(25.0, 30.0), facing, 120, UnitClassId::Skirmishers, team);
        sim.spawn_class(row(0.0, -110.0), facing, 280, UnitClassId::HeavySword, team);
        sim.spawn_class(
            row(0.0, -25.0),
            facing,
            280,
            UnitClassId::HeavyPhalanx,
            team,
        );
        sim.spawn_class(row(0.0, 55.0), facing, 140, UnitClassId::LongSwords, team);
        sim.spawn_class(row(0.0, 125.0), facing, 220, UnitClassId::LightSpear, team);
        sim.spawn_class(row(-40.0, -30.0), facing, 140, UnitClassId::Archers, team);
        sim.spawn_class(
            row(-55.0, 60.0),
            facing,
            40,
            UnitClassId::ArtilleryCrew,
            team,
        );
        sim.spawn_class(
            row(-10.0, 200.0),
            facing,
            110,
            UnitClassId::ShockCavalry,
            team,
        );
        sim.spawn_class(
            row(-30.0, -190.0),
            facing,
            90,
            UnitClassId::HorseArchers,
            team,
        );
    };
    side(sim, -140.0, FRAC_PI_2, 0);
    side(sim, 140.0, -FRAC_PI_2, 1);
}

/// Build terrain and deploy: player south facing north, enemy north facing
/// south, east/west flanks sealed by the map itself.
pub fn setup_battle(sim: &mut Sim, map: MapId) {
    sim.terrain = build(map);
    deploy_default_armies(sim);
}

/// Generated-map twin of `setup_battle`: the armies deploy on the SAME terrain
/// they will fight on (never build one map and swap another underneath).
pub fn setup_battle_generated(sim: &mut Sim, recipe: &crate::genmap::MapRecipe) {
    sim.terrain = crate::genmap::generate(recipe);
    deploy_default_armies(sim);
}

fn deploy_default_armies(sim: &mut Sim) {
    use std::f32::consts::FRAC_PI_2;
    deploy_army(sim, Vec2::new(0.0, -600.0), FRAC_PI_2, 0);
    deploy_army(sim, Vec2::new(0.0, 600.0), -FRAC_PI_2, 1);
}
