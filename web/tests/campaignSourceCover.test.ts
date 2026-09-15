// @vitest-environment node
import { expect, it } from "vitest";
import * as THREE from "three/webgpu";
import {
  campaignLandscapeSource,
  campaignMountainBandRaster,
} from "../../packages/game-renderer/src/terrain/campaignSource";
import { campaignRelief } from "../../packages/game-renderer/src/terrain/campaignRelief";
import { createSourceCoverSampler } from "../../packages/photoreal-renderer/src/landscape/terrainMaterial";

function source() {
  const w = 17,
    h = 13,
    cell = 8,
    minX = -68,
    maxY = 52;
  const biome = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      // Distinct per channel: only channel 2 carries the mountain band.
      biome.set([30 + i, 60 + j, (i * 7 + j * 13) % 256, 255], (j * w + i) * 4);
  return campaignLandscapeSource({
    w,
    h,
    cell,
    minX,
    maxY,
    height: new Float32Array(w * h).fill(2.2),
    biome,
    renderMask: {
      width: w,
      height: h,
      classes: new Uint8Array(w * h).fill(1),
      rect: { min: [minX, maxY - h * cell], max: [minX + w * cell, maxY] },
    },
  });
}

it("lifts the source mountain band at source resolution", () => {
  const field = source();
  const raster = campaignMountainBandRaster(field);
  expect([raster.width, raster.height]).toEqual([field.w, field.h]);
  for (let k = 0; k < raster.data.length; k++) {
    expect(raster.data[k]).toBe(field.biome[k * 4 + 2]);
  }
});

it("covers the world box whose texel centres are the source sample points", () => {
  const field = source();
  const raster = campaignMountainBandRaster(field);
  const { sample } = campaignRelief(field, 2);
  const spanX = raster.rect.max[0] - raster.rect.min[0],
    spanY = raster.rect.max[1] - raster.rect.min[1];
  for (let j = 0; j < raster.height; j++)
    for (let i = 0; i < raster.width; i++) {
      // Texel centre of the rect the material samples with, north-up: the
      // shader's flipped v puts row 0 at the rect's northern edge.
      const x = raster.rect.min[0] + ((i + 0.5) / raster.width) * spanX;
      const y = raster.rect.max[1] - ((j + 0.5) / raster.height) * spanY;
      expect(sample(field.biome, 4, 2, x, y)).toBeCloseTo(raster.data[j * raster.width + i], 6);
    }
});

it("uploads one filtered single-channel texture over the raster's own storage", () => {
  const raster = campaignMountainBandRaster(source());
  const { map } = createSourceCoverSampler(raster);
  expect(map.image.data).toBe(raster.data);
  expect(map.format).toBe(THREE.RedFormat);
  expect(map.type).toBe(THREE.UnsignedByteType);
  expect([map.magFilter, map.minFilter]).toEqual([THREE.LinearFilter, THREE.LinearFilter]);
  map.dispose();
});

it("rejects a biome raster smaller than its grid", () => {
  expect(() =>
    campaignMountainBandRaster({
      w: 4,
      h: 4,
      cell: 8,
      minX: 0,
      maxY: 0,
      biome: new Uint8Array(16),
    }),
  ).toThrow(/smaller/);
});
