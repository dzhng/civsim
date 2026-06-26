export interface SoldierMeshData {
  vertexStrideFloats: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  bones: Float32Array;
  vertices: Float32Array;
  indices: Uint16Array;
}

type Rgba = [number, number, number, number];

function addBox(
  out: number[],
  indices: number[],
  center: [number, number, number],
  size: [number, number, number],
  bone: number,
  color: Rgba,
) {
  const [cx, cy, cz] = center;
  const sx = size[0] * 0.5;
  const sy = size[1] * 0.5;
  const sz = size[2] * 0.5;
  const corners: [number, number, number][] = [
    [cx - sx, cy - sy, cz - sz], [cx + sx, cy - sy, cz - sz], [cx + sx, cy + sy, cz - sz], [cx - sx, cy + sy, cz - sz],
    [cx - sx, cy - sy, cz + sz], [cx + sx, cy - sy, cz + sz], [cx + sx, cy + sy, cz + sz], [cx - sx, cy + sy, cz + sz],
  ];
  const faces: [number[], [number, number, number]][] = [
    [[0, 1, 2, 3], [0, 0, -1]],
    [[4, 7, 6, 5], [0, 0, 1]],
    [[0, 4, 5, 1], [0, -1, 0]],
    [[1, 5, 6, 2], [1, 0, 0]],
    [[2, 6, 7, 3], [0, 1, 0]],
    [[3, 7, 4, 0], [-1, 0, 0]],
  ];
  for (const [face, normal] of faces) {
    const base = out.length / 11;
    for (const idx of face) {
      out.push(...corners[idx], ...normal, ...color, bone);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

export function createPlaceholderSoldierMesh(accentRgb: [number, number, number] = [0.20, 0.42, 0.88]): SoldierMeshData {
  const v: number[] = [];
  const indices: number[] = [];
  const linen: Rgba = [0.72, 0.62, 0.42, 1];
  const bronze: Rgba = [0.76, 0.48, 0.18, 1];
  const leather: Rgba = [0.35, 0.23, 0.13, 1];
  const accent: Rgba = [accentRgb[0], accentRgb[1], accentRgb[2], 1];
  addBox(v, indices, [0, 0.02, 1.24], [0.48, 0.28, 0.70], 1, linen);
  addBox(v, indices, [0, 0.02, 1.82], [0.30, 0.24, 0.30], 2, bronze);
  addBox(v, indices, [-0.46, 0.02, 1.38], [0.18, 0.18, 0.72], 3, leather);
  addBox(v, indices, [0.46, 0.02, 1.38], [0.18, 0.18, 0.72], 4, leather);
  addBox(v, indices, [-0.17, 0, 0.58], [0.18, 0.18, 0.78], 5, leather);
  addBox(v, indices, [0.17, 0, 0.58], [0.18, 0.18, 0.78], 6, leather);
  addBox(v, indices, [-0.34, -0.06, 1.36], [0.10, 0.08, 0.52], 3, accent);
  return splitInterleaved(new Float32Array(v), new Uint16Array(indices));
}

function splitInterleaved(vertices: Float32Array, indices: Uint16Array): SoldierMeshData {
  const count = vertices.length / 11;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const bones = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 11;
    positions.set(vertices.subarray(o, o + 3), i * 3);
    normals.set(vertices.subarray(o + 3, o + 6), i * 3);
    colors.set(vertices.subarray(o + 6, o + 10), i * 4);
    bones[i] = vertices[o + 10];
  }
  return { vertexStrideFloats: 11, positions, normals, colors, bones, vertices, indices };
}

