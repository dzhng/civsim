// @vitest-environment node
import { expect, test } from "vitest";
import { buildBattleHorizonLayout } from "@packages/game-renderer/src/battle/horizonPass";
import { buildOceanPlaneGeometry } from "@packages/game-renderer/src/water/battleWaterGeometry";
import { buildBattleGroundMesh } from "@packages/game-renderer/src/battle/groundPass";
import type { TerrainHeightField } from "@packages/game-renderer/src/terrain/heightField";

test("ocean starts at every drawn edge knot without overlap and settles offshore", () => {
  const grid = {
    w: 8,
    h: 8,
    cell: 4,
    ox: -16,
    oy: -16,
    tint: new Uint8Array(64).fill(1),
    height: Float32Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) % 3) * 2 - 5),
  };
  const field: TerrainHeightField = { ...grid, units: "meters", verticalScale: 1 };
  const ground = buildBattleGroundMesh(grid, field, "green-grass");
  for (let i = 0; i < ground.vertices.length; i += 10)
    ground.vertices[i + 9] = 0.6 + (ground.vertices[i + 1] + 14) / 70;
  const layout = buildBattleHorizonLayout(
    grid,
    { west: "ocean", east: "ocean", north: "open-fog", south: "open-fog" },
    field,
    ground.vertices,
  );
  for (const [index, spec] of layout.oceanPlanes.entries()) {
    // Low ocean resolution deliberately disagrees with the ground sampling.
    const mesh = buildOceanPlaneGeometry({ ...spec, rect: { ...spec.rect, res: 7 } });
    const west = index === 0;
    const boundary = new Map<number, number>();
    const coverage = new Map<number, number>();
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const [x, y, z] = mesh.positions.slice(i, i + 3);
      expect(west ? x <= spec.shoreX : x >= spec.shoreX).toBe(true);
      if (x === spec.shoreX) {
        boundary.set(y, z);
        coverage.set(y, mesh.shoreDist[i / 3]);
      }
      if (Math.abs(x - spec.shoreX) > 300) expect(z).toBeCloseTo(spec.baseZ, 5);
    }
    for (const point of spec.edge) {
      expect(boundary.get(point.y)).toBe(point.z);
      expect(coverage.get(point.y)).toBe(point.water);
    }
    expect(new Set(spec.edge.map((p) => p.z)).size).toBeGreaterThan(1);
    expect(spec.shoreX).toBe(west ? -14 : 14);
    expect(new Set(coverage.values()).size).toBeGreaterThan(1);
    for (const value of mesh.indices) expect(value).toBeLessThan(mesh.positions.length / 3);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = mesh.indices.slice(i, i + 3).map((v) => v * 3);
      const area =
        (mesh.positions[b] - mesh.positions[a]) * (mesh.positions[c + 1] - mesh.positions[a + 1]) -
        (mesh.positions[c] - mesh.positions[a]) * (mesh.positions[b + 1] - mesh.positions[a + 1]);
      expect(area).toBeGreaterThan(0);
    }
  }
});
