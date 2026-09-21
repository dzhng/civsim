// @vitest-environment node
import { expect, test } from "vitest";
import {
  prepareBattleTerrain,
  terrainPickingMeshes,
} from "@packages/battle-renderer/src/terrainScenePreparation";
import { createTerrainPicking } from "@packages/battle-renderer/src/terrainPicking";
import type { BattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainFeatures";

test("vista mountains join a lowered playable edge instead of exposing their underside", () => {
  const grid: BattleTerrainGrid = {
    w: 8,
    h: 8,
    cell: 4,
    ox: -16,
    oy: -16,
    height: new Float32Array(64).fill(-5.5),
    tint: new Uint8Array(64).fill(1),
    speed: new Float32Array(64),
    rough: new Float32Array(64),
  };
  // The renderer omits odd source samples at its coarser mesh resolution.
  // This peak must not become an invisible obstacle for clicking.
  grid.height![3 * grid.w + 3] = 200;
  const built = prepareBattleTerrain({
    grid,
    cover: "green-grass",
    slopeBands: null,
    lakes: [],
    vista: {
      shape: "lowered bay",
      bands: [
        {
          name: "vista",
          w: 9,
          h: 9,
          cell: 8,
          ox: -32,
          oy: -32,
          innerHalfW: 16,
          innerHalfH: 16,
          outerHalfW: 32,
          outerHalfH: 32,
          height: new Float32Array(81).fill(200),
          water: new Float32Array(81),
        },
      ],
    },
  });
  const surface = createTerrainPicking(terrainPickingMeshes(built.data));
  const renderedHeight = built.data.ground.vertices[2];
  expect(
    surface.surfaceHeightAt(-2, -2, () => {
      throw Error("rendered ground must answer picking without a height-field fallback");
    }),
  ).toBeCloseTo(renderedHeight, 4);
  expect(surface.raycast({ origin: [-2, -2, 400], dir: [0, 0, -1] })?.[2]).toBeCloseTo(
    renderedHeight,
    4,
  );
  const positions = built.data.vistaMeshes[0].mesh.vertices;
  const seam: number[] = [];
  for (let i = 0; i < positions.length; i += 10)
    if (positions[i] === 16 && Math.abs(positions[i + 1]) < 16) seam.push(positions[i + 2]);
  expect(
    surface.raycast({ origin: [15, 0, 20], dir: [0, 0, -1] }),
    "the gap between cell-centre ground vertices and the vista must be sealed",
  ).not.toBeNull();
  expect(seam.length).toBeGreaterThan(0);
  expect(Math.max(...seam)).toBeCloseTo(renderedHeight, 4);
});
