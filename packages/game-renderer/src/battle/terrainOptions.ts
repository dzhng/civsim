import { battleMapByWasmId } from "./mapCatalog";
import type { BattleSlopeBands } from "./terrainFeatures";
import type { BattleVistaGrid } from "./vistaSurface";
import type { BattleLakeSurfaceSpec } from "../water/battleWaterGeometry";
export interface BattleTerrainOptions {
  wasmMapId?: number;
  slopeBands?: BattleSlopeBands | null;
  vista?: BattleVistaGrid | null;
  lakeSurfaces?: BattleLakeSurfaceSpec[] | null;
}
export function resolveBattleTerrainOptions(options: BattleTerrainOptions) {
  const catalog =
    options.wasmMapId !== undefined ? battleMapByWasmId(options.wasmMapId) : undefined;
  return {
    cover: catalog?.groundCover ?? "green-grass",
    slopeBands: options.slopeBands ?? null,
    vista: options.vista ?? null,
    lakes: options.lakeSurfaces?.map((surface) => ({ ...surface })) ?? [],
  };
}
