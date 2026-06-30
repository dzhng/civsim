//! Slice 1 — the cheap battle estimator (`resolve::estimate`). Pins the
//! strength-ratio model the AI's lookahead imagines fights with: heavier side
//! wins, both bleed in proportion to the gap, deterministic. The full physics
//! sim is the real arbiter (see `full_game::lopsided_war_concludes`); this is
//! only the AI's mental model.

use campaign::Campaign;
use contract::{BattleSetup, Deployment, RosterUnit, TerrainSpec, UnitClassId};

/// Smallest valid map — we only need *a* `WorldMap` to satisfy the signature;
/// the synthetic setups below carry `unit_type: None`, so the class-rate
/// fallback is exercised and the map is never dereferenced.
fn tiny_map() -> &'static str {
    r#"{
      "half_w": 100, "half_h": 100,
      "nodes": [
        {"id": 1, "name": "A", "pos": [0,0],  "kind": "city", "tier": 1, "port": false, "owner": "red"},
        {"id": 2, "name": "B", "pos": [20,0], "kind": "city", "tier": 1, "port": false, "owner": "blue"}
      ],
      "edges": [
        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[20,0]], "tiles": ["open","open","open","open"]}
      ],
      "ambush_spots": [],
      "factions": [
        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},
        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true}
      ],
      "start_armies": [
        {"faction": "red",  "at": "A", "roster": [["HeavySword", 1]]},
        {"faction": "blue", "at": "B", "roster": [["LightSpear", 1]]}
      ]
    }"#
}

fn unit(id: u64, class: UnitClassId, count: u32) -> RosterUnit {
    RosterUnit {
        id,
        class,
        unit_type: None,
        count,
        training: 0.6,
        morale_cap: 1.0,
    }
}

/// Two teams, each a single class so weighting is a clean count comparison.
fn duel(team0: u32, team1: u32) -> BattleSetup {
    let mk = |team: u32, base: u64, n: u32| Deployment {
        team,
        units: vec![unit(base, UnitClassId::LightSpear, n)],
        center: [0.0, 0.0],
        facing: 0.0,
        column: false,
    };
    BattleSetup {
        seed: 0,
        // Estimate ignores terrain; a bare spec keeps the fixture honest.
        terrain: TerrainSpec {
            half_w: 100.0,
            half_h: 100.0,
            cell: 1.0,
            ops: vec![],
        },
        deployments: vec![mk(0, 0x100, team0), mk(1, 0x200, team1)],
        reinforcements: vec![],
    }
}

#[test]
fn heavier_side_wins_and_bleeds_less() {
    let c = Campaign::new(tiny_map(), 1, 0);

    // Lopsided: 100 vs 10 (same class). Team 0 wins nearly intact; team 1 routs.
    let r = campaign::resolve::estimate(&c.map, &duel(100, 10));
    assert_eq!(r.victor, 0);
    let t0 = r.units.iter().find(|u| u.team == 0).unwrap();
    let t1 = r.units.iter().find(|u| u.team == 1).unwrap();
    assert!(!t0.routed && t1.routed, "loser routs, winner holds");
    // ratio = 0.1 → winner_surv = 1 - 0.45*0.1 = 0.955 → 95 of 100.
    assert_eq!(t0.survivors, 95);
    // loser_surv = 0.45*0.1 = 0.045 → 0 of 10.
    assert_eq!(t1.survivors, 0);
}

#[test]
fn near_parity_both_bleed_hard() {
    let c = Campaign::new(tiny_map(), 1, 0);

    // 100 vs 100: ties go to team 0 (>=). Winner survives only ~55%, loser ~45%.
    let r = campaign::resolve::estimate(&c.map, &duel(100, 100));
    assert_eq!(r.victor, 0);
    let t0 = r.units.iter().find(|u| u.team == 0).unwrap();
    let t1 = r.units.iter().find(|u| u.team == 1).unwrap();
    // ratio = 1.0 → winner_surv = 0.55, loser_surv = 0.45.
    assert_eq!(t0.survivors, 55);
    assert_eq!(t1.survivors, 45);
}

#[test]
fn casualty_fractions_stay_in_band() {
    let c = Campaign::new(tiny_map(), 1, 0);
    // Sweep the strength gap; winner always 50–100%, loser always 0–45%.
    for loser in [5u32, 20, 50, 90, 100] {
        let r = campaign::resolve::estimate(&c.map, &duel(100, loser));
        let w = r.units.iter().find(|u| u.team == 0).unwrap();
        let l = r.units.iter().find(|u| u.team == 1).unwrap();
        let wf = w.survivors as f64 / 100.0;
        let lf = l.survivors as f64 / loser as f64;
        assert!(
            (0.5..=1.0).contains(&wf),
            "winner survivors {wf} out of band"
        );
        assert!(
            (0.0..=0.45).contains(&lf),
            "loser survivors {lf} out of band"
        );
    }
}

#[test]
fn deterministic() {
    let c = Campaign::new(tiny_map(), 1, 0);
    let setup = duel(73, 41);
    let a = campaign::resolve::estimate(&c.map, &setup);
    let b = campaign::resolve::estimate(&c.map, &setup);
    assert_eq!(a.victor, b.victor);
    assert_eq!(a.units.len(), b.units.len());
    for (x, y) in a.units.iter().zip(&b.units) {
        assert_eq!(x.survivors, y.survivors);
        assert_eq!(x.routed, y.routed);
    }
}

#[test]
fn unit_ids_preserved_for_casualty_writeback() {
    // apply_battle_outcome maps results back by id; estimate must echo ids.
    let c = Campaign::new(tiny_map(), 1, 0);
    let r = campaign::resolve::estimate(&c.map, &duel(50, 50));
    let ids: Vec<u64> = r.units.iter().map(|u| u.id).collect();
    assert!(ids.contains(&0x100) && ids.contains(&0x200));
}
