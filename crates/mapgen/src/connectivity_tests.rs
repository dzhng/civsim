use crate::descope::descope_sea_lanes;
use crate::geo::{dist, BBox};
use crate::landmass::{label_at_pos, landmass_labels, main_component, snap_land};
use crate::raster::{Raster, RenderMaskClass};
use crate::reconnect::reconnect_plan;
use crate::road_measure;
use serde_json::json;
use std::collections::BTreeSet;

#[test]
fn descope_sea_lanes_remaps_ambush_spots_by_original_edge_index() {
    let mut map = json!({
        "nodes": [
            {"id": 1, "name": "Gades", "kind": "city", "pos": [0.0, 0.0]},
            {"id": 2, "name": "Tingi", "kind": "city", "pos": [1.0, 0.0]},
            {"id": 3, "name": "Dropped A", "kind": "city", "pos": [2.0, 0.0]},
            {"id": 4, "name": "Dropped B", "kind": "city", "pos": [3.0, 0.0]},
            {"id": 5, "name": "Constantinopolis", "kind": "city", "pos": [4.0, 0.0]},
            {"id": 6, "name": "Nicomedia", "kind": "city", "pos": [5.0, 0.0]}
        ],
        "edges": [
            {"a": 3, "b": 4, "kind": "sea", "via": []},
            {"a": 1, "b": 3, "kind": "road", "via": []},
            {"a": 1, "b": 2, "kind": "sea", "via": []},
            {"a": 5, "b": 6, "kind": "road", "via": []}
        ],
        "ambush_spots": [
            {"edge": 2, "tile": 7, "side": 1},
            {"edge": 0, "tile": 8, "side": -1},
            {"edge": 1, "tile": 9, "side": 1},
            {"edge": 3, "tile": 10, "side": -1}
        ]
    });

    descope_sea_lanes(&mut map);

    let edges = map["edges"].as_array().unwrap();
    assert_eq!(edges.len(), 2);
    assert_eq!(edges[0]["a"], json!(1));
    assert_eq!(edges[0]["b"], json!(3));
    assert_eq!(edges[0]["kind"], json!("road"));
    assert_eq!(edges[1]["a"], json!(1));
    assert_eq!(edges[1]["b"], json!(2));
    assert_eq!(edges[1]["kind"], json!("sea"));
    assert!(edges.iter().all(|edge| edge.get("_oi").is_none()));

    let ambush = map["ambush_spots"].as_array().unwrap();
    let remapped_edges: Vec<u64> = ambush
        .iter()
        .map(|spot| spot["edge"].as_u64().unwrap())
        .collect();
    assert_eq!(remapped_edges, vec![1, 0]);
    assert_eq!(ambush[0]["tile"], json!(7));
    assert_eq!(ambush[1]["tile"], json!(9));
}

#[test]
fn sea_edge_bridges_main_component_without_merging_landmasses() {
    let raster = test_raster(&[(1, 1, 3, 3), (5, 1, 7, 3), (9, 1, 10, 3)]);
    let labels = landmass_labels(&raster);
    let west = raster.cell_center(2, 2);
    let east = raster.cell_center(6, 2);
    let britain_a = raster.cell_center(9, 1);
    let britain_b = raster.cell_center(10, 2);
    let map = json!({
        "nodes": [
            {"id": 1, "name": "West", "kind": "city", "pos": west},
            {"id": 2, "name": "East", "kind": "city", "pos": east},
            {"id": 3, "name": "Britain A", "kind": "city", "pos": britain_a},
            {"id": 4, "name": "Britain B", "kind": "city", "pos": britain_b}
        ],
        "edges": [
            {"a": 1, "b": 2, "kind": "sea"},
            {"a": 3, "b": 4, "kind": "road"},
            {"a": 4, "b": 3, "kind": "road"}
        ]
    });

    let main = main_component(&map, &[1]);
    assert_eq!(main, BTreeSet::from([1, 2]));
    assert_eq!(label_at_pos(west, &labels, &raster), Some(0));
    assert_eq!(label_at_pos(east, &labels, &raster), Some(1));
    assert_eq!(label_at_pos(britain_a, &labels, &raster), Some(2));
    assert_eq!(label_at_pos(britain_b, &labels, &raster), Some(2));
    assert!(!main.contains(&3));
    assert!(!main.contains(&4));
    assert!(reconnect_plan(&map, &raster, &[1], 100.0).is_empty());
}

#[test]
fn same_landmass_distance_cap_controls_reconnectability() {
    let raster = test_raster(&[(1, 1, 10, 3)]);
    let labels = landmass_labels(&raster);
    let main_pos = raster.cell_center(1, 2);
    let city_pos = raster.cell_center(8, 2);
    let gap = dist(main_pos, city_pos);
    assert_eq!(label_at_pos(city_pos, &labels, &raster), Some(0));
    let map = json!({
        "nodes": [
            {"id": 1, "name": "Main", "kind": "city", "pos": main_pos},
            {"id": 2, "name": "Off", "kind": "city", "pos": city_pos}
        ],
        "edges": [],
        "factions": []
    });
    assert!(reconnect_plan(&map, &raster, &[1], gap - 0.01).is_empty());
    let plan = reconnect_plan(&map, &raster, &[1], gap);
    assert_eq!(plan.len(), 1);
    assert_eq!((plan[0].0, plan[0].1), (2, 1));
    assert_eq!(plan[0].2.first(), Some(&city_pos));
    assert_eq!(plan[0].2.last(), Some(&main_pos));

    let connected_map = json!({
        "nodes": [
            {"id": 1, "name": "Main", "kind": "city", "pos": main_pos},
            {"id": 2, "name": "Off", "kind": "city", "pos": city_pos}
        ],
        "edges": [{"a": 1, "b": 2, "kind": "road"}],
        "factions": []
    });
    assert!(reconnect_plan(&connected_map, &raster, &[1], gap).is_empty());
}

#[test]
fn reconnect_plan_iteratively_chains_same_landmass_cities() {
    let raster = test_raster(&[(1, 1, 14, 3)]);
    let main = raster.cell_center(1, 2);
    let middle = raster.cell_center(5, 2);
    let far = raster.cell_center(9, 2);
    let too_far = raster.cell_center(14, 2);
    let map = json!({
        "nodes": [
            {"id": 1, "name": "Main", "kind": "city", "pos": main},
            {"id": 2, "name": "Middle", "kind": "city", "pos": middle},
            {"id": 3, "name": "Far", "kind": "city", "pos": far},
            {"id": 4, "name": "Too Far", "kind": "city", "pos": too_far}
        ],
        "edges": [],
        "factions": []
    });

    assert_eq!(dist(main, far), 8.0);
    let plan = reconnect_plan(&map, &raster, &[1], 4.5);
    let pairs: Vec<(u32, u32)> = plan
        .iter()
        .map(|(city_id, target_id, _)| (*city_id, *target_id))
        .collect();
    assert_eq!(pairs, vec![(2, 1), (3, 2)]);
}

#[test]
fn reconnect_plan_uses_nearest_drawable_target_not_nearest_same_landmass_target() {
    let raster = test_raster_sized(100, 8, &[(5, 3, 95, 3), (5, 3, 5, 5), (5, 5, 95, 5)]);
    let near_undrawable = raster.cell_center(95, 3);
    let far_drawable = raster.cell_center(92, 5);
    let city = raster.cell_center(95, 5);
    let map = json!({
        "nodes": [
            {"id": 1, "name": "Near Across Gap", "kind": "city", "pos": near_undrawable},
            {"id": 2, "name": "Far Same Strip", "kind": "city", "pos": far_drawable},
            {"id": 3, "name": "Peninsula Tip", "kind": "city", "pos": city}
        ],
        "edges": [{"a": 1, "b": 2, "kind": "road"}],
        "factions": []
    });

    let labels = landmass_labels(&raster);
    assert_eq!(
        label_at_pos(city, &labels, &raster),
        label_at_pos(near_undrawable, &labels, &raster)
    );
    assert_eq!(
        label_at_pos(city, &labels, &raster),
        label_at_pos(far_drawable, &labels, &raster)
    );
    assert!(
        road_measure::astar_land_path(
            &raster,
            snap_land(city, &raster).unwrap(),
            snap_land(near_undrawable, &raster).unwrap(),
            dist(city, near_undrawable),
            0,
        )
        .is_none(),
        "nearest same-label target should not be drawable across the water gap"
    );

    let plan = reconnect_plan(&map, &raster, &[1], 10.0);
    assert_eq!(plan.len(), 1);
    assert_eq!((plan[0].0, plan[0].1), (3, 2));
    assert_eq!(plan[0].2.first(), Some(&city));
    assert_eq!(plan[0].2.last(), Some(&far_drawable));
}

fn test_raster(rects: &[(usize, usize, usize, usize)]) -> Raster {
    test_raster_sized(16, 6, rects)
}

fn test_raster_sized(w: usize, h: usize, rects: &[(usize, usize, usize, usize)]) -> Raster {
    let mut px = vec![0u8; w * h * 4];
    for i in 0..w * h {
        px[i * 4..i * 4 + 3].copy_from_slice(&RenderMaskClass::Sea.rgb());
        px[i * 4 + 3] = 255;
    }
    for &(x0, y0, x1, y1) in rects {
        for y in y0..=y1 {
            for x in x0..=x1 {
                let i = (y * w + x) * 4;
                px[i..i + 3].copy_from_slice(&RenderMaskClass::Land.rgb());
            }
        }
    }
    Raster::from_rgba(
        BBox {
            min: [0.0, 0.0],
            max: [w as f64, h as f64],
        },
        w,
        h,
        px,
    )
}
