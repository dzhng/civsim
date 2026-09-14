import { expect, it } from "vitest";
import { buildCampaignLandscape } from "../../packages/game-renderer/src/terrain/campaignLandscape";

function range() {
  const w = 41,
    h = 41,
    cell = 8;
  return {
    w,
    h,
    cell,
    minX: -164,
    maxY: 164,
    height: Float32Array.from(
      { length: w * h },
      (_, k) => 2.2 + 14 * Math.exp(-(((((k % w) - 20) * cell) / 32) ** 2)),
    ),
    biome: new Uint8Array(w * h * 4).fill(100),
    renderLandAt: () => true,
  };
}

it("does not invent a mountain body when the source identifies only lowland", () => {
  const source = range();
  source.height.fill(2.2);
  const result = buildCampaignLandscape(source, [0, 0], 64, 2);
  for (let i = 2; i < result.surface.mesh.vertices.length; i += 10)
    expect(result.surface.mesh.vertices[i]).toBeLessThan(2);
});

it("finer geometry resolves curved faces rather than merely copying coarse triangles", () => {
  const source = range();
  const coarse = buildCampaignLandscape(source, [0, 0], 64, 8);
  const fine = buildCampaignLandscape(source, [0, 0], 64, 2);
  let resolved = 0;
  for (let y = -40; y <= 40; y += 6)
    for (let x = -40; x <= 40; x += 6) {
      if (
        Math.abs(
          coarse.surface.sampleRendered(x, y)!.position[2] -
            fine.surface.sampleRendered(x, y)!.position[2],
        ) > 0.02
      )
        resolved++;
    }
  expect(resolved).toBeGreaterThan(30);
});
