import { expect, it } from "vitest";
import {
  createRenderedSurface,
  createSurfaceView,
} from "../../packages/game-renderer/src/terrain/surface";
import {
  detailBoundary,
  maskCoarseSurface,
  morphTileSurface,
} from "../../packages/game-renderer/src/terrain/surfaceTiles";

function grid(
  ox: number,
  oy: number,
  size: number,
  cell: number,
  height: (x: number, y: number) => number,
  id: string,
) {
  const n = size / cell + 1,
    v = new Float32Array(n * n * 10),
    indices = new Uint32Array((n - 1) ** 2 * 6),
    colors = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i,
        x = ox + i * cell,
        y = oy + j * cell;
      v.set([x, y, height(x, y), 0, 0, 1, 0.5, 0.5, 0.3, 0], k * 10);
      colors.set([0.5, 0.5, 0.3], k * 3);
      if (i < n - 1 && j < n - 1)
        indices.set([k, k + n, k + 1, k + 1, k + n, k + n + 1], (j * (n - 1) + i) * 6);
    }
  return createRenderedSurface(
    {
      vertices: v,
      indices,
      surfaceColor: colors,
      tint: new Float32Array(n * n),
      triangles: indices.length / 3,
    },
    { ox, oy, columns: n, rows: n, cell, units: "kilometers" },
    id,
  );
}

it("gives each location exclusive detail/coarse coverage and restores coarse after eviction", () => {
  const coarse = grid(0, 0, 16, 4, () => 7, "coarse"),
    fine = grid(4, 4, 8, 1, () => 2, "fine");
  const masked = maskCoarseSurface(coarse, [fine.domain]);
  expect(masked.coveredCells).toBe(4);
  const presented = createRenderedSurface(masked.mesh, coarse.domain, "masked");
  expect(presented.sampleRendered(6, 6)).toBeNull();
  expect(presented.raycastRendered({ origin: [6, 6, 20], dir: [0, 0, -1] })).toBeNull();
  const view = createSurfaceView(presented, [fine]);
  expect(view.sampleRendered(6, 6)?.position[2]).toBe(2);
  expect(view.sampleRendered(2, 2)?.position[2]).toBe(7);
  expect(createSurfaceView(coarse).sampleRendered(6, 6)?.position[2]).toBe(7);
});

it("joins fine edges to a coarse ramp while preserving detail away from the exterior band", () => {
  const coarse = grid(0, 0, 32, 4, (x, y) => x * 0.2 + y * 0.1, "coarse");
  const fine = grid(8, 8, 16, 1, (x, y) => x * 0.2 + y * 0.1 + 5, "fine");
  const mesh = morphTileSurface(fine, coarse, detailBoundary([fine.domain]));
  const joined = createRenderedSurface(mesh, fine.domain, "joined");
  for (let y = 8; y <= 24; y++)
    expect(joined.sampleRendered(8, y)?.position[2]).toBeCloseTo(
      coarse.sampleRendered(8, y)!.position[2],
      5,
    );
  expect(joined.sampleRendered(16, 16)?.position[2]).toBe(fine.sampleRendered(16, 16)?.position[2]);
});

it("keeps shared vertices identical at a concave three-tile corner", () => {
  const coarse = grid(0, 0, 32, 4, () => 0, "coarse");
  const tiles = [
    grid(0, 0, 16, 1, () => 8, "a"),
    grid(16, 0, 16, 1, () => 8, "b"),
    grid(0, 16, 16, 1, () => 8, "c"),
  ];
  const boundary = detailBoundary(tiles.map((t) => t.domain));
  const joined = tiles.map((t) =>
    createRenderedSurface(morphTileSurface(t, coarse, boundary), t.domain, t.revision),
  );
  for (let y = 0; y <= 16; y++)
    expect(joined[0].sampleRendered(16, y)?.position[2]).toBe(
      joined[1].sampleRendered(16, y)?.position[2],
    );
  for (let x = 0; x <= 16; x++)
    expect(joined[0].sampleRendered(x, 16)?.position[2]).toBe(
      joined[2].sampleRendered(x, 16)?.position[2],
    );
  expect(joined[0].sampleRendered(16, 8)?.position[2]).toBe(8);
  expect(joined[0].sampleRendered(16, 16)?.position[2]).toBe(0);
});

it.each([false, true])("preserves coarse edge interpolation with packed color %s", (packed) => {
  const coarse = grid(0, 0, 16, 4, (x, y) => x * y * 0.02, "coarse");
  for (let k = 0; k < coarse.mesh.tint!.length; k++) {
    const x = coarse.mesh.vertices[k * 10],
      y = coarse.mesh.vertices[k * 10 + 1];
    coarse.mesh.vertices.set([x / 20, y / 20, 0.5], k * 10 + 3);
    coarse.mesh.vertices[k * 10 + 9] = y / 16;
    coarse.mesh.surfaceColor!.set([x / 16, y / 16, 0.7], k * 3);
    coarse.mesh.tint![k] = y / 4;
  }
  const fine = grid(4, 4, 8, 1, () => 9, "fine");
  if (packed) delete fine.mesh.surfaceColor;
  const mesh = morphTileSurface(fine, coarse, detailBoundary([fine.domain]));
  // Intermediate fine vertices must lie on the coarse attribute interpolation,
  // even when its endpoint normals are not parallel or of equal length.
  for (let j = 0; j < fine.domain.rows; j++) {
    const y = 4 + j,
      k = j * fine.domain.columns;
    expect(mesh.vertices[k * 10 + 3]).toBeCloseTo(0.2, 6);
    expect(mesh.vertices[k * 10 + 4]).toBeCloseTo(y / 20, 6);
    expect(mesh.vertices[k * 10 + 5]).toBeCloseTo(0.5, 6);
    expect(mesh.vertices[k * 10 + 9]).toBeCloseTo(y / 16, 6);
    expect(mesh.surfaceColor?.[k * 3 + 1] ?? mesh.vertices[k * 10 + 7]).toBeCloseTo(y / 16, 6);
    expect(mesh.tint![k]).toBeCloseTo(y / 4, 6);
  }
});

it("rejects fine edges that skip coarse grid kinks", () => {
  const coarse = grid(0, 0, 24, 4, (x, y) => x * y, "coarse");
  const fine = grid(0, 0, 12, 3, () => 2, "fine");
  expect(() => morphTileSurface(fine, coarse, detailBoundary([fine.domain]))).toThrow(
    "Fine spacing must divide coarse spacing",
  );
});
