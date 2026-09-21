import type { BattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainFeatures";
import type { BattleTerrainOptions } from "@packages/game-renderer/src/battle/terrainOptions";
import type { BattleCameraSnapshot } from "@packages/battle-renderer/src/types";
import type { BattleStandardInstance } from "@packages/game-renderer/src/models/shared/battleStandardData";
import type { BattleReadoutInstance } from "@packages/game-renderer/src/battle/readoutData";
import type { BattleRenderCamera } from "./battlePresentation";

export function cloneTerrainGrid(grid: BattleTerrainGrid): BattleTerrainGrid {
  return {
    ...grid,
    tint: new Uint8Array(grid.tint),
    height: grid.height ? new Float32Array(grid.height) : undefined,
    rough: grid.rough ? new Float32Array(grid.rough) : undefined,
    speed: grid.speed ? new Float32Array(grid.speed) : undefined,
  };
}

export function cloneTerrainOptions(options: BattleTerrainOptions): BattleTerrainOptions {
  return {
    ...options,
    vista: options.vista
      ? {
          shape: options.vista.shape,
          bands: options.vista.bands.map((band) => ({
            ...band,
            height: new Float32Array(band.height),
          })),
        }
      : null,
    lakeSurfaces: options.lakeSurfaces?.map((surface) => ({ ...surface })) ?? null,
  };
}

/** Frozen snapshots keep short unit-anchored cue segments (facing ticks,
 *  queue diamonds, near path legs) but drop cross-field order lines, whose
 *  endpoints churn between runs. Selection rings travel in their own layer
 *  and pass through untouched. */
export function frozenSelectionGroundCues(verts: Float32Array) {
  const stride = 6;
  const maxSegmentLength = 12;
  const out: number[] = [];
  for (let i = 0; i + stride * 2 <= verts.length; i += stride * 2) {
    const x0 = verts[i];
    const y0 = verts[i + 1];
    const x1 = verts[i + stride];
    const y1 = verts[i + stride + 1];
    if (Math.hypot(x1 - x0, y1 - y0) > maxSegmentLength) continue;
    for (let k = 0; k < stride * 2; k++) out.push(verts[i + k]);
  }
  return new Float32Array(out);
}

export function readoutsKey(
  standards: readonly BattleStandardInstance[],
  readouts: readonly BattleReadoutInstance[],
) {
  let key = `${standards.length}/${readouts.length}`;
  for (const standard of standards) {
    key += `|${standard.unitId}:${Math.round(standard.x * 10)},${Math.round(standard.y * 10)},${Math.round(standard.z * 10)},${Math.round(standard.yaw * 100)},${Math.round(standard.scale * 100)},${standard.factionId},${standard.selected ? 1 : 0}`;
  }
  for (const readout of readouts) {
    key += `#${readout.unitId}:${Math.round(readout.x * 10)},${Math.round(readout.y * 10)},${Math.round(readout.z * 10)},${Math.round(readout.worldPerPx * 1000)},${readout.chips.map((c) => `${c.kind ?? ""}${c.text}`).join(",")}`;
  }
  return key;
}

export function cameraSnapshot(camera: BattleRenderCamera): BattleCameraSnapshot {
  const [x, y] = camera.viewCenter();
  return {
    x,
    y,
    zoom: camera.zoom,
    zoomT: camera.zoomT,
    camera3d: camera.params(),
  };
}

export function frozenFrameKey(camera: BattleRenderCamera, count: number) {
  const p = camera.params();
  return [...p.target, p.distance, p.pitch, p.yaw, p.fovY, p.aspect, count].map(roundKey).join(":");
}

function roundKey(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : "nan";
}
