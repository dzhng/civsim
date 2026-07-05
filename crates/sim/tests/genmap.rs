use sim::genmap::certify::{
    deployment_band_passable_fraction, has_deployment_corridor, open_edge_fraction,
    side_sealed_fraction, Side, OPEN_EDGE_THRESHOLD, SEALED_SIDE_THRESHOLD,
};
use sim::genmap::{generate, terrain_hash, MapRecipe};
use sim::{build_map, MapId};

const GENERATED_SEED7_HASH: u64 = 0x3138cbc0087fc0cd;
const RIVER_AND_CRAGS_HASH: u64 = 0x1d65c06afbab0eca;
const WALLED_PLAIN_HASH: u64 = 0x864fe11f35ddf30c;
const COASTAL_SCRUB_HASH: u64 = 0x020ad95c550af7b6;

#[test]
fn generated_map_same_seed_is_byte_identical() {
    let recipe = MapRecipe {
        seed: 7,
        ..MapRecipe::default()
    };
    let a = generate(&recipe);
    let b = generate(&recipe);
    let ha = terrain_hash(&a);
    let hb = terrain_hash(&b);
    eprintln!("generated seed 7 terrain hash: {ha:#018x}");
    assert_eq!(ha, hb);
    assert_eq!(ha, GENERATED_SEED7_HASH);
}

#[test]
fn generated_map_different_seeds_differ() {
    let a = terrain_hash(&generate(&MapRecipe {
        seed: 7,
        ..MapRecipe::default()
    }));
    let b = terrain_hash(&generate(&MapRecipe {
        seed: 8,
        ..MapRecipe::default()
    }));
    assert_ne!(a, b);
}

#[test]
fn generated_map_edge_and_corridor_certificates_hold() {
    let t = generate(&MapRecipe {
        seed: 7,
        ..MapRecipe::default()
    });
    assert!(
        side_sealed_fraction(&t, Side::West) > SEALED_SIDE_THRESHOLD,
        "west sealed fraction {:.3}",
        side_sealed_fraction(&t, Side::West)
    );
    assert!(
        side_sealed_fraction(&t, Side::East) > SEALED_SIDE_THRESHOLD,
        "east sealed fraction {:.3}",
        side_sealed_fraction(&t, Side::East)
    );
    assert!(
        open_edge_fraction(&t, Side::South) > OPEN_EDGE_THRESHOLD,
        "south open fraction {:.3}",
        open_edge_fraction(&t, Side::South)
    );
    assert!(
        open_edge_fraction(&t, Side::North) > OPEN_EDGE_THRESHOLD,
        "north open fraction {:.3}",
        open_edge_fraction(&t, Side::North)
    );
    assert!(
        deployment_band_passable_fraction(&t, Side::South) > 0.99,
        "south deployment passable fraction {:.3}",
        deployment_band_passable_fraction(&t, Side::South)
    );
    assert!(
        deployment_band_passable_fraction(&t, Side::North) > 0.99,
        "north deployment passable fraction {:.3}",
        deployment_band_passable_fraction(&t, Side::North)
    );
    assert!(has_deployment_corridor(&t));
}

#[test]
fn hand_maps_stay_byte_identical() {
    let pins = [
        (MapId::RiverAndCrags, RIVER_AND_CRAGS_HASH),
        (MapId::WalledPlain, WALLED_PLAIN_HASH),
        (MapId::CoastalScrub, COASTAL_SCRUB_HASH),
    ];
    for (id, expected) in pins {
        let h = terrain_hash(&build_map(id));
        eprintln!("{id:?} terrain hash: {h:#018x}");
        assert_eq!(h, expected, "{id:?} terrain hash moved");
    }
}

#[test]
fn generated_landform_height_statistics_hold_over_seed_sweep() {
    for seed in 1..=16 {
        let t = generate(&MapRecipe {
            seed,
            ..MapRecipe::default()
        });
        let south_slope = deployment_apron_mean_abs_slope(&t, Side::South);
        let north_slope = deployment_apron_mean_abs_slope(&t, Side::North);
        let corridor = corridor_swell_range(&t);
        let flank = flank_peak_range(&t);
        if seed <= 4 {
            eprintln!(
                "seed {seed}: corridor swell {:.2}..{:.2}m, flank peaks {:.2}..{:.2}m, apron mean |slope| S {:.4} N {:.4}",
                corridor.0, corridor.1, flank.0, flank.1, south_slope, north_slope
            );
        }
        assert!(
            south_slope < 0.045,
            "seed {seed} south deployment mean |slope| {south_slope:.4}"
        );
        assert!(
            north_slope < 0.045,
            "seed {seed} north deployment mean |slope| {north_slope:.4}"
        );
        assert!(
            corridor.0 >= -8.5 && corridor.1 <= 11.5 && corridor.1 - corridor.0 >= 6.0,
            "seed {seed} corridor swell {:.2}..{:.2}m",
            corridor.0,
            corridor.1
        );
        assert!(
            flank.0 > 40.0 && flank.1 < 125.0,
            "seed {seed} flank peak range {:.2}..{:.2}m",
            flank.0,
            flank.1
        );
    }
}

fn deployment_apron_mean_abs_slope(t: &sim::Terrain, side: Side) -> f32 {
    let half_h = 0.5 * t.h as f32 * t.cell;
    let y_center = if side == Side::South {
        -0.75 * half_h
    } else {
        0.75 * half_h
    };
    let mut sum = 0.0;
    let mut n = 0usize;
    for cy in 1..t.h - 1 {
        let wy = t.origin.y + (cy as f32 + 0.5) * t.cell;
        if (wy - y_center).abs() > 45.0 {
            continue;
        }
        for cx in 1..t.w - 1 {
            let wx = t.origin.x + (cx as f32 + 0.5) * t.cell;
            if wx.abs() > 350.0 {
                continue;
            }
            let dzdx = (t.height[cy * t.w + cx + 1] - t.height[cy * t.w + cx - 1]) / (2.0 * t.cell);
            let dzdy =
                (t.height[(cy + 1) * t.w + cx] - t.height[(cy - 1) * t.w + cx]) / (2.0 * t.cell);
            sum += dzdx.abs() + dzdy.abs();
            n += 1;
        }
    }
    sum / n.max(1) as f32
}

fn corridor_swell_range(t: &sim::Terrain) -> (f32, f32) {
    height_range(t, |x, y| x.abs() <= 350.0 && y.abs() <= 720.0)
}

fn flank_peak_range(t: &sim::Terrain) -> (f32, f32) {
    let west = height_range(t, |x, _| x < -850.0).1;
    let east = height_range(t, |x, _| x > 850.0).1;
    (west.min(east), west.max(east))
}

fn height_range(t: &sim::Terrain, keep: impl Fn(f32, f32) -> bool) -> (f32, f32) {
    let mut lo = f32::INFINITY;
    let mut hi = f32::NEG_INFINITY;
    for cy in 0..t.h {
        let y = t.origin.y + (cy as f32 + 0.5) * t.cell;
        for cx in 0..t.w {
            let x = t.origin.x + (cx as f32 + 0.5) * t.cell;
            if !keep(x, y) {
                continue;
            }
            let z = t.height[cy * t.w + cx];
            lo = lo.min(z);
            hi = hi.max(z);
        }
    }
    (lo, hi)
}
