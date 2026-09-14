import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { buildCampaignLandscape } from "../../packages/game-renderer/src/terrain/campaignLandscape";
import { coastalRidgeFixture } from "../../apps/renderer-lab/src/routes/landscapeFixtures";
import { createBattleFrameUniforms } from "../../packages/photoreal-renderer/src/battle/battleTsl";
import { PhotorealTiledTerrain } from "../../packages/photoreal-renderer/src/campaign/tiledTerrain";

test("unchanged edge uploads still account for the newly retained query revision", () => {
  const field = coastalRidgeFixture();
  const coarse = buildCampaignLandscape(field, [0, 0], 128, 8).surface;
  const scene = new THREE.Scene();
  const terrain = new PhotorealTiledTerrain(scene, createBattleFrameUniforms(), coarse);
  const a = buildCampaignLandscape(field, [-96, -96], 32, 2).surface;
  const b = buildCampaignLandscape(field, [96, 96], 32, 2).surface;
  const install = (surface: typeof a, key: string) =>
    terrain.install(
      {
        ...surface,
        request: { key, minX: surface.domain.ox, minY: surface.domain.oy, size: 64, cell: 2 },
      },
      [],
    );
  install(a, "a");
  const oldQuery = terrain.surface.details[0].mesh.vertices;
  install(b, "b");
  const nextQuery = terrain.surface.details[0].mesh.vertices;
  expect(nextQuery).not.toBe(oldQuery);
  expect(nextQuery).toEqual(oldQuery);
  const storage = new Set<ArrayBufferLike>();
  for (const surface of [coarse, a, b, terrain.surface.coarse, ...terrain.surface.details])
    for (const value of Object.values(surface.mesh))
      if (ArrayBuffer.isView(value)) storage.add(value.buffer);
  for (const child of scene.children) {
    const geometry = (child as THREE.Mesh).geometry;
    storage.add(geometry.index!.array.buffer);
    for (const attribute of Object.values(geometry.attributes))
      storage.add(
        attribute instanceof THREE.InterleavedBufferAttribute
          ? attribute.data.array.buffer
          : attribute.array.buffer,
      );
  }
  expect(terrain.stats().cpuBytes).toBe([...storage].reduce((sum, b) => sum + b.byteLength, 0));
  terrain.dispose();
});
