// @vitest-environment node
import { test, expect, vi, afterEach } from "vitest";
import {
  layoutReadout,
  packReadoutChips,
  type ChipInstance,
} from "../../packages/game-renderer/src/battle/readoutData";
afterEach(() => vi.unstubAllGlobals());
test("readout rows wrap centered above the finial and preserve semantic plate keys", () => {
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({ font: "", measureText: (text: string) => ({ width: text.length * 5 }) }),
    }),
  });
  const chips: ChipInstance[] = [];
  layoutReadout(
    {
      unitId: 7,
      x: 1,
      y: 2,
      z: 3,
      worldPerPx: 0.2,
      chips: [
        { text: "ABCDEFGHIJ" },
        { text: "KLMNOPQRST", kind: "hot" },
        { text: "x:y", kind: "bad" },
      ],
    },
    chips,
  );
  expect(chips.map((c) => [c.key, c.offsetX, c.offsetY])).toEqual([
    ["plain:ABCDEFGHIJ", 0, 11.5],
    ["hot:KLMNOPQRST", -12.5, 24.5],
    ["bad:x:y", 27, 24.5],
  ]);
  expect(chips.every((c) => c.anchor.join(",") === "1,2,3" && c.worldPerPx === 0.2)).toBe(true);
});
test("missing atlas entries zero reused slots rather than leave orphan chips", () => {
  const chips: ChipInstance[] = [
    {
      anchor: [1, 2, 3],
      worldPerPx: 0.2,
      offsetX: 4,
      offsetY: 5,
      width: 8,
      height: 11,
      key: "missing",
    },
  ];
  const a = new Float32Array(4).fill(9),
    b = a.slice(),
    c = a.slice();
  packReadoutChips(chips, new Map(), a, b, c);
  expect([...a, ...b, ...c]).toEqual(Array(12).fill(0));
});
