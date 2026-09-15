import { buildBattleVistaGeometry } from "./vistaGeometry";
import { buildPhotorealBattleGroundMesh } from "./groundPass";
import { buildBattleHorizonLayout } from "./horizonPass";
import { buildBattleTerrainPresentation } from "./mapCatalog";
import {
  BATTLE_RELIEF_EXAGGERATION,
  deriveBattleEdgeRoles,
  type BattleGroundCover,
  type BattleTerrainGrid,
} from "./terrainFeatures";
import { featuresToBattleScenery } from "./terrainScenery";
import type { TerrainHeightField } from "../terrain/heightField";
import { joinVistaSurface, type BattleVistaGrid } from "./vistaSurface";

/** One CPU terrain recipe for each runtime; no scene objects or GPU resources. */
export function buildBattleTerrainData(
  grid: BattleTerrainGrid,
  cover: BattleGroundCover,
  vistaInput: BattleVistaGrid | null,
) {
  const field: TerrainHeightField = grid.height
    ? {
        w: grid.w,
        h: grid.h,
        cell: grid.cell,
        ox: grid.ox,
        oy: grid.oy,
        height: grid.height,
        units: "meters",
        verticalScale: BATTLE_RELIEF_EXAGGERATION,
      }
    : {
        w: grid.w,
        h: grid.h,
        cell: grid.cell,
        ox: grid.ox,
        oy: grid.oy,
        height: new Float32Array(grid.w * grid.h),
        units: "meters",
        verticalScale: 1,
      };
  const vista = vistaInput ? joinVistaSurface(vistaInput, field) : null;
  const presentation = buildBattleTerrainPresentation(
    { id: "live", edges: deriveBattleEdgeRoles(grid), groundCover: cover },
    grid,
    0x5eed,
  );
  const groundData = buildPhotorealBattleGroundMesh(grid, field, cover);
  const horizon = vista
    ? null
    : buildBattleHorizonLayout(
        { ox: grid.ox, oy: grid.oy, w: grid.w, h: grid.h, cell: grid.cell },
        presentation.edges,
        field,
      );
  return {
    field,
    vista,
    ground: groundData,
    vistaMeshes: vista ? buildBattleVistaGeometry(vista, cover, groundData) : [],
    horizon,
    rect: [grid.ox, grid.oy, grid.w * grid.cell, grid.h * grid.cell] as [
      number,
      number,
      number,
      number,
    ],
    scenery: featuresToBattleScenery(presentation.features, field, 0x77, grid),
  };
}
