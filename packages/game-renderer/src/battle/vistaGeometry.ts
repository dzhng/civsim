import { shoreWaterSignal } from "../water/waterShoreRamp";
import { frontSideGroundIndices, type PhotorealBattleGroundMesh } from "./groundPass";
import { joinedTerrainEdgeData } from "./terrainEdgeData";
import type { BattleGroundCover } from "./terrainFeatures";
import { GROUND_COVER_COLOR } from "./meadowPalette";
import { northSouthSink, type BattleVistaBand, type BattleVistaGrid } from "./vistaSurface";

/** Exact CPU vista mesh recipe, shared by each renderer. */
export function buildVistaGroundMesh(
  band: BattleVistaBand,
  cover: BattleGroundCover,
): Omit<PhotorealBattleGroundMesh, "earthDistance"> {
  const base = GROUND_COVER_COLOR[cover];
  const verts = new Float32Array(band.w * band.h * 10);
  const tint = new Float32Array(band.w * band.h);
  const surfaceColor = new Float32Array(band.w * band.h * 3);
  const zAt = (i: number, j: number): number => {
    const y = band.oy + j * band.cell;
    const baseZ = band.height[j * band.w + i] ?? 0;
    return baseZ + northSouthSink(y);
  };
  let v = 0;
  let tv = 0;
  for (let j = 0; j < band.h; j++) {
    for (let i = 0; i < band.w; i++) {
      const x = band.ox + i * band.cell;
      const y = band.oy + j * band.cell;
      const z = zAt(i, j);
      const wide = band.cell >= 64 ? 2 : 1;
      const il2 = Math.max(0, i - wide);
      const ir2 = Math.min(band.w - 1, i + wide);
      const jb2 = Math.max(0, j - wide);
      const jt2 = Math.min(band.h - 1, j + wide);
      const dx2 = Math.max(0.001, (ir2 - il2) * band.cell);
      const dy2 = Math.max(0.001, (jt2 - jb2) * band.cell);
      const hx = zAt(ir2, j) - zAt(il2, j);
      const hy = zAt(i, jt2) - zAt(i, jb2);
      let nx = -hx / dx2;
      let ny = -hy / dy2;
      const slope = Math.hypot(nx, ny);
      const slopeCeiling = band.cell >= 64 ? 0.52 : 0.82;
      if (slope > slopeCeiling) {
        const scale = slopeCeiling / slope;
        nx *= scale;
        ny *= scale;
      }
      const nz = 1;
      const nlen = Math.hypot(nx, ny, nz) || 1;
      verts[v++] = x;
      verts[v++] = y;
      verts[v++] = z;
      verts[v++] = nx / nlen;
      verts[v++] = ny / nlen;
      verts[v++] = nz / nlen;
      verts[v++] = base[0];
      verts[v++] = base[1];
      verts[v++] = base[2];
      verts[v++] = shoreWaterSignal(band.shoreDistance[j * band.w + i], band.cell);
      surfaceColor[tv * 3] = base[0];
      surfaceColor[tv * 3 + 1] = base[1];
      surfaceColor[tv * 3 + 2] = base[2];
      tint[tv++] = 0;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < band.h - 1; j++) {
    for (let i = 0; i < band.w - 1; i++) {
      const cx = band.ox + (i + 0.5) * band.cell;
      const cy = band.oy + (j + 0.5) * band.cell;
      // Keep the ring wholly outside the preceding tile. The seam strip
      // bridges the sub-cell gap where the two resolutions do not align.
      if (
        Math.abs(cx) < band.innerHalfW + band.cell / 2 &&
        Math.abs(cy) < band.innerHalfH + band.cell / 2
      )
        continue;
      const a = j * band.w + i;
      const b = a + 1;
      const c = a + band.w;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    vertices: verts,
    tint,
    surfaceColor,
    indices: new Uint32Array(indices),
    triangles: indices.length / 3,
  };
}

/** A data-only attribute view lets the seam recipe read the same values as
 * Three's interleaved ground geometry, without a renderer dependency. */
function groundEdgeView(mesh: Omit<PhotorealBattleGroundMesh, "earthDistance">) {
  const attribute = (data: Float32Array, stride: number, offset: number, itemSize: number) => ({
    count: data.length / stride,
    itemSize,
    getX: (i: number) => data[i * stride + offset],
    getY: (i: number) => data[i * stride + offset + 1],
    getComponent: (i: number, c: number) => data[i * stride + offset + c],
  });
  const normal = attribute(mesh.vertices, 10, 3, 3);
  const attributes = {
    position: attribute(mesh.vertices, 10, 0, 3),
    gNormal: normal,
    normal,
    gWater: attribute(mesh.vertices, 10, 9, 1),
    gTint: attribute(mesh.tint, 1, 0, 1),
    gSurfaceColor: attribute(mesh.surfaceColor, 3, 0, 3),
  };
  return {
    attributes,
    index: { array: frontSideGroundIndices(mesh.indices) },
    getAttribute: (name: string) => attributes[name as keyof typeof attributes],
  };
}

/** Build the complete outside rings, including the exact source seam strips.
 * Stored indices keep the ground recipe's winding; renderers apply its existing
 * front-side conversion once when creating their draw geometry. */
export function buildBattleVistaGeometry(
  vista: BattleVistaGrid,
  cover: BattleGroundCover,
  ground: PhotorealBattleGroundMesh,
) {
  const rings: { name: string; mesh: Omit<PhotorealBattleGroundMesh, "earthDistance"> }[] = [];
  let inner: Omit<PhotorealBattleGroundMesh, "earthDistance"> = ground;
  for (const band of vista.bands) {
    const mesh = buildVistaGroundMesh(band, cover);
    if (!mesh.indices.length) continue;
    const hole: [number, number, number, number] = [
      band.ox + Math.floor((-band.innerHalfW - band.ox) / band.cell) * band.cell,
      band.oy + Math.floor((-band.innerHalfH - band.oy) / band.cell) * band.cell,
      band.ox + Math.ceil((band.innerHalfW - band.ox) / band.cell) * band.cell,
      band.oy + Math.ceil((band.innerHalfH - band.oy) / band.cell) * band.cell,
    ];
    const joined = joinedTerrainEdgeData(groundEdgeView(mesh), groundEdgeView(inner), hole);
    const a = joined.attributes,
      count = a.position.values.length / 3,
      vertices = new Float32Array(count * 10);
    for (let i = 0; i < count; i++) {
      vertices.set(a.position.values.subarray(i * 3, i * 3 + 3), i * 10);
      vertices.set(a.gNormal.values.subarray(i * 3, i * 3 + 3), i * 10 + 3);
      vertices.set(a.gSurfaceColor.values.subarray(i * 3, i * 3 + 3), i * 10 + 6);
      vertices[i * 10 + 9] = a.gWater.values[i];
    }
    inner = {
      vertices,
      tint: a.gTint.values,
      surfaceColor: a.gSurfaceColor.values,
      indices: frontSideGroundIndices(joined.indices),
      triangles: joined.indices.length / 3,
    };
    rings.push({ name: band.name, mesh: inner });
  }
  return rings;
}
