// @vitest-environment node
import { expect, test } from "vitest";
import { Campaign, Game } from "../src/wasm/game_wasm.js";
import { localBattleSim, loadSimWasm } from "./support/localBattleSim";
const MAP =
  '{\n      "half_w": 100, "half_h": 100,\n      "nodes": [\n        {"id": 1, "name": "Red",  "pos": [0,0],  "kind": "city", "tier": 2, "port": false, "owner": "red"},\n        {"id": 2, "name": "Mid",  "pos": [20,0], "kind": "junction", "tier": 0, "port": false, "owner": ""},\n        {"id": 3, "name": "Blue", "pos": [40,0], "kind": "city", "tier": 1, "port": false, "owner": "blue"}\n      ],\n      "edges": [\n        {"a": 1, "b": 2, "kind": "road", "via": [[0,0],[20,0]], "tiles": ["open","open","open","open","open","open"]},\n        {"a": 2, "b": 3, "kind": "road", "via": [[20,0],[40,0]], "tiles": ["open","open","open","open","open","open"]}\n      ],\n      "ambush_spots": [],\n      "factions": [\n        {"id": "red",  "name": "Red",  "color": [200,0,0], "playable": true},\n        {"id": "blue", "name": "Blue", "color": [0,0,200], "playable": true},\n        {"id": "independents", "name": "Ind", "color": [99,99,99], "playable": false}\n      ],\n      "start_armies": [\n        {"faction": "red",  "at": "Red",  "roster": [["HeavySword", 3], ["Archers", 1]]},\n        {"faction": "blue", "at": "Blue", "roster": [["LightSpear", 2]]}\n      ]\n    }';

test("a campaign encounter crosses the authority boundary and reports the same outcome", async () => {
  await loadSimWasm();
  const campaign = new Campaign(MAP, 11, 0);
  campaign.debug_place(0, 1, 0, 3);
  campaign.debug_place(1, 1, 0, 4);
  for (let i = 0; i < 400 && campaign.battle_ready() < 0; i++) campaign.tick(1);
  const id = campaign.battle_ready();
  expect(id).toBeGreaterThanOrEqual(0);
  const handoff = campaign.begin_campaign_battle(id)!;
  const direct = Game.from_campaign_handoff(handoff)!;
  const sim = await localBattleSim({ source: "campaign", handoff });
  try {
    const advance = sim.client.advanceBy(60);
    await sim.settle();
    await advance;
    direct.advance_ticks(60);
    expect(sim.client.identity.generatedMapManifest).toBe(direct.generated_map_manifest());
    expect(sim.client.identity.generatedMap).not.toBeNull();
    expect(sim.client.stateHash()).toBe(direct.state_hash().toString());
    const result = sim.client.battleResult();
    await sim.settle();
    const outcome = await result;
    expect(outcome).toBe(direct.campaign_battle_result());
    expect(campaign.can_save()).toBe(false);
    expect(campaign.report_campaign_battle(outcome!)).toBe(true);
    expect(campaign.can_save()).toBe(true);
  } finally {
    const disposed = sim.client.dispose();
    await sim.settle();
    await disposed;
    direct.free();
    campaign.free();
  }
});
