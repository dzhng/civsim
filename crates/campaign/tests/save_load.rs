mod common;

use campaign::state::Loc;
use campaign::Campaign;
use common::{inert, test_map};

#[test]
fn save_load_roundtrip_is_deterministic() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.order_move(0, Loc::Node(2));
    for _ in 0..500 {
        c.tick();
    }
    let save = c.save();
    let mut c2 = Campaign::load(test_map(), &save).unwrap();
    for _ in 0..500 {
        c.tick();
        c2.tick();
    }
    assert_eq!(c.save(), c2.save());
}
