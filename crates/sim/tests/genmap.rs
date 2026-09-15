use sim::genmap::certify::{
    deployment_band_certificate, deployment_band_passable_fraction, flank_unreachable_fraction,
    has_deployment_corridor, largest_isolated_passable_pocket_cells, open_edge_fraction,
    side_sealed_fraction, speed_zero_cells_without_blocking_tint, Side, DEPLOYMENT_MAX_SLOPE,
    DEPLOYMENT_PASSABLE_THRESHOLD, ISOLATED_PASSABLE_POCKET_LIMIT_CELLS, OPEN_EDGE_THRESHOLD,
    SEALED_SIDE_THRESHOLD, UNREACHABLE_FLANK_THRESHOLD,
};
use sim::genmap::edges::{self, EdgeSealKind};
use sim::genmap::{
    drainage_report, field_texture, generate, generate_vista_grid, landform, passability,
    recipe_class, terrain_hash, MapRecipe, RecipeClass,
};
use sim::{build_map, MapId, Vec2};
use std::collections::HashSet;

const GENERATED_SEED7_HASH: u64 = 0x9053a4fa78867b91;
const RIVER_AND_CRAGS_HASH: u64 = 0x1d65c06afbab0eca;
const WALLED_PLAIN_HASH: u64 = 0x864fe11f35ddf30c;
const COASTAL_SCRUB_HASH: u64 = 0x020ad95c550af7b6;
const CURATED_GENERATED_SEEDS: &[(u64, &str, RecipeClass, EdgeSealKind, EdgeSealKind, u64)] = &[
    (
        1,
        "Shore & Crags",
        RecipeClass::FullFeatured,
        EdgeSealKind::CliffRun,
        EdgeSealKind::WaterReach,
        0x35787940547b4e73,
    ),
    (
        7,
        "Highland Vale",
        RecipeClass::FullFeatured,
        EdgeSealKind::CliffRun,
        EdgeSealKind::CliffRun,
        GENERATED_SEED7_HASH,
    ),
    (
        8,
        "Wooded Pass",
        RecipeClass::FullFeatured,
        EdgeSealKind::ForestBelt,
        EdgeSealKind::CliffRun,
        0x7055cdf3eac03c64,
    ),
];

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
    assert_eq!(recipe_class(&recipe), RecipeClass::FullFeatured);
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
fn curated_generated_maps_are_pinned_and_certified() {
    for &(seed, name, expected_class, west, east, expected_hash) in CURATED_GENERATED_SEEDS {
        let recipe = MapRecipe {
            seed,
            ..MapRecipe::default()
        };
        let t = generate(&recipe);
        let hash = terrain_hash(&t);
        let composition = edges::composition(&recipe);
        eprintln!("{name} seed {seed} terrain hash: {hash:#018x}");
        assert_eq!(recipe_class(&recipe), expected_class, "{name} class");
        assert_eq!(composition.west, west, "{name} west composition");
        assert_eq!(composition.east, east, "{name} east composition");
        assert_generated_certificates(seed, &t);
        assert_deployment_contract(
            seed,
            Side::South,
            deployment_band_certificate(&t, Side::South),
        );
        assert_deployment_contract(
            seed,
            Side::North,
            deployment_band_certificate(&t, Side::North),
        );
        assert_eq!(hash, expected_hash, "{name} seed {seed} terrain hash moved");
    }
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
    const SWEEP_SEEDS: u64 = 64;
    let mut corridor_p95_max: f32 = 0.0;
    let mut corridor_max_max: f32 = 0.0;
    let mut connected_width_min: f32 = f32::INFINITY;
    let mut flank_p50_min: f32 = f32::INFINITY;
    let mut flank_p95_min: f32 = f32::INFINITY;
    let mut flank_max_min: f32 = f32::INFINITY;
    let mut playable_peak_min: f32 = f32::INFINITY;
    let mut playable_peak_max: f32 = 0.0;
    let mut vista_peak_min: f32 = f32::INFINITY;
    let mut vista_peak_max: f32 = 0.0;
    let mut far_fog_peak_min: f32 = f32::INFINITY;
    let mut far_fog_peak_max: f32 = 0.0;
    let mut terrain_hashes = HashSet::new();
    let mut field_hashes = HashSet::new();
    let mut edge_compositions = HashSet::new();
    let mut class_counts = [0usize; 3];
    for seed in 1..=SWEEP_SEEDS {
        let seeded_recipe = MapRecipe { seed, ..recipe };
        let class = recipe_class(&seeded_recipe);
        class_counts[class_index(class)] += 1;
        let t = generate(&seeded_recipe);
        let hash = terrain_hash(&t);
        let field_hash = field_texture_hash(&t);
        let south_slope = deployment_apron_mean_abs_slope(&t, Side::South);
        let north_slope = deployment_apron_mean_abs_slope(&t, Side::North);
        let corridor = corridor_swell_range(&t);
        let connected_width = required_frontage_connected_width(&t);
        let flank = flank_peak_range(&t);
        let vista = vista_peak_range(&seeded_recipe);
        let drainage = drainage_report(&seeded_recipe);
        let composition = edges::composition(&seeded_recipe);
        let field = field_texture::summary(&t);
        terrain_hashes.insert(hash);
        field_hashes.insert(field_hash);
        edge_compositions.insert(format!("{:?}/{:?}", composition.west, composition.east));
        let south_deploy = deployment_band_certificate(&t, Side::South);
        let north_deploy = deployment_band_certificate(&t, Side::North);
        let slopes = passability::slope_field(&t);
        let corridor_slope = slope_stats(&t, &slopes, |x, y| x.abs() <= 350.0 && y.abs() <= 720.0);
        let flank_slope = slope_stats(&t, &slopes, |x, _| x.abs() >= 520.0);
        corridor_p95_max = corridor_p95_max.max(corridor_slope.p95);
        corridor_max_max = corridor_max_max.max(corridor_slope.max);
        connected_width_min = connected_width_min.min(connected_width);
        flank_p50_min = flank_p50_min.min(flank_slope.p50);
        flank_p95_min = flank_p95_min.min(flank_slope.p95);
        flank_max_min = flank_max_min.min(flank_slope.max);
        playable_peak_min = playable_peak_min.min(flank.0);
        playable_peak_max = playable_peak_max.max(flank.1);
        vista_peak_min = vista_peak_min.min(vista.vista.0);
        vista_peak_max = vista_peak_max.max(vista.vista.1);
        far_fog_peak_min = far_fog_peak_min.min(vista.far_fog.0);
        far_fog_peak_max = far_fog_peak_max.max(vista.far_fog.1);
        if seed <= 4 || seed == 7 {
            let ratios = terrain_ratios(&t);
            eprintln!(
                "seed {seed}: class {}; hash {hash:#018x} fieldHash {field_hash:#018x}; edge {:?}/{:?}; certs Wseal {:.3} Eseal {:.3} Sopen {:.3} Nopen {:.3} Wunreach {:.3} Eunreach {:.3}; deploy S pass {:.3} block {} p95 {:.3} max {:.3}, N pass {:.3} block {} p95 {:.3} max {:.3}; ratios pass {:.3} slow {:.3} blocked {:.3} water {:.3} forest {:.3} mud {:.3} scree {:.3} rough {:.3}; field forest {} scree {} mud {} rough {}; drainage lakes {} playable {} largestPlayable {} suppressedHollows {} streamCells {} streams {} lakeStreams {} runoffStreams {} deadEnds {} impassibleStreamCells {} fords {} marsh {}; corridor swell {:.2}..{:.2}m, connected frontage width {:.1}m, flank peaks {:.2}..{:.2}m, vista peaks {:.2}..{:.2}m, farFog peaks {:.2}..{:.2}m, apron mean |slope| S {:.4} N {:.4}, corridor slope p95 {:.3} max {:.3}, flank slope p50 {:.3} p95 {:.3} max {:.3}",
                class.as_str(),
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
                ratios.scree,
                ratios.rough,
                field.passable_forest_cells,
                field.scree_cells,
                field.mud_cells,
                field.rough_field_cells,
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
                connected_width,
                flank.0,
                flank.1,
                vista.vista.0,
                vista.vista.1,
                vista.far_fog.0,
                vista.far_fog.1,
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
        assert_class_field_texture(seed, class, field);
        assert!(
            deployment_band_is_texture_clean(&t, Side::South)
                && deployment_band_is_texture_clean(&t, Side::North),
            "seed {seed} deployment bands must stay clear of field texture"
        );
        assert!(
            drainage.water_level_set,
            "seed {seed} water cells must sit at their basin fill level"
        );
        assert!(
            drainage.streams_descend,
            "seed {seed} stream polylines must monotonically descend"
        );
        assert_class_hydrology(seed, class, &drainage);
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
        assert_class_corridor_swell(seed, class, corridor);
        assert!(
            connected_width >= 700.0,
            "seed {seed} connected frontage width {connected_width:.1}m"
        );
        for (side, kind, peak) in [
            (
                "west",
                composition.west,
                height_range(&t, |x, _| x < -850.0).1,
            ),
            (
                "east",
                composition.east,
                height_range(&t, |x, _| x > 850.0).1,
            ),
        ] {
            assert!(peak <= 280.0, "seed {seed} {side} peak too high: {peak}");
            if kind != EdgeSealKind::WaterReach {
                assert!(
                    peak >= 200.0,
                    "seed {seed} {side} land flank lost its ridge: {peak}"
                );
            }
        }
        assert!(
            vista.vista.0 >= 200.0 && vista.vista.1 <= 285.0,
            "seed {seed} vista peak range {:.2}..{:.2}m",
            vista.vista.0,
            vista.vista.1
        );
        assert!(
            vista.far_fog.0 >= 200.0 && vista.far_fog.1 <= 330.0,
            "seed {seed} farFog peak range {:.2}..{:.2}m",
            vista.far_fog.0,
            vista.far_fog.1
        );
    }
    eprintln!(
        "{SWEEP_SEEDS}-seed slope stats: classes full {} dry {} plain {}; corridor max p95 {:.3}, corridor max {:.3}, connected frontage min {:.1}m; flank min p50 {:.3}, min p95 {:.3}, min max {:.3}; playable peaks {:.2}..{:.2}m, vista peaks {:.2}..{:.2}m, farFog peaks {:.2}..{:.2}m; distinct edge compositions {}, unique terrain hashes {}, unique field hashes {}; bands flat {:.3} rolling {:.3} slow {:.3} cliff {:.3}, dilate {} cells, cap {:.1}m",
        class_counts[class_index(RecipeClass::FullFeatured)],
        class_counts[class_index(RecipeClass::Dry)],
        class_counts[class_index(RecipeClass::OpenPlain)],
        corridor_p95_max,
        corridor_max_max,
        connected_width_min,
        flank_p50_min,
        flank_p95_min,
        flank_max_min,
        playable_peak_min,
        playable_peak_max,
        vista_peak_min,
        vista_peak_max,
        far_fog_peak_min,
        far_fog_peak_max,
        edge_compositions.len(),
        terrain_hashes.len(),
        field_hashes.len(),
        recipe.slope_bands.flat_max,
        recipe.slope_bands.rolling_max,
        recipe.slope_bands.slow_min,
        recipe.slope_bands.cliff_min,
        recipe.slope_bands.cliff_dilate_cells,
        recipe.slope_bands.highland_cap_min_m,
    );
    assert!(
        edge_compositions.len() >= 3,
        "generated edge grammar collapsed: {edge_compositions:?}"
    );
    assert!(
        class_counts[class_index(RecipeClass::FullFeatured)] >= 24
            && class_counts[class_index(RecipeClass::FullFeatured)] <= 40
            && class_counts[class_index(RecipeClass::Dry)] >= 8
            && class_counts[class_index(RecipeClass::Dry)] <= 24
            && class_counts[class_index(RecipeClass::OpenPlain)] >= 8
            && class_counts[class_index(RecipeClass::OpenPlain)] <= 24,
        "generated recipe class distribution collapsed: full {} dry {} plain {}",
        class_counts[class_index(RecipeClass::FullFeatured)],
        class_counts[class_index(RecipeClass::Dry)],
        class_counts[class_index(RecipeClass::OpenPlain)]
    );
    assert_eq!(
        terrain_hashes.len(),
        SWEEP_SEEDS as usize,
        "generated terrain hashes must be unique across the fixed sweep"
    );
    assert_eq!(
        field_hashes.len(),
        SWEEP_SEEDS as usize,
        "generated field texture hashes must be unique across the fixed sweep"
    );
}

fn class_index(class: RecipeClass) -> usize {
    match class {
        RecipeClass::FullFeatured => 0,
        RecipeClass::Dry => 1,
        RecipeClass::OpenPlain => 2,
    }
}

fn assert_class_field_texture(
    seed: u64,
    class: RecipeClass,
    field: field_texture::FieldTextureSummary,
) {
    match class {
        RecipeClass::FullFeatured | RecipeClass::Dry => {
            assert!(
                field.passable_forest_cells >= 1_200
                    && field.scree_cells >= 1_600
                    && field.mud_cells >= 800
                    && field.rough_field_cells >= 1_600,
                "seed {seed} {class:?} field texture budget too small: {field:?}"
            );
        }
        RecipeClass::OpenPlain => {
            assert_eq!(
                field.passable_forest_cells, 0,
                "seed {seed} plain maps should not paint passable forest clumps"
            );
            assert_eq!(
                field.mud_cells, 0,
                "seed {seed} plain maps should not paint mud lowlands"
            );
            assert!(
                field.rough_field_cells >= 800,
                "seed {seed} plain maps should retain gentle rough-grass texture: {field:?}"
            );
        }
    }
}

fn assert_class_hydrology(
    seed: u64,
    class: RecipeClass,
    drainage: &sim::genmap::hydrology::DrainageReport,
) {
    match class {
        RecipeClass::FullFeatured => {
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
        }
        RecipeClass::Dry => {
            assert_eq!(
                drainage.lake_cells, 0,
                "seed {seed} dry maps must have zero lake cells, got {drainage:?}"
            );
            assert_eq!(
                drainage.playable_lake_cells, 0,
                "seed {seed} dry maps must have zero playable lake cells, got {drainage:?}"
            );
        }
        RecipeClass::OpenPlain => {
            assert_eq!(
                drainage.lake_cells, 0,
                "seed {seed} plain maps must have zero lake cells, got {drainage:?}"
            );
            assert_eq!(
                drainage.stream_count, 0,
                "seed {seed} plain maps should not carve drainage traces, got {drainage:?}"
            );
        }
    }
}

fn assert_class_corridor_swell(seed: u64, class: RecipeClass, corridor: (f32, f32)) {
    let span = corridor.1 - corridor.0;
    match class {
        RecipeClass::FullFeatured | RecipeClass::Dry => {
            assert!(
                // Dry-swell floor 5.0: flooding a seed's deepest hollow (its lake)
                // legitimately shallows the DRY roll (pre-hydrology floor was 6.0).
                // Dry class maps still use the full relief class, just with lake
                // budget zero, so they keep the same anti-billiard-table floor.
                corridor.0 >= -9.5 && corridor.1 <= 11.5 && span >= 5.0,
                "seed {seed} {class:?} corridor swell {:.2}..{:.2}m span {:.2}",
                corridor.0,
                corridor.1,
                span
            );
        }
        RecipeClass::OpenPlain => {
            assert!(
                // Plain maps intentionally lower the interior amplitude, but the
                // floor remains non-zero so the field reads as gentle swell rather
                // than a billiard table.
                corridor.0 >= -5.5 && corridor.1 <= 6.5 && (2.4..=6.8).contains(&span),
                "seed {seed} plain corridor swell {:.2}..{:.2}m span {:.2}",
                corridor.0,
                corridor.1,
                span
            );
        }
    }
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

struct VistaPeakRange {
    vista: (f32, f32),
    far_fog: (f32, f32),
}

fn vista_peak_range(recipe: &MapRecipe) -> VistaPeakRange {
    let grid = generate_vista_grid(recipe);
    let mut vista = (f32::INFINITY, f32::NEG_INFINITY);
    let mut far_fog = (f32::INFINITY, f32::NEG_INFINITY);
    for band in &grid.bands {
        let peaks = band_peak_range(band);
        if band.name == "vista" {
            vista = peaks;
        } else if band.name == "farFog" {
            far_fog = peaks;
        }
    }
    VistaPeakRange { vista, far_fog }
}

fn band_peak_range(band: &sim::VistaBand) -> (f32, f32) {
    let mut west = f32::NEG_INFINITY;
    let mut east = f32::NEG_INFINITY;
    for cy in 0..band.h {
        let y = band.origin.y + cy as f32 * band.cell;
        if y.abs() > band.outer_half_h {
            continue;
        }
        for cx in 0..band.w {
            let x = band.origin.x + cx as f32 * band.cell;
            let outside_inner = x.abs() >= band.inner_half_w || y.abs() >= band.inner_half_h;
            if !outside_inner || x.abs() < band.inner_half_w + 0.5 * band.cell {
                continue;
            }
            let z = band.heights[cy * band.w + cx];
            if x < 0.0 {
                west = west.max(z);
            } else if x > 0.0 {
                east = east.max(z);
            }
        }
    }
    (west.min(east), west.max(east))
}

fn required_frontage_connected_width(t: &sim::Terrain) -> f32 {
    let required_left = -350.0;
    let required_right = 350.0;
    let mut min_width = f32::INFINITY;
    for cy in 0..t.h {
        let y = t.origin.y + (cy as f32 + 0.5) * t.cell;
        let in_deploy_band = (y - 600.0).abs() <= 45.0 || (y + 600.0).abs() <= 45.0;
        if !in_deploy_band {
            continue;
        }
        let mut row_best = 0.0f32;
        let mut run_start: Option<usize> = None;
        for cx in 0..=t.w {
            let passable = cx < t.w && t.speed[cy * t.w + cx] > 0.0;
            if passable {
                run_start.get_or_insert(cx);
                continue;
            }
            if let Some(start) = run_start.take() {
                let end = cx - 1;
                let x0 = t.origin.x + start as f32 * t.cell;
                let x1 = t.origin.x + (end as f32 + 1.0) * t.cell;
                if x0 <= required_left && x1 >= required_right {
                    row_best = row_best.max(x1 - x0);
                }
            }
        }
        min_width = min_width.min(row_best);
    }
    min_width
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
    scree: f32,
    rough: f32,
}

fn terrain_ratios(t: &sim::Terrain) -> TerrainRatios {
    let mut passable = 0usize;
    let mut slow = 0usize;
    let mut blocked = 0usize;
    let mut water = 0usize;
    let mut forest = 0usize;
    let mut mud = 0usize;
    let mut scree = 0usize;
    let mut rough = 0usize;
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
        } else if t.tint[i] == 6 {
            scree += 1;
            if t.speed[i] <= 0.0 {
                blocked += 1;
            } else if t.speed[i] < 0.9 {
                slow += 1;
            } else {
                passable += 1;
            }
        } else if t.tint[i] == 0 && t.speed[i] > 0.0 && t.rough[i] >= 0.18 {
            rough += 1;
            if t.speed[i] < 0.9 {
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
        scree: scree as f32 / n,
        rough: rough as f32 / n,
    }
}

fn deployment_band_is_texture_clean(t: &sim::Terrain, side: Side) -> bool {
    let y = if side == Side::South { -600.0 } else { 600.0 };
    for cy in 0..t.h {
        let wy = t.origin.y + (cy as f32 + 0.5) * t.cell;
        if (wy - y).abs() > 45.0 {
            continue;
        }
        for cx in 0..t.w {
            let wx = t.origin.x + (cx as f32 + 0.5) * t.cell;
            if wx.abs() > 350.0 {
                continue;
            }
            let i = cy * t.w + cx;
            if matches!(t.tint[i], 4 | 6) {
                return false;
            }
        }
    }
    true
}

fn field_texture_hash(t: &sim::Terrain) -> u64 {
    let mut h = 0xcbf29ce484222325u64;
    let mut mix = |v: u32| {
        h ^= v as u64;
        h = h.wrapping_mul(0x100000001b3);
    };
    for cy in 0..t.h {
        let y = t.origin.y + (cy as f32 + 0.5) * t.cell;
        if y.abs() > 560.0 {
            continue;
        }
        for cx in 0..t.w {
            let x = t.origin.x + (cx as f32 + 0.5) * t.cell;
            if x.abs() > 430.0 {
                continue;
            }
            let i = cy * t.w + cx;
            mix(t.tint[i] as u32);
            mix((t.speed[i] * 10_000.0).round() as u32);
            mix((t.rough[i] * 10_000.0).round() as u32);
        }
    }
    h
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

#[test]
fn reported_water_reach_continues_into_the_vista_without_a_hanging_ridge() {
    let recipe = MapRecipe {
        seed: 455085311,
        ..MapRecipe::default()
    };
    let terrain = generate(&recipe);
    let vista = generate_vista_grid(&recipe);
    for band in &vista.bands {
        let iy = ((0.0 - band.origin.y) / band.cell).round() as usize;
        for ix in 0..band.w {
            let x = band.origin.x + ix as f32 * band.cell;
            if x < recipe.half_w || x > band.outer_half_w {
                continue;
            }
            let z = band.heights[iy * band.w + ix];
            assert!(
                z <= 0.0,
                "the bay must continue into {} at ({x},0), found mountain height {z}",
                band.name
            );
        }
    }
    let mut max_drop = 0.0f32;
    let mut previous = terrain.height_at(Vec2::new(700.0, 0.0));
    for x in (704..1200).step_by(4) {
        let z = terrain.height_at(Vec2::new(x as f32, 0.0));
        max_drop = max_drop.max((z - previous).abs());
        previous = z;
    }
    assert!(
        max_drop < 20.0,
        "shore must descend through slopes, not a single-cell cut: {max_drop}m drop"
    );
}

#[test]
fn vista_coast_interpolates_continuously_between_offshore_columns() {
    let vista = generate_vista_grid(&MapRecipe {
        seed: 1,
        ..MapRecipe::default()
    });
    for band in &vista.bands {
        let mut previous: Option<(f32, f32)> = None;
        for ix in 0..band.w {
            let x = band.origin.x + ix as f32 * band.cell;
            if x < 1400.0 || x > band.outer_half_w {
                continue;
            }
            let Some(iy) = (0..band.h - 1).rev().find(|&iy| {
                band.shore_distance[iy * band.w + ix] >= 0.0
                    && band.shore_distance[(iy + 1) * band.w + ix] < 0.0
            }) else {
                continue;
            };
            let a = band.shore_distance[iy * band.w + ix];
            let b = band.shore_distance[(iy + 1) * band.w + ix];
            let y = band.origin.y + (iy as f32 + (-a) / (b - a)) * band.cell;
            if let Some((px, py)) = previous {
                assert!(
                    (y - py - (x - px) * 0.25).abs() < band.cell * 0.2,
                    "{} coast stairs at x={x}: y={y}, previous={py}; cell={}",
                    band.name,
                    band.cell
                );
            }
            previous = Some((x, y));
        }
        assert!(previous.is_some(), "{} has no observed coast", band.name);
    }
}
