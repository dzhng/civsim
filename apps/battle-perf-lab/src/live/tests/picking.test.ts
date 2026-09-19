/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
import * as THREE from "three/webgpu";
import {
  BattleTerrainSurface,
  buildBattleTerrain,
} from "../../../../../packages/photoreal-renderer/src/battle/battleTerrainBuild";
import { createBattleFrameUniforms } from "../../../../../packages/photoreal-renderer/src/battle/battleTsl";
import { createSeaDisplacementSource } from "../../../../../packages/photoreal-renderer/src/battle/seaLayer";
import { createBladeFieldTransitionUniforms } from "../../../../../packages/photoreal-renderer/src/battle/bladeFieldLayer";
import {
  initialBladeFieldTransition,
  productionBladeFieldProfile,
} from "../../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { prepareBattleTerrain, terrainPickingMeshes } from "../../../../../packages/battle-renderer/src/terrainScenePreparation";
import { createTerrainPicking } from "../../terrainPicking";
import type { WorldRay } from "../../../../../packages/renderer-core/src/camera3d";

test("native CPU picking matches actual source Octree over playable/apron triangles, including grazing and backface rays", () => {
  const grid = {
    w: 8,
    h: 8,
    cell: 4,
    ox: -16,
    oy: -16,
    tint: new Uint8Array(64).fill(1),
    height: Float32Array.from({ length: 64 }, (_, i) => -5.5 + Math.sin(i) * 2),
    rough: new Float32Array(64),
    speed: new Float32Array(64),
  };
  grid.height[27] = 200;
  const vista = {
    shape: "seam control",
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
        height: Float32Array.from({ length: 81 }, (_, i) => 20 + Math.sin(i) * 10),
        water: new Float32Array(81),
      },
    ],
  };
  const data = prepareBattleTerrain({ grid, cover: "green-grass", vista, lakes: [] });
  const native = createTerrainPicking(terrainPickingMeshes(data.data));
  const source = new BattleTerrainSurface(new THREE.Scene());
  source.replace(
    buildBattleTerrain({
      grid,
      cover: "green-grass",
      vista,
      lakeSurfaces: [],
      slopeBands: null,
      frame: createBattleFrameUniforms(),
      sea: createSeaDisplacementSource(),
      grassTransition: createBladeFieldTransitionUniforms(
        initialBladeFieldTransition(productionBladeFieldProfile()),
      ),
    }),
  );
  try {
    const rays: WorldRay[] = [];
    for (const x of [-40, -32, -16.001, -16, -15.999, -3, 0, 12, 15.999, 16, 16.001, 31, 40])
      for (const y of [-20, -1, 0, 17]) {
        rays.push(
          { origin: [x, y, 100], dir: [0, 0, -1] },
          { origin: [x, y, -100], dir: [0, 0, 1] },
        );
      }
    for (const z of [-6, -4, 0, 4, 10, 30])
      rays.push(
        { origin: [-100, 0, z], dir: [1, 0, -0.001] },
        { origin: [100, 0, z], dir: [-1, 0, -0.02] },
      );
    for (const ray of rays) {
      const expected = source.raycast(ray),
        actual = native.raycast(ray);
      if (!expected) expect(actual).toBeNull();
      else {
        expect(actual).not.toBeNull();
        for (let i = 0; i < 3; i++) expect(actual![i]).toBeCloseTo(expected[i], 7);
      }
    }
    for (const [x, y] of [
      [0, 0],
      [15.999, 0],
      [16.001, 0],
      [30, 0],
    ])
      expect(native.surfaceHeightAt(x, y, () => 0)).toBeCloseTo(source.surfaceHeightAt(x, y), 7);
  } finally {
    source.dispose();
  }
});
