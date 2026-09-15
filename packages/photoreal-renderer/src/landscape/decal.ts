import * as THREE from "three/webgpu";
import { attribute, varying, vec4 } from "three/tsl";
import { linearAlbedo } from "./shaderNodes";

export function colorGeometry(
  vertices: Float32Array,
  stride: number,
  colorOffset: number,
  indices?: Uint16Array,
) {
  const geometry = new THREE.BufferGeometry(),
    count = vertices.length / stride;
  const positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    positions.set(vertices.subarray(i * stride, i * stride + 3), i * 3);
    colors.set(vertices.subarray(i * stride + colorOffset, i * stride + colorOffset + 4), i * 4);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("surfaceColor", new THREE.BufferAttribute(colors, 4));
  if (indices) geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}
export function decalMaterial() {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  const color = varying(attribute<"vec4">("surfaceColor", "vec4"));
  material.colorNode = vec4(linearAlbedo(color.rgb), color.a);
  return material;
}
