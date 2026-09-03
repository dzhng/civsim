import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import {
  BATTLE_RELIEF_EXAGGERATION,
  type BattleTerrainGrid,
} from "@packages/game-renderer/src/battle/terrainFeatures";
import { readBattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainGrid";
import type { BattleVistaGrid } from "@packages/photoreal-renderer/src/battle/battleWorld";
import type { Game } from "../wasm/game_wasm.js";
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
  renderer.setTerrain(
    grid.w,
    grid.h,
    grid.cell,
    grid.ox,
    grid.oy,
    grid.tint,
    heightForRenderer,
    cfg.wasmMapId,
    cfg.generatedMap?.slopeBands ?? null,
    generatedVista,
    lakeSurfaces,
    grid.rough!,
    grid.speed!,
    cfg.generatedMap?.groundCover ?? "green-grass",
  );
  audio.setTerrain(renderer.battleAudioTerrain(), renderer.battleAudioWaterSurfaces());
  return { generatedVista, grid, refreshStatic };
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
