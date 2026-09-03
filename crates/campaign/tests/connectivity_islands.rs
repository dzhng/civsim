//! Guardrail for true island holdings on the committed grand map. Islands are
//! neutral, inert garrisons: no playable owner, no campaigning persona, no
//! starting army.

use campaign::mapdata::{AiPersona, NodeId, NodeKind, WorldMap};
use std::collections::{BTreeMap, BTreeSet};

mod common;

use common::real_map;

fn playable_capital_names(map_json: &str) -> Vec<String> {
    let raw: serde_json::Value =
        serde_json::from_str(map_json).expect("real campaign map should parse as json");
    raw["factions"]
        .as_array()
        .expect("campaign map factions")
        .iter()
        .filter(|f| f["playable"].as_bool().unwrap_or(false))
        .map(|f| {
            f["capital"]
                .as_str()
                .unwrap_or_else(|| panic!("playable faction {:?} has no capital", f["id"]))
                .to_string()
        })
        .collect()
}

fn node_by_name(map: &WorldMap, name: &str) -> NodeId {
    let matches: Vec<NodeId> = map
        .nodes
        .iter()
        .enumerate()
        .filter(|(_, node)| node.name == name)
        .map(|(id, _)| id as NodeId)
        .collect();
    assert_eq!(
        matches.len(),
        1,
        "capital name {name:?} should resolve to exactly one loaded node"
    );
    matches[0]
}

#[test]
fn island_holdings_stay_neutral_armyless_and_inert() {
    let map_json = real_map();
    let map = WorldMap::from_json(&map_json);
    let wire: contract::mapjson::Map =
        serde_json::from_str(&map_json).expect("real campaign map wire schema");
    let capitals: Vec<NodeId> = playable_capital_names(&map_json)
        .iter()
        .map(|name| node_by_name(&map, name))
        .collect();
    assert!(
        !capitals.is_empty(),
        "real map should have playable capitals"
    );

    let capital_ids: BTreeSet<u32> = capitals
        .iter()
        .map(|&id| wire.nodes[id as usize].id)
        .collect();
    let main_wire: BTreeSet<u32> = mapgen::graph::components(
        wire.nodes.iter().map(|node| node.id),
        wire.edges.iter().map(|edge| (edge.a, edge.b)),
    )
    .into_iter()
    .filter(|component| !component.is_disjoint(&capital_ids))
    .flatten()
    .collect();
    let main: BTreeSet<NodeId> = wire
        .nodes
        .iter()
        .enumerate()
        .filter(|(_, node)| main_wire.contains(&node.id))
        .map(|(index, _)| index as NodeId)
        .collect();
    let start_armies_by_city: BTreeMap<NodeId, Vec<&str>> = map
        .start_armies
        .iter()
        .map(|army| (army.at, map.factions[army.faction as usize].id.as_str()))
        .fold(BTreeMap::new(), |mut by_city, (at, faction)| {
            by_city.entry(at).or_default().push(faction);
            by_city
        });

    let islands: Vec<NodeId> = map
        .nodes
        .iter()
        .enumerate()
        .filter(|(id, node)| node.kind == NodeKind::City && !main.contains(&(*id as NodeId)))
        .map(|(id, _)| id as NodeId)
        .collect();

    assert!(
        !islands.is_empty(),
        "island set must be non-empty; a vacuous island guardrail is useless"
    );
    let island_names: BTreeSet<&str> = islands
        .iter()
        .map(|&id| map.nodes[id as usize].name.as_str())
        .collect();
    assert!(
        island_names.contains("Londinium") || island_names.contains("Rhodos"),
        "island set should contain a known island city; got {:?}",
        island_names
    );
    println!("island holdings: {}", islands.len());

    let mut violations = Vec::new();
    for city_id in islands {
        let city = &map.nodes[city_id as usize];
        let owner = &map.factions[city.initial_owner as usize];

        if owner.playable {
            violations.push(format!(
                "{}: owner {} ({}) is playable",
                city.name, owner.id, owner.name
            ));
        }
        if owner.ai_persona != AiPersona::Neutral {
            violations.push(format!(
                "{}: owner {} ({}) has ai_persona {:?}",
                city.name, owner.id, owner.name, owner.ai_persona
            ));
        }
        if owner.ai_persona.campaigns() {
            violations.push(format!(
                "{}: owner {} ({}) campaigns() == true",
                city.name, owner.id, owner.name
            ));
        }
        if let Some(factions) = start_armies_by_city.get(&city_id) {
            violations.push(format!(
                "{}: has starting army from faction(s) {}",
                city.name,
                factions.join(", ")
            ));
        }
    }

    assert!(
        violations.is_empty(),
        "island holding invariant violation(s):\n{}",
        violations.join("\n")
    );
}
