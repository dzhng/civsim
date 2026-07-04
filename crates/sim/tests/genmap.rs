use sim::genmap::certify::{
    deployment_band_passable_fraction, has_deployment_corridor, open_edge_fraction,
    side_sealed_fraction, Side, OPEN_EDGE_THRESHOLD, SEALED_SIDE_THRESHOLD,
};
use sim::genmap::{generate, terrain_hash, MapRecipe};
use sim::{build_map, MapId};

const GENERATED_SEED7_HASH: u64 = 0x97616c1950edf8b8;
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
