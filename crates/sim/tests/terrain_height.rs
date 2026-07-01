//! Battle terrain relief: a presentation/seating channel. Height must sample
//! smoothly, stay gentle over the playable field, and never disturb movement
//! (the golden hash guards that separately). The sealed sides are WEST and
//! EAST — relief never changes which ground is passable.

use contract::{PaintOp, TerrainSpec};
use sim::{build_map, MapId, Terrain, Vec2, MAP_HALF_H, MAP_HALF_W};

const ALL_MAPS: [MapId; 3] = [
    MapId::RiverAndCrags,
    MapId::WalledPlain,
    MapId::CoastalScrub,
];

fn flat(w: usize, h: usize) -> Terrain {
    Terrain::flat(w, h, 4.0, Vec2::new(0.0, 0.0))
}

#[test]
fn a_fresh_grid_is_dead_flat() {
    let t = flat(20, 20);
    for cy in 0..20 {
        for cx in 0..20 {
            let p = Vec2::new(cx as f32 * 4.0 + 2.0, cy as f32 * 4.0 + 2.0);
            assert_eq!(t.height_at(p), 0.0);
        }
    }
}

#[test]
fn a_rise_peaks_at_center_and_eases_to_zero_by_radius() {
    let mut t = flat(80, 80);
    let c = Vec2::new(160.0, 160.0);
    t.add_rise(c, 120.0, 6.0);
    // Peak near the amplitude at the center cell center.
    assert!(
        (t.height_at(c) - 6.0).abs() < 0.2,
        "center {}",
        t.height_at(c)
    );
    // Nearly faded at the radius (bilinear leaves a sliver from the last inside
    // cell), and strictly flat well beyond it.
    assert!(
        t.height_at(c + Vec2::new(120.0, 0.0)) < 0.15,
        "rim {}",
        t.height_at(c + Vec2::new(120.0, 0.0))
    );
    assert!(t.height_at(c + Vec2::new(300.0, 0.0)).abs() < 1e-3);
    // Monotonic falloff outward: each step out is no higher than the last.
    let mut prev = f32::INFINITY;
    for r in 0..=12 {
        let here = t.height_at(c + Vec2::new(r as f32 * 10.0, 0.0));
        assert!(here <= prev + 1e-4, "rise not monotonic at r={r}");
        prev = here;
    }
}

#[test]
fn bilinear_samples_interpolate_between_cell_centers() {
    // Two adjacent cells with a tall step between them; the midpoint reads the
    // average, proving interpolation rather than nearest-cell stair-stepping.
    let mut t = flat(4, 1);
    t.height[1] = 0.0;
    t.height[2] = 10.0;
    let c1 = Vec2::new(1.0 * 4.0 + 2.0, 2.0); // center of cell 1 -> 0.0
    let c2 = Vec2::new(2.0 * 4.0 + 2.0, 2.0); // center of cell 2 -> 10.0
    let mid = Vec2::new((c1.x + c2.x) * 0.5, 2.0);
    assert!((t.height_at(c1) - 0.0).abs() < 1e-4);
    assert!((t.height_at(c2) - 10.0).abs() < 1e-4);
    assert!(
        (t.height_at(mid) - 5.0).abs() < 1e-3,
        "mid {}",
        t.height_at(mid)
    );
}

#[test]
fn off_map_samples_clamp_to_the_nearest_edge_height() {
    let mut t = flat(40, 40);
    t.add_rise(Vec2::new(80.0, 80.0), 200.0, 5.0);
    // A point far off the +x edge reads the same as the edge cell center, not 0.
    let edge = Vec2::new(40.0 * 4.0 - 2.0, 80.0);
    let beyond = Vec2::new(40.0 * 4.0 + 500.0, 80.0);
    assert_eq!(t.height_at(edge), t.height_at(beyond));
}

#[test]
fn a_ridge_raises_a_bank_along_its_line() {
    let mut t = flat(120, 40);
    let a = Vec2::new(40.0, 80.0);
    let b = Vec2::new(440.0, 80.0);
    t.add_ridge(a, b, 60.0, 4.0);
    // On the line: near the amplitude. Off the line by the radius: zero.
    let on = Vec2::new(240.0, 80.0);
    assert!(
        (t.height_at(on) - 4.0).abs() < 0.3,
        "ridge crest {}",
        t.height_at(on)
    );
    assert!(
        t.height_at(Vec2::new(240.0, 80.0 + 100.0)).abs() < 1e-3,
        "off-bank not flat"
    );
}

#[test]
fn every_quick_battle_map_rolls_but_stays_gentle() {
    for map in ALL_MAPS {
        let t = build_map(map);
        let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
        for &z in &t.height {
            lo = lo.min(z);
            hi = hi.max(z);
        }
        let span = hi - lo;
        // Non-flat...
        assert!(span > 1.0, "{map:?} is too flat: span {span}");
        // ...but modest relief, not a mountain range in the lane.
        assert!(span < 15.0, "{map:?} relief too extreme: span {span}");

        // Gentle slope: the rise/fall between adjacent cell centers stays well
        // under the cell size, so soldiers walk it rather than scale a wall.
        let mut max_step = 0.0f32;
        for cy in 0..t.h {
            for cx in 1..t.w {
                let d = (t.height[cy * t.w + cx] - t.height[cy * t.w + cx - 1]).abs();
                max_step = max_step.max(d);
            }
        }
        assert!(
            max_step < t.cell,
            "{map:?} slope too steep: {max_step}m over {}m",
            t.cell
        );
    }
}

#[test]
fn west_and_east_are_sealed_while_north_and_south_stay_open() {
    // The hard invariant: the EAST/WEST edges are mechanically impassable along
    // their length (speed 0), and the NORTH/SOUTH edges plus the central
    // corridor stay passable. Edge ROLE presentation must match this.
    for map in ALL_MAPS {
        let t = build_map(map);
        let band = 90.0; // sample within ~90m of each side

        let mut west_sealed = 0;
        let mut east_sealed = 0;
        let samples = 100;
        for k in 0..samples {
            let y =
                -MAP_HALF_H + 40.0 + (MAP_HALF_H * 2.0 - 80.0) * k as f32 / (samples - 1) as f32;
            // Scan inward from each side for an impassable cell.
            let west = (0..((band / t.cell) as i32))
                .any(|i| t.speed_at(Vec2::new(-MAP_HALF_W + 6.0 + i as f32 * t.cell, y)) <= 0.0);
            let east = (0..((band / t.cell) as i32))
                .any(|i| t.speed_at(Vec2::new(MAP_HALF_W - 6.0 - i as f32 * t.cell, y)) <= 0.0);
            west_sealed += west as i32;
            east_sealed += east as i32;
        }
        // A continuous seal: the great majority of the side is blocked.
        assert!(
            west_sealed > 90,
            "{map:?} west flank not sealed: {west_sealed}/100"
        );
        assert!(
            east_sealed > 90,
            "{map:?} east flank not sealed: {east_sealed}/100"
        );

        // The central corridor is open the full length of the field.
        for k in 0..samples {
            let y =
                -MAP_HALF_H + 40.0 + (MAP_HALF_H * 2.0 - 80.0) * k as f32 / (samples - 1) as f32;
            assert!(
                t.speed_at(Vec2::new(0.0, y)) > 0.0,
                "{map:?} center blocked at y={y}",
            );
        }
        // North and south edges read as open ground at mid-field.
        assert!(
            t.speed_at(Vec2::new(0.0, MAP_HALF_H - 10.0)) > 0.0,
            "{map:?} north sealed"
        );
        assert!(
            t.speed_at(Vec2::new(0.0, -MAP_HALF_H + 10.0)) > 0.0,
            "{map:?} south sealed"
        );
    }
}

#[test]
fn a_rise_op_carries_height_across_the_terrain_contract() {
    // Campaign-authored battle terrain can paint relief through the contract,
    // and it rasterizes to the same height a direct add_rise would.
    let spec = TerrainSpec {
        half_w: 200.0,
        half_h: 200.0,
        cell: 4.0,
        ops: vec![PaintOp::Rise {
            center: [0.0, 0.0],
            radius: 120.0,
            amplitude: 5.0,
        }],
    };
    let t = Terrain::from_spec(&spec);
    assert!((t.height_at(Vec2::new(0.0, 0.0)) - 5.0).abs() < 0.3);
    assert!(t.height_at(Vec2::new(160.0, 0.0)).abs() < 1e-3);
    // A Rise touches height only — the ground stays fully passable.
    assert_eq!(t.speed_at(Vec2::new(0.0, 0.0)), 1.0);
}
