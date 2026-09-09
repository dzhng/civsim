import { describe, expect, it } from "vitest";
import { quickBattleUrl, readQuickBattleUrl } from "./quickBattleUrl";
import type { QuickBattleConfig } from "./quickBattleCatalog";

const classes = [
  { id: 0, name: "Heavy Sword", cost: 1200 },
  { id: 4, name: "Archers", cost: 700 },
];
const config: QuickBattleConfig = {
  mapId: -1,
  generatedSeed: "18446744073709551615",
  environment: "dusk",
  factions: ["neutral", "crimson"],
  teams: [[{ classId: 0, count: 2 }], [{ classId: 4, count: 3 }]],
};
const read = (value: unknown) =>
  readQuickBattleUrl(new URLSearchParams({ setup: JSON.stringify(value) }), classes);

describe("battle links", () => {
  it("recreates every setup choice from a shared run or menu URL", () => {
    for (const path of ["/battle", "/battle/run"] as const) {
      const url = new URL(quickBattleUrl(path, config), "https://example.test");
      expect(url.pathname).toBe(path);
      expect(readQuickBattleUrl(url.searchParams, classes)).toEqual(config);
    }
  });
  it("accepts the builder’s full decimal seed range for deterministic 64-bit wrapping", () => {
    expect(read({ ...config, generatedSeed: "18446744073709551616" })?.generatedSeed).toBe(
      "18446744073709551616",
    );
  });
  it("rejects invalid deployments before they can reach the sim", () => {
    for (const teams of [
      [],
      [[], []],
      [[{ classId: 999, count: 1 }], config.teams[1]],
      [[{ classId: 0, count: 1.5 }], config.teams[1]],
      [[{ classId: 0, count: 20 }], config.teams[1]],
      [
        [
          { classId: 0, count: 1 },
          { classId: 0, count: 1 },
        ],
        config.teams[1],
      ],
    ]) {
      expect(read({ ...config, teams })).toBeNull();
    }
    expect(read({ ...config, generatedSeed: "-1" })).toBeNull();
    expect(read({ ...config, mapId: 999 })).toBeNull();
    expect(read({ ...config, environment: "unknown" })).toBeNull();
    expect(read({ ...config, factions: ["unknown", "azure"] })).toBeNull();
    expect(readQuickBattleUrl(new URLSearchParams("setup=%7B"), classes)).toBeNull();
  });
});
