import type { BattleVistaGrid } from "@packages/game-renderer/src/battle/vistaSurface";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import {
  BATTLE_RELIEF_EXAGGERATION,
  deriveBattleEdgeRoles,
  type BattleTerrainGrid,
} from "@packages/game-renderer/src/battle/terrainFeatures";
import { battleMapByWasmId } from "@packages/game-renderer/src/battle/mapCatalog";
import type { BattleLakeSurfaceSpec } from "@packages/photoreal-renderer/src/battle/battleWorld";
import type { BattleAudioWaterSurface } from "./battleAudio";
import type { BattleWorld } from "./battleWorld";

// The vista reader lives with the rest of the authority's immutable world read,
// which is where it now runs; re-exported so the renderer lab keeps its import.
export { readGeneratedVistaGrid } from "./sim/staticWorld";

export interface BattleTerrain {
  generatedVista: BattleVistaGrid | null;
  grid: BattleTerrainGrid;
  refreshStatic(): void;
}

export function buildBattleTerrain(world: BattleWorld): BattleTerrain {
  const { audio, generatedMap, renderer, sim } = world;
  const refreshStatic = () => {
    const soldierUnit = sim.soldierUnits();
    const info = world.unitInfo();
    const teams = Array.from(
      { length: sim.unitCount() },
      (_, unit) => info[unit * world.stride + UNIT_INFO.team],
    );
    const classes = Array.from(
      { length: sim.unitCount() },
      (_, unit) => info[unit * world.stride + UNIT_INFO.classId],
    );
    renderer.setStatic(soldierUnit, teams, classes);
  };
  refreshStatic();

  const generatedVista = sim.identity.vista;
  const grid = world.terrain;
  const reliefScale = generatedMap?.reliefScale ?? BATTLE_RELIEF_EXAGGERATION;
  const heightForRenderer =
    reliefScale === BATTLE_RELIEF_EXAGGERATION
      ? grid.height!
      : scaleHeightForRenderer(grid.height!, reliefScale);
  const lakeSurfaces =
    generatedMap?.lakeSurfaces?.map((lake) => ({
      ...lake,
      level: lake.level * reliefScale,
    })) ?? null;
  const terrainGrid: BattleTerrainGrid = { ...grid, height: heightForRenderer };
  renderer.setTerrain(terrainGrid, {
    wasmMapId: world.wasmMapId,
    slopeBands: generatedMap?.slopeBands ?? null,
    vista: generatedVista,
    lakeSurfaces,
  });
  audio.setTerrain(
    {
      w: grid.w,
      h: grid.h,
      cell: grid.cell,
      ox: grid.ox,
      oy: grid.oy,
      tint: grid.tint,
      groundCover: generatedMap?.groundCover ?? "green-grass",
    },
    buildAudioWaterSurfaces(terrainGrid, world.wasmMapId, generatedVista, lakeSurfaces),
  );
  return { generatedVista, grid, refreshStatic };
}

function buildAudioWaterSurfaces(
  grid: BattleTerrainGrid,
  wasmMapId: number | undefined,
  vista: BattleVistaGrid | null,
  lakeSurfaces: BattleLakeSurfaceSpec[] | null,
): BattleAudioWaterSurface[] {
  const surfaces: BattleAudioWaterSurface[] =
    lakeSurfaces?.map((lake) => ({
      kind: "lake",
      x0: lake.minX,
      y0: lake.minY,
      x1: lake.maxX,
      y1: lake.maxY,
    })) ?? [];
  if (vista) return surfaces;

  const roles = battleMapByWasmId(wasmMapId ?? -1)?.edges ?? deriveBattleEdgeRoles(grid);
  const worldX1 = grid.ox + grid.w * grid.cell;
  const y0 = grid.oy - 400;
  const y1 = grid.oy + grid.h * grid.cell + 400;
  const oceanLap = 12;
  const oceanFar = 2600;
  if (roles.west === "ocean") {
    surfaces.push({
      kind: "ocean",
      x0: grid.ox - oceanFar,
      y0,
      x1: grid.ox + oceanLap,
      y1,
    });
  }
  if (roles.east === "ocean") {
    surfaces.push({
      kind: "ocean",
      x0: worldX1 - oceanLap,
      y0,
      x1: worldX1 + oceanFar,
      y1,
    });
  }
  return surfaces;
}

function scaleHeightForRenderer(height: Float32Array, reliefScale: number): Float32Array {
  const out = new Float32Array(height.length);
  const scale = reliefScale / BATTLE_RELIEF_EXAGGERATION;
  for (let index = 0; index < height.length; index++) out[index] = height[index] * scale;
  return out;
}
