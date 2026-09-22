import { smoothstep } from "../../../renderer-core/src/math";
import { BATTLE_OCEAN_RAMP } from "./waterShoreRamp";
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
  const { rect, edge } = spec;
  // Every field edge knot is retained, including rows omitted by the original
  // uniform ocean grid. Additional collinear vertices cannot open a crack.
  const rows = [
    ...new Set(
      [
        ...Array.from(
          { length: rect.res + 1 },
          (_, j) => rect.y0 + ((rect.y1 - rect.y0) * j) / rect.res,
        ),
        ...edge.map((point) => point.y),
      ].map(Math.fround),
    ),
  ].sort((a, b) => a - b);
  const columns = rect.res + 1;
  const positions = new Float32Array(columns * rows.length * 3);
  const shoreDist = new Float32Array(columns * rows.length);
  let segment = 0;
  for (let j = 0; j < rows.length; j++) {
    const y = rows[j];
    while (segment + 1 < edge.length - 1 && edge[segment + 1].y < y) segment++;
    const a = edge[segment],
      b = edge[Math.min(segment + 1, edge.length - 1)];
    const t = a.y === b.y ? 0 : Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
    const z = a.z + (b.z - a.z) * t;
    const water = a.water + (b.water - a.water) * t;
    for (let i = 0; i < columns; i++) {
      const vertex = j * columns + i;
      const x = rect.x0 + ((rect.x1 - rect.x0) * i) / rect.res;
      const join = smoothstep(0, BATTLE_OCEAN_RAMP.depthFar, Math.abs(x - spec.shoreX));
      positions.set([x, y, z + (spec.baseZ - z) * join], vertex * 3);
      // Ocean fragments use the adjoining field coverage for their near-edge response.
      shoreDist[vertex] = water;
    }
  }
  const indices = new Uint32Array(rect.res * (rows.length - 1) * 6);
  let k = 0;
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < rect.res; i++) {
      const a = j * columns + i,
        b = a + 1,
        c = a + columns,
        d = c + 1;
      indices.set([a, b, c, b, d, c], k);
      k += 6;
    }
  }
  return { positions, indices, shoreDist };
}

export function buildLakePlaneGeometry(
  spec: BattleLakeSurfaceSpec,
  grid: BattleTerrainGrid,
): {
  positions: Float32Array<ArrayBuffer>;
  shoreDist: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
} | null {
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
