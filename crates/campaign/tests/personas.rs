//! Personas use one brain with different dials. These tests pin that the dials are
//! wired and actually change behaviour: the attack `gate` changes which city a
//! commander deems worth taking, and over a campaign a Warmonger throws itself
//! at fights a Defensive turtle declines.

mod common;

use campaign::ai::{persona, plan};
use campaign::mapdata::AiPersona;
use campaign::pathfind;
use campaign::state::Loc;
use campaign::Campaign;
use common::garrison;
use contract::UnitClassId;

#[test]
fn every_persona_parses_and_only_neutral_sits_still() {
    let cases = [
        ("expansionist", AiPersona::Expansionist),
        ("neutral", AiPersona::Neutral),
        ("defensive", AiPersona::Defensive),
        ("mercantile", AiPersona::Mercantile),
        ("opportunist", AiPersona::Opportunist),
        ("calculating", AiPersona::Calculating),
        ("warmonger", AiPersona::Warmonger),
    ];
    for (s, want) in cases {
        assert_eq!(AiPersona::parse(Some(s), false), want, "parse {s}");
        // Every characterful persona campaigns; only Neutral garrisons.
        assert_eq!(
            want.campaigns(),
            want != AiPersona::Neutral,
            "campaigns {s}"
        );
        // Profiles are sane: a real attack threshold and a positive temperature.
        let p = persona::profile(want);
        assert!(p.gate >= 100 && p.select_scale > 0.0, "profile {s}");
    }
    // Expansionist reproduces the pre-persona baseline exactly.
    assert_eq!(persona::profile(AiPersona::Expansionist).gate, 130);
}

/// Red (one unit) outmatches the near city only slightly (≈1.25×) but crushes
/// the far one. A low gate calls the near city beatable; a high gate holds out
/// for the soft far one. Node ids reindex 0-based: Red=0, Near=1, Far=2.
fn two_target_map() -> &'static str {
    r#"{
      "half_w": 100, "half_h": 100,
      "nodes": [
        {"id": 1, "name": "Red",  "pos": [0,0],  "kind": "city", "tier": 2, "port": false, "owner": "red"},
        {"id": 2, "name": "Near", "pos": [5,0],   "kind": "city", "tier": 2, "port": false, "owner": "blue"},
        {"id": 3, "name": "Far",  "pos": [0,5],   "kind": "city", "tier": 1, "port": false, "owner": "blue"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[5,0]], "tiles": ["open"]},
        {"a": 1, "b": 3, "kind": "road", "via": [[0,0],[0,5]], "tiles": ["open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true},
        {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}
      ],
      "start_armies": [
        {"faction": "red", "at": "Red", "roster": [["HeavySword", 1]]}
      ]
    }"#
}

#[test]
fn gate_decides_which_city_is_worth_taking() {
    let mut c = Campaign::new(two_target_map(), 7, 0);
    // Near is a marginal win (red's unit vs 400 of the same class ≈ 1.25×); Far
    // is a pushover. Same-class garrisons so strength is a clean count comparison.
    c.state.cities.get_mut(&1).unwrap().garrison = garrison(UnitClassId::HeavySword, 400);
    c.state.cities.get_mut(&2).unwrap().garrison = garrison(UnitClassId::HeavySword, 60);
    let mut bfs = pathfind::Visited::new(&c.map);

    // Every city any candidate plan would march on, for a given gate.
    let mut targets = |gate: u64| -> Vec<Loc> {
        plan::candidates(&c.map, &c.state, 0, gate, &mut bfs)
            .iter()
            .flat_map(|p| p.orders.iter().map(|&(_, l)| l))
            .collect()
    };

    // Warmonger's gate (100): the near city clears the bar, so the offensive
    // commits to it and never considers the distant soft target.
    let low = targets(persona::profile(AiPersona::Warmonger).gate);
    assert!(
        low.contains(&Loc::Node(1)) && !low.contains(&Loc::Node(2)),
        "a low gate should commit to the near, even fight (targets {low:?})",
    );
    // Defensive's gate (180): the near fight isn't a clear enough win, so it
    // holds out for the soft far city.
    let high = targets(persona::profile(AiPersona::Defensive).gate);
    assert!(
        high.contains(&Loc::Node(2)),
        "a high gate should pass the even fight for the soft far target (targets {high:?})",
    );
}

/// Red ringed by enemy cities it would *lose* to (blue is Neutral — it only
/// garrisons, so every battle is one red chose to start). Adjacent so a rollout
/// reaches them. Node ids: Red=0, then the three blue cities 1..3.
fn siege_ring_map() -> &'static str {
    r#"{
      "half_w": 100, "half_h": 100,
      "nodes": [
        {"id": 1, "name": "Red", "pos": [0,0],  "kind": "city", "tier": 2, "port": false, "owner": "red"},
        {"id": 2, "name": "B1",  "pos": [5,0],   "kind": "city", "tier": 1, "port": false, "owner": "blue"},
        {"id": 3, "name": "B2",  "pos": [0,5],   "kind": "city", "tier": 1, "port": false, "owner": "blue"},
        {"id": 4, "name": "B3",  "pos": [-5,0],  "kind": "city", "tier": 1, "port": false, "owner": "blue"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[5,0]],  "tiles": ["open"]},
        {"a": 1, "b": 3, "kind": "road", "via": [[0,0],[0,5]],  "tiles": ["open"]},
        {"a": 1, "b": 4, "kind": "road", "via": [[0,0],[-5,0]], "tiles": ["open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": false}
      ],
      "start_armies": [
        {"faction": "red", "at": "Red", "roster": [["HeavySword", 1]]}
      ]
    }"#
}

fn battles_started(p: AiPersona, ticks: u32, seed: u64) -> u32 {
    let mut c = Campaign::new(siege_ring_map(), seed, 0);
    c.state.factions[0].ai = true;
    c.map.factions[0].ai_persona = p;
    // Each ringing city out-garrisons red's army — these are losing assaults.
    for n in [1u32, 2, 3] {
        c.state.cities.get_mut(&n).unwrap().garrison = garrison(UnitClassId::HeavySword, 900);
    }
    common::run_ai(&mut c, ticks)
}

#[test]
fn warmonger_throws_itself_at_fights_a_turtle_declines() {
    // Sum across seeds — a single campaign's mood swings are noisy, but the brave
    // persona out-attacks the cautious one in aggregate.
    let warmonger: u32 = (0..6)
        .map(|s| battles_started(AiPersona::Warmonger, 8_000, s))
        .sum();
    let defensive: u32 = (0..6)
        .map(|s| battles_started(AiPersona::Defensive, 8_000, s))
        .sum();
    assert!(
        warmonger > defensive,
        "warmonger ({warmonger}) should start more losing fights than defensive ({defensive})",
    );
}
