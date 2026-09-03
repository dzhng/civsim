use crate::debraid::{braided_road_pairs, debraid_map};
use crate::geo::BBox;
use crate::raster::{Raster, RenderMaskClass};
use crate::road_measure::{longest_water_run, reroute_road_via, water_runs, ROAD_WATER_RUN_MAX_KM};
use crate::sources;

fn rect_poly(x0: f64, y0: f64, x1: f64, y1: f64) -> sources::Poly {
    let ring = vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    sources::Poly {
        bbox: BBox::of(ring.iter().copied()),
        rings: vec![ring],
    }
}

fn land_raster_with_water(water: sources::Poly) -> Raster {
    let bb = BBox {
        min: [0.0, 0.0],
        max: [60.0, 60.0],
    };
    let mut raster = Raster::new(bb, 1.0);
    raster.fill_poly(
        &rect_poly(0.0, 0.0, 60.0, 60.0),
        RenderMaskClass::Land.rgb(),
    );
    raster.fill_poly(&water, RenderMaskClass::Sea.rgb());
    raster
}

#[test]
fn reroute_bay_notch_but_refuse_full_width_channel() {
    let bay = land_raster_with_water(rect_poly(20.0, 0.0, 40.0, 32.0));
    let via = vec![[5.5, 20.5], [55.5, 20.5]];
    let rerouted = reroute_road_via(&via, &bay);

    assert!(
        rerouted.changed,
        "bay crossing should route around painted water"
    );
    assert_eq!(rerouted.via[0], via[0]);
    assert_eq!(*rerouted.via.last().unwrap(), via[1]);
    assert!(
        water_runs(&rerouted.via, &bay)
            .iter()
            .all(|run| run.km <= ROAD_WATER_RUN_MAX_KM),
        "rerouted bay road still has long water runs: {:?}",
        water_runs(&rerouted.via, &bay)
    );

    let channel = land_raster_with_water(rect_poly(20.0, 0.0, 40.0, 60.0));
    let refused = reroute_road_via(&via, &channel);
    assert!(
        !refused.changed,
        "full-width channel should be treated as a ferry candidate"
    );
    assert_eq!(refused.via, via);
    assert!(
        longest_water_run(&refused.via, &channel) > ROAD_WATER_RUN_MAX_KM,
        "refused channel should still require a ferry ledger entry"
    );
}

#[test]
fn debraid_drops_bypass_edge_and_remaps_ambush_spots() {
    // A--B direct (100km) hugs the two local legs A--C--B: a braid. The
    // bypass must go, the legs stay, and ambush spots follow the edges.
    let mut map = serde_json::json!({
        "nodes": [
            {"id": 1, "name": "A", "kind": "city", "pos": [0.0, 0.0]},
            {"id": 2, "name": "B", "kind": "city", "pos": [100.0, 0.0]},
            {"id": 3, "name": "C", "kind": "city", "pos": [50.0, 2.0]},
        ],
        "edges": [
            {"a": 1, "b": 2, "kind": "road",
             "via": [[0.0, 0.0], [50.0, 2.0], [100.0, 0.0]]},
            {"a": 1, "b": 3, "kind": "road", "via": [[0.0, 0.0], [50.0, 2.0]]},
            {"a": 3, "b": 2, "kind": "road", "via": [[50.0, 2.0], [100.0, 0.0]]},
        ],
        "ambush_spots": [
            {"edge": 0, "at": [50.0, 1.0]},
            {"edge": 2, "at": [75.0, 1.0]},
        ],
    });

    let report = debraid_map(&mut map);

    assert_eq!(report.dropped.len(), 1, "dropped: {:?}", report.dropped);
    assert!(
        report.dropped[0].starts_with("A--B"),
        "{:?}",
        report.dropped
    );
    assert!(report.kept_braids.is_empty(), "{:?}", report.kept_braids);
    let edges = map["edges"].as_array().unwrap();
    assert_eq!(edges.len(), 2);
    assert!(braided_road_pairs(&map).is_empty());
    // The A--B spot died with its edge; the C--B spot follows C--B to
    // its new index 1 (value-checked, not just counted).
    let spots = map["ambush_spots"].as_array().unwrap();
    assert_eq!(spots.len(), 1);
    assert_eq!(spots[0]["edge"], 1);
    assert_eq!(spots[0]["at"], serde_json::json!([75.0, 1.0]));
    assert_eq!(edges[1]["a"], 3);
    assert_eq!(edges[1]["b"], 2);
}

#[test]
fn debraid_drops_only_one_of_two_parallel_roads() {
    // Two cities joined by two parallel 100km roads 2km apart: a braid,
    // but only ONE of them may go — the survivor is load-bearing.
    let mut map = serde_json::json!({
        "nodes": [
            {"id": 1, "name": "A", "kind": "city", "pos": [0.0, 0.0]},
            {"id": 2, "name": "B", "kind": "city", "pos": [100.0, 0.0]},
        ],
        "edges": [
            {"a": 1, "b": 2, "kind": "road",
             "via": [[0.0, 0.0], [50.0, 2.0], [100.0, 0.0]]},
            {"a": 1, "b": 2, "kind": "road", "via": [[0.0, 0.0], [100.0, 0.0]]},
        ],
        "ambush_spots": [],
    });

    let report = debraid_map(&mut map);

    assert_eq!(report.dropped.len(), 1, "dropped: {:?}", report.dropped);
    assert_eq!(map["edges"].as_array().unwrap().len(), 1);
    assert!(
        braided_road_pairs(&map).is_empty(),
        "single surviving road cannot braid with itself"
    );
}

#[test]
fn debraid_cascades_stub_junction_left_by_a_drop() {
    // The bypass runs A--J--B through junction J whose only other edge is
    // the braid remainder: dropping the bypass legs strands J, and the
    // stub cascade must remove it rather than leave a dead junction.
    let mut map = serde_json::json!({
        "nodes": [
            {"id": 1, "name": "A", "kind": "city", "pos": [0.0, 0.0]},
            {"id": 2, "name": "B", "kind": "city", "pos": [100.0, 0.0]},
            {"id": 3, "name": "C", "kind": "city", "pos": [50.0, 2.0]},
            {"id": 4, "name": "x", "kind": "junction", "pos": [50.0, 1.0]},
        ],
        "edges": [
            {"a": 1, "b": 4, "kind": "road", "via": [[0.0, 0.0], [50.0, 1.0]]},
            {"a": 4, "b": 2, "kind": "road", "via": [[50.0, 1.0], [100.0, 0.0]]},
            {"a": 1, "b": 3, "kind": "road", "via": [[0.0, 0.0], [50.0, 2.0]]},
            {"a": 3, "b": 2, "kind": "road", "via": [[50.0, 2.0], [100.0, 0.0]]},
        ],
        "ambush_spots": [],
    });

    debraid_map(&mut map);

    let names: Vec<&str> = map["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["name"].as_str().unwrap())
        .collect();
    assert!(
        !names.contains(&"x"),
        "stub junction must cascade: {names:?}"
    );
    assert!(braided_road_pairs(&map).is_empty());
    assert_eq!(map["edges"].as_array().unwrap().len(), 2);
}
