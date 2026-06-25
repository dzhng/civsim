mod common;

use campaign::state::Relation;
use campaign::Campaign;
use common::{inert, test_map};

#[test]
fn player_diplomacy_changes_relations_and_gifts_gold() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    assert_eq!(c.relation_to(1), Relation::War);
    assert!(c.make_peace(1));
    assert_eq!(c.relation_to(1), Relation::Peace);
    assert!(c.propose_alliance(1));
    assert_eq!(c.relation_to(1), Relation::Alliance);
    assert!(c.break_alliance(1));
    assert_eq!(c.relation_to(1), Relation::Peace);

    let red_gold = c.state.factions[0].treasury;
    let blue_gold = c.state.factions[1].treasury;
    assert!(c.gift_gold(1, 200));
    assert_eq!(c.state.factions[0].treasury, red_gold - 200);
    assert_eq!(c.state.factions[1].treasury, blue_gold + 200);
    assert!(!c.gift_gold(0, 1), "cannot gift yourself");
}
