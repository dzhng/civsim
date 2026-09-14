import { TURF_CONTRAST } from "@packages/game-renderer/src/battle/groundMaterialPolicy";
import { buildPhotorealBattleGroundMesh } from "@packages/game-renderer/src/battle/groundPass";
import type { BattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainFeatures";
import {
  coverEdgeCoverage,
  coverEdgeNoise,
} from "@packages/photoreal-renderer/src/battle/groundDetail";

export interface BattleGroundEdgeFixture {
  grid: BattleTerrainGrid;
  anchors: {
    mud: [number, number];
    road: [number, number];
    scree: [number, number];
    ruler: [number, number];
  };
  telemetry: {
    mudWidthMeters: number;
    roadLeftWidthMeters: number;
    roadRightWidthMeters: number;
    displacementBoundMeters: number;
    detachedIslands: number;
  };
}

export function createBattleGroundEdgeFixture(): BattleGroundEdgeFixture {
  const w = 160;
  const h = 120;
  const cell = 4;
  const ox = -320;
  const oy = -240;
  const tint = new Uint8Array(w * h);
  const rough = new Float32Array(w * h);
  const speed = new Float32Array(w * h).fill(1);
  const height = new Float32Array(w * h);

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const x = ox + (cx + 0.5) * cell;
      const y = oy + (cy + 0.5) * cell;
      const index = cy * w + cx;
      const mud = Math.hypot((x + 170) / 1.1, y * 0.82) <= 92;
      const road = Math.abs(x - 10) <= 10 && Math.abs(y) <= 210;
      const scree = Math.hypot((x - 185) / 1.25, y + 10) <= 70;
      if (mud) {
        tint[index] = 5;
        rough[index] = 0.35;
        speed[index] = 0.5;
      } else if (road) {
        tint[index] = 6;
        rough[index] = 0;
        speed[index] = 1;
      } else if (scree) {
        tint[index] = 6;
        rough[index] = 0.45;
        speed[index] = 0.6;
      }
    }
  }

  const grid: BattleTerrainGrid = { w, h, cell, ox, oy, tint, rough, speed, height };
  return {
    grid,
    anchors: {
      mud: [-69, 0],
      road: [10, 0],
      scree: [185, -10],
      ruler: [-74, 0],
    },
    telemetry: measureFixture(grid),
  };
}

function measureFixture(grid: BattleTerrainGrid): BattleGroundEdgeFixture["telemetry"] {
  const field = {
    w: grid.w,
    h: grid.h,
    cell: grid.cell,
    ox: grid.ox,
    oy: grid.oy,
    height: grid.height as Float32Array,
    units: "meters" as const,
    verticalScale: 1,
  };
  const mesh = buildPhotorealBattleGroundMesh(grid, field, "green-grass", 2);
  const sdf = mesh.earthDistance;
  const distanceAt = (channel: 0 | 1, x: number): number => {
    const u = Math.max(0, Math.min(sdf.width - 1, (x - sdf.ox) / sdf.cell - 0.5));
    const v = Math.max(0, Math.min(sdf.height - 1, (0 - sdf.oy) / sdf.cell - 0.5));
    const x0 = Math.floor(u);
    const x1 = Math.min(sdf.width - 1, x0 + 1);
    const y0 = Math.floor(v);
    const y1 = Math.min(sdf.height - 1, y0 + 1);
    const tx = u - x0;
    const ty = v - y0;
    const decode = (ix: number, iy: number) =>
      (sdf.data[(iy * sdf.width + ix) * 2 + channel] / 255 - 0.5) * 2 * sdf.rangeMeters;
    const top = decode(x0, y0) + (decode(x1, y0) - decode(x0, y0)) * tx;
    const bottom = decode(x0, y1) + (decode(x1, y1) - decode(x0, y1)) * tx;
    return top + (bottom - top) * ty;
  };
  const visualAt = (channel: 0 | 1, x: number) =>
    coverEdgeCoverage(distanceAt(channel, x), coverEdgeNoise(x, 0));
  const widths = (channel: 0 | 1): Array<{ center: number; width: number }> => {
    const samples: Array<{ x: number; value: number }> = [];
    for (let x = grid.ox + 16; x <= grid.ox + grid.w * grid.cell - 16; x += 0.02) {
      samples.push({ x, value: visualAt(channel, x) });
    }
    const crossings = (level: number) => {
      const result: number[] = [];
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        if (a.value < level === b.value < level) continue;
        const t = (level - a.value) / (b.value - a.value);
        result.push(a.x + (b.x - a.x) * t);
      }
      return result;
    };
    const low = crossings(0.1);
    const high = crossings(0.9);
    return low.map((x) => {
      const match = high.reduce((best, candidate) =>
        Math.abs(candidate - x) < Math.abs(best - x) ? candidate : best,
      );
      return { center: (x + match) * 0.5, width: Math.abs(match - x) };
    });
  };
  const mudEdges = widths(0);
  const roadEdges = widths(1).sort((a, b) => a.center - b.center);
  const detachedIslands = Math.max(0, mudEdges.length - 4) + Math.max(0, roadEdges.length - 2);
  return {
    mudWidthMeters: nearest(mudEdges, -69).width,
    roadLeftWidthMeters: nearest(roadEdges, 0).width,
    roadRightWidthMeters: nearest(roadEdges, 20).width,
    displacementBoundMeters: TURF_CONTRAST.edge.displacementBoundMeters,
    detachedIslands,
  };
}

function nearest(edges: Array<{ center: number; width: number }>, target: number) {
  if (edges.length === 0) throw new Error(`fixture edge missing near ${target}`);
  return edges.reduce((best, edge) =>
    Math.abs(edge.center - target) < Math.abs(best.center - target) ? edge : best,
  );
}
