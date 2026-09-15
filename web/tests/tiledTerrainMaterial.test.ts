import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { buildCampaignLandscape } from "../../packages/game-renderer/src/terrain/campaignLandscape";
import { coastalRidgeFixture } from "../../apps/renderer-lab/src/routes/landscapeFixtures";
import { createLandscapeGroundMaterial } from "../../packages/photoreal-renderer/src/landscape/terrainMaterial";
import { createLandscapeFrameUniforms } from "../../packages/photoreal-renderer/src/landscape/shaderNodes";
import { PhotorealTiledTerrain } from "../../packages/photoreal-renderer/src/campaign/tiledTerrain";

test("terrain material survives tile eviction and is released with its world", () => {
  const field = coastalRidgeFixture();
  const coarse = buildCampaignLandscape(field, [0, 0], 128, 8).surface;
  const scene = new THREE.Scene();
  const material = createLandscapeGroundMaterial(createLandscapeFrameUniforms());
  let releases = 0;
  material.addEventListener("dispose", () => releases++);
  const terrain = new PhotorealTiledTerrain(scene, material, coarse);
  for (const [key, x, evicted] of [
    ["a", -96, []],
    ["b", 96, ["a"]],
  ] as const) {
    const surface = buildCampaignLandscape(field, [x, x], 32, 2).surface;
    terrain.install(
      {
        ...surface,
        request: { key, minX: surface.domain.ox, minY: surface.domain.oy, size: 64, cell: 2 },
      },
      evicted,
    );
    expect(releases).toBe(0);
    expect(scene.children.every((child) => (child as THREE.Mesh).material === material)).toBe(true);
  }
  terrain.dispose();
  expect(releases).toBe(1);
  expect(scene.children).toHaveLength(0);
});
