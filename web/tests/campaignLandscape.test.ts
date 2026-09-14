import { describe, expect, it } from "vitest";
import { buildCampaignLandscape } from "../../packages/game-renderer/src/terrain/campaignLandscape";
import type { CampaignTerrainField } from "../../packages/game-renderer/src/campaign/entityFrame";

function coast(): CampaignTerrainField {
  const w = 9,
    h = 9,
    cell = 8;
  const height = Float32Array.from({ length: w * h }, (_, i) => 3 + (i % w) * 0.7);
  // Deliberately stale coarse shoreline: the full-resolution mask must own water.
  const biome = Uint8Array.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : 180));
  return {
    w,
    h,
    cell,
    minX: -36,
    maxY: 36,
    height,
    biome,
    land: new Uint8Array(w * h).fill(1),
    maxH: 9,
    heightAt: () => 4,
    renderLandAt: (x, _y, margin = 0) => x > margin,
  };
}

describe("campaign landscape surface", () => {
  it("seats arbitrary positions on the triangles that are actually drawn", () => {
    const surface = buildCampaignLandscape(coast(), [0, 0], 24, 2);
    const { vertices, indices } = surface.surface.mesh;
    // Triangle centroids exercise both sides of the diagonal, including coast slopes.
    for (let t = 0; t < indices.length; t += 39) {
      const a = indices[t] * 10,
        b = indices[t + 1] * 10,
        c = indices[t + 2] * 10;
      const x = (vertices[a] + vertices[b] + vertices[c]) / 3;
      const y = (vertices[a + 1] + vertices[b + 1] + vertices[c + 1]) / 3;
      const z = (vertices[a + 2] + vertices[b + 2] + vertices[c + 2]) / 3;
      expect(surface.surface.sampleRendered(x, y)?.position[2]).toBeCloseTo(z, 5);
    }
  });
  it("uses the detailed coast even when the coarse biome says land", () => {
    const surface = buildCampaignLandscape(coast(), [0, 0], 24, 2);
    const vertices = surface.surface.mesh.vertices;
    for (let i = 0; i < vertices.length; i += 10) {
      const x = vertices[i],
        z = vertices[i + 2],
        water = vertices[i + 9];
      if (x <= 0) {
        expect(z).toBe(0);
        expect(water).toBeGreaterThan(0);
      } else {
        expect(z).toBeGreaterThan(0);
        expect(water).toBe(0);
      }
    }
    for (const tree of surface.scenery) {
      expect(tree.x).toBeGreaterThan(1);
      expect(tree.z).toBe(surface.surface.sampleRendered(tree.x, tree.y)?.position[2]);
    }
  });
});

it("keeps overlapping relief, shore distances, normals and tree identities world-stable", () => {
  const source = coast();
  const a = buildCampaignLandscape(source, [0, 0], 80, 2);
  const b = buildCampaignLandscape(source, [30, 18], 80, 2);
  const av = a.surface.mesh.vertices,
    bv = b.surface.mesh.vertices;
  for (let k = 0; k < av.length / 10; k++) {
    const x = av[k * 10],
      y = av[k * 10 + 1];
    const d = b.surface.domain;
    const i = (x - d.ox) / d.cell,
      j = (y - d.oy) / d.cell;
    if (i < 0 || j < 0 || i >= d.columns || j >= d.rows) continue;
    const q = j * d.columns + i;
    expect(Array.from(av.slice(k * 10, k * 10 + 10))).toEqual(
      Array.from(bv.slice(q * 10, q * 10 + 10)),
    );
    expect(a.shoreDistance[k]).toBe(b.shoreDistance[q]);
  }
  const overlap = (t: { x: number; y: number }) => t.x > -45 && t.x < 75 && t.y > -55 && t.y < 75;
  const trees = a.scenery.filter(overlap);
  expect(trees.length).toBeGreaterThan(0);
  expect(trees).toEqual(b.scenery.filter(overlap));
});
