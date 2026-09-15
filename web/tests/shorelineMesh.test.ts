import { expect, it } from "vitest";
import { conformShoreline } from "../../packages/game-renderer/src/terrain/shorelineMesh";
import {
  createRenderedSurface,
  createSurfaceView,
} from "../../packages/game-renderer/src/terrain/surface";
import {
  detailBoundary,
  maskCoarseSurface,
  morphTileSurface,
} from "../../packages/game-renderer/src/terrain/surfaceTiles";
import type { RenderMaskData } from "../../packages/game-renderer/src/terrain/campaignSource";

function grid(cell: number, ox = 0, oy = 0, size = 8) {
  const n = size / cell + 1,
    vertices = new Float32Array(n * n * 10),
    indices = new Uint32Array((n - 1) ** 2 * 6);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      vertices.set([ox + i * cell, oy + j * cell, 2, 0, 0, 1, 0.5, 0.5, 0.3, 0], k * 10);
      if (i < n - 1 && j < n - 1)
        indices.set([k, k + n, k + 1, k + 1, k + n, k + n + 1], (j * (n - 1) + i) * 6);
    }
  return createRenderedSurface(
    {
      vertices,
      indices,
      surfaceColor: new Float32Array(n * n * 3),
      tint: new Float32Array(n * n),
      triangles: indices.length / 3,
    },
    { ox, oy, cell, columns: n, rows: n, units: "kilometers" },
    "base",
  );
}
const source: RenderMaskData = {
  width: 8,
  height: 8,
  rect: { min: [0, 0], max: [8, 8] },
  classes: new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]),
};
function conformed(cell: number, ox = 0, oy = 0, size = 8) {
  const base = grid(cell, ox, oy, size),
    result = conformShoreline(base, source);
  return { ...result, surface: createRenderedSurface(result.mesh, base.domain, "shore") };
}
function wetAt(surface: ReturnType<typeof createRenderedSurface>, x: number, y: number) {
  const hit = surface.sampleRendered(x, y)!;
  return surface.mesh.waterCoverage![surface.mesh.indices[hit.triangle * 3]];
}
it("keeps every source pixel wet or dry at overview and close spacing, with level water and a raised island", () => {
  for (const cell of [4, 1]) {
    const { surface } = conformed(cell);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const water = source.classes[(7 - y) * 8 + x] === 0;
        expect(wetAt(surface, x + 0.5, y + 0.5)).toBe(water ? 1 : 0);
        const hit = surface.sampleRendered(x + 0.5, y + 0.5)!;
        expect(hit.position[2]).toBe(water ? 0 : 2);
        expect(
          surface.raycastRendered({ origin: [x + 0.5, y + 0.5, 10], dir: [0, 0, -1] })?.position,
        ).toEqual(hit.position);
      }
  }
});
it("suppresses every coarse shoreline triangle and restores the same queryable island after eviction", () => {
  const coarse = conformed(4).surface,
    fine = conformed(1, 0, 0, 4).surface;
  const masked = createRenderedSurface(
    maskCoarseSurface(coarse, [fine.domain]).mesh,
    coarse.domain,
    "masked",
  );
  expect(masked.sampleRendered(3.5, 3.5)).toBeNull();
  expect(masked.raycastRendered({ origin: [3.5, 3.5, 10], dir: [0, 0, -1] })).toBeNull();
  const joined = createRenderedSurface(
    morphTileSurface(fine, coarse, detailBoundary([fine.domain])),
    fine.domain,
    "joined",
  );
  const view = createSurfaceView(masked, [joined]);
  for (let y = 0.5; y < 4; y++)
    for (let x = 0.5; x < 4; x++) {
      expect(wetAt(view.ownerAt(x, y), x, y)).toBe(wetAt(coarse, x, y));
      const hit = view.sampleRendered(x, y)!;
      expect(view.raycastRendered({ origin: [x, y, 10], dir: [0, 0, -1] })?.position).toEqual(
        hit.position,
      );
      if (wetAt(coarse, x, y)) expect(hit.position[2]).toBe(0);
    }
  expect(createSurfaceView(coarse).sampleRendered(3.5, 4.5)?.position[2]).toBe(2);
});
it("rejects a source-conforming allocation before calling the height builder", () => {
  let calls = 0;
  const base = grid(4),
    sample = base.sampleRendered;
  base.sampleRendered = (x, y) => {
    calls++;
    return sample(x, y);
  };
  expect(() => conformShoreline(base, source, 1)).toThrow(/budget/);
  expect(calls).toBe(0);
  const result = conformed(4);
  expect(result.typedBytes).toBe(
    Object.values(result.mesh).reduce((n, v) => n + (ArrayBuffer.isView(v) ? v.byteLength : 0), 0),
  );
});

it("finds the nearest conforming bank for oblique rays across multiple cells", async () => {
  const { Ray, Vector3 } = await import("three");
  const { surface } = conformed(4),
    v = surface.mesh.vertices,
    indices = surface.mesh.indices;
  for (let y = 0.25; y < 8; y += 0.5) {
    const origin: [number, number, number] = [-2, y, 3],
      dir: [number, number, number] = [1, 0, -0.4];
    const ray = new Ray(new Vector3(...origin), new Vector3(...dir).normalize());
    let nearest: InstanceType<typeof Vector3> | null = null,
      distance = Infinity;
    for (let t = 0; t < indices.length; t += 3) {
      const points = [0, 1, 2].map(
        (i) =>
          new Vector3(
            v[indices[t + i] * 10],
            v[indices[t + i] * 10 + 1],
            v[indices[t + i] * 10 + 2],
          ),
      );
      const hit = ray.intersectTriangle(points[0], points[1], points[2], false, new Vector3());
      if (hit && hit.distanceTo(ray.origin) < distance) {
        nearest = hit;
        distance = hit.distanceTo(ray.origin);
      }
    }
    const hit = surface.raycastRendered({ origin, dir });
    expect(hit === null).toBe(nearest === null);
    if (hit && nearest) expect(new Vector3(...hit.position).distanceTo(nearest)).toBeLessThan(1e-6);
  }
});

it("connects diagonal wet source centers through a tile cut without opening a dry seam", () => {
  const classes = new Uint8Array(16).fill(1);
  classes[2 * 4 + 1] = 4;
  classes[1 * 4 + 2] = 4;
  const mask: RenderMaskData = { width: 4, height: 4, rect: { min: [0, 0], max: [4, 4] }, classes };
  const surfaces = [grid(4, 0, 0, 4), grid(1, 0, 0, 4), grid(1, 2, 2, 2)].map((base) =>
    createRenderedSurface(conformShoreline(base, mask).mesh, base.domain, "diagonal"),
  );
  for (const surface of surfaces)
    for (let t = Math.max(1.5, surface.domain.ox); t <= 2.5; t += 0.025) {
      expect(wetAt(surface, t, t)).toBe(1);
      expect(surface.sampleRendered(t, t)?.position[2]).toBe(0);
    }
});

it("recovers dry source relief even when every coarse corner missed an island", () => {
  const base = grid(8);
  for (let i = 2; i < base.mesh.vertices.length; i += 10) base.mesh.vertices[i] = 0;
  const result = conformShoreline(base, source, 32 * 1024 * 1024, () => 2);
  const surface = createRenderedSurface(result.mesh, base.domain, "island-source");
  expect(surface.sampleRendered(3.5, 4.5)!.position[2]).toBe(2);
  expect(surface.sampleRendered(2.5, 4.5)!.position[2]).toBe(0);
});

it("uses the same dry source normal across coarse and fine shoreline topology", () => {
  const height = (x: number, y: number) => 2 + x * 0.1 + y * 0.2;
  for (const cell of [4, 1]) {
    const base = grid(cell),
      result = conformShoreline(base, source, 32 * 1024 * 1024, height);
    const length = Math.hypot(0.1, 0.2, 1);
    for (let k = 0; k < result.mesh.waterCoverage!.length; k++) {
      if (result.mesh.waterCoverage![k]) continue;
      expect(result.mesh.vertices[k * 10 + 3]).toBeCloseTo(-0.1 / length, 6);
      expect(result.mesh.vertices[k * 10 + 4]).toBeCloseTo(-0.2 / length, 6);
      expect(result.mesh.vertices[k * 10 + 5]).toBeCloseTo(1 / length, 6);
    }
  }
});

it("keeps adaptive polygon edges watertight over nonlinear source relief", () => {
  const base = grid(8, 0, 0, 32);
  const coast: RenderMaskData = {
    width: 32,
    height: 32,
    rect: { min: [0, 0], max: [32, 32] },
    classes: Uint8Array.from({ length: 1024 }, (_, i) => (i % 32 < 9 ? 0 : 1)),
  };
  const result = conformShoreline(
    base,
    coast,
    32 * 1024 * 1024,
    (x, y) => 2 + x * x * 0.1 + y * y * 0.1,
  );
  const { vertices: v, indices } = result.mesh;
  for (let t = 0; t < indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e] * 10,
        b = indices[t + ((e + 1) % 3)] * 10;
      const dx = v[b] - v[a],
        dy = v[b + 1] - v[a + 1];
      if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) continue;
      for (let k = 0; k < v.length; k += 10) {
        const u = dx === 0 ? (v[k + 1] - v[a + 1]) / dy : (v[k] - v[a]) / dx;
        if (u <= 1e-6 || u >= 1 - 1e-6) continue;
        if (
          Math.abs(v[k] - (v[a] + dx * u)) > 1e-6 ||
          Math.abs(v[k + 1] - (v[a + 1] + dy * u)) > 1e-6
        )
          continue;
        expect(v[k + 2]).toBeCloseTo(v[a + 2] + (v[b + 2] - v[a + 2]) * u, 5);
      }
    }
});

it("keeps water normals level when a bank vertex morph samples the dry side", () => {
  const make = (cell: number) => {
    const base = grid(cell);
    const result = conformShoreline(base, source, undefined, (x, y) => 1 + x * 0.3 + y * 0.1);
    return createRenderedSurface(result.mesh, base.domain, "normal-bank");
  };
  const coarse = make(4),
    fine = make(1);
  const joined = morphTileSurface(fine, coarse, detailBoundary([fine.domain]));
  let banks = 0;
  for (let k = 0; k < joined.vertices.length / 10; k++) {
    if (!joined.waterCoverage![k]) continue;
    const x = joined.vertices[k * 10],
      y = joined.vertices[k * 10 + 1];
    const hit = coarse.sampleRendered(x, y)!;
    if (!coarse.mesh.waterCoverage![coarse.mesh.indices[hit.triangle * 3]]) banks++;
    expect(joined.vertices[k * 10 + 3]).toBeCloseTo(0, 12);
    expect(joined.vertices[k * 10 + 4]).toBeCloseTo(0, 12);
    expect(joined.vertices[k * 10 + 5]).toBe(1);
  }
  expect(banks).toBeGreaterThan(0);
});
