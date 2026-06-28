import type { ImportedRig } from '../src/validate';
import type { VatBake } from '../src/schema';

export function parseGlb(buffer: ArrayBuffer | Uint8Array): { json: unknown; bin: Uint8Array | null };

export function gltfToRig(gltf: unknown, glbBin: Uint8Array | null, options?: { clipNames?: Record<string, string> }): ImportedRig;

export interface GltfBakeResult {
  rig: ImportedRig;
  bake: VatBake;
  boneNames: string[];
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
