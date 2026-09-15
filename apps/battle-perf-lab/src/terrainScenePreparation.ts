import { buildBattleTerrainData } from "../../../packages/game-renderer/src/battle/terrainSceneData";
import type { BattleTerrainInput } from "./sceneTypes";
import type { BattleWaterInput } from "./waterData";
/** Snapshot caller/WASM arrays before any asynchronous GPU admission. Every terrain
 * layer and grass publication borrows this one committed grid generation. */
export function prepareBattleTerrain(input: BattleTerrainInput) {
  const grid = {
    ...input.grid,
    tint: new Uint8Array(input.grid.tint),
    height: input.grid.height?.slice(),
    rough: input.grid.rough?.slice(),
    speed: input.grid.speed?.slice(),
  };
  const cover = input.cover;
  const lakes = input.lakes.map((l) => ({ ...l }));
  const slopeBands = input.slopeBands ? { ...input.slopeBands } : null;
  const data = buildBattleTerrainData(grid, cover, input.vista);
  const waterInputs: BattleWaterInput[] = [
    ...(data.horizon?.oceanPlanes ?? []).map((spec) => ({ kind: "ocean" as const, spec })),
    ...lakes.map((spec) => ({ kind: "lake" as const, spec, grid })),
  ];
  return { grid, cover, data, lakes, slopeBands, waterInputs };
}
