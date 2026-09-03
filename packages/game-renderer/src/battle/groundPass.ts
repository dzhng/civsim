import type { BattleGroundCover, BattleTerrainGrid } from './terrainFeatures';
import { terrainHeightAt, type TerrainHeightField } from '../terrain/heightField';
import { GROUND_COVER_COLOR, MEADOW, type Rgb } from './meadowPalette';
import {
  buildPhotorealEarthDistance,
  isBattleRoadSurface,
  type PhotorealEarthDistanceField,
} from './photorealEarthDistance';

// The rolling battle ground: a height-displaced grid mesh that replaces the flat
// terrain quads, so soldiers, shadows, and props (which seat on the same height
// source) sit ON the ground instead of floating over it. Full-field ground cover
// (grass/yellow/scrub/sand) is the base; sim terrain tints layer feature colour
// on top. Lit by the surface normal so the relief reads.

// Feature tints (sim tint byte → overlay colour); grass (0) keeps the cover.
// Water (tint 1, WATER_TINT) is deliberately absent — it is no longer a flat overlay
// colour but the shared `waterShade` material, keyed per-vertex by the box-filtered
// water weight (the location(3) `water` attribute) and blended in the fs water branch.
const TINT_COLOR: Record<number, Rgb> = {
  2: [0.50, 0.47, 0.42], // rock
  3: [0.55, 0.52, 0.47], // wall
  4: MEADOW.earth.forestFloor,
  5: MEADOW.earth.mud,
  6: MEADOW.earth.roadDust,
};

// The sim tint byte that means water — its cells carry the shared water material.
const WATER_TINT = 1;

/** The battle ground mesh, CPU-built: interleaved stride-10 vertices
 *  (pos3, normal3, color3, waterWeight1) + uint32 triangle indices. Photoreal
 *  displaces and tints the surface from this shared data. */
export interface BattleGroundMesh {
  /** Interleaved: x,y,z, nx,ny,nz, r,g,b, water — 10 floats per vertex. */
  vertices: Float32Array;
  /** Source sim tint byte per vertex, kept out of the legacy interleaved stride. */
  tint: Float32Array;
  indices: Uint32Array;
  triangles: number;
}

export interface PhotorealBattleGroundMesh extends BattleGroundMesh {
  /** Photoreal base surface before mud/road albedo is composed. */
  surfaceColor: Float32Array;
  /** Signed earthy-union/road distance in compact RG8, positive inside each surface. */
  earthDistance: PhotorealEarthDistanceField;
}

export function buildBattleGroundMesh(
  grid: BattleTerrainGrid,
  field: TerrainHeightField,
  cover: BattleGroundCover,
  step = 2,
): BattleGroundMesh {
  const base = GROUND_COVER_COLOR[cover];
  const nx = Math.floor(grid.w / step) + 1;
  const ny = Math.floor(grid.h / step) + 1;
  const verts = new Float32Array(nx * ny * 10);
  const tintVerts = new Float32Array(nx * ny);
  const cellWorld = (ci: number, cj: number): [number, number] => [
    grid.ox + Math.min(ci, grid.w - 1) * grid.cell + grid.cell * 0.5,
    grid.oy + Math.min(cj, grid.h - 1) * grid.cell + grid.cell * 0.5,
  ];
  // Box-filter the feature tint over the step block so a forest/mud boundary
  // fades across cells instead of stair-stepping per coarse vertex.
  const cellColor = (ci: number, cj: number): Rgb => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -step; dy <= step; dy++) {
      for (let dx = -step; dx <= step; dx++) {
        const sx = ci + dx;
        const sy = cj + dy;
        if (sx < 0 || sy < 0 || sx >= grid.w || sy >= grid.h) continue;
        const overlay = TINT_COLOR[grid.tint[sy * grid.w + sx]];
        const c = overlay ? mix(base, overlay, 0.82) : base;
        r += c[0]; g += c[1]; b += c[2]; n++;
      }
    }
    return n > 0 ? [r / n, g / n, b / n] : base;
  };
  // Water weight, box-filtered exactly like the tint colour so the shore fades
  // across cells instead of stair-stepping: the fraction of the step block that
  // is water tint. This is the field water's distance-from-shore proxy (0 at the
  // edge → 1 deep in the body) that the shared shore ramp keys on.
  const cellWater = (ci: number, cj: number): number => {
    let water = 0, n = 0;
    for (let dy = -step; dy <= step; dy++) {
      for (let dx = -step; dx <= step; dx++) {
        const sx = ci + dx;
        const sy = cj + dy;
        if (sx < 0 || sy < 0 || sx >= grid.w || sy >= grid.h) continue;
        if (grid.tint[sy * grid.w + sx] === WATER_TINT) water++;
        n++;
      }
    }
    return n > 0 ? water / n : 0;
  };
  let v = 0;
  let tv = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ci = Math.min(i * step, grid.w - 1);
      const cj = Math.min(j * step, grid.h - 1);
      const [x, y] = cellWorld(ci, cj);
      const z = terrainHeightAt(field, x, y);
      // Surface normal from the height gradient (central difference in world).
      const d = grid.cell * step;
      const hx = terrainHeightAt(field, x + d, y) - terrainHeightAt(field, x - d, y);
      const hy = terrainHeightAt(field, x, y + d) - terrainHeightAt(field, x, y - d);
      const nlen = Math.hypot(hx, hy, 2 * d) || 1;
      const color = cellColor(ci, cj);
      verts[v++] = x; verts[v++] = y; verts[v++] = z;
      verts[v++] = -hx / nlen; verts[v++] = -hy / nlen; verts[v++] = (2 * d) / nlen;
      verts[v++] = color[0]; verts[v++] = color[1]; verts[v++] = color[2];
      verts[v++] = cellWater(ci, cj);
      tintVerts[tv++] = grid.tint[cj * grid.w + ci] ?? 0;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const dd = c + 1;
      indices.push(a, c, b, b, c, dd);
    }
  }
  return { vertices: verts, tint: tintVerts, indices: new Uint32Array(indices), triangles: indices.length / 3 };
}

export function buildPhotorealBattleGroundMesh(
  grid: BattleTerrainGrid,
  field: TerrainHeightField,
  cover: BattleGroundCover,
  step = 2,
): PhotorealBattleGroundMesh {
  const mesh = buildBattleGroundMesh(grid, field, cover, step);
  const base = GROUND_COVER_COLOR[cover];
  const nx = Math.floor(grid.w / step) + 1;
  const ny = Math.floor(grid.h / step) + 1;
  const photorealTint = new Float32Array(mesh.tint);
  const surfaceColor = new Float32Array(nx * ny * 3);
  let vertex = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++, vertex++) {
      const ci = Math.min(i * step, grid.w - 1);
      const cj = Math.min(j * step, grid.h - 1);
      const sourceIndex = cj * grid.w + ci;
      if (
        grid.tint[sourceIndex] === 5 ||
        isBattleRoadSurface(grid.tint[sourceIndex], grid.rough?.[sourceIndex], grid.speed?.[sourceIndex])
      ) {
        photorealTint[vertex] = 0;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -step; dy <= step; dy++) {
        for (let dx = -step; dx <= step; dx++) {
          const sx = ci + dx;
          const sy = cj + dy;
          if (sx < 0 || sy < 0 || sx >= grid.w || sy >= grid.h) continue;
          const index = sy * grid.w + sx;
          const tint = grid.tint[index];
          const isMud = tint === 5;
          const isRoad = isBattleRoadSurface(tint, grid.rough?.[index], grid.speed?.[index]);
          const overlay = isMud || isRoad ? undefined : TINT_COLOR[tint];
          const color = overlay ? mix(base, overlay, 0.82) : base;
          r += color[0];
          g += color[1];
          b += color[2];
          count++;
        }
      }
      surfaceColor[vertex * 3] = count > 0 ? r / count : base[0];
      surfaceColor[vertex * 3 + 1] = count > 0 ? g / count : base[1];
      surfaceColor[vertex * 3 + 2] = count > 0 ? b / count : base[2];
    }
  }
  return {
    ...mesh,
    tint: photorealTint,
    surfaceColor,
    earthDistance: buildPhotorealEarthDistance(grid),
  };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
