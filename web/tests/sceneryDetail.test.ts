// @vitest-environment node
import { expect, test } from "vitest";
import {
  CAMPAIGN_SCENERY_DETAIL,
  BATTLE_SCENERY_DETAIL,
  sceneryDetailActive,
  sceneryLeafFade,
  sceneryPixels,
} from "../../packages/game-renderer/src/terrain/sceneryDetail";

test("detail residency retains its state inside the threshold band while leaf presence fades", () => {
  let active = false;
  const states = [60, 75, 60, 54, 60].map(
    (pixels) => (active = sceneryDetailActive(pixels, active, CAMPAIGN_SCENERY_DETAIL)),
  );
  expect(states).toEqual([false, true, true, false, false]);
  expect(sceneryLeafFade(40, CAMPAIGN_SCENERY_DETAIL)).toBe(0);
  expect(sceneryLeafFade(85, CAMPAIGN_SCENERY_DETAIL)).toBe(0.5);
  expect(sceneryLeafFade(130, CAMPAIGN_SCENERY_DETAIL)).toBe(1);
});

test("projected trees use each base depth and physical height, including raised ground", () => {
  const projection = {
    view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -100, 1],
    pixelsPerViewUnit: 1000,
    perspective: true,
    near: 0.1,
  };
  const tree = { kind: "broadleaf" as const, x: 0, y: 0, size: 1 };
  const base = sceneryPixels(tree, 2, projection);
  expect(sceneryPixels({ ...tree, height: 2 }, 2, projection)).toBe(base * 2);
  expect(sceneryPixels({ ...tree, z: 50 }, 2, projection)).toBe(base * 2);
  expect(sceneryPixels({ ...tree, z: 101 }, 2, projection)).toBe(0);
});

test("battle retains leaf edges on smaller crowns with its own residency band", () => {
  let active = false;
  expect(
    [24, 30, 24, 21, 24].map(
      (pixels) => (active = sceneryDetailActive(pixels, active, BATTLE_SCENERY_DETAIL)),
    ),
  ).toEqual([false, true, true, false, false]);
  // A modest battle crown keeps its leaf edge; campaign can still use its closed crown.
  expect(sceneryLeafFade(40, BATTLE_SCENERY_DETAIL)).toBeGreaterThan(0.5);
  expect(sceneryLeafFade(40, CAMPAIGN_SCENERY_DETAIL)).toBe(0);
  expect(sceneryLeafFade(20, BATTLE_SCENERY_DETAIL)).toBe(0);
  expect(sceneryLeafFade(34, BATTLE_SCENERY_DETAIL)).toBe(0.5);
  expect(sceneryLeafFade(48, BATTLE_SCENERY_DETAIL)).toBe(1);
});
