import type { ImportedRig } from '../src/validate';
import type { VatBake } from '../src/schema';
import type { SoldierMeshData } from '../src/mesh';

export interface GltfRig extends ImportedRig {
  bones: (ImportedRig['bones'][number] & { sourceNode: number })[];
  skinJoints: number[];
}

export interface GltfPrimitive extends Pick<SoldierMeshData,
  'positions' | 'normals' | 'tangents' | 'uvs' | 'colors' | 'joints' | 'weights' | 'indices'> {
  nodeIndex: number;
  nodeName: string;
  meshIndex: number;
  primitiveIndex: number;
  materialIndex: number | null;
}

export function parseGlb(buffer: ArrayBuffer | Uint8Array): { json: unknown; bin: Uint8Array | null };

export function gltfToRig(gltf: unknown, glbBin: Uint8Array | null, options?: { clipNames?: Record<string, string> }): GltfRig;

export interface GltfBakeResult {
  rig: GltfRig;
  bake: VatBake;
  boneNames: string[];
  primitives: GltfPrimitive[];
}

export function bakeGltf(
  buffer: ArrayBuffer | Uint8Array,
  options?: { fps?: number; skeleton?: string; clipNames?: Record<string, string> },
): GltfBakeResult;

export function bakeGltfJson(
  gltf: unknown,
  glbBin: Uint8Array | null,
  options?: { fps?: number; skeleton?: string; clipNames?: Record<string, string> },
): GltfBakeResult;
