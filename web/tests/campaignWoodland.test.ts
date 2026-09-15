// @vitest-environment node
import { expect, test } from "vitest";
import {
  buildCampaignWoodlandCandidates,
  buildCampaignSceneryCandidates,
  campaignScenery,
} from "../../packages/game-renderer/src/campaign/scenery";
import type { CampaignTerrainField } from "../../packages/game-renderer/src/campaign/entityFrame";

function woodland(): CampaignTerrainField {
  const w = 48,
    h = 48,
    cell = 8;
  const biome = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      // Wide central clearing crosses the old source-cell jitter boundary.
      biome[(j * w + i) * 4 + 1] = i >= 18 && i < 30 ? 0 : 255;
    }
  return {
    w,
    h,
    cell,
    minX: -192,
    maxY: 192,
    biome,
    height: new Float32Array(w * h).fill(2.2),
    land: new Uint8Array(w * h).fill(1),
    maxH: 2.2,
    heightAt: () => 2.2,
    renderLandAt: (x, _y, margin = 0) => x < 150 - margin,
    renderWaterAt: (x, y) => x >= 150 || (y > 80 && y < 88),
  };
}

test("campaign woodland respects actual clearing and coastal footprint with bounded deterministic output", () => {
  const field = woodland();
  const candidates = buildCampaignWoodlandCandidates(field, 0);
  expect(candidates.length).toBeGreaterThan(300);
  expect(candidates.length).toBeLessThanOrEqual(Math.ceil((field.w * field.cell) / 4) ** 2);
  expect(candidates.every((t) => field.renderLandAt(t.x, t.y, t.size / 2))).toBe(true);
  expect(candidates.every((t) => !field.renderWaterAt(t.x, t.y))).toBe(true);
  expect(candidates.every((t) => Math.abs(t.x) > 40)).toBe(true);
  expect(buildCampaignWoodlandCandidates(field, 0)).toEqual(candidates);
  const reserved = campaignScenery(candidates, [{ x: -100, y: 0, radius: 40, kind: "army" }]);
  expect(reserved.length).toBeLessThan(candidates.length);
  expect(reserved.every((t) => Math.hypot(t.x + 100, t.y) >= 40)).toBe(true);
});

test("campaign woodland excludes steep relief without changing source elevation", () => {
  const field = woodland();
  const low = buildCampaignWoodlandCandidates(field, 0);
  field.height.fill(100);
  const before = field.height.slice();
  const high = buildCampaignWoodlandCandidates(field, 0);
  expect(high.length).toBeLessThan(low.length / 3);
  expect(field.height).toEqual(before);
});

test("campaign planting retains city and road clearances through its production producer", () => {
  const field = woodland();
  const candidates = buildCampaignSceneryCandidates(
    {
      bgRect: { min: [-192, -192], max: [192, 192] },
      map: {
        attribution: "woodland-test",
        factions: [],
        nodes: [
          {
            id: 1,
            name: "Town",
            pos: [-100, 80],
            kind: "city",
            tier: 2,
            port: false,
            owner: "test",
          },
        ],
        edges: [
          {
            kind: "road",
            via: [
              [-100, -192],
              [-100, 0],
            ],
          },
        ],
      },
    },
    field,
    false,
    0,
  );
  expect(candidates.length).toBeGreaterThan(300);
  expect(candidates.every((t) => Math.hypot(t.x + 100, t.y - 80) >= 6)).toBe(true);
  expect(candidates.filter((t) => t.y < 0).every((t) => Math.abs(t.x + 100) >= 2.4)).toBe(true);
  expect(
    candidates.filter((t) => t.kind !== "mountain").every((t) => Math.abs(t.z! - 2.15) < 1e-6),
  ).toBe(true);
});
