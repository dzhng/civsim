//! The campaign-facing battle runner: spec-built terrain, roster deployment,
//! reinforcements, and headless auto-resolve.

use contract::{
    BattleSetup, Deployment, PaintOp, Reinforcement, RosterUnit, TerrainSpec, UnitClassId,
};
use sim::runner::Battle;

fn spec() -> TerrainSpec {
    TerrainSpec {
        half_w: 600.0,
        half_h: 400.0,
        cell: 4.0,
        ops: vec![
            // Sealed flanks, a river with a bridge through the middle.
            PaintOp::Rect {
                min: [-600.0, -400.0],
                max: [-560.0, 400.0],
                speed: 0.0,
                rough: 0.0,
                tint: 2,
            },
            PaintOp::Rect {
                min: [560.0, -400.0],
                max: [600.0, 400.0],
                speed: 0.0,
                rough: 0.0,
                tint: 2,
            },
            PaintOp::Capsule {
                a: [-560.0, 40.0],
                b: [560.0, -40.0],
                radius: 30.0,
                speed: 0.0,
                rough: 0.0,
                tint: 1,
            },
            PaintOp::Capsule {
                a: [-20.0, 60.0],
                b: [20.0, -60.0],
                radius: 18.0,
                speed: 1.0,
                rough: 0.05,
                tint: 6,
            },
        ],
    }
}

fn roster(id_base: u64, n: u32) -> Vec<RosterUnit> {
    vec![
        RosterUnit {
            id: id_base,
            class: UnitClassId::HeavySword,
            unit_type: None,
            count: n,
            training: 0.7,
            morale_cap: 1.0,
        },
        RosterUnit {
            id: id_base + 1,
            class: UnitClassId::Archers,
            unit_type: None,
            count: 240,
            training: 0.6,
            morale_cap: 1.0,
        },
    ]
}

#[test]
fn terrain_spec_rasterizes_with_bridge() {
    let t = sim::Terrain::from_spec(&spec());
    use sim::Vec2;
    assert_eq!(t.speed_at(Vec2::new(-580.0, 0.0)), 0.0, "flank wall");
    assert_eq!(t.speed_at(Vec2::new(-300.0, 30.0)), 0.0, "river");
    assert!(
        t.speed_at(Vec2::new(0.0, 0.0)) > 0.9,
        "bridge over the river"
    );
}

#[test]
fn auto_resolve_returns_a_verdict_and_conserves_units() {
    let setup = BattleSetup {
        seed: 42,
        terrain: spec(),
        deployments: vec![
            Deployment {
                team: 0,
                units: roster(100, 640),
                center: [0.0, -250.0],
                facing: std::f32::consts::FRAC_PI_2,
                column: false,
            },
            Deployment {
                team: 1,
                units: roster(200, 320),
                center: [0.0, 250.0],
                facing: -std::f32::consts::FRAC_PI_2,
                column: false,
            },
        ],
        // A team-0 reinforcement that arrives quickly, and one scheduled far
        // beyond the cap (must come back deployed: false, full strength).
        reinforcements: vec![
            Reinforcement {
                team: 0,
                units: vec![RosterUnit {
                    id: 102,
                    class: UnitClassId::ShockCavalry,
                    unit_type: None,
                    count: 140,
                    training: 0.7,
                    morale_cap: 1.0,
                }],
                entry: [0.0, -380.0],
                facing: std::f32::consts::FRAC_PI_2,
                delay_secs: 20.0,
            },
            Reinforcement {
                team: 1,
                units: vec![RosterUnit {
                    id: 202,
                    class: UnitClassId::LongSwords,
                    unit_type: None,
                    count: 180,
                    training: 0.8,
                    morale_cap: 1.0,
                }],
                entry: [0.0, 380.0],
                facing: -std::f32::consts::FRAC_PI_2,
                delay_secs: 1e9,
            },
        ],
    };
    let r = Battle::auto_resolve(&setup, 30 * 60 * 12); // cap: 12 battle-minutes
                                                        // Every campaign unit id comes back exactly once.
    let mut ids: Vec<u64> = r.units.iter().map(|u| u.id).collect();
    ids.sort_unstable();
    assert_eq!(ids, vec![100, 101, 102, 200, 201, 202]);
    // The bigger army with the cavalry reinforcement should win.
    assert_eq!(r.victor, 0, "result: {:?}", r);
    // The far reinforcement never arrived.
    let far = r.units.iter().find(|u| u.id == 202).unwrap();
    assert!(!far.deployed && far.survivors == 180);
    // The near one did, and survivors never exceed starting count.
    let cav = r.units.iter().find(|u| u.id == 102).unwrap();
    assert!(cav.deployed && cav.survivors <= 140);
    // Determinism: same setup, same outcome.
    let r2 = Battle::auto_resolve(&setup, 30 * 60 * 12);
    assert_eq!(
        serde_json::to_string(&r).unwrap(),
        serde_json::to_string(&r2).unwrap()
    );
}
