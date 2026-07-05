use sim::genmap::certify::{
    deployment_band_passable_fraction, flank_unreachable_fraction, has_deployment_corridor,
    largest_isolated_passable_pocket_cells, open_edge_fraction, side_sealed_fraction,
    speed_zero_cells_without_blocking_tint, Side, ISOLATED_PASSABLE_POCKET_LIMIT_CELLS,
    OPEN_EDGE_THRESHOLD, SEALED_SIDE_THRESHOLD, UNREACHABLE_FLANK_THRESHOLD,
};
use sim::genmap::{generate, passability, terrain_hash, MapRecipe};
use sim::{build_map, MapId};

const GENERATED_SEED7_HASH: u64 = 0x8ceb1a8a243ea756;
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
fn generated_passability_certificates_hold_over_seed_sweep() {
    let recipe = MapRecipe::default();
    let mut corridor_p95_max: f32 = 0.0;
    let mut corridor_max_max: f32 = 0.0;
    let mut flank_p50_min: f32 = f32::INFINITY;
    let mut flank_p95_min: f32 = f32::INFINITY;
    let mut flank_max_min: f32 = f32::INFINITY;
    for seed in 1..=32 {
        let t = generate(&MapRecipe { seed, ..recipe });
        let south_slope = deployment_apron_mean_abs_slope(&t, Side::South);
        let north_slope = deployment_apron_mean_abs_slope(&t, Side::North);
        let corridor = corridor_swell_range(&t);
        let flank = flank_peak_range(&t);
        let slopes = passability::slope_field(&t);
        let corridor_slope = slope_stats(&t, &slopes, |x, y| x.abs() <= 350.0 && y.abs() <= 720.0);
        let flank_slope = slope_stats(&t, &slopes, |x, _| x.abs() >= 520.0);
        corridor_p95_max = corridor_p95_max.max(corridor_slope.p95);
        corridor_max_max = corridor_max_max.max(corridor_slope.max);
        flank_p50_min = flank_p50_min.min(flank_slope.p50);
        flank_p95_min = flank_p95_min.min(flank_slope.p95);
        flank_max_min = flank_max_min.min(flank_slope.max);
        if seed <= 4 || seed == 7 {
            let ratios = terrain_ratios(&t);
            eprintln!(
                "seed {seed}: certs Wseal {:.3} Eseal {:.3} Sopen {:.3} Nopen {:.3} Wunreach {:.3} Eunreach {:.3}; ratios pass {:.3} slow {:.3} blocked {:.3} water {:.3}; corridor swell {:.2}..{:.2}m, flank peaks {:.2}..{:.2}m, apron mean |slope| S {:.4} N {:.4}, corridor slope p95 {:.3} max {:.3}, flank slope p50 {:.3} p95 {:.3} max {:.3}",
                side_sealed_fraction(&t, Side::West),
                side_sealed_fraction(&t, Side::East),
                open_edge_fraction(&t, Side::South),
                open_edge_fraction(&t, Side::North),
                flank_unreachable_fraction(&t, Side::West),
                flank_unreachable_fraction(&t, Side::East),
                ratios.passable,
                ratios.slow,
                ratios.blocked,
                ratios.water,
                corridor.0,
                corridor.1,
                flank.0,
                flank.1,
                south_slope,
                north_slope,
                corridor_slope.p95,
                corridor_slope.max,
                flank_slope.p50,
                flank_slope.p95,
                flank_slope.max,
            );
        }
        assert_generated_certificates(seed, &t);
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
    eprintln!(
        "32-seed slope stats: corridor max p95 {:.3}, corridor max {:.3}; flank min p50 {:.3}, min p95 {:.3}, min max {:.3}; bands flat {:.3} rolling {:.3} slow {:.3} cliff {:.3}, dilate {} cells, cap {:.1}m",
        corridor_p95_max,
        corridor_max_max,
        flank_p50_min,
        flank_p95_min,
        flank_max_min,
        recipe.slope_bands.flat_max,
        recipe.slope_bands.rolling_max,
        recipe.slope_bands.slow_min,
        recipe.slope_bands.cliff_min,
        recipe.slope_bands.cliff_dilate_cells,
        recipe.slope_bands.highland_cap_min_m,
    );
}

fn assert_generated_certificates(seed: u64, t: &sim::Terrain) {
    assert!(
        side_sealed_fraction(t, Side::West) > SEALED_SIDE_THRESHOLD,
        "seed {seed} west sealed fraction {:.3}",
        side_sealed_fraction(t, Side::West)
    );
    assert!(
        side_sealed_fraction(t, Side::East) > SEALED_SIDE_THRESHOLD,
        "seed {seed} east sealed fraction {:.3}",
        side_sealed_fraction(t, Side::East)
    );
    assert!(
        open_edge_fraction(t, Side::South) > OPEN_EDGE_THRESHOLD,
        "seed {seed} south open fraction {:.3}",
        open_edge_fraction(t, Side::South)
    );
    assert!(
        open_edge_fraction(t, Side::North) > OPEN_EDGE_THRESHOLD,
        "seed {seed} north open fraction {:.3}",
        open_edge_fraction(t, Side::North)
    );
    assert!(
        deployment_band_passable_fraction(t, Side::South) >= 0.95,
        "seed {seed} south deployment passable fraction {:.3}",
        deployment_band_passable_fraction(t, Side::South)
    );
    assert!(
        deployment_band_passable_fraction(t, Side::North) >= 0.95,
        "seed {seed} north deployment passable fraction {:.3}",
        deployment_band_passable_fraction(t, Side::North)
    );
    assert!(has_deployment_corridor(t), "seed {seed} lacks S-N corridor");
    assert!(
        flank_unreachable_fraction(t, Side::West) > UNREACHABLE_FLANK_THRESHOLD,
        "seed {seed} west flank unreachable fraction {:.3}",
        flank_unreachable_fraction(t, Side::West)
    );
    assert!(
        flank_unreachable_fraction(t, Side::East) > UNREACHABLE_FLANK_THRESHOLD,
        "seed {seed} east flank unreachable fraction {:.3}",
        flank_unreachable_fraction(t, Side::East)
    );
    assert_eq!(
        speed_zero_cells_without_blocking_tint(t),
        0,
        "seed {seed} speed-0 land cells must carry rock/water tint"
    );
    assert!(
        largest_isolated_passable_pocket_cells(t) <= ISOLATED_PASSABLE_POCKET_LIMIT_CELLS,
        "seed {seed} largest isolated passable pocket {} cells",
        largest_isolated_passable_pocket_cells(t)
    );
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

struct SlopeStats {
    p50: f32,
    p95: f32,
    max: f32,
}

fn slope_stats(t: &sim::Terrain, slope: &[f32], keep: impl Fn(f32, f32) -> bool) -> SlopeStats {
    let mut values = Vec::new();
    for cy in 0..t.h {
        let y = t.origin.y + (cy as f32 + 0.5) * t.cell;
        for cx in 0..t.w {
            let x = t.origin.x + (cx as f32 + 0.5) * t.cell;
            if keep(x, y) {
                values.push(slope[cy * t.w + cx]);
            }
        }
    }
    values.sort_by(|a, b| a.total_cmp(b));
    SlopeStats {
        p50: percentile(&values, 0.50),
        p95: percentile(&values, 0.95),
        max: values.last().copied().unwrap_or(0.0),
    }
}

fn percentile(values: &[f32], p: f32) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    let i = ((values.len() - 1) as f32 * p).round() as usize;
    values[i.min(values.len() - 1)]
}

struct TerrainRatios {
    passable: f32,
    slow: f32,
    blocked: f32,
    water: f32,
}

fn terrain_ratios(t: &sim::Terrain) -> TerrainRatios {
    let mut passable = 0usize;
    let mut slow = 0usize;
    let mut blocked = 0usize;
    let mut water = 0usize;
    for i in 0..t.w * t.h {
        if t.tint[i] == 1 {
            water += 1;
        } else if t.speed[i] <= 0.0 {
            blocked += 1;
        } else if t.speed[i] < 0.9 {
            slow += 1;
        } else {
            passable += 1;
        }
    }
    let n = (t.w * t.h).max(1) as f32;
    TerrainRatios {
        passable: passable as f32 / n,
        slow: slow as f32 / n,
        blocked: blocked as f32 / n,
        water: water as f32 / n,
    }
}
