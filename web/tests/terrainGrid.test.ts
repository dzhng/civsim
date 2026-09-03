// @vitest-environment node

import { describe, expect, test } from "vitest";

import {
  readBattleTerrainGrid,
  type TerrainGridSource,
} from "@packages/game-renderer/src/battle/terrainGrid.ts";

describe("readBattleTerrainGrid", () => {
  test("copies every terrain field out of wasm memory", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const pointers = { tint: 0, height: 16, rough: 32, speed: 48 };
    new Uint8Array(memory.buffer, pointers.tint, 4).set([0, 1, 4, 6]);
    new Float32Array(memory.buffer, pointers.height, 4).set([1, 2, 3, 4]);
    new Float32Array(memory.buffer, pointers.rough, 4).set([0.1, 0.2, 0.3, 0.4]);
    new Float32Array(memory.buffer, pointers.speed, 4).set([0.5, 0.6, 0.7, 0.8]);
    const source: TerrainGridSource = {
      terrain_w: () => 2,
      terrain_h: () => 2,
      terrain_cell: () => 4,
      terrain_origin_x: () => -8,
      terrain_origin_y: () => -12,
      terrain_tint_ptr: () => pointers.tint,
      terrain_height_ptr: () => pointers.height,
      terrain_rough_ptr: () => pointers.rough,
      terrain_speed_ptr: () => pointers.speed,
    };

    const grid = readBattleTerrainGrid(source, memory);
    memory.grow(1);

    expect(grid).toMatchObject({ w: 2, h: 2, cell: 4, ox: -8, oy: -12 });
    expect([...grid.tint]).toEqual([0, 1, 4, 6]);
    expect([...grid.height!]).toEqual([1, 2, 3, 4]);
    expect([...grid.rough!]).toEqual([
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(0.3),
      Math.fround(0.4),
    ]);
    expect([...grid.speed!]).toEqual([
      Math.fround(0.5),
      Math.fround(0.6),
      Math.fround(0.7),
      Math.fround(0.8),
    ]);
  });
});
