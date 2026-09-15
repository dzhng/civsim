// @vitest-environment node
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import {
  RenderMask,
  campaignLandscapeSource,
} from "../../packages/game-renderer/src/terrain/campaignSource";
import { conformShoreline } from "../../packages/game-renderer/src/terrain/shorelineMesh";
import { createRenderedSurface } from "../../packages/game-renderer/src/terrain/surface";
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import {
  buildCampaignLandscape,
  campaignLandscapeAllocation,
} from "../../packages/game-renderer/src/terrain/campaignLandscape";
import { coastalRidgeFixture } from "../../apps/renderer-lab/src/routes/landscapeFixtures";
import { createLandscapeFrameUniforms } from "../../packages/photoreal-renderer/src/landscape/shaderNodes";
import {
  PhotorealTiledTerrain,
  TerrainAllocationBudget,
} from "../../packages/photoreal-renderer/src/campaign/tiledTerrain";
import { createLandscapeGroundMaterial } from "../../packages/photoreal-renderer/src/landscape/terrainMaterial";

test("unchanged edge uploads still account for the newly retained query revision", () => {
  const field = coastalRidgeFixture();
  const coarse = buildCampaignLandscape(field, [0, 0], 128, 8).surface;
  const scene = new THREE.Scene();
  const terrain = new PhotorealTiledTerrain(
    scene,
    createLandscapeGroundMaterial(createLandscapeFrameUniforms()),
    coarse,
  );
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

test("admission reservation covers old and new unique storage plus upload staging without cloning coarse vertices", () => {
  const field = coastalRidgeFixture();
  const coarse = buildCampaignLandscape(field, [0, 0], 128, 8).surface;
  const scene = new THREE.Scene();
  const terrain = new PhotorealTiledTerrain(
    scene,
    createLandscapeGroundMaterial(createLandscapeFrameUniforms()),
    coarse,
    (geometry, surface) =>
      geometry.setAttribute(
        "campaignFog",
        new THREE.BufferAttribute(new Float32Array(surface.mesh.vertices.length / 10), 1),
      ),
    undefined,
    [],
    Float32Array.BYTES_PER_ELEMENT,
  );
  const initial = terrain.stats();
  expect(initial.peakAllocationBytes).toBeGreaterThanOrEqual(
    initial.cpuBytes + initial.gpuBytes + initial.geometryBytes,
  );
  const sources = [coarse];
  const shoreDistances: Float32Array[] = [];
  const buffers = () => {
    const storage = new Set<ArrayBufferLike>(shoreDistances.map((array) => array.buffer));
    for (const surface of [...sources, terrain.surface.coarse, ...terrain.surface.details])
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
    return storage;
  };
  for (const [key, x] of [
    ["a", -96],
    ["b", 96],
  ] as const) {
    const fine = buildCampaignLandscape(field, [x, -96], 32, 2).surface;
    sources.push(fine);
    const shoreDistance = new Float32Array(fine.domain.columns * fine.domain.rows);
    shoreDistances.push(shoreDistance);
    const before = buffers();
    terrain.install(
      {
        ...fine,
        shoreDistance,
        request: { key, minX: fine.domain.ox, minY: fine.domain.oy, size: 64, cell: 2 },
      },
      [],
    );
    for (const buffer of buffers()) before.add(buffer);
    const stats = terrain.stats();
    expect(stats.cpuBytes).toBe([...buffers()].reduce((sum, buffer) => sum + buffer.byteLength, 0));
    const simultaneousCpu = [...before].reduce((sum, buffer) => sum + buffer.byteLength, 0);
    expect(stats.peakAllocationBytes).toBeGreaterThanOrEqual(
      simultaneousCpu + stats.gpuBytes + stats.lastAdmissionUploadBytes,
    );
    expect(terrain.surface.coarse.mesh.vertices).toBe(coarse.mesh.vertices);
    expect(terrain.surface.sampleRendered(x, -96)?.revision).toContain(key);
  }
  terrain.dispose();
});

test("admits coastal detail over the full-source overview within the unchanged allocation ceiling", () => {
  const raster = PNG.sync.read(readFileSync(resolve(process.cwd(), "public/data/campaign-bg.png")));
  const rect = JSON.parse(
    readFileSync(resolve(process.cwd(), "public/data/campaign-bg.json"), "utf8"),
  );
  const mask = new RenderMask(raster.data, raster.width, raster.height, rect);
  // Flat relief isolates the actual source topology and array ownership.
  const field = campaignLandscapeSource({
    w: 2,
    h: 2,
    cell: 5000,
    minX: rect.min[0],
    maxY: rect.max[1],
    height: new Float32Array(4).fill(2.2),
    biome: new Uint8Array(16).fill(128),
    renderMask: mask,
  });
  const budget = new TerrainAllocationBudget();
  budget.reserve(campaignLandscapeAllocation(2560, 32).typedArrayBytes);
  const built = buildCampaignLandscape(field, [0, 0], 2560, 32);
  const base = built.surface;
  const coarse = createRenderedSurface(
    conformShoreline(base, mask, 48 * 1024 * 1024).mesh,
    base.domain,
    "overview",
  );
  const terrain = new PhotorealTiledTerrain(
    new THREE.Scene(),
    createLandscapeGroundMaterial(createLandscapeFrameUniforms()),
    coarse,
    (geometry, surface) =>
      geometry.setAttribute(
        "campaignFog",
        new THREE.BufferAttribute(new Float32Array(surface.mesh.vertices.length / 10), 1),
      ),
    budget,
    [built.shoreDistance.buffer],
    Float32Array.BYTES_PER_ELEMENT,
  );
  expect(() => budget.reserve(terrain.stats().allocationBytes + 128 * 1024 * 1024)).toThrow(
    /budget/,
  );
  expect(terrain.surface.coarse).toBe(coarse);
  budget.reserve(
    terrain.stats().allocationBytes + campaignLandscapeAllocation(32, 2).typedArrayBytes,
  );
  const fineBase = buildCampaignLandscape(field, [-320, 640], 32, 2).surface;
  const fine = conformShoreline(fineBase, mask);
  terrain.install(
    {
      mesh: fine.mesh,
      domain: fineBase.domain,
      request: {
        key: "coast",
        minX: fineBase.domain.ox,
        minY: fineBase.domain.oy,
        size: 64,
        cell: 2,
      },
    },
    [],
  );
  expect(terrain.stats().peakAllocationBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
  expect(terrain.surface.ownerAt(-320, 640).revision).toContain("coast");
  expect(terrain.surface.coarse.mesh.vertices).toBe(coarse.mesh.vertices);
  expect(terrain.surface.coarse.sampleRendered(-320, 640)).toBeNull();
  expect(terrain.surface.sampleRendered(-320, 640)?.position[2]).toBe(0);
  terrain.dispose();
}, 30000);
