import { expect, it } from "vitest";
import { buildWaterBodies } from "../../packages/game-renderer/src/water/waterBodies";

it("keeps a narrow connecting channel and an island hole in one source-stable body", () => {
  const rows = ["11100111", "10100111", "11111111", "11100111"];
  const data = Uint8Array.from(rows.join(""), Number);
  const body = buildWaterBodies(data, 8, 4, (v) => v === 1);
  expect(body.bodyAt(0, 0)).toBeGreaterThanOrEqual(0);
  expect(body.bodyAt(7, 0)).toBe(body.bodyAt(0, 0));
  expect(body.bodyAt(4, 2)).toBe(body.bodyAt(0, 0));
  expect(body.bodyAt(1, 1)).toBe(-1);
  expect(body.bodyAt(4, 0)).toBe(-1);
  expect(body.bodyAt(-1, 0)).toBe(-1);
  expect(body.bodyAt(8, 0)).toBe(-1);
});

it("keeps diagonal raster river pixels connected", () => {
  const body = buildWaterBodies(Uint8Array.of(1, 0, 0, 1), 2, 2, (v) => v === 1);
  expect(body.bodyAt(0, 0)).toBe(body.bodyAt(1, 1));
});

it("preserves separate basins when a dry pixel keeps them apart", () => {
  const body = buildWaterBodies(Uint8Array.of(1, 0, 1, 1, 0, 1), 3, 2, (v) => v === 1);
  expect(body.bodyAt(0, 0)).not.toBe(body.bodyAt(2, 1));
});

it("agrees with cell flood fill for every three-by-three wet topology", () => {
  for (let bits = 0; bits < 512; bits++) {
    const mask = Uint8Array.from({ length: 9 }, (_, i) => (bits >> i) & 1);
    const bodies = buildWaterBodies(mask, 3, 3, (v) => v === 1);
    const labels = new Int32Array(9).fill(-1);
    for (let seed = 0; seed < 9; seed++) {
      if (!mask[seed] || labels[seed] >= 0) continue;
      const queue = [seed];
      labels[seed] = seed;
      while (queue.length) {
        const i = queue.pop()!,
          x = i % 3,
          y = Math.floor(i / 3);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy,
              j = ny * 3 + nx;
            if (nx < 0 || ny < 0 || nx >= 3 || ny >= 3 || !mask[j] || labels[j] >= 0) continue;
            labels[j] = seed;
            queue.push(j);
          }
      }
    }
    for (let a = 0; a < 9; a++) {
      const actual = bodies.bodyAt(a % 3, Math.floor(a / 3));
      expect(actual >= 0).toBe(mask[a] === 1);
      for (let b = 0; b < 9; b++)
        if (mask[a] && mask[b])
          expect(actual === bodies.bodyAt(b % 3, Math.floor(b / 3))).toBe(labels[a] === labels[b]);
    }
  }
});

it("stores a broad sea by its rows rather than a body ID for every pixel", () => {
  const bodies = buildWaterBodies(new Uint8Array(1000 * 1000).fill(1), 1000, 1000, (v) => v === 1);
  expect(bodies.retainedBytes).toBe(bodies.rows.byteLength + bodies.runs.byteLength);
  expect(bodies.retainedBytes).toBeLessThan(20000);
  expect(bodies.bodyAt(0, 0)).toBe(bodies.bodyAt(999, 999));
});
