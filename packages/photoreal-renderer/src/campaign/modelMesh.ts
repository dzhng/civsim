import * as THREE from "three/webgpu";
import { attribute, modelNormalMatrix, vec4 } from "three/tsl";
import type { MeshData } from "../../../game-renderer/src/models/shared/meshBuilder";
import { colorGeometry } from "../landscape/decal";
import { linearAlbedo, viewNormalNode } from "../landscape/shaderNodes";

export function modelGeometry(model: MeshData) {
  const geometry = colorGeometry(model.opaque.vertices, 10, 6, model.opaque.indices);
  const normals = new Float32Array((model.opaque.vertices.length / 10) * 3);
  for (let i = 0; i < normals.length / 3; i++)
    normals.set(model.opaque.vertices.subarray(i * 10 + 3, i * 10 + 6), i * 3);
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  return geometry;
}

export function modelMesh(model: MeshData) {
  const geometry = modelGeometry(model);
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  // Shared model normals are authored outward; their legacy winding is mixed.
  material.normalNode = viewNormalNode(modelNormalMatrix.mul(attribute<"vec3">("normal", "vec3")));
  material.colorNode = vec4(linearAlbedo(attribute<"vec4">("surfaceColor", "vec4").rgb), 1);
  return new THREE.Mesh(geometry, material);
}
