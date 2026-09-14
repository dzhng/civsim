import { expect, it } from "vitest";
import { buildCampaignLandscape } from "../../packages/game-renderer/src/terrain/campaignLandscape";
import { coastalRidgeFixture } from "../../apps/renderer-lab/src/routes/landscapeFixtures";

it("keeps shore distance, water and beach color fixed when terrain resolution changes", () => {
  const source = coastalRidgeFixture();
  const fine = buildCampaignLandscape(source, [0, 0], 64, 2);
  const coarse = buildCampaignLandscape(source, [0, 0], 64, 8);
  const d = coarse.surface.domain,
    f = fine.surface.domain;
  for (let j = 0; j < d.rows; j++)
    for (let i = 0; i < d.columns; i++) {
      const k = j * d.columns + i,
        x = d.ox + i * d.cell,
        y = d.oy + j * d.cell;
      const fk = ((y - f.oy) / f.cell) * f.columns + (x - f.ox) / f.cell;
      expect(coarse.shoreDistance[k]).toBe(fine.shoreDistance[fk]);
      expect(coarse.surface.mesh.vertices[k * 10 + 9]).toBe(
        fine.surface.mesh.vertices[fk * 10 + 9],
      );
      expect(Array.from(coarse.surface.mesh.surfaceColor.subarray(k * 3, k * 3 + 3))).toEqual(
        Array.from(fine.surface.mesh.surfaceColor.subarray(fk * 3, fk * 3 + 3)),
      );
    }
});
