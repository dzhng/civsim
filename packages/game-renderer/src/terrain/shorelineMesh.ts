import type { RenderMaskData } from "./campaignSource";
import { renderMaskWaterAt } from "./campaignSource";
import type { LandscapeMesh, RenderedSurface } from "./surface";

/** Source-raster shoreline tessellation within the existing surface cells.
 * Dry bank edges and wet faces share a level; there is no second surface owner. */
export function conformShoreline(
  base: RenderedSurface,
  source: RenderMaskData,
  maxBytes = 32 * 1024 * 1024,
  heightAt?: (x: number, y: number) => number,
  additionalVertexBytes = 0,
) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || maxBytes > 128 * 1024 * 1024)
    throw new Error(`Invalid shoreline geometry budget: ${maxBytes}`);
  if (!Number.isFinite(additionalVertexBytes) || additionalVertexBytes < 0)
    throw new Error("Additional shoreline vertex storage must be finite and nonnegative");
  const vertexBytes = 41 + (base.mesh.surfaceColor ? 12 : 0) + (base.mesh.coverage ? 12 : 0);
  const height = heightAt ?? ((x: number, y: number) => base.sampleRendered(x, y)!.position[2]);
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
  const clip = (polygon: Point[], axis: 0 | 1, boundary: number, side: number) => {
    const result: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = (a[axis] - boundary) * side,
        db = (b[axis] - boundary) * side;
      if (da >= 0) result.push(a);
      if (da < 0 !== db < 0) {
        const t = da / (da - db);
        const intersection: Point = [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ];
        // Interpolation can round past the plane (especially a zero tile edge),
        // making an otherwise valid coastal vertex fall outside its surface.
        intersection[axis] = boundary;
        result.push(intersection);
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
      for (const [axis, boundary, side] of [
        [0, left, 1], [0, right, -1], [1, bottom, 1], [1, top, -1],
      ] as const)
        polygon = clip(polygon, axis, boundary, side);
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
        const bytes =
          points.size * (vertexBytes + additionalVertexBytes) +
          triangles * 12 +
          (cellCount + 1) * 4;
        if (bytes > maxBytes)
          throw new Error(
            `Shoreline geometry needs at least ${bytes} typed-array bytes; budget is ${maxBytes}`,
          );
      });
    },
  );
  // Adjacent adaptive rectangles must retain each other's edge vertices. A
  // nonlinear height at an omitted vertex otherwise opens a geometric crack.
  const rows = new Map<string, number[]>(),
    columns = new Map<string, number[]>();
  for (const id of points.keys()) {
    const [x, y, water] = id.split(":").map(Number);
    const row = `${y.toFixed(9)}:${water}`,
      column = `${x.toFixed(9)}:${water}`;
    if (!rows.has(row)) rows.set(row, []);
    if (!columns.has(column)) columns.set(column, []);
    rows.get(row)!.push(x);
    columns.get(column)!.push(y);
  }
  for (const values of [...rows.values(), ...columns.values()]) values.sort((a, b) => a - b);
  const lowerBound = (values: number[], target: number) => {
    let lo = 0,
      hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (values[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const conformEdges = (polygon: Point[], water: boolean) => {
    const result: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      result.push(a);
      const vertical = Math.abs(a[0] - b[0]) < epsilon;
      if (!vertical && Math.abs(a[1] - b[1]) >= epsilon) continue;
      const axis = vertical ? 1 : 0;
      const values =
        (vertical ? columns : rows).get(`${a[1 - axis].toFixed(9)}:${water ? 1 : 0}`) ?? [];
      const inside = values.slice(
        lowerBound(values, Math.min(a[axis], b[axis]) + epsilon),
        lowerBound(values, Math.max(a[axis], b[axis]) - epsilon),
      );
      if (b[axis] < a[axis]) inside.reverse();
      for (const value of inside) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        result.push([vertical ? a[0] : value, vertical ? value : a[1], a[2] + (b[2] - a[2]) * t]);
      }
    }
    return result;
  };
  const centerOf = (polygon: Point[]): Point =>
    polygon.reduce(
      (sum, p) =>
        [
          sum[0] + p[0] / polygon.length,
          sum[1] + p[1] / polygon.length,
          sum[2] + p[2] / polygon.length,
        ] as Point,
      [0, 0, 0] as Point,
    );
  triangles = 0;
  cells(
    () => {},
    (_i, _j, left, bottom, right, top, mixed, water) => {
      polygons(left, bottom, right, top, mixed, water, (polygon, water) => {
        const boundary = conformEdges(polygon, water);
        if (boundary.length !== polygon.length) {
          const center = centerOf(polygon),
            id = key(center[0], center[1], water);
          if (!points.has(id)) points.set(id, points.size);
          triangles += boundary.length;
        } else triangles += polygon.length - 2;
        const bytes =
          points.size * (vertexBytes + additionalVertexBytes) +
          triangles * 12 +
          (cellCount + 1) * 4;
        if (bytes > maxBytes)
          throw new Error(
            `Shoreline geometry needs at least ${bytes} typed-array bytes; budget is ${maxBytes}`,
          );
      });
    },
  );
  const verticesCount = points.size;
  const typedBytes = verticesCount * vertexBytes + triangles * 12 + (cellCount + 1) * 4;
  const mesh: LandscapeMesh = {
    vertices: new Float32Array(verticesCount * 10),
    surfaceColor: base.mesh.surfaceColor ? new Float32Array(verticesCount * 3) : undefined,
    coverage: base.mesh.coverage ? new Float32Array(verticesCount * 3) : undefined,
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
    mesh.surfaceColor?.fill(0, k * 3, k * 3 + 3);
    mesh.coverage?.fill(0, k * 3, k * 3 + 3);
    for (let corner = 0; corner < 3; corner++) {
      const n = base.mesh.indices[hit.triangle * 3 + corner],
        weight = hit.barycentric[corner];
      for (let c = 0; c < 3; c++) {
        mesh.vertices[k * 10 + 6 + c] += base.mesh.vertices[n * 10 + 6 + c] * weight;
        if (mesh.surfaceColor)
          mesh.surfaceColor[k * 3 + c] += base.mesh.surfaceColor![n * 3 + c] * weight;
      }
      for (let c = 0; mesh.coverage && c < 3; c++)
        mesh.coverage[k * 3 + c] += base.mesh.coverage![n * 3 + c] * weight;
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
    (_i, _j, left, bottom, right, top, mixed, water) => {
      polygons(left, bottom, right, top, mixed, water, (polygon, water) => {
        const boundary = conformEdges(polygon, water);
        const ids = boundary.map(([x, y, signal]) =>
          emit(x, y, water || Math.abs(signal) < 1e-8 ? 0 : height(x, y), water),
        );
        if (boundary.length !== polygon.length) {
          const [x, y] = centerOf(polygon),
            center = emit(x, y, water ? 0 : height(x, y), water);
          for (let p = 0; p < ids.length; p++) face(center, ids[p], ids[(p + 1) % ids.length]);
        } else for (let p = 1; p < ids.length - 1; p++) face(ids[0], ids[p], ids[p + 1]);
      });
    },
  );
  mesh.cellTriangles![cellCount] = triangle;
  if (heightAt) {
    // Source-gradient normals stay identical across coarse/fine topology and
    // loaded windows; triangle-area averaging would expose cell-size seams.
    const step = Math.min(sx, sy) / 2;
    for (let k = 0; k < mesh.waterCoverage!.length; k++) {
      const x = mesh.vertices[k * 10],
        y = mesh.vertices[k * 10 + 1];
      const dx = mesh.waterCoverage![k]
        ? 0
        : (heightAt(x + step, y) - heightAt(x - step, y)) / (2 * step);
      const dy = mesh.waterCoverage![k]
        ? 0
        : (heightAt(x, y + step) - heightAt(x, y - step)) / (2 * step);
      const length = Math.hypot(dx, dy, 1);
      mesh.vertices.set([-dx / length, -dy / length, 1 / length], k * 10 + 3);
    }
    return { mesh, typedBytes, mixedCells };
  }
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
