import { expect, it } from "vitest";
import { buildCampaignLandscape } from "../../packages/game-renderer/src/terrain/campaignLandscape";
import { coastalRidgeFixture } from "../../apps/renderer-lab/src/routes/landscapeFixtures";

it("keeps shore distance, water and beach color fixed when terrain resolution changes", () => {
  const source = coastalRidgeFixture();
  const fine = buildCampaignLandscape(source, [0, 0], 64, 2);
  const coarse = buildCampaignLandscape(source, [0, 0], 64, 8);
  const a = coarse.surface.mesh,
    b = fine.surface.mesh;
  const keyed = new Map(
    Array.from({ length: b.vertices.length / 10 }, (_, k) => [
      `${b.vertices[k * 10]},${b.vertices[k * 10 + 1]},${b.waterCoverage![k]}`,
      k,
    ]),
  );
  let compared = 0;
  for (let k = 0; k < a.vertices.length / 10; k++) {
    const q = keyed.get(`${a.vertices[k * 10]},${a.vertices[k * 10 + 1]},${a.waterCoverage![k]}`);
    if (q === undefined) continue;
    compared++;
    expect(coarse.surface.mesh.shoreDistance![k]).toBe(fine.surface.mesh.shoreDistance![q]);
    expect(a.vertices[k * 10 + 9]).toBe(b.vertices[q * 10 + 9]);
    expect(Array.from(a.vertices.subarray(k * 10 + 6, k * 10 + 9))).toEqual(
      Array.from(b.vertices.subarray(q * 10 + 6, q * 10 + 9)),
    );
    expect(Array.from(a.vertices.subarray(k * 10 + 2, k * 10 + 6))).toEqual(
      Array.from(b.vertices.subarray(q * 10 + 2, q * 10 + 6)),
    );
  }
  expect(compared).toBeGreaterThan(100);
});
