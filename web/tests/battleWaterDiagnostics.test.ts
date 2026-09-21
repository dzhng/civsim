// @vitest-environment node
import { expect, test } from "vitest";
import { prepareWaterSurfaces } from "@packages/battle-renderer/src/waterData";
import type { BattleWaterInput } from "@packages/battle-renderer/src/waterData";

const lake = (level: number, tint: number): BattleWaterInput => ({
  kind: "lake",
  spec: {
    id: 1,
    level,
    minCellX: 0,
    minCellY: 0,
    maxCellX: 0,
    maxCellY: 0,
    minX: 0,
    minY: 0,
    maxX: 4,
    maxY: 4,
    cells: 1,
  },
  grid: { w: 1, h: 1, cell: 4, ox: 0, oy: 0, tint: new Uint8Array([tint]) },
});

test("water diagnostics travel with built geometry, excluding dry lake requests", () => {
  const surfaces = [...prepareWaterSurfaces([lake(99, 0), lake(12, 1), lake(-3, 1)])];
  expect(
    surfaces.map((surface) => ({
      kind: surface.kind,
      level: surface.level,
      triangles: surface.indices.length / 3,
    })),
  ).toEqual([
    { kind: "lake", level: 12, triangles: 2 },
    { kind: "lake", level: -3, triangles: 2 },
  ]);
  for (const surface of surfaces) {
    expect([...surface.positions].filter((_, i) => i % 3 === 2)).toEqual(
      Array(4).fill(surface.level),
    );
    expect(surface.state[0]).toBeGreaterThan(surface.level);
    expect(surface.state[0] - surface.level).toBeCloseTo(
      surfaces[0].state[0] - surfaces[0].level,
      5,
    );
  }
});
