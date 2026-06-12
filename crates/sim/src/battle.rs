//! Predefined battle setup: terrain + both armies deployed. ~15,000 soldiers
//! in 20 units per side, mixed classes, mirrored rosters.

use crate::class::{class_stats, UnitClassId};
use crate::maps::{build, MapId};
use crate::math::{dir, Vec2};
use crate::sim::Sim;

use UnitClassId::*;

/// Soldiers per unit by class (data, freely tunable).
pub fn unit_size(class: UnitClassId) -> usize {
    match class {
        HeavyInfantry => 1280,
        LightInfantry => 880,
        LongSwords => 360,
        Phalanx => 1280,
        Archers => 480,
        Skirmishers => 360,
        ShockCavalry => 280,
        HorseArchers => 240,
        ArtilleryCrew => 80,
    }
}

fn unit_width(class: UnitClassId) -> f32 {
    let s = class_stats(class);
    let files = unit_size(class).div_ceil(s.default_depth.max(1));
    files as f32 * s.spacing.x
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
        &[HeavyInfantry, Phalanx, HeavyInfantry, Phalanx, HeavyInfantry],
        row(0.0),
        facing,
        team,
    );
    deploy_row(
        sim,
        &[LightInfantry, HeavyInfantry, LongSwords, HeavyInfantry, LightInfantry],
        row(-55.0),
        facing,
        team,
    );
    deploy_row(
        sim,
        &[Archers, LightInfantry, Archers, Archers],
        row(-110.0),
        facing,
        team,
    );
    deploy_row(sim, &[ArtilleryCrew], row(-150.0), facing, team);
    // Cavalry wings, slightly refused.
    // Wings must fit inside the sealed flanks (open corridor |y| < ~360).
    sim.spawn_class(row(-20.0) + right * -300.0, facing, unit_size(ShockCavalry), ShockCavalry, team);
    sim.spawn_class(row(-20.0) + right * 300.0, facing, unit_size(ShockCavalry), ShockCavalry, team);
    sim.spawn_class(row(-60.0) + right * 340.0, facing, unit_size(HorseArchers), HorseArchers, team);
}

/// Deploy a campaign roster. Entries are split into battle-sized units
/// (`unit_size` per class) and grouped into the same role rows as the
/// hand-built armies. `column: true` lays the army strung out along the
/// march axis instead — marching order, the corridor machinery's natural
/// prey. Returns (campaign unit id, sim unit index) for result mapping.
pub fn deploy_roster(sim: &mut Sim, dep: &contract::Deployment) -> Vec<(u64, usize)> {
    let center = Vec2::new(dep.center[0], dep.center[1]);
    let facing = dep.facing;
    let mut out: Vec<(u64, usize)> = Vec::new();

    // Split aggregates into spawnable units, keeping campaign identity.
    let mut units: Vec<(u64, UnitClassId, usize, f32, f32)> = Vec::new(); // (id, class, count, training, morale_cap)
    for r in &dep.units {
        let mut left = r.count as usize;
        let full = unit_size(r.class);
        while left > 0 {
            let n = left.min(full);
            // Avoid splinter units: fold a small remainder into the previous.
            if left == n && n < full / 4 {
                if let Some(prev) = units.iter_mut().rev().find(|u| u.0 == r.id && u.1 == r.class) {
                    prev.2 += n;
                    break;
                }
            }
            units.push((r.id, r.class, n, r.training, r.morale_cap));
            left -= n;
        }
    }

    let spawn = |sim: &mut Sim, id: u64, class: UnitClassId, count: usize, training: f32, cap: f32, anchor: Vec2, face: f32, out: &mut Vec<(u64, usize)>| {
        let idx = sim.spawn_class(anchor, face, count, class, dep.team);
        let u = &mut sim.units[idx];
        u.training = training.clamp(0.05, 1.0);
        u.morale_ceiling = cap.clamp(0.2, 1.0);
        u.morale = u.morale.min(u.morale_ceiling);
        out.push((id, idx));
    };

    if dep.column {
        // Marching order: a single file of units down the road behind center.
        let f = dir(facing);
        let mut fwd = 0.0;
        for &(id, class, count, training, cap) in &units {
            let s = class_stats(class);
            let depth = (count.div_ceil(unit_size(class).div_ceil(s.default_depth.max(1)).max(1)))
                as f32
                * s.spacing.y;
            spawn(sim, id, class, count, training, cap, center - f * (fwd + 0.5 * depth), facing, &mut out);
            fwd += depth + 18.0;
        }
        return out;
    }

    // Formed: group by role, lay rows like deploy_army does.
    let role = |c: UnitClassId| match c {
        Skirmishers => 0,                          // screen
        HeavyInfantry | Phalanx | LongSwords => 1, // main line
        LightInfantry => 2,                        // second line
        Archers => 3,                              // ranged
        ArtilleryCrew => 4,
        ShockCavalry | HorseArchers => 5, // wings
    };
    let f = dir(facing);
    let right = Vec2::new(f.y, -f.x);
    const MAX_ROW_W: f32 = 1500.0;
    const GAP: f32 = 14.0;
    let row_fwd = [45.0, 0.0, -55.0, -110.0, -150.0];
    for r in 0..5 {
        let members: Vec<&(u64, UnitClassId, usize, f32, f32)> =
            units.iter().filter(|u| role(u.1) == r).collect();
        if members.is_empty() {
            continue;
        }
        // Chunk into rows that fit the open corridor.
        let mut rows: Vec<Vec<&(u64, UnitClassId, usize, f32, f32)>> = vec![Vec::new()];
        let mut w_acc = 0.0;
        for m in members {
            let w = unit_width(m.1) + GAP;
            if w_acc + w > MAX_ROW_W && !rows.last().unwrap().is_empty() {
                rows.push(Vec::new());
                w_acc = 0.0;
            }
            rows.last_mut().unwrap().push(m);
            w_acc += w;
        }
        for (k, row_members) in rows.iter().enumerate() {
            let fwd = row_fwd[r] - k as f32 * 45.0;
            let total: f32 = row_members.iter().map(|m| unit_width(m.1) + GAP).sum::<f32>() - GAP;
            let mut x = -0.5 * total;
            for &&(id, class, count, training, cap) in row_members {
                let w = unit_width(class);
                spawn(sim, id, class, count, training, cap, center + f * fwd + right * (x + 0.5 * w), facing, &mut out);
                x += w + GAP;
            }
        }
    }
    // Cavalry wings, alternating sides.
    let wings: Vec<&(u64, UnitClassId, usize, f32, f32)> =
        units.iter().filter(|u| role(u.1) == 5).collect();
    for (k, &&(id, class, count, training, cap)) in wings.iter().enumerate() {
        let side = if k % 2 == 0 { 1.0 } else { -1.0 };
        let lane = 300.0 + (k / 2) as f32 * 60.0;
        spawn(sim, id, class, count, training, cap, center + f * -20.0 + right * (side * lane), facing, &mut out);
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
    let duel_count = |c: UnitClassId| -> usize {
        use UnitClassId::*;
        match c {
            HeavyInfantry => 240,
            LightInfantry => 220,
            LongSwords => 140,
            Phalanx => 240,
            Archers => 140,
            Skirmishers => 140,
            ShockCavalry => 120,
            HorseArchers => 100,
            ArtilleryCrew => 40,
        }
    };
    sim.spawn_class(Vec2::new(0.0, -90.0), FRAC_PI_2, duel_count(a), a, 0);
    sim.spawn_class(Vec2::new(0.0, 90.0), -FRAC_PI_2, duel_count(b), b, 1);
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
        sim.spawn_class(Vec2::new(0.0, -90.0), FRAC_PI_2, 240, UnitClassId::HeavyInfantry, 0);
        sim.spawn_class(Vec2::new(0.0, 90.0), -FRAC_PI_2, 240, UnitClassId::HeavyInfantry, 1);
        return;
    }
    if kind == 2 || kind == 3 {
        // A 100x4 line facing north; blue cavalry charges its face (kind 2)
        // or its eastern flank (kind 3).
        sim.spawn_unit(Vec2::new(0.0, 40.0), FRAC_PI_2, 400, 100, Vec2::new(1.0, 1.1), 1, 0.7);
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
        sim.spawn_class(row(0.0, -110.0), facing, 280, UnitClassId::HeavyInfantry, team);
        sim.spawn_class(row(0.0, -25.0), facing, 280, UnitClassId::Phalanx, team);
        sim.spawn_class(row(0.0, 55.0), facing, 140, UnitClassId::LongSwords, team);
        sim.spawn_class(row(0.0, 125.0), facing, 220, UnitClassId::LightInfantry, team);
        sim.spawn_class(row(-40.0, -30.0), facing, 140, UnitClassId::Archers, team);
        sim.spawn_class(row(-55.0, 60.0), facing, 40, UnitClassId::ArtilleryCrew, team);
        sim.spawn_class(row(-10.0, 200.0), facing, 110, UnitClassId::ShockCavalry, team);
        sim.spawn_class(row(-30.0, -190.0), facing, 90, UnitClassId::HorseArchers, team);
    };
    side(sim, -140.0, FRAC_PI_2, 0);
    side(sim, 140.0, -FRAC_PI_2, 1);
}

/// Build terrain and deploy: player south facing north, enemy north facing
/// south, east/west flanks sealed by the map itself.
pub fn setup_battle(sim: &mut Sim, map: MapId) {
    sim.terrain = build(map);
    use std::f32::consts::FRAC_PI_2;
    deploy_army(sim, Vec2::new(0.0, -600.0), FRAC_PI_2, 0);
    deploy_army(sim, Vec2::new(0.0, 600.0), -FRAC_PI_2, 1);
}
