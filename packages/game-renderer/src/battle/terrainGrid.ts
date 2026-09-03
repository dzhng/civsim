import type { BattleTerrainGrid } from "./terrainFeatures";

export interface TerrainGridSource {
  terrain_w(): number;
  terrain_h(): number;
  terrain_cell(): number;
  terrain_origin_x(): number;
  terrain_origin_y(): number;
  terrain_tint_ptr(): number;
  terrain_height_ptr(): number;
  terrain_rough_ptr(): number;
  terrain_speed_ptr(): number;
}

/** Copies every field out of wasm memory. Call after any memory-growing wasm call. */
export function readBattleTerrainGrid(
  game: TerrainGridSource,
  memory: WebAssembly.Memory,
): BattleTerrainGrid {
  const w = game.terrain_w();
  const h = game.terrain_h();
  const cells = w * h;
  return {
    w,
    h,
    cell: game.terrain_cell(),
    ox: game.terrain_origin_x(),
    oy: game.terrain_origin_y(),
    tint: new Uint8Array(memory.buffer, game.terrain_tint_ptr(), cells).slice(),
    height: new Float32Array(memory.buffer, game.terrain_height_ptr(), cells).slice(),
    rough: new Float32Array(memory.buffer, game.terrain_rough_ptr(), cells).slice(),
    speed: new Float32Array(memory.buffer, game.terrain_speed_ptr(), cells).slice(),
  };
}
