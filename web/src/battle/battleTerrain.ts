import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import {
  BATTLE_RELIEF_EXAGGERATION,
  deriveBattleEdgeRoles,
  type BattleTerrainGrid,
} from "@packages/game-renderer/src/battle/terrainFeatures";
import { battleMapByWasmId } from "@packages/game-renderer/src/battle/mapCatalog";
import { readBattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainGrid";
import type {
  BattleLakeSurfaceSpec,
  BattleVistaGrid,
} from "@packages/photoreal-renderer/src/battle/battleWorld";
import type { Game } from "../wasm/game_wasm.js";
import type { BattleAudioWaterSurface } from "./battleAudio";
import type { BattleWorld, GeneratedBattleMapDescriptor } from "./battleWorld";

type VistaExportGame = Game & {
  generated_vista_band_count(): number;
  generated_vista_band_width(band: number): number;
  generated_vista_band_height(band: number): number;
  generated_vista_band_cell(band: number): number;
  generated_vista_band_origin_x(band: number): number;
  generated_vista_band_origin_y(band: number): number;
  generated_vista_band_height_ptr(band: number): number;
};

export interface BattleTerrain {
  generatedVista: BattleVistaGrid | null;
  grid: BattleTerrainGrid;
  refreshStatic(): void;
}

export function buildBattleTerrain(world: BattleWorld): BattleTerrain {
  const { audio, cfg, game, renderer } = world;
  const refreshStatic = () => {
    const soldierUnit = new Uint32Array(
      world.memory.buffer,
      game.soldier_unit_ptr(),
      game.soldier_count(),
    );
    const info = world.unitInfo();
    const teams = Array.from(
      { length: game.unit_count() },
      (_, unit) => info[unit * world.stride + UNIT_INFO.team],
    );
    const classes = Array.from(
      { length: game.unit_count() },
      (_, unit) => info[unit * world.stride + UNIT_INFO.classId],
    );
    renderer.setStatic(soldierUnit, teams, classes);
  };
  refreshStatic();

  const generatedVista = cfg.generatedMap ? readGeneratedVistaGrid(world, cfg.generatedMap) : null;
  const grid = readBattleTerrainGrid(game, world.memory);
  const reliefScale = cfg.generatedMap?.reliefScale ?? BATTLE_RELIEF_EXAGGERATION;
  const heightForRenderer =
    reliefScale === BATTLE_RELIEF_EXAGGERATION
      ? grid.height!
      : scaleHeightForRenderer(grid.height!, reliefScale);
  const lakeSurfaces =
    cfg.generatedMap?.lakeSurfaces?.map((lake) => ({
      ...lake,
      level: lake.level * reliefScale,
    })) ?? null;
  const terrainGrid: BattleTerrainGrid = { ...grid, height: heightForRenderer };
  renderer.setTerrain(terrainGrid, {
    wasmMapId: cfg.wasmMapId,
    slopeBands: cfg.generatedMap?.slopeBands ?? null,
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
      groundCover: cfg.generatedMap?.groundCover ?? "green-grass",
    },
    buildAudioWaterSurfaces(terrainGrid, cfg.wasmMapId, generatedVista, lakeSurfaces),
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

function readGeneratedVistaGrid(
  world: BattleWorld,
  descriptor: GeneratedBattleMapDescriptor,
): BattleVistaGrid | null {
  const vista = descriptor.vista;
  if (!vista?.bands?.length) return null;
  const game = world.game as VistaExportGame;
  const count = Math.min(game.generated_vista_band_count(), vista.bands.length);
  const bands: BattleVistaGrid["bands"] = [];
  for (let index = 0; index < count; index++) {
    const meta = vista.bands[index];
    const width = game.generated_vista_band_width(index);
    const height = game.generated_vista_band_height(index);
    const cell = game.generated_vista_band_cell(index);
    const originX = game.generated_vista_band_origin_x(index);
    const originY = game.generated_vista_band_origin_y(index);
    const pointer = game.generated_vista_band_height_ptr(index);
    if (!meta || width <= 0 || height <= 0 || pointer === 0) continue;
    const heights = new Float32Array(
      new Float32Array(world.memory.buffer, pointer, width * height),
    );
    bands.push({
      name: meta.name,
      w: width,
      h: height,
      cell,
      ox: originX,
      oy: originY,
      innerHalfW: meta.innerHalfW,
      innerHalfH: meta.innerHalfH,
      outerHalfW: meta.outerHalfW,
      outerHalfH: meta.outerHalfH,
      height: heights,
    });
  }
  return bands.length > 0 ? { shape: vista.shape, bands } : null;
}
