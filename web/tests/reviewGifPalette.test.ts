// @vitest-environment node
import { expect, test } from "vitest";
// @ts-expect-error Node review scripts have no declaration module.
import { quantize } from "../shots/_gif.mjs";

test("water review retains subtle moving shades without changing the default palette", () => {
  const frames = [
    { data: Uint8Array.from([64, 128, 144, 255, 65, 129, 145, 255, 66, 130, 146, 255]) },
  ];
  expect(new Set(quantize(frames).indexed[0]).size).toBe(1);
  const detailed = quantize(frames, 8);
  expect(new Set(detailed.indexed[0]).size).toBe(3);
  for (let i = 0; i < 3; i++) {
    const index = detailed.indexed[0][i];
    expect([...detailed.palette.slice(index * 3, index * 3 + 3)]).toEqual([
      ...frames[0].data.slice(i * 4, i * 4 + 3),
    ]);
  }
});
