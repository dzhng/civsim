mod common;

use campaign::{tunables, Campaign};
use common::test_map;

#[test]
fn ai_faction_recruits_and_attacks() {
    let mut c = Campaign::new(test_map(), 7, 0); // blue (1) stays AI
    c.state.factions[1].treasury = 5_000;
    // Red's field army leaves the map area so blue sees no threat at home;
    // blue should eventually recruit and march on red's city A.
    c.state.armies[0].roster[0].count = 0; // tombstone red's army
    let mut recruited = false;
    let mut marched = false;
    for _ in 0..30 * tunables::TICKS_PER_DAY {
        c.tick();
        recruited |= !c.state.cities[&2].recruit_queue.is_empty()
            || c.state
                .armies
                .iter()
                .any(|a| a.faction == 1 && a.id > 1 && a.alive());
        marched |= c
            .state
            .armies
            .iter()
            .any(|a| a.faction == 1 && a.marching());
        if c.state.cities[&0].owner == 1 || (recruited && marched) {
            break;
        }
    }
    assert!(recruited, "AI should spend its treasury on troops");
    assert!(marched, "AI should move armies with a purpose");
}
