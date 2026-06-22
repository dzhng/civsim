//! Battle-map generation: the campaign locale, baked into a battle
//! `TerrainSpec`. Maps are stylized templates — a bridge tile yields a
//! river-and-bridge corridor, a pass yields cliff-pinched ground — using the
//! same paint vocabulary as the hand-built maps (tints: 0 grass, 1 water,
//! 2 rock, 3 wall, 4 forest, 5 mud, 6 scree/field).

use crate::mapdata::{NodeKind, TileFeature, WorldMap};
use crate::state::Loc;
use contract::{PaintOp, Pcg32, TerrainSpec};

pub const HALF_W: f32 = 1200.0;
pub const HALF_H: f32 = 800.0;
const CELL: f32 = 4.0;

/// The battle convention: armies fight along Y (attacker south, defender
/// north), east/west flanks sealed.
pub fn defender_center() -> [f32; 2] {
    [0.0, 350.0]
}
pub fn attacker_center() -> [f32; 2] {
    [0.0, -350.0]
}

/// What kind of ground the site is, for template selection.
fn site_feature(map: &WorldMap, site: Loc) -> TileFeature {
    match site {
        Loc::Edge { edge, tile } => map.edges[edge as usize].tiles[tile as usize],
        Loc::Node(_) => TileFeature::Open,
    }
}

fn site_city_tier(map: &WorldMap, site: Loc) -> Option<u8> {
    match site {
        Loc::Node(n) if map.nodes[n as usize].kind == NodeKind::City => {
            Some(map.nodes[n as usize].tier)
        }
        _ => None,
    }
}

pub fn generate(map: &WorldMap, site: Loc, seed: u64) -> TerrainSpec {
    let mut rng = Pcg32::new(seed, 0xBA771E);
    let mut ops: Vec<PaintOp> = Vec::new();
    let feature = site_feature(map, site);
    let city = site_city_tier(map, site);

    // Flank seals: ragged crag walls east and west, like the hand maps.
    for side in [-1.0f32, 1.0] {
        let x = side * (HALF_W - 30.0);
        let mut y = -HALF_H;
        while y < HALF_H {
            let r = 38.0 + rng.unit_f32() * 36.0;
            ops.push(PaintOp::Circle {
                center: [x + rng.range_f32(-20.0, 20.0), y],
                radius: r,
                speed: 0.0,
                rough: 0.0,
                tint: 2,
            });
            y += 30.0;
        }
        // Scree at the foot.
        ops.push(PaintOp::Rect {
            min: [
                side.min(0.0) * HALF_W + if side > 0.0 { HALF_W - 95.0 } else { 0.0 },
                -HALF_H,
            ],
            max: [
                side.max(0.0) * HALF_W + if side < 0.0 { -HALF_W + 95.0 } else { 0.0 },
                HALF_H,
            ],
            speed: 0.6,
            rough: 0.45,
            tint: 6,
        });
    }

    match feature {
        TileFeature::Bridge | TileFeature::Ford => {
            // The river runs across the field; the road crosses it mid-map.
            let tilt = rng.range_f32(-120.0, 120.0);
            let (a, b) = ([-HALF_W, -tilt], [HALF_W, tilt]);
            let half_river = 55.0;
            // Marshy banks first, water over them, crossing last (paint order
            // is z-order).
            ops.push(PaintOp::Capsule {
                a,
                b,
                radius: half_river + 45.0,
                speed: 0.5,
                rough: 0.35,
                tint: 5,
            });
            ops.push(PaintOp::Capsule {
                a,
                b,
                radius: half_river,
                speed: 0.0,
                rough: 0.0,
                tint: 1,
            });
            if feature == TileFeature::Bridge {
                ops.push(PaintOp::Capsule {
                    a: [0.0, -(half_river + 60.0)],
                    b: [0.0, half_river + 60.0],
                    radius: 22.0,
                    speed: 1.0,
                    rough: 0.05,
                    tint: 6,
                });
            } else {
                ops.push(PaintOp::Capsule {
                    a: [0.0, -(half_river + 50.0)],
                    b: [0.0, half_river + 50.0],
                    radius: 45.0,
                    speed: 0.45,
                    rough: 0.4,
                    tint: 5,
                });
            }
        }
        TileFeature::Pass => {
            // Cliff tongues pinch the corridor to a few hundred meters.
            for side in [-1.0f32, 1.0] {
                let reach = rng.range_f32(550.0, 750.0);
                let mut x = side * HALF_W;
                while side * x > reach * 0.45 {
                    ops.push(PaintOp::Circle {
                        center: [x, rng.range_f32(-90.0, 90.0)],
                        radius: 95.0 + rng.unit_f32() * 50.0,
                        speed: 0.0,
                        rough: 0.0,
                        tint: 2,
                    });
                    x -= side * 80.0;
                }
            }
        }
        TileFeature::Hill => {
            // High ground under the defender: slow, rough approach.
            ops.push(PaintOp::Circle {
                center: [0.0, 320.0],
                radius: 330.0,
                speed: 0.8,
                rough: 0.25,
                tint: 6,
            });
            ops.push(PaintOp::Circle {
                center: [0.0, 390.0],
                radius: 190.0,
                speed: 0.7,
                rough: 0.3,
                tint: 6,
            });
        }
        TileFeature::Forest => {
            for _ in 0..7 {
                ops.push(PaintOp::Circle {
                    center: [rng.range_f32(-850.0, 850.0), rng.range_f32(-550.0, 550.0)],
                    radius: rng.range_f32(90.0, 170.0),
                    speed: 0.7,
                    rough: 0.6,
                    tint: 4,
                });
            }
        }
        TileFeature::Open | TileFeature::Sea => {}
    }

    if let Some(tier) = city {
        // City outskirts: the wall runs along the defender's rear. Terrain
        // only — assaults come later.
        let wall_y = HALF_H - 120.0;
        ops.push(PaintOp::Rect {
            min: [-HALF_W, wall_y],
            max: [HALF_W, wall_y + 60.0],
            speed: 0.0,
            rough: 0.0,
            tint: 3,
        });
        let towers = 4 + tier as i32 * 2;
        for k in 0..towers {
            let x = -HALF_W + (k as f32 + 0.5) * (2.0 * HALF_W / towers as f32);
            ops.push(PaintOp::Circle {
                center: [x, wall_y],
                radius: 16.0,
                speed: 0.0,
                rough: 0.0,
                tint: 3,
            });
        }
    }

    // Light scatter so no field is a billiard table.
    for _ in 0..3 {
        ops.push(PaintOp::Circle {
            center: [rng.range_f32(-700.0, 700.0), rng.range_f32(-350.0, 350.0)],
            radius: rng.range_f32(50.0, 110.0),
            speed: 0.7,
            rough: 0.6,
            tint: 4,
        });
    }
    // The road itself, cosmetic.
    ops.push(PaintOp::Capsule {
        a: [0.0, -HALF_H],
        b: [0.0, HALF_H],
        radius: 9.0,
        speed: 1.0,
        rough: 0.0,
        tint: 6,
    });

    TerrainSpec {
        half_w: HALF_W,
        half_h: HALF_H,
        cell: CELL,
        ops,
    }
}

/// Map-edge entry point + facing for a reinforcement arriving from a given
/// battle-space bearing (radians; -PI/2 = from the attacker's south edge).
pub fn entry_point(bearing: f32) -> ([f32; 2], f32) {
    let (c, s) = (bearing.cos(), bearing.sin());
    // Walk from center to the window edge along the bearing, inset from the
    // sealed flanks so columns arrive on open ground.
    let t = ((HALF_W - 220.0) / c.abs()).min((HALF_H - 60.0) / s.abs().max(1e-3));
    let p = [c * t, s * t];
    // March in toward the center.
    (p, (-p[1]).atan2(-p[0]))
}
