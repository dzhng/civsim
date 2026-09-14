// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  extractBattleTerrainFeatures,
  type BattleTerrainGrid,
} from "../../packages/game-renderer/src/battle/terrainFeatures";
import { featuresToBattleScenery } from "../../packages/game-renderer/src/battle/terrainScenery";
import { terrainNormalAt } from "../../packages/game-renderer/src/terrain/heightField";
import { terrainHeightField } from "../../packages/game-renderer/src/battle/terrainFeatures";
import { terrainScatterCandidates } from "../../packages/game-renderer/src/terrain/scatter";

function grid(paint: (x: number, y: number) => number): BattleTerrainGrid {
  const w = 24,
    h = 24;
  return {
    w,
    h,
    cell: 10,
    ox: -120,
    oy: -120,
    tint: Uint8Array.from({ length: w * h }, (_, i) => paint(i % w, Math.floor(i / w))),
    height: new Float32Array(w * h),
  };
}
function trees(g: BattleTerrainGrid) {
  return featuresToBattleScenery(
    extractBattleTerrainFeatures(g, 11).filter((f) => f.kind === "forest"),
    terrainHeightField(g),
    77,
    g,
  );
}
function cellAt(g: BattleTerrainGrid, x: number, y: number) {
  return Math.floor((y - g.oy) / g.cell) * g.w + Math.floor((x - g.ox) / g.cell);
}

describe("production battle forest placement", () => {
  test("concave forests keep their clearing and populate arms beyond the equivalent-area disc", () => {
    const g = grid((x, y) => (x < 5 || x >= 19 || y >= 19 ? 4 : 0));
    const forest = extractBattleTerrainFeatures(g, 11).find((f) => f.kind === "forest")!;
    // The old centroid disc covers the empty middle and misses the long arms.
    expect(g.tint[cellAt(g, forest.x, forest.y)]).toBe(0);
    const placed = trees(g);
    expect(placed.length).toBeGreaterThan(30);
    expect(placed.every((t) => g.tint[cellAt(g, t.x, t.y)] === 4)).toBe(true);
    expect(placed.some((t) => Math.hypot(t.x - forest.x, t.y - forest.y) > forest.radius)).toBe(
      true,
    );
    expect(placed.some((t) => t.x < -70 && t.y < -50)).toBe(true);
    expect(placed.some((t) => t.x > 70 && t.y < -50)).toBe(true);
  });

  test("water, roads, walls and gameplay clearings remain unplanted", () => {
    const g = grid((x, y) => (y < 8 ? 4 : x < 5 ? 1 : x < 10 ? 6 : x < 15 ? 3 : x < 19 ? 0 : 4));
    const before = g.tint.slice();
    const placed = trees(g);
    expect(placed.length).toBeGreaterThan(20);
    expect(placed.every((t) => g.tint[cellAt(g, t.x, t.y)] === 4)).toBe(true);
    expect(g.tint).toEqual(before);
  });

  test("local steep slopes exclude trees without emptying gentle forest terrain", () => {
    const g = grid(() => 4);
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) g.height![y * g.w + x] = Math.max(0, x - 12) * g.cell * 2;
    const placed = trees(g);
    expect(placed.some((t) => t.x < -30)).toBe(true);
    expect(placed.some((t) => t.x > 30)).toBe(false);
    expect(placed.every((t) => Number.isFinite(t.z))).toBe(true);
  });

  test("forest enumeration does not change instance identity or duplicate candidates", () => {
    const g = grid((x) => (x < 8 || x > 15 ? 4 : 0));
    const features = extractBattleTerrainFeatures(g, 11).filter((f) => f.kind === "forest");
    const field = terrainHeightField(g);
    const ordered = (fs: typeof features) =>
      featuresToBattleScenery(fs, field, 77, g).sort((a, b) => a.x - b.x || a.y - b.y);
    const placed = ordered(features);
    expect(placed.length).toBeGreaterThan(0);
    expect(ordered([...features].reverse())).toEqual(placed);
    expect(new Set(placed.map((t) => `${t.x},${t.y}`)).size).toBe(placed.length);
    expect(placed.length).toBeLessThanOrEqual(features.length * 240);
  });

  test("authored disc features without source cells retain their bounded footprint", () => {
    const g = grid(() => 4);
    const placed = featuresToBattleScenery(
      [{ kind: "forest", x: 0, y: 0, radius: 30, yaw: 0, density: 1, tint: 4 }],
      terrainHeightField(g),
      77,
      g,
    );
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.every((t) => Math.hypot(t.x, t.y) <= 30)).toBe(true);
  });
});

test("scatter windows preserve identities in overlaps with finite work", () => {
  const whole = [...terrainScatterCandidates([-100, -100, 100, 100], 9.6, 77)];
  const window = [...terrainScatterCandidates([-41, -23, 67, 88], 9.6, 77)];
  expect(window).toEqual(whole.filter((p) => p.x >= -41 && p.x < 67 && p.y >= -23 && p.y < 88));
  expect(whole.length).toBeLessThanOrEqual(22 * 22);
});

test("shared slope normals preserve a plane at its edges and interior", () => {
  const g = grid(() => 4);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) g.height![y * g.w + x] = 2 * x * g.cell + y * g.cell;
  const field = terrainHeightField(g);
  const length = Math.sqrt(6);
  for (const x of [-119, -80, 0, 80, 119])
    for (const y of [-119, 0, 119]) {
      const n = terrainNormalAt(field, x, y);
      expect(n[0]).toBeCloseTo(-2 / length);
      expect(n[1]).toBeCloseTo(-1 / length);
      expect(n[2]).toBeCloseTo(1 / length);
    }
  field.height.fill(0);
  expect(terrainNormalAt(field, 119, 119)).toEqual([-0, -0, 1]);
});
