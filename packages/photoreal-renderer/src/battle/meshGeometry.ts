import * as THREE from "three/webgpu";
import {
  packSoldierVertices,
  SOLDIER_VERTEX_LAYOUT,
  type SoldierMeshData,
} from "../../../soldier-assets/src/mesh";

/** One vertex buffer leaves room for instance attributes on baseline WebGPU. */
export function soldierGeometry(mesh: SoldierMeshData): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  const buffer = new THREE.InterleavedBuffer(
    packSoldierVertices(mesh),
    SOLDIER_VERTEX_LAYOUT.strideFloats,
  );
  const offsets = SOLDIER_VERTEX_LAYOUT.offsets;
  for (const [name, size, offset] of [
    ["position", 3, offsets.position],
    ["normal", 3, offsets.normal],
    ["color", 4, offsets.color],
    ["joints", 4, offsets.joints],
    ["weights", 4, offsets.weights],
    ["uv", 2, offsets.uv],
    ["tangent", 4, offsets.tangent],
    ["materialId", 1, offsets.material],
    ["factionMask", 1, offsets.faction],
  ] as const) {
    geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, size, offset));
  }
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.instanceCount = 0;
  return geometry;
}
