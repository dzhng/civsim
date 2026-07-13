import type { SoldierKitManifest, SoldierMeshJson, VatBake } from './schema';
import { splitInterleaved, type SoldierMeshData } from './soldierMesh';

export const PLACEHOLDER_KIT_URL = '/assets/soldiers/kit.json';
export const PLACEHOLDER_VAT_URL = '/assets/soldiers/baked/human-placeholder.vat.json';

export async function loadPlaceholderKit(): Promise<SoldierKitManifest> {
  const res = await fetch(PLACEHOLDER_KIT_URL);
  if (!res.ok) throw new Error(`failed to load placeholder kit: ${res.status}`);
  return await res.json() as SoldierKitManifest;
}

export async function loadPlaceholderVat(): Promise<VatBake> {
  const res = await fetch(PLACEHOLDER_VAT_URL);
  if (!res.ok) throw new Error(`failed to load placeholder VAT: ${res.status}`);
  return await res.json() as VatBake;
}

export function placeholderClipNames(kit: SoldierKitManifest): string[] {
  return Object.keys(kit.clips).sort((a, b) => kit.clips[a].start - kit.clips[b].start);
}

/** Class ids whose archetype names a mount — the source of truth for `mounted`. */
export function mountedClassesFromKit(kit: SoldierKitManifest): number[] {
  return Object.entries(kit.archetypes)
    .filter(([, archetype]) => Boolean(archetype.mount))
    .map(([id]) => Number(id))
    .filter(Number.isFinite);
}

async function fetchVat(url: string): Promise<VatBake> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load VAT ${url}: ${res.status}`);
  return await res.json() as VatBake;
}

/**
 * The `classId → VatBake` registry the skinned pipeline binds per class. Every
 * class defaults to the shared placeholder; a class listed in `kit.classVats`
 * gets its dedicated bake. Identical URLs are fetched once. The returned array
 * is indexed by classId and spans the archetype range.
 */
/**
 * The `classId → SoldierMeshData` overrides for classes that render a baked
 * real mesh instead of the generated placeholder (`kit.classMeshes`). Sparse:
 * classes without an entry stay `undefined` and keep their placeholder tiers.
 */
export async function loadClassMeshes(kit?: SoldierKitManifest): Promise<(SoldierMeshData | undefined)[]> {
  const entries = Object.entries(kit?.classMeshes ?? {});
  const meshes: (SoldierMeshData | undefined)[] = [];
  for (const [id, url] of entries) {
    const classId = Number(id);
    if (!Number.isFinite(classId)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`failed to load class mesh ${url}: ${res.status}`);
    const json = await res.json() as SoldierMeshJson;
    meshes[classId] = splitInterleaved(new Float32Array(json.vertices), new Uint16Array(json.indices));
  }
  return meshes;
}

export async function loadClassVats(kit?: SoldierKitManifest): Promise<VatBake[]> {
  const shared = await loadPlaceholderVat();
  const archetypeIds = Object.keys(kit?.archetypes ?? {}).map(Number).filter(Number.isFinite);
  const count = archetypeIds.length ? Math.max(...archetypeIds) + 1 : 1;
  const classVats = kit?.classVats ?? {};
  const cache = new Map<string, VatBake>();
  const vats: VatBake[] = [];
  for (let id = 0; id < count; id++) {
    const url = classVats[String(id)];
    if (!url) { vats[id] = shared; continue; }
    if (!cache.has(url)) cache.set(url, await fetchVat(url));
    vats[id] = cache.get(url)!;
  }
  return vats;
}

