import type { SoldierMeshData } from '../../../packages/soldier-assets/src/soldierMesh';
import type { ImportedRig } from '../../../packages/soldier-assets/src/validate';

// A generic skeleton-preview mesh for an imported rig: a joint cube at each
// bone plus a segment to its parent, every box skinned to its bone so the
// imported VAT animates it. Works for any bone count (the placeholder soldier
// mesh assumes the 7-bone placeholder skeleton, so it can't preview arbitrary
// imported rigs). Box vertices sit at each bone's WORLD BIND position, which is
// what the VAT's joint = world*inverseBind expects.

type Mat4 = number[];

function mat4FromTRS(t: number[], q: number[], s: number[]): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function worldBindPositions(rig: ImportedRig): Array<[number, number, number]> {
  const world: Mat4[] = [];
  return rig.bones.map((bone, i) => {
    const local = mat4FromTRS(bone.bind.T, bone.bind.R, bone.bind.S);
    world[i] = bone.parent >= 0 ? mat4Mul(world[bone.parent], local) : local;
    return [world[i][12], world[i][13], world[i][14]];
  });
}

function pushBox(
  v: number[], indices: number[],
  center: [number, number, number], size: [number, number, number],
  bone: number, color: [number, number, number, number],
) {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const corners: [number, number, number][] = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
  ];
  const faces: Array<[number[], [number, number, number]]> = [
    [[0, 1, 2, 3], [0, 0, -1]], [[4, 7, 6, 5], [0, 0, 1]], [[0, 4, 5, 1], [0, -1, 0]],
    [[1, 5, 6, 2], [1, 0, 0]], [[2, 6, 7, 3], [0, 1, 0]], [[3, 7, 4, 0], [-1, 0, 0]],
  ];
  for (const [face, normal] of faces) {
    const base = v.length / 11;
    for (const idx of face) v.push(...corners[idx], ...normal, ...color, bone);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

const BONE_COLORS: Array<[number, number, number, number]> = [
  [0.86, 0.42, 0.24, 1], [0.34, 0.62, 0.86, 1], [0.52, 0.78, 0.40, 1], [0.84, 0.74, 0.34, 1],
  [0.74, 0.44, 0.78, 1], [0.40, 0.78, 0.72, 1], [0.82, 0.56, 0.40, 1],
];

export function importedRigMesh(rig: ImportedRig): SoldierMeshData {
  const positions = worldBindPositions(rig);
  const v: number[] = [];
  const indices: number[] = [];
  rig.bones.forEach((bone, i) => {
    const color = BONE_COLORS[i % BONE_COLORS.length];
    pushBox(v, indices, positions[i], [0.16, 0.16, 0.16], i, color);
    if (bone.parent >= 0) {
      const a = positions[bone.parent];
      const b = positions[i];
      const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const span: [number, number, number] = [
        Math.max(0.05, Math.abs(b[0] - a[0])),
        Math.max(0.05, Math.abs(b[1] - a[1])),
        Math.max(0.05, Math.abs(b[2] - a[2])),
      ];
      pushBox(v, indices, mid, span, i, [color[0] * 0.7, color[1] * 0.7, color[2] * 0.7, 1]);
    }
  });
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
