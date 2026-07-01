mod common;

use campaign::state::{Loc, Stance};
use campaign::{pathfind, Campaign};
use common::{diamond_map, inert, test_map};

#[test]
fn loads_and_paths() {
    let c = Campaign::new(test_map(), 7, 0);
    assert_eq!(c.map.nodes.len(), 3);
    assert_eq!(c.state.armies.len(), 2);
    // A -> C by road: 12 tiles + B + 12 tiles + C = 26 locs.
    let p = pathfind::plan(
        &c.map,
        &c.state.road_levels,
        Loc::Node(0),
        Loc::Node(2),
        false,
    )
    .unwrap();
    assert_eq!(p.len(), 26);
    assert_eq!(*p.last().unwrap(), Loc::Node(2));
}

#[test]
fn marches_and_arrives() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    assert!(c.order_move(0, Loc::Node(0))); // B -> A
                                            // 12 tiles + the node, at ~262 ticks/tile for light infantry.
    for _ in 0..14 * 300 {
        c.tick();
    }
    assert_eq!(c.state.armies[0].loc, Loc::Node(0));
    assert!(c.state.armies[0].halted());
}

#[test]
fn sea_route_embarks() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Force the sea lane: dest is a sea tile midway.
    let p = pathfind::plan(
        &c.map,
        &c.state.road_levels,
        Loc::Node(0),
        Loc::Edge { edge: 2, tile: 3 },
        true,
    )
    .unwrap();
    assert!(p
        .iter()
        .all(|l| matches!(l, Loc::Edge { edge: 2, .. } | Loc::Node(_))));
    assert!(c.order_move(0, Loc::Edge { edge: 2, tile: 3 }));
    let mut embarked = false;
    for _ in 0..5_000 {
        c.tick();
        if c.state.armies[0].embark_ticks_left > 0 {
            embarked = true;
        }
    }
    assert!(embarked, "never paid the embark stop");
    assert!(matches!(c.state.armies[0].stance, Stance::AtSea));
}

#[test]
fn higher_level_road_marches_faster() {
    let ticks_to_arrive = |level: u8| {
        let mut c = Campaign::new(test_map(), 7, 0);
        inert(&mut c);
        c.state.road_levels[0] = level;
        assert!(c.order_move(0, Loc::Node(0))); // B -> A along edge 0
        for t in 0..20_000u32 {
            c.tick();
            if c.state.armies[0].loc == Loc::Node(0) && c.state.armies[0].halted() {
                return t;
            }
        }
        panic!("never arrived");
    };
    let slow = ticks_to_arrive(1);
    let fast = ticks_to_arrive(3);
    assert!(
        (fast as f32) < slow as f32 / 1.45,
        "level 3 should be ~1.6x faster: {slow} -> {fast} ticks"
    );
}

#[test]
fn routing_prefers_the_faster_parallel_route() {
    let mut c = Campaign::new(diamond_map(), 7, 0);
    inert(&mut c);
    // Identical routes either way; make the south leg faster (edges 2+3)
    // and the planner must choose it.
    c.state.road_levels[2] = 3;
    c.state.road_levels[3] = 3;
    let p = pathfind::plan(
        &c.map,
        &c.state.road_levels,
        Loc::Node(0),
        Loc::Node(3),
        false,
    )
    .unwrap();
    assert!(
        p.contains(&Loc::Node(2)),
        "route should pass the southern junction S, got {p:?}"
    );
}

#[test]
fn repeated_orders_do_not_stall_the_march() {
    // The AI re-issues its attack intent hourly; a re-order toward the
    // same next tile must not zero the step progress (it used to, which
    // froze every AI march longer than one order interval).
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    for _ in 0..14 * 300 {
        assert!(c.order_move(0, Loc::Node(0)));
        for _ in 0..60 {
            c.tick();
        }
        if c.state.armies[0].loc == Loc::Node(0) {
            return; // arrived despite hourly re-orders
        }
    }
    panic!(
        "hourly re-orders stalled the march at {:?}",
        c.state.armies[0].loc
    );
}

#[test]
fn camp_breaks_on_a_move_order() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    assert!(c.order_camp(0));
    c.tick();
    assert!(matches!(c.state.armies[0].stance, Stance::Camp { .. }));
    assert!(c.order_move(0, Loc::Node(0)));
    assert!(matches!(c.state.armies[0].stance, Stance::March));
    // And camping is refused while marching.
    assert!(!c.order_camp(0));
}
