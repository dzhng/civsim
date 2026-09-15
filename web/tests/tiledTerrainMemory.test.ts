// @vitest-environment node
import {
  campaignOverviewRequest,
  terrainViewRequests,
  TERRAIN_DETAIL_LIMIT,
} from "../../packages/photoreal-renderer/src/campaign/terrainView";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import {
  RenderMask,
  campaignLandscapeSource,
} from "../../packages/game-renderer/src/terrain/campaignSource";
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

// The material requires a rock detail map; these tests provision a bare stand-in
// because they measure tile residency and storage, never the rock response.
const rockDetailMap = new THREE.Texture();

test("distant admissions reuse the unchanged presented query and its storage", () => {
  const field = coastalRidgeFixture();
  const coarse = buildCampaignLandscape(field, [0, 0], 128, 8).surface;
  const scene = new THREE.Scene();
  const terrain = new PhotorealTiledTerrain(
    scene,
    createLandscapeGroundMaterial(createLandscapeFrameUniforms(), undefined, { rockDetailMap }),
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
  expect(nextQuery).toBe(oldQuery);
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

test("adjacent admission and eviction refresh the affected edge", () => {
  const field = coastalRidgeFixture();
  const coarse = buildCampaignLandscape(field, [64, 0], 128, 8).surface;
  const terrain = new PhotorealTiledTerrain(
    new THREE.Scene(),
    createLandscapeGroundMaterial(createLandscapeFrameUniforms(), undefined, { rockDetailMap }),
    coarse,
  );
  const tile = (x: number, y: number) => {
    const surface = buildCampaignLandscape(field, [x, y], 32, 2).surface;
    for (let k = 2; k < surface.mesh.vertices.length; k += 10) surface.mesh.vertices[k] += 8;
    return surface;
  };
  const a = tile(32, -32),
    b = tile(96, -32),
    c = tile(160, 96);
  const install = (surface: typeof a, key: string, evicted: string[] = []) =>
    terrain.install(
      {
        ...surface,
        request: { key, minX: surface.domain.ox, minY: surface.domain.oy, size: 64, cell: 2 },
      },
      evicted,
    );
  install(a, "a");
  const edge = terrain.surface.sampleRendered(64, -32)!.position[2];
  install(b, "b");
  expect(terrain.surface.sampleRendered(64, -32)!.position[2]).toBeCloseTo(
    a.sampleRendered(64, -32)!.position[2],
    5,
  );
  expect(terrain.surface.sampleRendered(64, -32)!.position[2]).toBeGreaterThan(edge + 7);
  install(c, "c", ["b"]);
  expect(terrain.surface.sampleRendered(64, -32)!.position[2]).toBeCloseTo(edge, 5);
  terrain.dispose();
});

test("admission reservation covers old and new unique storage plus upload staging without cloning coarse vertices", () => {
  const field = coastalRidgeFixture();
  const coarse = buildCampaignLandscape(field, [0, 0], 128, 8).surface;
  const scene = new THREE.Scene();
  const terrain = new PhotorealTiledTerrain(
    scene,
    createLandscapeGroundMaterial(createLandscapeFrameUniforms(), undefined, { rockDetailMap }),
    coarse,
    (geometry, surface) =>
      geometry.setAttribute(
        "campaignFog",
        new THREE.BufferAttribute(new Float32Array(surface.mesh.vertices.length / 10), 1),
      ),
    undefined,
    Float32Array.BYTES_PER_ELEMENT,
  );
  const initial = terrain.stats();
  expect(initial.peakAllocationBytes).toBeGreaterThanOrEqual(
    initial.cpuBytes + initial.gpuBytes + initial.geometryBytes,
  );
  const sources = [coarse];
  const buffers = () => {
    const storage = new Set<ArrayBufferLike>();
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
    const before = buffers();
    terrain.install(
      {
        ...fine,
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
  const overview = campaignOverviewRequest(rect);
  for (const cell of [16, overview.cell]) {
    const budget = new TerrainAllocationBudget();
    budget.reserve(campaignLandscapeAllocation(overview.size / 2, cell).typedArrayBytes);
    const built = buildCampaignLandscape(
      field,
      [overview.minX + overview.size / 2, overview.minY + overview.size / 2],
      overview.size / 2,
      cell,
    );
    budget.reserve(built.generationBytes);
    const coarse = built.surface;
    const create = () =>
      new PhotorealTiledTerrain(
        new THREE.Scene(),
        createLandscapeGroundMaterial(createLandscapeFrameUniforms(), undefined, { rockDetailMap }),
        coarse,
        (geometry, surface) =>
          geometry.setAttribute(
            "campaignFog",
            new THREE.BufferAttribute(new Float32Array(surface.mesh.vertices.length / 10), 1),
          ),
        budget,
        Float32Array.BYTES_PER_ELEMENT,
      );
    const terrain = create();
    if (cell === 16) {
      expect(terrain.stats().peakAllocationBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
      terrain.dispose();
      continue;
    }
    expect(() => budget.reserve(terrain.stats().allocationBytes + 128 * 1024 * 1024)).toThrow(
      /budget/,
    );
    expect(terrain.surface.coarse).toBe(coarse);
    budget.reserve(
      terrain.stats().allocationBytes + campaignLandscapeAllocation(32, 2).typedArrayBytes,
    );
    const fineBuilt = buildCampaignLandscape(
      field,
      [-320, 640],
      32,
      2,
      128 * 1024 * 1024 - terrain.stats().allocationBytes,
    );
    budget.reserve(terrain.stats().allocationBytes + fineBuilt.generationBytes);
    const fineBase = fineBuilt.surface;
    const fine = fineBase;
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
    const resident = new Set(["coast"]);
    for (const [x, y] of [
      [-450, 1080],
      [-456, 446],
      [1131, -686],
      [-450, 1080],
    ]) {
      const requests = terrainViewRequests(
        { x, y, zoom: 1.8, width: 1280, height: 800 },
        coarse.domain,
      );
      const wanted = new Set(requests.map((r) => r.key));
      for (const request of requests) {
        if (resident.has(request.key)) continue;
        const result = buildCampaignLandscape(
          field,
          [request.minX + request.size / 2, request.minY + request.size / 2],
          request.size / 2,
          request.cell,
          128 * 1024 * 1024 - terrain.stats().allocationBytes,
        );
        budget.reserve(terrain.stats().allocationBytes + result.generationBytes);
        const evicted =
          resident.size === TERRAIN_DETAIL_LIMIT
            ? [[...resident].find((key) => !wanted.has(key))!]
            : [];
        terrain.install(
          { request, mesh: result.surface.mesh, domain: result.surface.domain },
          evicted,
        );
        for (const key of evicted) resident.delete(key);
        resident.add(request.key);
      }
      expect(terrain.stats().residentTiles).toBe(TERRAIN_DETAIL_LIMIT);
      expect(terrain.surface.ownerAt(x, y).revision).not.toContain("coarse");
      expect(terrain.stats().peakAllocationBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
    }
    terrain.dispose();
  }
}, 60000);
