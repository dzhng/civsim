use sim::genmap::certify::DEPLOYMENT_FRONTAGE_HALF_W;
use sim::genmap::{generate, MapRecipe};
use sim::{deploy_custom_army, Sim, Terrain, Tunables, UnitClassId, Vec2};

use UnitClassId::*;

const MIXED_ROSTER: &[UnitClassId] = &[
    MediumInfantry,
    MediumInfantry,
    MediumInfantry,
    MediumSpear,
    MediumSpear,
    HeavySpear,
    MediumPhalanx,
    LightSword,
    LightSpear,
    Skirmishers,
    Archers,
    Archers,
    ArtilleryCrew,
    ShockCavalry,
    ShockCavalry,
    HorseArchers,
];

#[test]
fn custom_deployment_uses_formation_and_passable_ground_on_generated_maps() {
    for seed in 1..=16 {
        let mut sim = sim_with_generated_terrain(seed);
        deploy_custom_army(&mut sim, 0, MIXED_ROSTER);
        deploy_custom_army(&mut sim, 1, MIXED_ROSTER);

        assert_eq!(
            sim.units.len(),
            MIXED_ROSTER.len() * 2,
            "seed {seed} should deploy both custom armies"
        );
        assert_all_soldiers_on_passable_deployment_ground(seed, &sim);
        assert_role_lines_are_ordered(seed, &sim, 0);
        assert_role_lines_are_ordered(seed, &sim, 1);
        assert_cavalry_owns_flanks(seed, &sim, 0);
        assert_cavalry_owns_flanks(seed, &sim, 1);
    }
}

#[test]
fn custom_deployment_is_deterministic_for_same_roster_and_seed() {
    let a = custom_layout_signature(7);
    let b = custom_layout_signature(7);
    assert_eq!(a, b);
}

fn sim_with_generated_terrain(seed: u64) -> Sim {
    let mut sim = Sim::new(Tunables::default(), 0x5eed_c0de);
    sim.terrain = generate(&MapRecipe {
        seed,
        ..MapRecipe::default()
    });
    sim
}

fn custom_layout_signature(seed: u64) -> Vec<(u32, u32, u32, u32)> {
    let mut sim = sim_with_generated_terrain(seed);
    deploy_custom_army(&mut sim, 0, MIXED_ROSTER);
    deploy_custom_army(&mut sim, 1, MIXED_ROSTER);
    sim.units
        .iter()
        .map(|u| {
            (
                u.team,
                u.class as u32,
                u.anchor.x.to_bits(),
                u.anchor.y.to_bits(),
            )
        })
        .collect()
}

fn assert_all_soldiers_on_passable_deployment_ground(seed: u64, sim: &Sim) {
    for unit in &sim.units {
        for i in unit.start..unit.start + unit.count {
            let p = Vec2::new(sim.positions[2 * i], sim.positions[2 * i + 1]);
            assert!(
                p.x.abs() <= DEPLOYMENT_FRONTAGE_HALF_W,
                "seed {seed} team {} {:?} soldier {i} deployed outside frontage at x={:.1}",
                unit.team,
                unit.class,
                p.x
            );
            assert!(
                seat_passable(&sim.terrain, p),
                "seed {seed} team {} {:?} soldier {i} deployed on blocked terrain at ({:.1},{:.1})",
                unit.team,
                unit.class,
                p.x,
                p.y
            );
        }
    }
}

fn assert_role_lines_are_ordered(seed: u64, sim: &Sim, team: u32) {
    let mut front = Vec::new();
    let mut second = Vec::new();
    let mut third = Vec::new();
    for unit in sim.units.iter().filter(|u| u.team == team) {
        let score = if team == 0 {
            unit.anchor.y
        } else {
            -unit.anchor.y
        };
        match role_line(unit.class) {
            RoleLine::Front => front.push(score),
            RoleLine::Second => second.push(score),
            RoleLine::Third => third.push(score),
            RoleLine::Cavalry => {}
        }
    }
    assert!(
        !front.is_empty(),
        "seed {seed} team {team} missing front line"
    );
    assert!(
        !second.is_empty(),
        "seed {seed} team {team} missing second line"
    );
    assert!(
        !third.is_empty(),
        "seed {seed} team {team} missing third line"
    );

    let front_rear = front.iter().copied().fold(f32::INFINITY, f32::min);
    let second_front = second.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let second_rear = second.iter().copied().fold(f32::INFINITY, f32::min);
    let third_front = third.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    assert!(
        front_rear > second_front + 15.0,
        "DEPLOY-E8A4 seed {seed} team {team} front line should be ahead of second: front rear {front_rear:.1}, second front {second_front:.1}"
    );
    assert!(
        second_rear > third_front + 15.0,
        "DEPLOY-E8A4 seed {seed} team {team} second line should be ahead of third: second rear {second_rear:.1}, third front {third_front:.1}"
    );
}

fn assert_cavalry_owns_flanks(seed: u64, sim: &Sim, team: u32) {
    let units: Vec<_> = sim.units.iter().filter(|u| u.team == team).collect();
    let left = units
        .iter()
        .min_by(|a, b| a.anchor.x.total_cmp(&b.anchor.x))
        .unwrap();
    let right = units
        .iter()
        .max_by(|a, b| a.anchor.x.total_cmp(&b.anchor.x))
        .unwrap();
    assert!(
        matches!(role_line(left.class), RoleLine::Cavalry),
        "DEPLOY-E8A4 seed {seed} team {team} left flank should be cavalry, got {:?} at x={:.1}",
        left.class,
        left.anchor.x
    );
    assert!(
        matches!(role_line(right.class), RoleLine::Cavalry),
        "DEPLOY-E8A4 seed {seed} team {team} right flank should be cavalry, got {:?} at x={:.1}",
        right.class,
        right.anchor.x
    );
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum RoleLine {
    Front,
    Second,
    Third,
    Cavalry,
}

fn role_line(class: UnitClassId) -> RoleLine {
    match class {
        HeavySword | HeavyPhalanx | HeavySpear | MediumInfantry | MediumSpear | MediumPhalanx => {
            RoleLine::Front
        }
        ShockCavalry | HorseArchers => RoleLine::Cavalry,
        Archers | ArtilleryCrew => RoleLine::Third,
        LightSpear | LongSwords | Skirmishers | Peasant | LightSword => RoleLine::Second,
    }
}

fn seat_passable(t: &Terrain, p: Vec2) -> bool {
    let cx = ((p.x - t.origin.x) / t.cell).floor();
    let cy = ((p.y - t.origin.y) / t.cell).floor();
    if cx < 0.0 || cy < 0.0 || cx >= t.w as f32 || cy >= t.h as f32 {
        return false;
    }
    let i = cy as usize * t.w + cx as usize;
    t.speed[i] > 0.0 && !matches!(t.tint[i], 1 | 2 | 4)
}
