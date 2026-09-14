import type { WorldRay } from "../../../renderer-core/src/camera3d";

/** Presentation data only. Simulation heights and passability have separate owners. */
export interface LandscapeMesh {
  /** x,y,z, normal xyz, display albedo rgb, field-water weight.
   * Water coverage and depth are separate source signals (water material adoption). */
  vertices: Float32Array;
  surfaceColor: Float32Array;
  tint: Float32Array;
  indices: Uint32Array;
  triangles: number;
}

export interface SurfaceDomain {
  /** East/north origin of the first vertex, not a cell center. */
  ox: number;
  oy: number;
  columns: number;
  rows: number;
  cell: number;
  units: "meters" | "kilometers";
}

export interface SurfaceHit {
  position: [number, number, number];
  normal: [number, number, number];
  revision: string;
  triangle: number;
  barycentric: [number, number, number];
}

/** A regular XY mesh with two indexed triangles per cell, in row-major order.
 * Queries use the uploaded vertices/indices, including either diagonal. */
export function createRenderedSurface(
  mesh: LandscapeMesh,
  domain: SurfaceDomain,
  revision: string,
) {
  const { ox, oy, columns, rows, cell } = domain;
  if (columns < 2 || rows < 2 || !(cell > 0) || !Number.isFinite(cell))
    throw new Error("Rendered surface needs a finite grid with at least one cell");
  const maxX = ox + (columns - 1) * cell,
    maxY = oy + (rows - 1) * cell;
  const triangle = (t: number) => [0, 1, 2].map((n) => mesh.indices[t * 3 + n] * 10);
  const hit = (t: number, x: number, y: number): SurfaceHit | null => {
    const [a, b, c] = triangle(t),
      v = mesh.vertices;
    const bx = v[b] - v[a],
      by = v[b + 1] - v[a + 1],
      bz = v[b + 2] - v[a + 2];
    const cx = v[c] - v[a],
      cy = v[c + 1] - v[a + 1],
      cz = v[c + 2] - v[a + 2];
    const det = bx * cy - by * cx;
    if (Math.abs(det) < 1e-12) return null;
    const u = ((x - v[a]) * cy - (y - v[a + 1]) * cx) / det;
    const w = (bx * (y - v[a + 1]) - by * (x - v[a])) / det;
    if (u < -1e-7 || w < -1e-7 || u + w > 1 + 1e-7) return null;
    const dx = (bz * cy - cz * by) / det,
      dy = (bx * cz - cx * bz) / det;
    const length = Math.hypot(dx, dy, 1);
    return {
      position: [x, y, v[a + 2] + u * bz + w * cz],
      normal: [-dx / length, -dy / length, 1 / length],
      revision,
      triangle: t,
      barycentric: [1 - u - w, u, w],
    };
  };
  const cellAt = (x: number, y: number) => [
    Math.max(0, Math.min(columns - 2, Math.floor((x - ox) / cell))),
    Math.max(0, Math.min(rows - 2, Math.floor((y - oy) / cell))),
  ];
  const sampleRendered = (x: number, y: number): SurfaceHit | null => {
    if (!Number.isFinite(x + y) || x < ox || x > maxX || y < oy || y > maxY) return null;
    const [i, j] = cellAt(x, y),
      t = (j * (columns - 1) + i) * 2;
    return hit(t, x, y) ?? hit(t + 1, x, y);
  };
  const raycastRendered = (
    ray: WorldRay,
    visible: (x: number, y: number) => boolean = () => true,
  ): SurfaceHit | null => {
    const { origin: o, dir: d } = ray;
    if (![...o, ...d].every(Number.isFinite) || Math.hypot(...d) === 0) return null;
    let enter = 0,
      exit = Infinity;
    for (const [axis, lo, hi] of [
      [0, ox, maxX],
      [1, oy, maxY],
    ]) {
      if (d[axis] === 0) {
        if (o[axis] < lo || o[axis] > hi) return null;
      } else {
        const a = (lo - o[axis]) / d[axis],
          b = (hi - o[axis]) / d[axis];
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter > exit) return null;
    let [i, j] = cellAt(o[0] + enter * d[0], o[1] + enter * d[1]);
    const sx = Math.sign(d[0]),
      sy = Math.sign(d[1]);
    const deltaX = sx === 0 ? Infinity : cell / Math.abs(d[0]);
    const deltaY = sy === 0 ? Infinity : cell / Math.abs(d[1]);
    let nextX = sx === 0 ? Infinity : (ox + (i + (sx > 0 ? 1 : 0)) * cell - o[0]) / d[0];
    let nextY = sy === 0 ? Infinity : (oy + (j + (sy > 0 ? 1 : 0)) * cell - o[1]) / d[1];
    // A ray crosses at most columns + rows cells. Vertical rays visit one.
    while (i >= 0 && i < columns - 1 && j >= 0 && j < rows - 1 && enter <= exit) {
      const end = Math.min(nextX, nextY, exit);
      let nearest: SurfaceHit | null = null,
        nearestT = Infinity;
      for (let t = (j * (columns - 1) + i) * 2; t < (j * (columns - 1) + i) * 2 + 2; t++) {
        const [a, b, c] = triangle(t),
          v = mesh.vertices;
        const ab = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]];
        const ac = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
        const n = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const denominator = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
        if (Math.abs(denominator) < 1e-12) continue;
        const distance =
          (n[0] * (v[a] - o[0]) + n[1] * (v[a + 1] - o[1]) + n[2] * (v[a + 2] - o[2])) /
          denominator;
        if (
          distance < enter - 1e-7 ||
          distance > end + 1e-7 ||
          distance < 0 ||
          distance >= nearestT
        )
          continue;
        const candidate = hit(t, o[0] + distance * d[0], o[1] + distance * d[1]);
        if (candidate && visible(candidate.position[0], candidate.position[1])) {
          nearest = candidate;
          nearestT = distance;
        }
      }
      if (nearest) return nearest;
      if (end === exit || !Number.isFinite(end)) break;
      const crossX = nextX <= nextY,
        crossY = nextY <= nextX;
      if (crossX) {
        i += sx;
        nextX += deltaX;
      }
      if (crossY) {
        j += sy;
        nextY += deltaY;
      }
      enter = end;
    }
    return null;
  };
  return { mesh, domain, revision, sampleRendered, raycastRendered };
}
export type RenderedSurface = ReturnType<typeof createRenderedSurface>;

/** Immutable frame view. Detail ownership applies equally to samples and rays;
 * the renderer uses the same domains to suppress covered coarse triangles. */
export function createSurfaceView(
  coarse: RenderedSurface,
  details: readonly RenderedSurface[] = [],
) {
  const ownerAt = (x: number, y: number) =>
    details.find((s) => {
      const d = s.domain;
      return (
        x >= d.ox &&
        y >= d.oy &&
        x <= d.ox + (d.columns - 1) * d.cell &&
        y <= d.oy + (d.rows - 1) * d.cell
      );
    }) ?? coarse;
  return {
    coarse,
    details,
    ownerAt,
    sampleRendered: (x: number, y: number) => ownerAt(x, y).sampleRendered(x, y),
    raycastRendered(ray: WorldRay) {
      let nearest: SurfaceHit | null = null,
        distance = Infinity;
      for (const surface of [...details, coarse]) {
        const hit = surface.raycastRendered(ray, (x, y) => ownerAt(x, y) === surface);
        if (!hit) continue;
        const d = Math.hypot(...hit.position.map((v, i) => v - ray.origin[i]));
        if (d < distance) {
          nearest = hit;
          distance = d;
        }
      }
      return nearest;
    },
  };
}
