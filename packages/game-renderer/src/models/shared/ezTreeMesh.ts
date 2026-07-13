// Adapter from the vendored ez-tree generator (./tree/) to civsim MeshData:
// rotates the generator's Y-up frame into the prop Z-up frame, normalizes the
// tree to a target height so registry defaultScale keeps world sizing, and
// paints vertex colors (bark + height-graded canopy with per-leaf variation)
// in place of upstream's materials. Leaf quads carry leaf-atlas UVs so the
// scenery shaders can alpha-cut them into clusters (see leafAtlas.ts); branch
// geometry gets the u=-1 untextured sentinel. Trees stay in the scenery-prop
// contract: interleaved pos/normal/rgba vertices plus a MeshBuilder drop
// shadow.
import { generateTreeGeometry, type TreeGeometryPart } from './tree/generateTree';
import type { TreeOptions } from './tree/options';
import { buildLeafAtlas, type LeafStyle } from './leafAtlas';
import { MeshBuilder, type MeshData, type Rgb } from './meshBuilder';

export interface EzTreePalette {
  bark: Rgb;
  /** Canopy color at the lowest leaves. */
  leafLow: Rgb;
  /** Canopy color at the treetop; leaves grade between the two by height. */
  leafHigh: Rgb;
}

export interface EzTreeMeshSpec {
  label: string;
  options: TreeOptions;
  palette: EzTreePalette;
  /** Which leaf-atlas tile the leaf quads cut from. */
  leafStyle: LeafStyle;
  /** Target height in prop units (world size = height × instance size). */
  height: number;
  shadowRadius: number;
}

export function buildEzTreeMesh(spec: EzTreeMeshSpec): MeshData {
  const geometry = generateTreeGeometry(spec.options);

  const maxY = Math.max(partMaxY(geometry.branches), partMaxY(geometry.leaves));
  const scale = spec.height / Math.max(1e-6, maxY);

  const vertices: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  appendPart(vertices, indices, geometry.branches, scale, (h) =>
    lerpRgb(scaleRgb(spec.palette.bark, 0.82), spec.palette.bark, Math.min(1, h * 2)),
  );
  for (let i = 0; i < geometry.branches.verts.length / 3; i++) uvs.push(-1, -1);

  appendPart(vertices, indices, geometry.leaves, scale, (h, vertexIndex) => {
    // One jitter per quad (4 vertices), not per vertex, so each leaf reads as
    // a single facet of the canopy rather than a smeared gradient.
    const jitter = 0.88 + hash1(Math.floor(vertexIndex / 4)) * 0.24;
    return scaleRgb(lerpRgb(spec.palette.leafLow, spec.palette.leafHigh, h), jitter);
  });
  appendLeafUvs(uvs, geometry.leaves.verts.length / 3, spec.leafStyle);

  const vertexCount = vertices.length / 10;
  if (vertexCount > 65535 || indices.length > 65535) {
    throw new Error(`${spec.label} exceeds uint16 index range`);
  }

  const shadowBuilder = new MeshBuilder();
  shadowBuilder.shadow(spec.shadowRadius, spec.shadowRadius * 0.62, 0.18);

  return {
    opaque: {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      indexCount: indices.length,
      uvs: new Float32Array(uvs),
    },
    shadow: shadowBuilder.finish(spec.label).shadow,
  };
}

/**
 * Atlas UVs for each leaf quad (4 vertices, order top-left, bottom-left,
 * bottom-right, top-right in the generator's leaf frame), with a per-quad
 * horizontal flip so repeated tiles don't read as clones.
 */
function appendLeafUvs(uvs: number[], leafVertexCount: number, style: LeafStyle): void {
  const region = buildLeafAtlas().regions[style];
  for (let quad = 0; quad < leafVertexCount / 4; quad++) {
    const flip = hash1(quad * 31 + 7) < 0.5;
    const u0 = flip ? region.u1 : region.u0;
    const u1 = flip ? region.u0 : region.u1;
    uvs.push(u0, region.v0, u0, region.v1, u1, region.v1, u1, region.v0);
  }
}

/** Y-up generator frame → Z-up prop frame (rotate -90° about X: y→z, z→-y). */
function toPropFrame(x: number, y: number, z: number): [number, number, number] {
  return [x, -z, y];
}

function appendPart(
  vertices: number[],
  indices: number[],
  part: TreeGeometryPart,
  scale: number,
  colorAt: (normalizedHeight: number, vertexIndex: number) => Rgb,
): void {
  const base = vertices.length / 10;
  const count = part.verts.length / 3;
  const maxZ = Math.max(1e-6, partMaxY(part) * scale);
  for (let i = 0; i < count; i++) {
    const [px, py, pz] = toPropFrame(
      part.verts[i * 3] * scale,
      part.verts[i * 3 + 1] * scale,
      part.verts[i * 3 + 2] * scale,
    );
    const [nx, ny, nz] = toPropFrame(
      part.normals[i * 3],
      part.normals[i * 3 + 1],
      part.normals[i * 3 + 2],
    );
    const color = colorAt(Math.max(0, Math.min(1, pz / maxZ)), i);
    vertices.push(px, py, pz, nx, ny, nz, ...color, 1);
  }
  for (const index of part.indices) indices.push(base + index);
}

function partMaxY(part: TreeGeometryPart): number {
  let max = 0;
  for (let i = 1; i < part.verts.length; i += 3) {
    if (part.verts[i] > max) max = part.verts[i];
  }
  return max;
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scaleRgb(color: Rgb, s: number): Rgb {
  return [Math.min(1, color[0] * s), Math.min(1, color[1] * s), Math.min(1, color[2] * s)];
}

function hash1(x: number): number {
  let n = (x * 374761393) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
