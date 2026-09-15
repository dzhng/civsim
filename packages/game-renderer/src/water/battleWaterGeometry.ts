/** Pure production water topology, shared by source and native controls. */
import type { BattleOceanPlaneSpec } from "../battle/horizonPass";
import type { BattleTerrainGrid } from "../battle/terrainFeatures";
const WATER_TINT = 1;
export interface BattleLakeSurfaceSpec {
  id: number;
  level: number;
  minCellX: number;
  minCellY: number;
  maxCellX: number;
  maxCellY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cells: number;
}

export function buildOceanPlaneGeometry(spec: BattleOceanPlaneSpec) {
  const { rect } = spec;
  const side = rect.res + 1;
  const positions = new Float32Array(side * side * 3);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const o = (j * side + i) * 3;
      positions[o] = rect.x0 + ((rect.x1 - rect.x0) * i) / rect.res;
      positions[o + 1] = rect.y0 + ((rect.y1 - rect.y0) * j) / rect.res;
      positions[o + 2] = 0;
    }
  }
  const indices = new Uint32Array(rect.res * rect.res * 6);
  let k = 0;
  for (let j = 0; j < rect.res; j++) {
    for (let i = 0; i < rect.res; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  return { positions, indices };
}

export function buildLakePlaneGeometry(
  spec: BattleLakeSurfaceSpec,
  grid: BattleTerrainGrid,
): { positions: Float32Array; shoreDist: Float32Array; indices: Uint32Array } | null {
  const minX = Math.max(0, Math.min(grid.w - 1, Math.floor(spec.minCellX)));
  const minY = Math.max(0, Math.min(grid.h - 1, Math.floor(spec.minCellY)));
  const maxX = Math.max(minX, Math.min(grid.w - 1, Math.floor(spec.maxCellX)));
  const maxY = Math.max(minY, Math.min(grid.h - 1, Math.floor(spec.maxCellY)));
  const waterCells: Array<{ cx: number; cy: number; shore: number }> = [];
  const shoreCells = lakeShoreDistanceCells(grid, minX, minY, maxX, maxY);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const i = cy * grid.w + cx;
      if (grid.tint[i] !== WATER_TINT) continue;
      waterCells.push({ cx, cy, shore: (shoreCells.get(i) ?? 0) * grid.cell });
    }
  }
  if (waterCells.length === 0) return null;

  const positions = new Float32Array(waterCells.length * 4 * 3);
  const shoreDist = new Float32Array(waterCells.length * 4);
  const indices = new Uint32Array(waterCells.length * 6);
  let pv = 0;
  let sv = 0;
  let iv = 0;
  for (let n = 0; n < waterCells.length; n++) {
    const { cx, cy, shore } = waterCells[n];
    const x0 = grid.ox + cx * grid.cell;
    const x1 = x0 + grid.cell;
    const y0 = grid.oy + cy * grid.cell;
    const y1 = y0 + grid.cell;
    positions.set(
      [x0, y0, spec.level, x1, y0, spec.level, x0, y1, spec.level, x1, y1, spec.level],
      pv,
    );
    shoreDist.set([shore, shore, shore, shore], sv);
    const b = n * 4;
    indices.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], iv);
    pv += 12;
    sv += 4;
    iv += 6;
  }
  return { positions, shoreDist, indices };
}

function lakeShoreDistanceCells(
  grid: BattleTerrainGrid,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Map<number, number> {
  const dist = new Map<number, number>();
  const queue: number[] = [];
  const push = (i: number, d: number) => {
    if (dist.has(i)) return;
    dist.set(i, d);
    queue.push(i);
  };
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const i = cy * grid.w + cx;
      if (grid.tint[i] !== WATER_TINT) continue;
      if (
        cx === 0 ||
        cy === 0 ||
        cx === grid.w - 1 ||
        cy === grid.h - 1 ||
        grid.tint[i - 1] !== WATER_TINT ||
        grid.tint[i + 1] !== WATER_TINT ||
        grid.tint[i - grid.w] !== WATER_TINT ||
        grid.tint[i + grid.w] !== WATER_TINT
      ) {
        push(i, 0);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const d = dist.get(i) ?? 0;
    const cx = i % grid.w;
    const cy = Math.floor(i / grid.w);
    const neighbors = [
      cx > minX ? i - 1 : -1,
      cx < maxX ? i + 1 : -1,
      cy > minY ? i - grid.w : -1,
      cy < maxY ? i + grid.w : -1,
    ];
    for (const ni of neighbors) {
      if (ni < 0 || grid.tint[ni] !== WATER_TINT || dist.has(ni)) continue;
      push(ni, d + 1);
    }
  }
  return dist;
}
