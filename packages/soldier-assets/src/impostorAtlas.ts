import type { AppearanceBundle } from "./appearanceBundle";
import { decodeLocalSample, resolveLocalSample } from "./localAnimation";
import { localPoseToJointMatrices } from "./localPose";
import { poseSoldierMesh } from "./skin";
import { packSoldierMaterials, SOLDIER_TEXTURE_COLOR_SPACES } from "./material";

/** Increment revision when source property/normal/contact or atlas mip baking changes. */
export const IMPOSTOR_ATLAS_POLICY = {
  revision: "three-property-atlas-1",
  columns: 8,
  rows: 8,
  tileSize: 96,
} as const;
export interface ImpostorAtlasLayout {
  columns: number;
  rows: number;
  tileSize: number;
  center: readonly [number, number, number];
  worldSpan: number;
}
export interface ImpostorAtlasData extends ImpostorAtlasLayout {
  /** Complete tightly packed RGBA8 chains. Albedo uses sRGB; normal/contact and ORM/mask are linear. */
  albedo: readonly Uint8Array[];
  normal: readonly Uint8Array[];
  orm: readonly Uint8Array[];
}
/** Render-time placement retains only metadata after the upload bytes are released. */
export function impostorAtlasLayout(atlas: ImpostorAtlasLayout): ImpostorAtlasLayout {
  const { columns, rows, tileSize, center, worldSpan } = atlas;
  return { columns, rows, tileSize, center, worldSpan };
}
export interface ImpostorAtlasArtifact extends ImpostorAtlasLayout {
  inputHash: string;
  contentHash: string;
  policy: string;
  payload: string;
}
const channels = ["albedo", "normal", "orm"] as const;

export async function atlasDigest(bytes: Uint8Array): Promise<string> {
  // Copy the exact view rather than hashing unrelated bytes in its backing buffer.
  const data = new Uint8Array(bytes.length);
  data.set(bytes);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const textBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** Bind the placement metadata to the exact property bytes as one asset. */
export async function impostorAtlasContentHash(
  layout: ImpostorAtlasLayout,
  bytes: Uint8Array,
): Promise<string> {
  return atlasDigest(
    textBytes({ layout: impostorAtlasLayout(layout), bytes: await atlasDigest(bytes) }),
  );
}

/** Fingerprints only inputs that reach the fixed far-pose property bake, independent of live lighting. */
export async function impostorAtlasInput(bundle: AppearanceBundle) {
  const far = bundle.manifest.far;
  const palette = localPoseToJointMatrices(
    bundle.rig,
    decodeLocalSample(bundle.animation, resolveLocalSample(bundle.animation, far.clip, far.phase)),
  );
  const posed = poseSoldierMesh(bundle.farMesh, palette);
  const values = {
    ...posed,
    colors: bundle.farMesh.colors,
    materialIds: bundle.farMesh.materialIds,
    factionMasks: bundle.farMesh.factionMasks,
    uvs: bundle.farMesh.uvs,
    indices: bundle.farMesh.indices,
    materials: packSoldierMaterials(bundle.surface.materials),
  };
  const parts = await Promise.all(
    Object.entries(values).map(async ([name, value]) => [
      name,
      await atlasDigest(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
    ]),
  );
  const textures = await Promise.all(
    Object.keys(SOLDIER_TEXTURE_COLOR_SPACES).map(async (channel) => {
      const texture = bundle.surface.textures[channel as keyof typeof SOLDIER_TEXTURE_COLOR_SPACES];
      if (!texture) return [channel, null];
      const s = texture.sampler;
      return [
        channel,
        {
          image: await atlasDigest(texture.image),
          mimeType: texture.mimeType,
          sampler: [s.magFilter, s.minFilter, s.mipmapFilter, s.wrapS, s.wrapT],
        },
      ];
    }),
  );
  return {
    palette,
    inputHash: await atlasDigest(
      textBytes({
        policy: IMPOSTOR_ATLAS_POLICY,
        indexFormat: bundle.farMesh.indices instanceof Uint32Array ? "uint32" : "uint16",
        parts,
        textures,
      }),
    ),
  };
}

function mipSizes(layout: ImpostorAtlasLayout): number[] {
  for (const n of [layout.columns, layout.rows, layout.tileSize])
    if (!Number.isSafeInteger(n) || n < 1) throw Error("Invalid impostor atlas dimensions");
  if (
    layout.columns !== IMPOSTOR_ATLAS_POLICY.columns ||
    layout.rows !== IMPOSTOR_ATLAS_POLICY.rows ||
    layout.tileSize !== IMPOSTOR_ATLAS_POLICY.tileSize
  )
    throw Error("Impostor atlas bake policy dimensions mismatch");
  if (
    !Number.isFinite(layout.worldSpan) ||
    layout.worldSpan <= 0 ||
    layout.center.length !== 3 ||
    layout.center.some((v) => !Number.isFinite(v))
  )
    throw Error("Invalid impostor atlas anchor");
  const sizes: number[] = [];
  for (
    let w = layout.columns * layout.tileSize, h = layout.rows * layout.tileSize;
    ;
    w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)
  ) {
    sizes.push(w * h * 4);
    if (w === 1 && h === 1) return sizes;
  }
}

/** Payload is channel-major, then mip-major. No image re-encoding or mip reconstruction occurs. */
export function packImpostorAtlas(atlas: ImpostorAtlasData): Uint8Array<ArrayBuffer> {
  const sizes = mipSizes(atlas);
  const bytes = new Uint8Array(sizes.reduce((sum, size) => sum + size, 0) * channels.length);
  let offset = 0;
  for (const channel of channels) {
    if (atlas[channel].length !== sizes.length) throw Error("Incomplete impostor atlas mip chain");
    sizes.forEach((size, mip) => {
      const data = atlas[channel][mip];
      if (data.length !== size) throw Error("Impostor atlas mip byte length mismatch");
      bytes.set(data, offset);
      offset += size;
    });
  }
  return bytes;
}

function currentArtifactSizes(artifact: ImpostorAtlasArtifact, expectedInputHash: string) {
  if (
    artifact.policy !== IMPOSTOR_ATLAS_POLICY.revision ||
    artifact.inputHash !== expectedInputHash
  )
    throw Error("Stale impostor atlas: rebake for current appearance and policy");
  return mipSizes(artifact);
}

export async function readImpostorAtlas(
  artifact: ImpostorAtlasArtifact,
  bytes: Uint8Array,
  expectedInputHash: string,
): Promise<ImpostorAtlasData> {
  const sizes = currentArtifactSizes(artifact, expectedInputHash);
  if (bytes.length !== sizes.reduce((sum, size) => sum + size, 0) * channels.length)
    throw Error("Impostor atlas payload length mismatch");
  if ((await impostorAtlasContentHash(artifact, bytes)) !== artifact.contentHash)
    throw Error("Impostor atlas payload digest mismatch");
  let offset = 0;
  const chains = channels.map(() =>
    sizes.map((size) => {
      const mip = bytes.subarray(offset, offset + size);
      offset += size;
      return mip;
    }),
  );
  return {
    columns: artifact.columns,
    rows: artifact.rows,
    tileSize: artifact.tileSize,
    center: artifact.center,
    worldSpan: artifact.worldSpan,
    albedo: chains[0],
    normal: chains[1],
    orm: chains[2],
  };
}

/** Runtime path: fetch/decompress/validate only. Three belongs exclusively to the authoring tool. */
export async function loadImpostorAtlas(
  url: string,
  bundle: AppearanceBundle,
): Promise<ImpostorAtlasData> {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Impostor atlas ${url}: HTTP ${response.status}`);
  const artifact: ImpostorAtlasArtifact = await response.json();
  const { inputHash } = await impostorAtlasInput(bundle);
  const sizes = currentArtifactSizes(artifact, inputHash);
  const bytes = new Uint8Array(sizes.reduce((sum, size) => sum + size, 0) * channels.length);
  const payload = await fetch(new URL(artifact.payload, url));
  if (!payload.ok || !payload.body) throw Error(`Impostor atlas payload: HTTP ${payload.status}`);
  const reader = payload.body.pipeThrough(new DecompressionStream("gzip")).getReader();
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.length > bytes.length - offset) {
        await reader.cancel();
        throw Error("Impostor atlas payload exceeds expected byte count");
      }
      bytes.set(value, offset);
      offset += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== bytes.length) throw Error("Impostor atlas payload length mismatch");
  return readImpostorAtlas(artifact, bytes, inputHash);
}
