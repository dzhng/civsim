//! The rollout sandbox (`rollout::forward`). Pins what the commander's lookahead
//! relies on: rolling a clone forward is deterministic, and battles that come
//! due auto-resolve via the cheap estimate instead of hanging for a player.

use campaign::state::Loc;
use campaign::Campaign;

mod common;

use common::lopsided_map;

fn all_ai(c: &mut Campaign) {
    for f in &mut c.state.factions {
        f.ai = true;
    }
}

fn blue_soldiers(st: &campaign::state::CampaignState) -> u32 {
    st.armies
        .iter()
        .filter(|a| a.faction == 1)
        .map(|a| a.soldiers())
        .sum()
}

#[test]
fn forward_is_deterministic() {
    let mut c = Campaign::new(lopsided_map(), 7, 0);
    all_ai(&mut c);
    c.order_move(0, Loc::Node(2)); // send red at blue so battles actually happen

    let mut a = c.state.clone();
    let mut b = c.state.clone();
    campaign::rollout::forward(&c.map, &mut a, 4000);
    campaign::rollout::forward(&c.map, &mut b, 4000);

    assert_eq!(
        serde_json::to_string(&a).unwrap(),
        serde_json::to_string(&b).unwrap(),
        "same clone rolled forward twice must be identical",
    );
}

#[test]
fn forward_resolves_battles_without_hanging() {
    let mut c = Campaign::new(lopsided_map(), 7, 0);
    all_ai(&mut c);
    assert!(c.order_move(0, Loc::Node(2)), "red should accept the march");
    assert!(blue_soldiers(&c.state) > 0, "blue starts with an army");

    let mut sb = c.state.clone();
    campaign::rollout::forward(&c.map, &mut sb, 5000);

    // Red reaches Blue, the estimate resolves the fight, blue's defenders are
    // overrun — all without a player to click through a battle.
    assert_eq!(
        blue_soldiers(&sb),
        0,
        "blue's army should be wiped by the auto-resolved battle",
    );
    assert!(
        sb.armies[0].soldiers() > 0,
        "the overwhelming attacker should survive",
    );
}

#[test]
fn forward_does_not_touch_the_live_state() {
    let mut c = Campaign::new(lopsided_map(), 7, 0);
    all_ai(&mut c);
    c.order_move(0, Loc::Node(2));

    let before = serde_json::to_string(&c.state).unwrap();
    let mut sb = c.state.clone();
    campaign::rollout::forward(&c.map, &mut sb, 3000);
    let after = serde_json::to_string(&c.state).unwrap();

    assert_eq!(
        before, after,
        "rolling a clone forward must not mutate the live game"
    );
}
