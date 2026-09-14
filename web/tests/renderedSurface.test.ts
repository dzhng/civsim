import { expect, it } from "vitest";
import {
  createRenderedSurface,
  createSurfaceView,
} from "../../packages/game-renderer/src/terrain/surface";

it("samples both diagonals and hits the actual raised triangle through tilted rays", () => {
  const vertices = new Float32Array(40);
  [
    [0, 0, 1],
    [2, 0, 3],
    [0, 2, 5],
    [2, 2, 2],
  ].forEach((p, i) => vertices.set(p, i * 10));
  for (const indices of [
    [0, 2, 1, 1, 2, 3],
    [0, 3, 1, 0, 2, 3],
  ]) {
    const mesh = {
      vertices,
      indices: Uint32Array.from(indices),
      surfaceColor: new Float32Array(12),
      tint: new Float32Array(4),
      triangles: 2,
    };
    const surface = createRenderedSurface(
      mesh,
      { ox: 0, oy: 0, columns: 2, rows: 2, cell: 2, units: "kilometers" },
      "test",
    );
    for (let t = 0; t < 6; t += 3) {
      const p = [0, 1, 2].map(
        (c) =>
          (vertices[indices[t] * 10 + c] +
            vertices[indices[t + 1] * 10 + c] +
            vertices[indices[t + 2] * 10 + c]) /
          3,
      );
      expect(surface.sampleRendered(p[0], p[1])?.position[2]).toBeCloseTo(p[2], 6);
      const result = surface.raycastRendered({
        origin: [p[0] - 10, p[1] - 5, p[2] + 20],
        dir: [10, 5, -20],
      });
      expect(result?.position[2]).toBeCloseTo(p[2], 6);
      expect(result?.revision).toBe("test");
    }
    expect(surface.sampleRendered(-1, 0)).toBeNull();
    expect(surface.raycastRendered({ origin: [-1, 0, 10], dir: [0, 0, -1] })).toBeNull();
  }
});

it("falls back to coarse terrain outside detail and ignores hidden coarse ray hits", () => {
  const make = (cell: number, height: number, revision: string) => {
    const vertices = new Float32Array(40);
    [
      [0, 0, height],
      [cell, 0, height],
      [0, cell, height],
      [cell, cell, height],
    ].forEach((p, i) => vertices.set(p, i * 10));
    return createRenderedSurface(
      {
        vertices,
        indices: Uint32Array.from([0, 2, 1, 1, 2, 3]),
        surfaceColor: new Float32Array(12),
        tint: new Float32Array(4),
        triangles: 2,
      },
      { ox: 0, oy: 0, columns: 2, rows: 2, cell, units: "meters" },
      revision,
    );
  };
  const coarse = make(4, 5, "coarse"),
    detail = make(2, 1, "detail");
  const view = createSurfaceView(coarse, [detail]);
  expect(view.sampleRendered(3, 3)?.position[2]).toBe(5);
  expect(view.sampleRendered(1, 1)?.position[2]).toBe(1);
  expect(view.raycastRendered({ origin: [1, 1, 10], dir: [0, 0, -1] })?.revision).toBe("detail");
  expect(createSurfaceView(coarse).sampleRendered(1, 1)?.position[2]).toBe(5);
});
