import { describe, expect, it } from "vitest";
import { buildCampaignLandscape } from "../../packages/game-renderer/src/terrain/campaignLandscape";
import { campaignLandscapeSource } from "../../packages/game-renderer/src/terrain/campaignSource";

function coast() {
  const w = 9,
    h = 9,
    cell = 8;
  const height = Float32Array.from({ length: w * h }, (_, i) => 3 + (i % w) * 0.7);
  // Deliberately stale coarse shoreline: the full-resolution mask must own water.
  const biome = Uint8Array.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : 180));
  return campaignLandscapeSource({
    w,
    h,
    cell,
    minX: -36,
    maxY: 36,
    height,
    biome,
    renderMask: {
      width: 200,
      height: 200,
      classes: Uint8Array.from({ length: 40000 }, (_, k) => (k % 200 >= 100 ? 1 : 0)),
      rect: { min: [-200, -200], max: [200, 200] },
    },
  });
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
      if (surface.surface.mesh.waterCoverage![i / 10]) {
        expect(z).toBe(0);
        expect(water).toBe(1);
        expect(x).toBeLessThanOrEqual(0);
      } else {
        expect(z).toBeGreaterThanOrEqual(0);
        expect(water).toBe(0);
        expect(x).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

it("keeps overlapping relief, shore distances, and normals world-stable", () => {
  const source = coast();
  const a = buildCampaignLandscape(source, [0, 0], 80, 2);
  const b = buildCampaignLandscape(source, [30, 18], 80, 2);
  const av = a.surface.mesh.vertices,
    bv = b.surface.mesh.vertices;
  const keyed = new Map(
    Array.from({ length: bv.length / 10 }, (_, k) => [
      `${bv[k * 10]},${bv[k * 10 + 1]},${b.surface.mesh.waterCoverage![k]}`,
      k,
    ]),
  );
  let compared = 0;
  for (let k = 0; k < av.length / 10; k++) {
    const q = keyed.get(`${av[k * 10]},${av[k * 10 + 1]},${a.surface.mesh.waterCoverage![k]}`);
    if (q === undefined) continue;
    compared++;
    expect(Array.from(av.slice(k * 10, k * 10 + 10))).toEqual(
      Array.from(bv.slice(q * 10, q * 10 + 10)),
    );
    expect(a.shoreDistance[k]).toBe(b.shoreDistance[q]);
  }
  expect(compared).toBeGreaterThan(100);
});

it("preserves a narrow river and small island through the production builder", () => {
  const field = coast();
  field.renderMask.width = 32;
  field.renderMask.height = 32;
  field.renderMask.rect = { min: [-16, -16], max: [16, 16] };
  field.renderMask.classes = Uint8Array.from({ length: 1024 }, (_, k) => (k % 32 < 8 ? 0 : 1));
  field.renderMask.classes[16 * 32 + 3] = 1;
  for (let y = 4; y < 28; y++) field.renderMask.classes[y * 32 + 19] = 4;
  for (const cell of [8, 2]) {
    const { surface, shoreDistance } = buildCampaignLandscape(field, [0, 0], 16, cell);
    expect(shoreDistance.length).toBe(surface.mesh.vertices.length / 10);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const wx = x - 15.5,
          wy = 15.5 - y;
        const hit = surface.sampleRendered(wx, wy)!;
        const vertex = surface.mesh.indices[hit.triangle * 3];
        expect(surface.mesh.waterCoverage![vertex]).toBe(field.renderWaterAt(wx, wy) ? 1 : 0);
        if (field.renderWaterAt(wx, wy)) expect(hit.position[2]).toBe(0);
      }
    expect(surface.sampleRendered(-12.5, -0.5)!.position[2]).toBeGreaterThan(0);
    for (let k = 0; k < shoreDistance.length; k++) {
      expect(Number.isFinite(shoreDistance[k])).toBe(true);
      if (surface.mesh.waterCoverage![k]) expect(shoreDistance[k]).toBeLessThanOrEqual(0);
      else expect(shoreDistance[k]).toBeGreaterThanOrEqual(0);
    }
  }
});
