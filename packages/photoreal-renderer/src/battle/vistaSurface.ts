import { smoothstep } from "../../../renderer-core/src/math";
import {
  terrainHeightAt,
  type TerrainHeightField,
} from "../../../game-renderer/src/terrain/heightField";

export interface BattleVistaBand {
  name: "vista" | "farFog" | string;
  w: number;
  h: number;
  cell: number;
  /** First vertex-sample world coordinate, not a cell-corner origin. */
  ox: number;
  oy: number;
  /** Renderer cuts this inner rect out of the full band to avoid z-fighting. */
  innerHalfW: number;
  innerHalfH: number;
  outerHalfW: number;
  outerHalfH: number;
  height: Float32Array;
  /** Signed coast distance in world metres; positive is wet. */
  shoreDistance: Float32Array;
}

export interface BattleVistaGrid {
  shape: string;
  bands: BattleVistaBand[];
}

export function vistaSurfaceHeightAt(vista: BattleVistaGrid, x: number, y: number): number | null {
  const band = vista.bands.find(
    (b) => Math.abs(x) <= b.outerHalfW + b.cell && Math.abs(y) <= b.outerHalfH + b.cell,
  );
  if (!band) return null;
  if (Math.abs(x) < band.innerHalfW && Math.abs(y) < band.innerHalfH) return null;
  return vistaBandHeightAt(band, x, y);
}

export function vistaBandHeightAt(band: BattleVistaBand, x: number, y: number): number {
  const gx = clampNumber((x - band.ox) / band.cell, 0, band.w - 1);
  const gy = clampNumber((y - band.oy) / band.cell, 0, band.h - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, band.w - 1);
  const y1 = Math.min(y0 + 1, band.h - 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const top = lerpNumber(band.height[y0 * band.w + x0], band.height[y0 * band.w + x1], tx);
  const bot = lerpNumber(band.height[y1 * band.w + x0], band.height[y1 * band.w + x1], tx);
  return lerpNumber(top, bot, ty) + northSouthSink(y);
}

export function northSouthSink(y: number): number {
  // All bands share one world-space ramp so their lowered edges meet without
  // a height step that catches light along the horizon.
  const SINK_START_Y = 820;
  const SINK_END_Y = 2800;
  const t = Math.max(0, Math.abs(y) - SINK_START_Y) / Math.max(1, SINK_END_Y - SINK_START_Y);
  const s = smoothstep(0.15, 1.0, t);
  return -7.5 * s;
}

function clampNumber(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Adjacent bands use different detail profiles. Match the final inner surface
 * and ease the correction away through the outer band's detail transition. */
export function joinVistaSurface(
  vista: BattleVistaGrid,
  field: TerrainHeightField,
): BattleVistaGrid {
  const bands: BattleVistaBand[] = [];
  let innerHeightAt = (x: number, y: number) => terrainHeightAt(field, x, y);
  for (const source of vista.bands) {
    const height = new Float32Array(source.height);
    for (let j = 0; j < source.h; j++) {
      for (let i = 0; i < source.w; i++) {
        const x = source.ox + i * source.cell;
        const y = source.oy + j * source.cell;
        const ex = clampNumber(x, -source.innerHalfW, source.innerHalfW);
        const ey = clampNumber(y, -source.innerHalfH, source.innerHalfH);
        const distance = Math.max(Math.abs(x - ex), Math.abs(y - ey));
        const weight = 1 - smoothstep(0, source.cell * 10, distance);
        if (weight > 0)
          height[j * source.w + i] +=
            (innerHeightAt(ex, ey) - vistaBandHeightAt(source, ex, ey)) * weight;
      }
    }
    const joined = { ...source, height };
    bands.push(joined);
    innerHeightAt = (x, y) => vistaBandHeightAt(joined, x, y);
  }
  return { ...vista, bands };
}
