//! The rollout sandbox (`rollout::forward`). Pins what the commander's lookahead
//! relies on: rolling a clone forward is deterministic, and battles that come
//! due auto-resolve via the cheap estimate instead of hanging for a player.

use campaign::state::Loc;
use campaign::Campaign;

/// Strong red, weak blue, a junction between. Node ids reindex to 0-based on
/// load: red's city is Node(0), the junction Node(1), blue's city Node(2). Red
/// can march the map's length and crush blue — the shape of
/// `full_game::lopsided_war_concludes`, small enough to roll forward fast.
fn lopsided_map() -> &'static str {
    r#"{
      "half_w": 100, "half_h": 100,
      "nodes": [
        {"id": 1, "name": "Red",  "pos": [0,0],  "kind": "city", "tier": 2, "port": false, "owner": "red"},
        {"id": 2, "name": "Mid",  "pos": [20,0], "kind": "junction", "tier": 0, "port": false, "owner": ""},
        {"id": 3, "name": "Blue", "pos": [40,0], "kind": "city", "tier": 1, "port": false, "owner": "blue"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[20,0]], "tiles": ["open","open","open","open","open","open"]},
        {"a": 2, "b": 3, "kind": "road", "via": [[20,0],[40,0]], "tiles": ["open","open","open","open","open","open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true},
        {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}
      ],
      "start_armies": [
        {"faction": "red",  "at": "Red",  "roster": [["HeavySword", 3], ["Archers", 1], ["ShockCavalry", 1]]},
        {"faction": "blue", "at": "Blue", "roster": [["LightSpear", 1]]}
      ]
    }"#
}

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
