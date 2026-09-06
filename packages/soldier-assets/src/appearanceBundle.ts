import type { SoldierMeshData } from "./mesh";
import type { ImportedRig } from "./rig";
import type { VatBake } from "./schema";

export type SoldierMeshAsset = { [K in keyof SoldierMeshData]: number[] } & {
  indexFormat: "uint16" | "uint32";
};

export interface SoldierMaterial {
  name: string;
  baseColor: [number, number, number, number];
  roughness: number;
  metallic: number;
}

export interface AppearanceManifest {
  name: string;
  mounted: boolean;
  skeleton: string;
  animation: string;
  materials: string;
  tiers: [string, string, string];
  far: { mesh: string; clip: string; phase: number };
  bounds: { center: [number, number, number]; radius: number };
}

export interface AppearanceBundle {
  manifest: AppearanceManifest;
  rig: ImportedRig;
  animation: VatBake;
  materials: SoldierMaterial[];
  tiers: [SoldierMeshData, SoldierMeshData, SoldierMeshData];
  farMesh: SoldierMeshData;
}

export interface AppearanceCatalog {
  appearances: Record<string, string>;
}

/** One request cache per load transaction; reload starts a fresh transaction. */
function assetReader() {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(url: string): Promise<T> => {
    if (!cache.has(url))
      cache.set(
        url,
        fetch(url).then(async (response) => {
          if (!response.ok) throw new Error(`appearance asset ${url}: HTTP ${response.status}`);
          return response.json();
        }),
      );
    return cache.get(url)! as Promise<T>;
  };
}

export async function loadAppearanceCatalog(
  url: string,
): Promise<Record<number, AppearanceBundle>> {
  const read = assetReader();
  const catalog = await read<AppearanceCatalog>(url);
  if (!catalog.appearances || Object.keys(catalog.appearances).length === 0)
    throw new Error("appearance catalog is empty");
  const entries = await Promise.all(
    Object.entries(catalog.appearances).map(async ([id, path]) => {
      if (!/^\d+$/.test(id)) throw new Error(`invalid appearance id ${id}`);
      return [Number(id), await readAppearanceBundle(new URL(path, url).href, read)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function decodeSoldierMesh(asset: SoldierMeshAsset): SoldierMeshData {
  const count = asset.positions?.length / 3;
  if (!Number.isInteger(count) || count <= 0)
    throw new Error("mesh positions must contain complete vertices");
  const widths = {
    positions: 3,
    normals: 3,
    colors: 4,
    joints: 4,
    weights: 4,
    uvs: 2,
    tangents: 4,
    materialIds: 1,
    factionMasks: 1,
  } as const;
  for (const [field, width] of Object.entries(widths)) {
    const values = asset[field as keyof typeof widths];
    if (
      !Array.isArray(values) ||
      values.length !== count * width ||
      values.some((v) => !Number.isFinite(v))
    ) {
      throw new Error(`mesh ${field} must contain ${width} finite values per vertex`);
    }
  }
  if (asset.indexFormat !== "uint16" && asset.indexFormat !== "uint32")
    throw new Error("mesh indexFormat must be uint16 or uint32");
  if (
    !Array.isArray(asset.indices) ||
    asset.indices.length % 3 !== 0 ||
    asset.indices.some(
      (v) =>
        !Number.isInteger(v) ||
        v < 0 ||
        v >= count ||
        (asset.indexFormat === "uint16" && v > 65535),
    )
  ) {
    throw new Error("mesh triangle indices exceed vertex count or declared index width");
  }
  for (let i = 0; i < count; i++) {
    let total = 0;
    for (let j = 0; j < 4; j++) {
      const joint = asset.joints[i * 4 + j],
        weight = asset.weights[i * 4 + j];
      if (!Number.isInteger(joint) || joint < 0 || joint > 65535 || weight < 0)
        throw new Error("mesh has invalid joint influences");
      total += weight;
    }
    if (Math.abs(total - 1) > 1e-5) throw new Error("mesh weights must sum to one");
  }
  return {
    positions: new Float32Array(asset.positions),
    normals: new Float32Array(asset.normals),
    colors: new Float32Array(asset.colors),
    joints: new Uint16Array(asset.joints),
    weights: new Float32Array(asset.weights),
    uvs: new Float32Array(asset.uvs),
    tangents: new Float32Array(asset.tangents),
    materialIds: new Float32Array(asset.materialIds),
    factionMasks: new Float32Array(asset.factionMasks),
    indices:
      asset.indexFormat === "uint32"
        ? new Uint32Array(asset.indices)
        : new Uint16Array(asset.indices),
  };
}

export function encodeSoldierMesh(mesh: SoldierMeshData): SoldierMeshAsset {
  return {
    positions: Array.from(mesh.positions),
    normals: Array.from(mesh.normals),
    colors: Array.from(mesh.colors),
    joints: Array.from(mesh.joints),
    weights: Array.from(mesh.weights),
    uvs: Array.from(mesh.uvs),
    tangents: Array.from(mesh.tangents),
    materialIds: Array.from(mesh.materialIds),
    factionMasks: Array.from(mesh.factionMasks),
    indices: Array.from(mesh.indices),
    indexFormat: mesh.indices instanceof Uint32Array ? "uint32" : "uint16",
  };
}

/** A bundle is installed only after all referenced content resolves successfully. */
export async function loadAppearanceBundle(url: string): Promise<AppearanceBundle> {
  return readAppearanceBundle(url, assetReader());
}

async function readAppearanceBundle(
  url: string,
  fetchAsset: ReturnType<typeof assetReader>,
): Promise<AppearanceBundle> {
  const read = <T>(path: string): Promise<T> => {
    const resolved = new URL(path, url).href;
    return fetchAsset<T>(resolved);
  };
  const manifest = await read<AppearanceManifest>(url);
  if (
    !Array.isArray(manifest.tiers) ||
    manifest.tiers.length !== 3 ||
    manifest.tiers.some((p) => !p)
  ) {
    throw new Error("appearance requires three mesh tiers");
  }
  if (
    !manifest.skeleton ||
    !manifest.animation ||
    !manifest.materials ||
    !manifest.far?.mesh ||
    !manifest.far.clip
  ) {
    throw new Error("appearance requires skeleton, animation, materials and far representation");
  }
  if (
    !manifest.bounds ||
    !Number.isFinite(manifest.bounds.radius) ||
    manifest.bounds.radius <= 0 ||
    manifest.bounds.center?.length !== 3 ||
    manifest.bounds.center.some((v) => !Number.isFinite(v))
  ) {
    throw new Error("appearance requires finite animated bounds");
  }
  const [rig, animation, materials, meshes, farAsset] = await Promise.all([
    read<ImportedRig>(manifest.skeleton),
    read<VatBake>(manifest.animation),
    read<SoldierMaterial[]>(manifest.materials),
    Promise.all(manifest.tiers.map((path) => read<SoldierMeshAsset>(path))),
    read<SoldierMeshAsset>(manifest.far.mesh),
  ]);
  if (
    ![animation.width, animation.height, animation.bones].every(
      (value) => Number.isInteger(value) && value > 0,
    ) ||
    animation.height !== animation.bones * 4 ||
    !Number.isFinite(animation.fps) ||
    animation.fps <= 0 ||
    !Array.isArray(animation.data) ||
    animation.data.length !== animation.width * animation.height * 4 ||
    animation.data.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("appearance animation matrix data does not match its dimensions");
  }
  if (
    !Array.isArray(animation.clips) ||
    animation.clips.length === 0 ||
    new Set(animation.clips.map((clip) => clip.name)).size !== animation.clips.length ||
    animation.clips.some(
      (clip) =>
        typeof clip.name !== "string" ||
        !clip.name ||
        typeof clip.loop !== "boolean" ||
        !Number.isFinite(clip.duration) ||
        clip.duration < 0 ||
        !Number.isInteger(clip.start) ||
        clip.start < 0 ||
        !Number.isInteger(clip.frames) ||
        clip.frames < 1 ||
        clip.start + clip.frames > animation.width,
    )
  ) {
    throw new Error("appearance animation clips have invalid metadata or sample ranges");
  }
  if (!Number.isFinite(manifest.far.phase) || manifest.far.phase < 0 || manifest.far.phase > 1) {
    throw new Error("appearance far phase must be between zero and one");
  }
  if (
    rig.bones.length !== animation.bones ||
    !animation.clips.some((clip) => clip.name === manifest.far.clip)
  ) {
    throw new Error("appearance skeleton or far clip does not match animation");
  }
  const tiers = meshes.map(decodeSoldierMesh) as AppearanceBundle["tiers"];
  const farMesh = decodeSoldierMesh(farAsset);
  for (const mesh of [...tiers, farMesh]) {
    if (
      mesh.joints.some((joint) => joint >= rig.bones.length) ||
      mesh.materialIds.some(
        (slot) => !Number.isInteger(slot) || slot < 0 || slot >= materials.length,
      )
    ) {
      throw new Error("appearance mesh references a missing joint or material");
    }
  }
  return { manifest, rig, animation, materials, tiers, farMesh };
}
