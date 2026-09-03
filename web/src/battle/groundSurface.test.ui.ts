import { describe, expect, it } from "vitest";
import {
  buildBattleGroundMesh,
  buildPhotorealBattleGroundMesh,
} from "@packages/game-renderer/src/battle/groundPass";
import { isBattleRoadSurface } from "@packages/game-renderer/src/battle/photorealEarthDistance";
import {
  coverEdgeCoverage,
  mudInteriorCoverage,
  TURF_CONTRAST,
} from "@packages/photoreal-renderer/src/battle/groundDetail";

describe("photoreal battle ground surfaces", () => {
  it("preserves the legacy stride-10 vertex bytes", () => {
    const w = 7;
    const h = 6;
    const cell = 4;
    const ox = -14;
    const oy = -12;
    const tint = Uint8Array.from(
      { length: w * h },
      (_, i) => [0, 5, 6, 1, 2, 4, 3][(i * 5 + Math.floor(i / w) * 2) % 7],
    );
    const height = Float32Array.from({ length: w * h }, (_, i) =>
      Math.fround(Math.sin(i * 0.31) * 7 + (i % w) * 0.25),
    );
    const mesh = buildBattleGroundMesh(
      { w, h, cell, ox, oy, tint, height },
      { w, h, cell, ox, oy, height, units: "meters", verticalScale: 1.6 },
      "yellow-grass",
      2,
    );
    const bytes = new Uint8Array(
      mesh.vertices.buffer,
      mesh.vertices.byteOffset,
      mesh.vertices.byteLength,
    );

    expect(mesh.vertices.length % 10).toBe(0);
    let hash = 2166136261;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    expect((hash >>> 0).toString(16)).toBe("cefa5f24");
  });

  it("classifies authored road and bridge cells without admitting scree", () => {
    expect(isBattleRoadSurface(6, 0, 1)).toBe(true);
    expect(isBattleRoadSurface(6, 0.05, 1)).toBe(true);
    expect(isBattleRoadSurface(6, Math.fround(0.05), 1)).toBe(true);
    expect(isBattleRoadSurface(6, 0.05009, 0.94991)).toBe(false);
    expect(isBattleRoadSurface(6, 0.45, 0.6)).toBe(false);
    expect(isBattleRoadSurface(6, 0.25, 0.8)).toBe(false);
    expect(isBattleRoadSurface(6, 0.3, 0.7)).toBe(false);
    expect(isBattleRoadSurface(5, 0, 1)).toBe(false);
    expect(isBattleRoadSurface(6, undefined, 1)).toBe(false);
    expect(isBattleRoadSurface(6, 0, undefined)).toBe(false);
    expect(isBattleRoadSurface(6, Number.NaN, 1)).toBe(false);
    expect(isBattleRoadSurface(6, 0, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("keeps mud, road, and scree ownership separate through the mesh kernel", () => {
    const w = 18;
    const h = 9;
    const tint = new Uint8Array(w * h);
    const rough = new Float32Array(w * h);
    const speed = new Float32Array(w * h).fill(1);
    for (let y = 2; y <= 6; y++) {
      for (let x = 2; x <= 6; x++) tint[y * w + x] = 5;
      for (let x = 10; x <= 14; x++) tint[y * w + x] = 6;
    }
    tint[4 * w + 16] = 6;
    rough[4 * w + 16] = 0.45;
    speed[4 * w + 16] = 0.6;
    const height = new Float32Array(w * h);
    const mesh = buildPhotorealBattleGroundMesh(
      { w, h, cell: 4, ox: -6, oy: -6, tint, rough, speed, height },
      { w, h, cell: 4, ox: -6, oy: -6, height, units: "meters", verticalScale: 1 },
      "green-grass",
      1,
    );
    const center = 4 * (w + 1) + 4;
    const roadCenter = 4 * (w + 1) + 12;
    const screeCenter = 4 * (w + 1) + 16;

    expect(Array.from(mesh.surfaceColor.slice(center * 3, center * 3 + 3))).not.toEqual(
      Array.from(mesh.vertices.slice(center * 10 + 6, center * 10 + 9)),
    );
    expect(mesh.tint[center]).toBe(0);
    expect(mesh.tint[roadCenter]).toBe(0);
    expect(mesh.tint[screeCenter]).toBe(6);
    const decode = (index: number, channel: 0 | 1) =>
      (mesh.earthDistance.data[index * 2 + channel] / 255 - 0.5) *
      2 *
      mesh.earthDistance.rangeMeters;
    const distanceWidth = mesh.earthDistance.width;
    expect(decode((4 * 2 + 1) * distanceWidth + (4 * 2 + 1), 0)).toBeGreaterThan(0);
    expect(decode((4 * 2 + 1) * distanceWidth + (12 * 2 + 1), 1)).toBeGreaterThan(0);
    expect(decode((4 * 2 + 1) * distanceWidth + (16 * 2 + 1), 1)).toBeLessThan(0);
  });

  it("packs a deterministic, correctly oriented padded earth field", () => {
    const w = 7;
    const h = 5;
    const tint = new Uint8Array(w * h);
    tint[1 * w + 2] = 5;
    tint[3 * w + 5] = 5;
    const height = new Float32Array(w * h);
    const mesh = buildPhotorealBattleGroundMesh(
      { w, h, cell: 4, ox: 40, oy: -20, tint, height },
      { w, h, cell: 4, ox: 40, oy: -20, height, units: "meters", verticalScale: 1 },
      "green-grass",
      1,
    );
    const sdf = mesh.earthDistance;
    const decode = (x: number, y: number, channel: 0 | 1) =>
      (sdf.data[(y * sdf.width + x) * 2 + channel] / 255 - 0.5) * 2 * sdf.rangeMeters;
    const sourceCenter = (x: number, y: number, channel: 0 | 1 = 0) =>
      decode(x * 2 + 1, y * 2 + 1, channel);

    expect(sdf).toMatchObject({ width: 14, height: 10, cell: 2, ox: 40, oy: -20 });
    expect(sourceCenter(2, 1)).toBeGreaterThan(0);
    expect(sourceCenter(2, 3)).toBeLessThan(0);
    expect(sourceCenter(5, 3)).toBeGreaterThan(0);
    expect(sourceCenter(5, 1)).toBeLessThan(0);
    expect(Array.from(sdf.data).every(Number.isFinite)).toBe(true);

    let hash = 2166136261;
    for (const byte of sdf.data) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    expect((hash >>> 0).toString(16)).toBe("e4705ea6");

    const emptyTint = new Uint8Array(w * h);
    const empty = buildPhotorealBattleGroundMesh(
      { w, h, cell: 4, ox: 40, oy: -20, tint: emptyTint, height },
      { w, h, cell: 4, ox: 40, oy: -20, height, units: "meters", verticalScale: 1 },
      "green-grass",
      1,
    ).earthDistance;
    expect(Array.from(empty.data).every((byte) => byte === 0)).toBe(true);
  });

  it("keeps the earth union continuous through a mud-road seam", () => {
    const w = 16;
    const h = 12;
    const tint = new Uint8Array(w * h);
    const rough = new Float32Array(w * h);
    const speed = new Float32Array(w * h).fill(1);
    for (let y = 2; y <= 9; y++) {
      for (let x = 2; x <= 13; x++) tint[y * w + x] = x >= 7 && x <= 8 ? 6 : 5;
    }
    const height = new Float32Array(w * h);
    const sdf = buildPhotorealBattleGroundMesh(
      { w, h, cell: 4, ox: 0, oy: 0, tint, rough, speed, height },
      { w, h, cell: 4, ox: 0, oy: 0, height, units: "meters", verticalScale: 1 },
      "green-grass",
      1,
    ).earthDistance;
    const decode = (x: number, y: number, channel: 0 | 1) =>
      (sdf.data[((y * 2 + 1) * sdf.width + (x * 2 + 1)) * 2 + channel] / 255 - 0.5) *
      2 *
      sdf.rangeMeters;

    for (let x = 5; x <= 10; x++) {
      const unionDistance = decode(x, 6, 0);
      const roadDistance = decode(x, 6, 1);
      const earth = coverEdgeCoverage(unionDistance, 0);
      const road = Math.min(coverEdgeCoverage(roadDistance, 0), earth);
      const mud = earth - road;
      const surface = 1 - earth;
      expect(unionDistance).toBeGreaterThan(0);
      expect(surface + mud + road).toBeCloseTo(1, 7);
      expect(surface).toBe(0);
    }
    expect(decode(6, 6, 1)).toBeLessThan(0);
    expect(decode(7, 6, 1)).toBeGreaterThan(0);
    expect(decode(8, 6, 1)).toBeGreaterThan(0);
    expect(decode(9, 6, 1)).toBeLessThan(0);
  });

  it("pins the pure churn and edge-coverage math", () => {
    expect(mudInteriorCoverage(1.5)).toBe(0);
    expect(mudInteriorCoverage(2.5)).toBeGreaterThan(0);
    expect(mudInteriorCoverage(2.5)).toBeLessThan(1);
    expect(mudInteriorCoverage(4)).toBe(1);

    const sample = (x: number) => coverEdgeCoverage(x, 0);
    const crossing = (target: number) => {
      for (let x = -10; x <= 10; x += 0.001) {
        if (sample(x) >= target) return x;
      }
      throw new Error(`coverage never crossed ${target}`);
    };
    const width = crossing(0.9) - crossing(0.1);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(width).toBeLessThanOrEqual(2);
    expect(TURF_CONTRAST.edge.noiseDisplacementMeters).toBeLessThanOrEqual(
      TURF_CONTRAST.edge.displacementBoundMeters,
    );
  });
});
