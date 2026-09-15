import type { LandscapeMesh, RenderedSurface, SurfaceDomain } from "./surface";
import { smoothstep } from "../../../renderer-core/src/math";

type Segment = readonly [number, number, number, number];

/** Outer boundary of nonoverlapping tiles with equal world extent. Shared
 * edges cancel; a concave corner remains visible to both adjoining tiles. */
export function detailBoundary(domains: readonly SurfaceDomain[]): Segment[] {
  const edges = new Map<string, Segment>();
  for (const d of domains) {
    const x = d.ox + (d.columns - 1) * d.cell,
      y = d.oy + (d.rows - 1) * d.cell;
    for (const edge of [
      [d.ox, d.oy, x, d.oy],
      [d.ox, y, x, y],
      [d.ox, d.oy, d.ox, y],
      [x, d.oy, x, y],
    ] as Segment[]) {
      const key = edge.join(":");
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, edge);
    }
  }
  return [...edges.values()];
}

/** Collapse covered coarse cells to zero-area triangles. Keeping the indexed
 * cell slots lets rendering, sampling and ray traversal share one topology. */
export function maskCoarseSurface(coarse: RenderedSurface, domains: readonly SurfaceDomain[]) {
  const indices = coarse.mesh.indices.slice(),
    d = coarse.domain;
  let coveredCells = 0;
  for (const tile of domains) {
    const x0 = (tile.ox - d.ox) / d.cell,
      y0 = (tile.oy - d.oy) / d.cell;
    const x1 = (tile.ox + (tile.columns - 1) * tile.cell - d.ox) / d.cell;
    const y1 = (tile.oy + (tile.rows - 1) * tile.cell - d.oy) / d.cell;
    if (![x0, y0, x1, y1].every(Number.isInteger))
      throw new Error("Detail coverage must align with coarse cells");
    for (let y = Math.max(0, y0); y < Math.min(d.rows - 1, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(d.columns - 1, x1); x++) {
        const cell = y * (d.columns - 1) + x;
        const offset = (coarse.mesh.cellTriangles?.[cell] ?? cell * 2) * 3;
        const end = (coarse.mesh.cellTriangles?.[cell + 1] ?? (cell + 1) * 2) * 3;
        indices.fill(indices[offset], offset, end);
        coveredCells++;
      }
  }
  return { mesh: { ...coarse.mesh, indices }, coveredCells };
}

/** Morph only the exterior band of the entire detailed region to its coarse
 * parent. Per-tile skirts would leave artificial valleys along internal joins.
 * World-distance to the union boundary also handles three-tile concave corners. */
export function morphTileSurface(
  fine: RenderedSurface,
  coarse: RenderedSurface,
  boundary: readonly Segment[],
): LandscapeMesh {
  const d = fine.domain,
    band = coarse.domain.cell * 2;
  if (!Number.isInteger(coarse.domain.cell / d.cell))
    throw new Error("Fine spacing must divide coarse spacing to preserve coarse edge kinks");
  const maxX = d.ox + (d.columns - 1) * d.cell,
    maxY = d.oy + (d.rows - 1) * d.cell;
  const nearby = boundary.filter(
    ([x0, y0, x1, y1]) =>
      x1 >= d.ox - band && x0 <= maxX + band && y1 >= d.oy - band && y0 <= maxY + band,
  );
  if (!nearby.length) return fine.mesh;
  const vertices = fine.mesh.vertices.slice(),
    surfaceColor = fine.mesh.surfaceColor.slice(),
    tint = fine.mesh.tint.slice();
  for (let k = 0; k < vertices.length / 10; k++) {
    const x = vertices[k * 10],
      y = vertices[k * 10 + 1];
    let distance2 = Infinity;
    for (const [x0, y0, x1, y1] of nearby) {
      const dx = Math.max(x0 - x, 0, x - x1),
        dy = Math.max(y0 - y, 0, y - y1);
      distance2 = Math.min(distance2, dx * dx + dy * dy);
    }
    if (distance2 >= band * band) continue;
    const hit = coarse.sampleRendered(x, y);
    if (!hit) continue;
    const blend = 1 - smoothstep(0, band, Math.sqrt(distance2));
    const offsets = [0, 1, 2].map((i) => coarse.mesh.indices[hit.triangle * 3 + i]);
    for (let c = 2; c < 10; c++) {
      if (fine.mesh.waterCoverage && (c === 9 || (c === 2 && fine.mesh.waterCoverage[k]))) continue;
      let target = 0;
      for (let i = 0; i < 3; i++)
        target += coarse.mesh.vertices[offsets[i] * 10 + c] * hit.barycentric[i];
      vertices[k * 10 + c] += (target - vertices[k * 10 + c]) * blend;
    }
    // Preserve interpolated normals: normalizing each fine vertex here would
    // change the coarse edge interpolation. The material normalizes per pixel.
    let coarseTint = 0;
    for (let i = 0; i < 3; i++) coarseTint += coarse.mesh.tint[offsets[i]] * hit.barycentric[i];
    tint[k] += (coarseTint - tint[k]) * blend;
    for (let c = 0; c < 3; c++) {
      let target = 0;
      for (let i = 0; i < 3; i++)
        target += coarse.mesh.surfaceColor[offsets[i] * 3 + c] * hit.barycentric[i];
      surfaceColor[k * 3 + c] += (target - surfaceColor[k * 3 + c]) * blend;
    }
  }
  return { ...fine.mesh, vertices, surfaceColor, tint };
}
