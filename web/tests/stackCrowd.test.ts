import { expect, test } from "vitest";
import { buildStackCrowd } from "../../packages/crowd-runtime/src/stackCrowd";

test("campaign figures use each represented class's authored clip", () => {
  const figures = buildStackCrowd([1, 1], {
    unitCount: 2,
    stackUnitCap: 2,
    maxFigures: 2,
    x: 0,
    y: 0,
    faction: 0,
    seed: 1,
    clipForClass: (id: number) => ["sword-walk", "pike-carry"][id],
  });
  expect(figures.map(({ classId, clip }) => [classId, clip])).toEqual([
    [0, "sword-walk"],
    [1, "pike-carry"],
  ]);
});
