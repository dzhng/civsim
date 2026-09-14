// @vitest-environment node
import * as THREE from "three/webgpu";
import { expect, test } from "vitest";
import {
  buildBattleTerrain,
  BattleTerrainSurface,
} from "@packages/photoreal-renderer/src/battle/battleTerrainBuild";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import { createSeaDisplacementSource } from "@packages/photoreal-renderer/src/battle/seaLayer";
import {
  productionBladeFieldProfile,
  initialBladeFieldTransition,
} from "@packages/photoreal-renderer/src/battle/battleGrassField";
import { createBladeFieldTransitionUniforms } from "@packages/photoreal-renderer/src/battle/bladeFieldLayer";
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
  const built = buildBattleTerrain({
    grid,
    cover: "green-grass",
    slopeBands: null,
    lakeSurfaces: [],
    frame: createLandscapeFrameUniforms(),
    sea: createSeaDisplacementSource(),
    grassTransition: createBladeFieldTransitionUniforms(
      initialBladeFieldTransition(productionBladeFieldProfile()),
    ),
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
  const surface = new BattleTerrainSurface(new THREE.Scene());
  surface.replace(built);
  try {
    const renderedHeight = built.ground.geometry.getAttribute("position").getZ(0);
    expect(surface.surfaceHeightAt(-2, -2)).toBeCloseTo(renderedHeight, 4);
    expect(surface.raycast({ origin: [-2, -2, 400], dir: [0, 0, -1] })?.[2]).toBeCloseTo(
      renderedHeight,
      4,
    );
    const positions = built.vistaMeshes[0].geometry.getAttribute("position");
    const seam: number[] = [];
    for (let i = 0; i < positions.count; i++)
      if (positions.getX(i) === 16 && Math.abs(positions.getY(i)) < 16)
        seam.push(positions.getZ(i));
    const ray = new THREE.Raycaster(new THREE.Vector3(15, 0, 20), new THREE.Vector3(0, 0, -1));
    expect(
      ray.intersectObjects([built.ground, ...built.vistaMeshes]).length,
      "the gap between cell-centre ground vertices and the vista must be sealed",
    ).toBeGreaterThan(0);
    expect(seam.length).toBeGreaterThan(0);
    expect(Math.max(...seam)).toBeCloseTo(
      built.ground.geometry.getAttribute("position").getZ(0),
      4,
    );
  } finally {
    surface.dispose();
  }
});
