use sim::genmap::certify::{
    deployment_band_certificate, deployment_band_passable_fraction, flank_unreachable_fraction,
    has_deployment_corridor, largest_isolated_passable_pocket_cells, open_edge_fraction,
    side_sealed_fraction, speed_zero_cells_without_blocking_tint, Side, DEPLOYMENT_MAX_SLOPE,
    DEPLOYMENT_PASSABLE_THRESHOLD, ISOLATED_PASSABLE_POCKET_LIMIT_CELLS, OPEN_EDGE_THRESHOLD,
    SEALED_SIDE_THRESHOLD, UNREACHABLE_FLANK_THRESHOLD,
};
use sim::genmap::edges::{self, EdgeSealKind};
use sim::genmap::{
    drainage_report, generate, generate_vista_grid, landform, passability, terrain_hash, MapRecipe,
};
use sim::{build_map, MapId};

const GENERATED_SEED7_HASH: u64 = 0xa83197564d957288;
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
fn generated_edge_recipe_composes_seeded_flank_kinds() {
    let cases = [
        (1, EdgeSealKind::CliffRun, EdgeSealKind::WaterReach),
        (3, EdgeSealKind::WaterReach, EdgeSealKind::ForestBelt),
        (7, EdgeSealKind::CliffRun, EdgeSealKind::CliffRun),
        (8, EdgeSealKind::ForestBelt, EdgeSealKind::CliffRun),
    ];
    for (seed, west, east) in cases {
        let recipe = MapRecipe {
            seed,
            ..MapRecipe::default()
        };
        let composition = edges::composition(&recipe);
        assert_eq!(composition.west, west, "seed {seed} west composition");
        assert_eq!(composition.east, east, "seed {seed} east composition");
    }
}

#[test]
fn generated_edge_roles_follow_composition_semantics() {
    let cases = [
        (1, "cliff", "ocean"),
        (3, "ocean", "cliff"),
        (7, "cliff", "cliff"),
        (8, "cliff", "cliff"),
    ];
    for (seed, west, east) in cases {
        let recipe = MapRecipe {
            seed,
            ..MapRecipe::default()
        };
        let t = generate(&recipe);
        let roles = derived_edge_roles(&t);
        let composition = edges::composition(&recipe);
        assert_eq!(composition.west.expected_edge_role(), west);
        assert_eq!(composition.east.expected_edge_role(), east);
        assert_eq!(roles.west, west, "seed {seed} west role from tint band");
        assert_eq!(roles.east, east, "seed {seed} east role from tint band");
        assert_eq!(roles.north, "open-fog", "seed {seed} north role");
        assert_eq!(roles.south, "open-fog", "seed {seed} south role");
    }
}

#[test]
fn generated_vista_inner_boundary_matches_playable_rect_heights() {
    let recipe = MapRecipe {
        seed: 7,
        ..MapRecipe::default()
    };
    let vista = generate_vista_grid(&recipe);
    let band = &vista.bands[0];
    assert_eq!(band.name, "vista");
    assert_eq!(band.cell, recipe.cell * 4.0);

    for iy in 0..=((recipe.half_h * 2.0 / band.cell).round() as usize) {
        let y = -recipe.half_h + iy as f32 * band.cell;
        assert_shared_height("west", &recipe, band, -recipe.half_w, y);
        assert_shared_height("east", &recipe, band, recipe.half_w, y);
    }
    for ix in 0..=((recipe.half_w * 2.0 / band.cell).round() as usize) {
        let x = -recipe.half_w + ix as f32 * band.cell;
        assert_shared_height("south", &recipe, band, x, -recipe.half_h);
        assert_shared_height("north", &recipe, band, x, recipe.half_h);
    }
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
        let drainage = drainage_report(&MapRecipe { seed, ..recipe });
        let composition = edges::composition(&MapRecipe { seed, ..recipe });
        let south_deploy = deployment_band_certificate(&t, Side::South);
        let north_deploy = deployment_band_certificate(&t, Side::North);
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
                "seed {seed}: edge {:?}/{:?}; certs Wseal {:.3} Eseal {:.3} Sopen {:.3} Nopen {:.3} Wunreach {:.3} Eunreach {:.3}; deploy S pass {:.3} block {} p95 {:.3} max {:.3}, N pass {:.3} block {} p95 {:.3} max {:.3}; ratios pass {:.3} slow {:.3} blocked {:.3} water {:.3} forest {:.3} mud {:.3}; drainage lakes {} playable {} largestPlayable {} suppressedHollows {} streamCells {} streams {} lakeStreams {} runoffStreams {} deadEnds {} impassibleStreamCells {} fords {} marsh {}; corridor swell {:.2}..{:.2}m, flank peaks {:.2}..{:.2}m, apron mean |slope| S {:.4} N {:.4}, corridor slope p95 {:.3} max {:.3}, flank slope p50 {:.3} p95 {:.3} max {:.3}",
                composition.west,
                composition.east,
                side_sealed_fraction(&t, Side::West),
                side_sealed_fraction(&t, Side::East),
                open_edge_fraction(&t, Side::South),
                open_edge_fraction(&t, Side::North),
                flank_unreachable_fraction(&t, Side::West),
                flank_unreachable_fraction(&t, Side::East),
                south_deploy.passable_fraction,
                south_deploy.blocked_cells,
                south_deploy.p95_slope,
                south_deploy.max_slope,
                north_deploy.passable_fraction,
                north_deploy.blocked_cells,
                north_deploy.p95_slope,
                north_deploy.max_slope,
                ratios.passable,
                ratios.slow,
                ratios.blocked,
                ratios.water,
                ratios.forest,
                ratios.mud,
                drainage.lake_count,
                drainage.playable_lake_count,
                drainage.largest_playable_lake_cells,
                drainage.suppressed_mountain_hollow_cells,
                drainage.stream_cells,
                drainage.stream_count,
                drainage.stream_lake_connections,
                drainage.stream_runoff_connections,
                drainage.stream_dead_ends,
                drainage.stream_impassable_cells,
                drainage.ford_count,
                drainage.marsh_cells,
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
        assert_deployment_contract(seed, Side::South, south_deploy);
        assert_deployment_contract(seed, Side::North, north_deploy);
        assert!(
            drainage.water_level_set,
            "seed {seed} water cells must sit at their basin fill level"
        );
        assert!(
            drainage.streams_descend,
            "seed {seed} stream polylines must monotonically descend"
        );
        assert!(
            (1..=2).contains(&drainage.playable_lake_count)
                && drainage.largest_playable_lake_cells >= 1_500,
            "seed {seed} must retain 1-2 readable playable-zone lakes, got {drainage:?}"
        );
        assert_eq!(
            drainage.lake_count, drainage.playable_lake_count,
            "seed {seed} selected lakes must be playable-zone lakes, got {drainage:?}"
        );
        assert!(
            drainage.stream_count >= 1 && drainage.stream_cells > 0,
            "seed {seed} must carve at least one drainage trace, got {drainage:?}"
        );
        assert!(
            drainage.stream_dead_ends == 0
                && drainage.stream_lake_connections + drainage.stream_runoff_connections
                    == drainage.stream_count,
            "seed {seed} streams must connect to lakes or N/S runoff, got {drainage:?}"
        );
        assert!(
            drainage.stream_impassable_cells == 0,
            "seed {seed} stream beds must stay passable mud outside lakes, got {drainage:?}"
        );
        assert!(
            south_slope < 0.045,
            "seed {seed} south deployment mean |slope| {south_slope:.4}"
        );
        assert!(
            north_slope < 0.045,
            "seed {seed} north deployment mean |slope| {north_slope:.4}"
        );
        assert!(
            // Dry-swell floor 5.0: flooding a seed's deepest hollow (its lake)
            // legitimately shallows the DRY roll (pre-hydrology floor was 6.0).
            corridor.0 >= -9.5 && corridor.1 <= 11.5 && corridor.1 - corridor.0 >= 5.0,
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

fn assert_deployment_contract(
    seed: u64,
    side: Side,
    report: sim::genmap::certify::DeploymentBandCertificate,
) {
    assert!(
        report.passable_fraction >= DEPLOYMENT_PASSABLE_THRESHOLD,
        "seed {seed} {side:?} deployment passable fraction {:.3}",
        report.passable_fraction
    );
    assert_eq!(
        report.blocked_cells, 0,
        "seed {seed} {side:?} deployment band must be blocker-free"
    );
    assert!(
        report.max_slope <= DEPLOYMENT_MAX_SLOPE,
        "seed {seed} {side:?} deployment max slope {:.3}",
        report.max_slope
    );
    assert!(
        report.meets_contract(),
        "seed {seed} {side:?} deployment certificate {report:?}"
    );
}

fn assert_shared_height(side: &str, recipe: &MapRecipe, band: &sim::VistaBand, x: f32, y: f32) {
    let vx = ((x - band.origin.x) / band.cell).round() as isize;
    let vy = ((y - band.origin.y) / band.cell).round() as isize;
    assert!(
        vx >= 0 && vy >= 0 && (vx as usize) < band.w && (vy as usize) < band.h,
        "{side} shared point ({x:.1},{y:.1}) missing from vista band origin=({:.1},{:.1}) dims={}x{} cell={}",
        band.origin.x,
        band.origin.y,
        band.w,
        band.h,
        band.cell
    );
    let snapped_x = band.origin.x + vx as f32 * band.cell;
    let snapped_y = band.origin.y + vy as f32 * band.cell;
    assert!(
        (snapped_x - x).abs() < 1e-4 && (snapped_y - y).abs() < 1e-4,
        "{side} shared point ({x:.1},{y:.1}) does not land on vista sample ({snapped_x:.1},{snapped_y:.1})"
    );
    let playable = landform::height(recipe, sim::Vec2::new(x, y));
    let vista = band.heights[vy as usize * band.w + vx as usize];
    assert!(
        (playable - vista).abs() < 1e-6,
        "{side} shared height mismatch at ({x:.1},{y:.1}): playable {playable:.6}, vista {vista:.6}"
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
    // Dry cells only: lake fill flattens hollows to the water level, which
    // says nothing about the corridor's rolling relief.
    height_range_where(t, |x, y, tint| {
        tint != 1 && x.abs() <= 350.0 && y.abs() <= 720.0
    })
}

fn height_range_where(t: &sim::Terrain, keep: impl Fn(f32, f32, u8) -> bool) -> (f32, f32) {
    let mut lo = f32::INFINITY;
    let mut hi = f32::NEG_INFINITY;
    for cy in 0..t.h {
        let y = t.origin.y + (cy as f32 + 0.5) * t.cell;
        for cx in 0..t.w {
            let x = t.origin.x + (cx as f32 + 0.5) * t.cell;
            let i = cy * t.w + cx;
            if keep(x, y, t.tint[i]) {
                lo = lo.min(t.height[i]);
                hi = hi.max(t.height[i]);
            }
        }
    }
    (lo, hi)
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
    forest: f32,
    mud: f32,
}

fn terrain_ratios(t: &sim::Terrain) -> TerrainRatios {
    let mut passable = 0usize;
    let mut slow = 0usize;
    let mut blocked = 0usize;
    let mut water = 0usize;
    let mut forest = 0usize;
    let mut mud = 0usize;
    for i in 0..t.w * t.h {
        if t.tint[i] == 1 {
            water += 1;
        } else if t.tint[i] == 4 {
            forest += 1;
            if t.speed[i] <= 0.0 {
                blocked += 1;
            } else if t.speed[i] < 0.9 {
                slow += 1;
            } else {
                passable += 1;
            }
        } else if t.tint[i] == 5 {
            mud += 1;
            if t.speed[i] <= 0.0 {
                blocked += 1;
            } else if t.speed[i] < 0.9 {
                slow += 1;
            } else {
                passable += 1;
            }
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
        forest: forest as f32 / n,
        mud: mud as f32 / n,
    }
}

struct EdgeRoles {
    north: &'static str,
    south: &'static str,
    east: &'static str,
    west: &'static str,
}

fn derived_edge_roles(t: &sim::Terrain) -> EdgeRoles {
    fn side_role(t: &sim::Terrain, west: bool) -> &'static str {
        let band = ((t.w as f32) * 0.06).round().max(1.0) as usize;
        let mut rock = 0usize;
        let mut water = 0usize;
        let mut wall = 0usize;
        for cy in 0..t.h {
            for b in 0..band.min(t.w) {
                let cx = if west { b } else { t.w - 1 - b };
                match t.tint[cy * t.w + cx] {
                    1 => water += 1,
                    2 => rock += 1,
                    3 => wall += 1,
                    _ => {}
                }
            }
        }
        let max = rock.max(water).max(wall);
        if max < (t.h as f32 * 0.3) as usize {
            "open-fog"
        } else if max == water {
            "ocean"
        } else if max == wall {
            "wall"
        } else {
            "cliff"
        }
    }
    EdgeRoles {
        north: "open-fog",
        south: "open-fog",
        west: side_role(t, true),
        east: side_role(t, false),
    }
}
