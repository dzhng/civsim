export interface SoldierMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  joints: Uint16Array;
  weights: Float32Array;
  uvs: Float32Array;
  tangents: Float32Array;
  materialIds: Float32Array;
  factionMasks: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** Float offsets shared by raw GPU upload and its vertex bindings. */
export const SOLDIER_VERTEX_LAYOUT = {
  strideFloats: 26,
  offsets: {
    position: 0,
    normal: 3,
    color: 6,
    joints: 10,
    weights: 14,
    uv: 18,
    tangent: 20,
    material: 24,
    faction: 25,
  },
} as const;

/** Keep canonical attributes separate; interleave only at GPU upload boundaries. */
export function packSoldierVertices(mesh: SoldierMeshData): Float32Array {
  const count = mesh.positions.length / 3;
  const packed = new Float32Array(count * SOLDIER_VERTEX_LAYOUT.strideFloats);
  const fields = [
    [mesh.positions, 3, SOLDIER_VERTEX_LAYOUT.offsets.position],
    [mesh.normals, 3, SOLDIER_VERTEX_LAYOUT.offsets.normal],
    [mesh.colors, 4, SOLDIER_VERTEX_LAYOUT.offsets.color],
    [mesh.joints, 4, SOLDIER_VERTEX_LAYOUT.offsets.joints],
    [mesh.weights, 4, SOLDIER_VERTEX_LAYOUT.offsets.weights],
    [mesh.uvs, 2, SOLDIER_VERTEX_LAYOUT.offsets.uv],
    [mesh.tangents, 4, SOLDIER_VERTEX_LAYOUT.offsets.tangent],
    [mesh.materialIds, 1, SOLDIER_VERTEX_LAYOUT.offsets.material],
    [mesh.factionMasks, 1, SOLDIER_VERTEX_LAYOUT.offsets.faction],
  ] as const;
  for (let i = 0; i < count; i++) {
    const base = i * SOLDIER_VERTEX_LAYOUT.strideFloats;
    for (const [values, size, offset] of fields) {
      packed.set(values.subarray(i * size, (i + 1) * size), base + offset);
    }
  }
  return packed;
}
