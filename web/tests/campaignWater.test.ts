import { buildCampaignCoast } from "../../packages/game-renderer/src/terrain/campaignCoast";
import { expect, it } from "vitest";
import {
  RenderMask,
  campaignWaterAt,
  snapshotCampaignLandscape,
  campaignLandscapeSource,
} from "../../packages/game-renderer/src/terrain/campaignSource";

it("keeps rivers territory-capable while reporting their actual wet coverage", () => {
  const pixels = Uint8Array.from([
    38, 60, 84, 255, 196, 178, 138, 255, 142, 120, 96, 255, 52, 84, 110, 255, 60, 96, 124, 255,
  ]);
  const mask = new RenderMask(pixels, 5, 1, { min: [0, 0], max: [10, 2] });
  expect([1, 3, 5, 7, 9].map((x) => mask.landAt(x, 1))).toEqual([false, true, true, false, true]);
  expect([1, 3, 5, 7, 9].map((x) => mask.waterAt(x, 1))).toEqual([true, false, false, true, true]);
});

it("connects a river mouth to its sea while retaining an isolated lake", () => {
  const palette = [
    [38, 60, 84, 255],
    [196, 178, 138, 255],
    [142, 120, 96, 255],
    [52, 84, 110, 255],
    [60, 96, 124, 255],
  ];
  const classes = [0, 1, 1, 1, 3, 0, 4, 1, 1, 3, 0, 1, 4, 1, 1];
  const mask = new RenderMask(Uint8Array.from(classes.flatMap((c) => palette[c])), 5, 3, {
    min: [0, 0],
    max: [5, 3],
  });
  const sea = campaignWaterAt(mask, 0.5, 2.5),
    river = campaignWaterAt(mask, 2.5, 0.5),
    lake = campaignWaterAt(mask, 4.5, 2.5);
  expect(river.bodyId).toBe(sea.bodyId);
  expect(campaignWaterAt(structuredClone(mask), 2.5, 0.5)).toEqual(river);
  expect(river.kind).toBe("river");
  expect(river.level).toBe(sea.level);
  expect(lake.bodyId).not.toBe(sea.bodyId);
  expect(campaignWaterAt(mask, 3.5, 1.5).wet).toBe(false);
});

it("transfers wet semantics independently from territory semantics", () => {
  const mask = new RenderMask(Uint8Array.of(60, 96, 124, 255), 1, 1, { min: [0, 0], max: [2, 2] });
  const snapshot = snapshotCampaignLandscape({
    w: 1,
    h: 1,
    cell: 2,
    minX: 0,
    maxY: 2,
    height: Float32Array.of(1),
    biome: new Uint8Array(4),
    renderMask: mask,
  });
  const reconstructed = campaignLandscapeSource(structuredClone(snapshot));
  expect(reconstructed.renderLandAt(1, 1)).toBe(true);
  expect(reconstructed.renderWaterAt(1, 1)).toBe(true);
  snapshot.renderMask.classes[0] = 1;
  expect(mask.waterAt(1, 1)).toBe(true);
});

it("keeps invalid and outside coordinates off render land", () => {
  const mask = new RenderMask(Uint8Array.of(196, 178, 138, 255), 1, 1, {
    min: [0, 0],
    max: [2, 2],
  });
  for (const x of [NaN, Infinity, -Infinity, 3]) expect(mask.landAt(x, 1)).toBe(false);
});

it("uses the existing canonical coast transform for wet signs including river cells", () => {
  const palette = [
    [38, 60, 84, 255],
    [196, 178, 138, 255],
    [142, 120, 96, 255],
    [52, 84, 110, 255],
    [60, 96, 124, 255],
  ];
  const classes: number[] = Array.from({ length: 81 }, (_, i) => (i % 9 < 2 ? 0 : 1));
  classes[4 * 9 + 2] = 4;
  classes[5 * 9 + 3] = 4;
  classes[6 * 9 + 4] = 4;
  classes[2 * 9 + 6] = 3;
  classes[4 * 9] = 1;
  const mask = new RenderMask(Uint8Array.from(classes.flatMap((c) => palette[c])), 9, 9, {
    min: [-9, -9],
    max: [9, 9],
  });
  const coast = buildCampaignCoast((x, y) => !mask.waterAt(x, y), -14, -14, 15, 2);
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 9; col++) {
      const x = -8 + col * 2,
        y = 8 - row * 2,
        wet = mask.waterAt(x, y);
      const signed = wet ? -coast.offshoreAt(x, y) : coast.inlandAt(x, y);
      expect(signed < 0).toBe(wet);
      expect(signed > 0).toBe(!wet);
    }
});
