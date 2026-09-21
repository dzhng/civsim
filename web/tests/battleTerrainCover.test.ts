// @vitest-environment node
import { groundCoverage } from "@packages/game-renderer/src/battle/groundCoverage";
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import {
  createGroundMesh,
  joinTerrainMeshEdges,
} from "@packages/photoreal-renderer/src/landscape/terrainLayer";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";

// The ground material requires a rock detail map; this test provisions a bare
// stand-in because it measures cover interpolation, never the rock response.
const rockDetailMap = new THREE.Texture();

test("grass and forest interpolate through terrain joins without inventing rock or scree", () => {
  const square = (coordinates: number[]) => {
    const vertices: number[] = [];
    const tint: number[] = [];
    const indices: number[] = [];
    for (const y of coordinates)
      for (const x of coordinates) {
        vertices.push(x, y, 0, 0, 0, 1, 0.5, 0.5, 0.5, 0);
        tint.push(y > 0 ? 4 : 0);
      }
    const n = coordinates.length;
    for (let y = 0; y < n - 1; y++)
      for (let x = 0; x < n - 1; x++) {
        const i = y * n + x;
        indices.push(i, i + 1, i + n, i + 1, i + n + 1, i + n);
      }
    return createGroundMesh(
      createLandscapeFrameUniforms(),
      {
        vertices: new Float32Array(vertices),
        coverage: groundCoverage(new Float32Array(tint)),
        indices: new Uint32Array(indices),
        triangles: indices.length / 3,
      },
      { rockDetailMap },
    );
  };
  const inner = square([-1, 1]);
  const outer = square([-2, 0, 2]);
  try {
    joinTerrainMeshEdges(outer.geometry, inner.geometry, [-2, -2, 2, 2]);
    const position = outer.geometry.getAttribute("position");
    const cover = outer.geometry.getAttribute("gCover");
    const boundary: number[][] = [];
    for (let i = 0; i < position.count; i++) {
      expect(cover.getX(i), "a grass/forest join cannot contain rock").toBe(0);
      expect(cover.getZ(i), "a grass/forest join cannot contain scree").toBe(0);
      if (Math.abs(position.getX(i)) === 1 && position.getY(i) === 0)
        boundary.push([cover.getX(i), cover.getY(i), cover.getZ(i)]);
    }
    expect(boundary).toEqual([
      [0, 0.5, 0],
      [0, 0.5, 0],
    ]);
  } finally {
    for (const mesh of [inner, outer]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
});

test("production CPU vista seams retain mixed forest coverage without phantom rock", async () => {
  const { buildBattleVistaGeometry } =
    await import("@packages/game-renderer/src/battle/vistaGeometry");
  const { buildPhotorealBattleGroundMesh } =
    await import("@packages/game-renderer/src/battle/groundPass");
  const grid = {
    w: 4,
    h: 4,
    cell: 2,
    ox: -4,
    oy: -4,
    height: new Float32Array(16),
    tint: Uint8Array.from({ length: 16 }, (_, i) => (i >= 8 ? 4 : 0)),
    speed: new Float32Array(16),
    rough: new Float32Array(16),
  };
  const ground = buildPhotorealBattleGroundMesh(
    grid,
    { ...grid, units: "meters", verticalScale: 1 },
    "green-grass",
    2,
  );
  const rings = buildBattleVistaGeometry(
    {
      shape: "forest boundary",
      bands: [
        {
          name: "vista",
          w: 5,
          h: 5,
          cell: 4,
          ox: -8,
          oy: -8,
          innerHalfW: 4,
          innerHalfH: 4,
          outerHalfW: 8,
          outerHalfH: 8,
          height: new Float32Array(25),
          shoreDistance: new Float32Array(25).fill(-1000),
        },
      ],
    },
    "green-grass",
    ground,
  );
  const cover = rings[0].mesh.coverage;
  let mixed = 0;
  for (let i = 0; i < cover.length; i += 3) {
    expect(cover[i]).toBe(0);
    expect(cover[i + 2]).toBe(0);
    if (cover[i + 1] > 0 && cover[i + 1] < 1) mixed++;
  }
  expect(mixed).toBeGreaterThan(0);
});
