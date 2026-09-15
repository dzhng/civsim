import type { RenderMaskData } from "./campaignSource";
import { renderMaskWaterAt } from "./campaignSource";
import type { LandscapeMesh, RenderedSurface } from "./surface";

/** Source-raster shoreline tessellation within the existing surface cells.
 * Dry bank edges and wet faces share a level; there is no second surface owner. */
export function conformShoreline(
  base: RenderedSurface,
  source: RenderMaskData,
  maxBytes = 32 * 1024 * 1024,
) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || maxBytes > 128 * 1024 * 1024)
    throw new Error(`Invalid shoreline geometry budget: ${maxBytes}`);
  const d = base.domain;
  const cellCount = (d.columns - 1) * (d.rows - 1);
  const sx = (source.rect.max[0] - source.rect.min[0]) / source.width;
  const sy = (source.rect.max[1] - source.rect.min[1]) / source.height;
  const wet = (x: number, y: number) => renderMaskWaterAt(source, x, y);
  const epsilon = Math.min(sx, sy) * 1e-5;
  const cuts = (lo: number, hi: number, origin: number, step: number) => {
    const values = [lo];
    for (let k = Math.floor((lo - origin) / step) + 1; origin + k * step < hi - epsilon; k++)
      values.push(origin + k * step);
    values.push(hi);
    return values;
  };
  const cells = (
    start: (i: number, j: number) => void,
    visit: (
      i: number,
      j: number,
      left: number,
      bottom: number,
      right: number,
      top: number,
      mixed: boolean,
      water: boolean,
    ) => void,
  ) => {
    for (let j = 0; j < d.rows - 1; j++)
      for (let i = 0; i < d.columns - 1; i++) {
        start(i, j);
        const x = d.ox + i * d.cell,
          y = d.oy + j * d.cell;
        const xs = cuts(x, x + d.cell, source.rect.min[0] + sx / 2, sx);
        const ys = cuts(y, y + d.cell, source.rect.min[1] + sy / 2, sy);
        const partition = (a0: number, b0: number, a1: number, b1: number) => {
          const water = wet((xs[a0] + xs[a1]) / 2, (ys[b0] + ys[b1]) / 2);
          let mixed = false;
          // Both cells beside an exact bank must conform, including a corner.
          for (let a = a0; a <= a1 && !mixed; a++)
            for (let b = b0; b <= b1 && !mixed; b++)
              for (const dx of [-sx / 2, sx / 2])
                for (const dy of [-sy / 2, sy / 2])
                  if (wet(xs[a] + dx, ys[b] + dy) !== water) mixed = true;
          if (mixed && (a1 - a0 > 1 || b1 - b0 > 1)) {
            if (a1 - a0 >= b1 - b0) {
              const mid = (a0 + a1) >>> 1;
              partition(a0, b0, mid, b1);
              partition(mid, b0, a1, b1);
            } else {
              const mid = (b0 + b1) >>> 1;
              partition(a0, b0, a1, mid);
              partition(a0, mid, a1, b1);
            }
          } else visit(i, j, xs[a0], ys[b0], xs[a1], ys[b1], mixed, water);
        };
        partition(0, 0, xs.length - 1, ys.length - 1);
      }
  };
  type Point = [number, number, number];
  const clip = (polygon: Point[], distance: (p: Point) => number) => {
    const result: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = distance(a),
        db = distance(b);
      if (da >= 0) result.push(a);
      if (da < 0 !== db < 0) {
        const t = da / (da - db);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    return result;
  };
  const polygons = (
    left: number,
    bottom: number,
    right: number,
    top: number,
    mixed: boolean,
    water: boolean,
    visit: (points: Point[], water: boolean) => void,
  ) => {
    if (!mixed) {
      visit(
        [
          [left, bottom, water ? 1 : -1],
          [left, top, water ? 1 : -1],
          [right, top, water ? 1 : -1],
          [right, bottom, water ? 1 : -1],
        ],
        water,
      );
      return;
    }
    // The source quad and its saddle choice are world-stable even when a tile
    // cuts through the quad. Clip afterwards, rather than inventing a tile edge.
    const qx =
      source.rect.min[0] +
      sx / 2 +
      Math.floor(((left + right) / 2 - source.rect.min[0] - sx / 2) / sx) * sx;
    const qy =
      source.rect.min[1] +
      sy / 2 +
      Math.floor(((bottom + top) / 2 - source.rect.min[1] - sy / 2) / sy) * sy;
    const corners: Point[] = [
      [qx, qy, 0],
      [qx, qy + sy, 0],
      [qx + sx, qy + sy, 0],
      [qx + sx, qy, 0],
    ];
    for (const p of corners) p[2] = wet(p[0], p[1]) ? 1 : -1;
    // March the source-center quad once. In an ambiguous diagonal, join
    // the wet corners and cut the two dry corners, preserving river continuity.
    const wetCount = corners.filter((p) => p[2] > 0).length;
    const saddle = wetCount === 2 && corners[0][2] === corners[2][2];
    const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
    const candidates: { points: Point[]; water: boolean }[] = [];
    for (const water of [false, true]) {
      if (saddle && !water) {
        for (let i = 0; i < 4; i++)
          if (corners[i][2] < 0)
            candidates.push({
              water,
              points: [
                midpoint(corners[(i + 3) % 4], corners[i]),
                corners[i],
                midpoint(corners[i], corners[(i + 1) % 4]),
              ],
            });
      } else {
        const points: Point[] = [];
        for (let i = 0; i < 4; i++) {
          const a = corners[i],
            b = corners[(i + 1) % 4];
          if (a[2] > 0 === water) points.push(a);
          if (a[2] !== b[2]) points.push(midpoint(a, b));
        }
        candidates.push({ water, points });
      }
    }
    for (const { points, water } of candidates) {
      let polygon = points;
      for (const distance of [
        (p: Point) => p[0] - left,
        (p: Point) => right - p[0],
        (p: Point) => p[1] - bottom,
        (p: Point) => top - p[1],
      ])
        polygon = clip(polygon, distance);
      if (polygon.length < 3) continue;
      const area = polygon.reduce(
        (n, p, i) =>
          n +
          p[0] * polygon[(i + 1) % polygon.length][1] -
          p[1] * polygon[(i + 1) % polygon.length][0],
        0,
      );
      if (Math.abs(area) > 1e-10) visit(polygon, water);
    }
  };
  const points = new Map<string, number>();
  const key = (x: number, y: number, water: boolean) =>
    `${x.toFixed(9)}:${y.toFixed(9)}:${water ? 1 : 0}`;
  let triangles = 0,
    mixedCells = 0;
  cells(
    () => {},
    (_i, _j, left, bottom, right, top, mixed, water) => {
      if (mixed) mixedCells++;
      polygons(left, bottom, right, top, mixed, water, (polygon, water) => {
        for (const [x, y] of polygon) {
          const id = key(x, y, water);
          if (!points.has(id)) points.set(id, points.size);
        }
        triangles += polygon.length - 2;
        // Stop the counting pass too: rejected source detail must not grow an
        // unbounded temporary vertex map before the typed-array preflight.
        const bytes = points.size * 57 + triangles * 12 + (cellCount + 1) * 4;
        if (bytes > maxBytes)
          throw new Error(
            `Shoreline geometry needs at least ${bytes} typed-array bytes; budget is ${maxBytes}`,
          );
      });
    },
  );
  const verticesCount = points.size;
  const typedBytes = verticesCount * 57 + triangles * 12 + (cellCount + 1) * 4;
  const mesh: LandscapeMesh = {
    vertices: new Float32Array(verticesCount * 10),
    surfaceColor: new Float32Array(verticesCount * 3),
    tint: new Float32Array(verticesCount),
    indices: new Uint32Array(triangles * 3),
    triangles,
    cellTriangles: new Uint32Array(cellCount + 1),
    waterCoverage: new Uint8Array(verticesCount),
  };
  let triangle = 0;
  const emit = (x: number, y: number, z: number, water: boolean) => {
    const k = points.get(key(x, y, water))!;
    const hit = base.sampleRendered(x, y)!;
    for (let c = 6; c < 9; c++) mesh.vertices[k * 10 + c] = 0;
    mesh.surfaceColor.fill(0, k * 3, k * 3 + 3);
    mesh.tint[k] = 0;
    for (let corner = 0; corner < 3; corner++) {
      const n = base.mesh.indices[hit.triangle * 3 + corner],
        weight = hit.barycentric[corner];
      for (let c = 0; c < 3; c++) {
        mesh.vertices[k * 10 + 6 + c] += base.mesh.vertices[n * 10 + 6 + c] * weight;
        mesh.surfaceColor[k * 3 + c] += base.mesh.surfaceColor[n * 3 + c] * weight;
      }
      mesh.tint[k] += base.mesh.tint[n] * weight;
    }
    mesh.vertices.set([x, y, z, 0, 0, 0], k * 10);
    mesh.vertices[k * 10 + 9] = water ? 1 : 0;
    mesh.waterCoverage![k] = water ? 1 : 0;
    return k;
  };
  const face = (a: number, b: number, c: number) => {
    mesh.indices.set([a, b, c], triangle++ * 3);
  };
  cells(
    (i, j) => {
      mesh.cellTriangles![j * (d.columns - 1) + i] = triangle;
    },
    (i, j, left, bottom, right, top, mixed, water) => {
      const x0 = d.ox + i * d.cell,
        y0 = d.oy + j * d.cell;
      const h = [
        base.sampleRendered(x0, y0)!.position[2],
        base.sampleRendered(x0 + d.cell, y0)!.position[2],
        base.sampleRendered(x0, y0 + d.cell)!.position[2],
        base.sampleRendered(x0 + d.cell, y0 + d.cell)!.position[2],
      ];
      const height = (x: number, y: number) => {
        const u = (x - x0) / d.cell,
          v = (y - y0) / d.cell;
        return (h[0] * (1 - u) + h[1] * u) * (1 - v) + (h[2] * (1 - u) + h[3] * u) * v;
      };
      polygons(left, bottom, right, top, mixed, water, (polygon, water) => {
        const ids = polygon.map(([x, y, signal]) =>
          emit(x, y, water || Math.abs(signal) < 1e-8 ? 0 : height(x, y), water),
        );
        for (let p = 1; p < ids.length - 1; p++) face(ids[0], ids[p], ids[p + 1]);
      });
    },
  );
  mesh.cellTriangles![cellCount] = triangle;
  // Area-weighted normals belong to the final conforming faces.
  const v = mesh.vertices;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t] * 10,
      b = mesh.indices[t + 1] * 10,
      c = mesh.indices[t + 2] * 10;
    const ux = v[b] - v[a],
      uy = v[b + 1] - v[a + 1],
      uz = v[b + 2] - v[a + 2];
    const vx = v[c] - v[a],
      vy = v[c + 1] - v[a + 1],
      vz = v[c + 2] - v[a + 2];
    const nx = uz * vy - uy * vz,
      ny = ux * vz - uz * vx,
      nz = uy * vx - ux * vy;
    for (const k of [a, b, c]) {
      v[k + 3] += nx;
      v[k + 4] += ny;
      v[k + 5] += nz;
    }
  }
  for (let k = 0; k < v.length; k += 10) {
    const length = Math.hypot(v[k + 3], v[k + 4], v[k + 5]);
    if (length) {
      v[k + 3] /= length;
      v[k + 4] /= length;
      v[k + 5] /= length;
    }
  }
  return { mesh, typedBytes, mixedCells };
}
