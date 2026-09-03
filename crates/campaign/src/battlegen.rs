//! Battle-map generation: the campaign locale, baked into a battle
//! `TerrainSource`. Open-field campaign battles use the generated-map recipe;
//! bridge/ford and city fights keep the paint-op templates that encode
//! site-specific gameplay.

use crate::mapdata::{NodeKind, TileFeature, WorldMap};
use crate::state::Loc;
use contract::{
    MapRecipe, PaintOp, Pcg32, TerrainSource, TerrainSpec, FIELD_CELL, FIELD_HALF_H, FIELD_HALF_W,
};
const CERTIFIED_CAMPAIGN_RECIPE_SEEDS: u64 = 64;

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

pub fn terrain_source(
    map: &WorldMap,
    site: Loc,
    campaign_seed: u64,
    template_seed: u64,
) -> TerrainSource {
    if use_ops_template(map, site) {
        TerrainSource::Ops(ops_template(map, site, template_seed))
    } else {
        TerrainSource::Recipe(recipe_for_site(map, site, campaign_seed))
    }
}

pub fn recipe_for_site(map: &WorldMap, site: Loc, campaign_seed: u64) -> MapRecipe {
    let mut recipe = MapRecipe {
        seed: derived_site_seed(campaign_seed, site),
        ..MapRecipe::default()
    };
    match site_feature(map, site) {
        TileFeature::Pass => {
            recipe.edge_seals.weights.cliff_run = 10;
            recipe.edge_seals.weights.forest_belt = 1;
            recipe.edge_seals.weights.water_reach = 0;
            recipe.field_texture.scree_patches = 9;
        }
        TileFeature::Forest => {
            recipe.edge_seals.weights.forest_belt = 5;
            recipe.field_texture.forest_clumps = 8;
        }
        TileFeature::Hill => {
            recipe.hydrology.lake_area_budget = 0.01;
            recipe.field_texture.scree_patches = 9;
        }
        TileFeature::Open | TileFeature::Sea | TileFeature::Bridge | TileFeature::Ford => {}
    }
    recipe
}

pub fn derived_site_seed(campaign_seed: u64, site: Loc) -> u64 {
    1 + splitmix64(campaign_seed ^ site_id(site).wrapping_mul(0x9E37_79B9_7F4A_7C15))
        % CERTIFIED_CAMPAIGN_RECIPE_SEEDS
}

pub fn site_id(site: Loc) -> u64 {
    match site {
        Loc::Node(n) => n as u64,
        Loc::Edge { edge, tile } => (1u64 << 63) | ((edge as u64) << 16) | tile as u64,
    }
}

fn splitmix64(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

fn use_ops_template(map: &WorldMap, site: Loc) -> bool {
    site_city_tier(map, site).is_some()
        || matches!(
            site_feature(map, site),
            TileFeature::Bridge | TileFeature::Ford
        )
}

pub fn ops_template(map: &WorldMap, site: Loc, seed: u64) -> TerrainSpec {
    let mut rng = Pcg32::new(seed, 0xBA771E);
    let mut ops: Vec<PaintOp> = Vec::new();
    let feature = site_feature(map, site);
    let city = site_city_tier(map, site);

    // Flank seals: ragged crag walls east and west, like the hand maps.
    for side in [-1.0f32, 1.0] {
        let x = side * (FIELD_HALF_W - 30.0);
        let mut y = -FIELD_HALF_H;
        while y < FIELD_HALF_H {
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
                side.min(0.0) * FIELD_HALF_W + if side > 0.0 { FIELD_HALF_W - 95.0 } else { 0.0 },
                -FIELD_HALF_H,
            ],
            max: [
                side.max(0.0) * FIELD_HALF_W
                    + if side < 0.0 {
                        -FIELD_HALF_W + 95.0
                    } else {
                        0.0
                    },
                FIELD_HALF_H,
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
            let (a, b) = ([-FIELD_HALF_W, -tilt], [FIELD_HALF_W, tilt]);
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
                let mut x = side * FIELD_HALF_W;
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
        let wall_y = FIELD_HALF_H - 120.0;
        ops.push(PaintOp::Rect {
            min: [-FIELD_HALF_W, wall_y],
            max: [FIELD_HALF_W, wall_y + 60.0],
            speed: 0.0,
            rough: 0.0,
            tint: 3,
        });
        let towers = 4 + tier as i32 * 2;
        for k in 0..towers {
            let x = -FIELD_HALF_W + (k as f32 + 0.5) * (2.0 * FIELD_HALF_W / towers as f32);
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
        a: [0.0, -FIELD_HALF_H],
        b: [0.0, FIELD_HALF_H],
        radius: 9.0,
        speed: 1.0,
        rough: 0.0,
        tint: 6,
    });

    TerrainSpec {
        half_w: FIELD_HALF_W,
        half_h: FIELD_HALF_H,
        cell: FIELD_CELL,
        ops,
    }
}

/// Map-edge entry point + facing for a reinforcement arriving from a given
/// battle-space bearing (radians; -PI/2 = from the attacker's south edge).
pub fn entry_point(bearing: f32) -> ([f32; 2], f32) {
    let (c, s) = (bearing.cos(), bearing.sin());
    // Walk from center to the window edge along the bearing, inset from the
    // sealed flanks so columns arrive on open ground.
    let t = ((FIELD_HALF_W - 220.0) / c.abs()).min((FIELD_HALF_H - 60.0) / s.abs().max(1e-3));
    let p = [c * t, s * t];
    // March in toward the center.
    (p, (-p[1]).atan2(-p[0]))
}
