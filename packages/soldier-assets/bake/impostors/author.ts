import * as THREE from "three/webgpu";
import { loadAppearanceBundle, type AppearanceCatalog } from "../../src/appearanceBundle";
import {
  IMPOSTOR_ATLAS_POLICY,
  impostorAtlasInput,
  packImpostorAtlas,
  impostorAtlasContentHash,
  loadImpostorAtlas,
  type ImpostorAtlasArtifact,
  type ImpostorAtlasData,
} from "../../src/impostorAtlas";
import { createSoldierImpostorAtlas } from "../../../photoreal-renderer/src/battle/impostorLayer";
import { prepareSoldierSurface } from "../../../photoreal-renderer/src/battle/soldierSurface";
import { captureMipChain } from "./capture";

const renderer = new THREE.WebGPURenderer({ antialias: false, reversedDepthBuffer: true });
renderer.setPixelRatio(1);
let cached: { id: number; bundle: Awaited<ReturnType<typeof loadAppearanceBundle>> } | undefined;
async function bundleFor(id: number) {
  if (cached?.id === id) return cached.bundle;
  const catalogUrl = new URL("/assets/soldiers/catalog.json", location.href);
  const response = await fetch(catalogUrl);
  if (!response.ok) throw Error(`Appearance catalog HTTP ${response.status}`);
  const catalog: AppearanceCatalog = await response.json();
  if (!catalog.appearances[id]) throw Error(`Missing appearance ${id}`);
  const bundle = await loadAppearanceBundle(new URL(catalog.appearances[id], catalogUrl).href);
  cached = { id, bundle };
  return bundle;
}
async function bake(id: number) {
  await renderer.init();
  const bundle = await bundleFor(id),
    { palette, inputHash } = await impostorAtlasInput(bundle);
  const surface = await prepareSoldierSurface(renderer, bundle.surface);
  try {
    const atlas = await createSoldierImpostorAtlas(renderer, bundle.farMesh, palette, surface);
    try {
      const data: ImpostorAtlasData = {
        columns: atlas.columns,
        rows: atlas.rows,
        tileSize: atlas.tileSize,
        center: [atlas.center.x, atlas.center.y, atlas.center.z],
        worldSpan: atlas.worldSpan,
        albedo: await captureMipChain(renderer, atlas.textures.albedo),
        normal: await captureMipChain(renderer, atlas.textures.normal),
        orm: await captureMipChain(renderer, atlas.textures.orm),
      };
      const bytes = packImpostorAtlas(data),
        contentHash = await impostorAtlasContentHash(data, bytes);
      const artifact: ImpostorAtlasArtifact = {
        columns: data.columns,
        rows: data.rows,
        tileSize: data.tileSize,
        center: data.center,
        worldSpan: data.worldSpan,
        inputHash,
        contentHash,
        policy: IMPOSTOR_ATLAS_POLICY.revision,
        payload: `${contentHash}.atlas`,
      };
      return { artifact, bytes };
    } finally {
      atlas.dispose();
    }
  } finally {
    surface.dispose();
  }
}
async function snapshot(artifact: ImpostorAtlasArtifact, bytes: Uint8Array<ArrayBuffer>) {
  const compressed = new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  let binary = "";
  for (let i = 0; i < compressed.length; i += 16384)
    binary += String.fromCharCode(...compressed.subarray(i, i + 16384));
  return {
    artifact,
    gzip: btoa(binary),
    decodedBytes: bytes.length,
    compressedBytes: compressed.length,
  };
}
Object.assign(window, {
  __atlasAuthor: {
    async input(id: number) {
      return (await impostorAtlasInput(await bundleFor(id))).inputHash;
    },
    async bake(id: number) {
      const { artifact, bytes } = await bake(id);
      return snapshot(artifact, bytes);
    },
    async verify(id: number, url: string, rebake: boolean) {
      const loaded = await loadImpostorAtlas(url, await bundleFor(id)),
        bytes = packImpostorAtlas(loaded);
      if (!rebake) return { id, decodedBytes: bytes.length, verifiedFreshSource: false };
      const fresh = await bake(id),
        storedHash = await impostorAtlasContentHash(loaded, bytes);
      const perMip = [];
      let offset = 0;
      for (const channel of ["albedo", "normal", "orm"] as const)
        for (const [mip, values] of loaded[channel].entries()) {
          let differingBytes = 0,
            maxByteDifference = 0,
            alphaDifferences = 0;
          const first = [];
          const width = Math.max(1, (loaded.columns * loaded.tileSize) >> mip);
          for (let i = 0; i < values.length; i++)
            if (values[i] !== fresh.bytes[offset + i]) {
              differingBytes++;
              maxByteDifference = Math.max(
                maxByteDifference,
                Math.abs(values[i] - fresh.bytes[offset + i]),
              );
              if (i % 4 === 3) alphaDifferences++;
              if (first.length < 16)
                first.push({
                  x: Math.floor(i / 4) % width,
                  y: Math.floor(i / 4 / width),
                  component: i % 4,
                  stored: values[i],
                  fresh: fresh.bytes[offset + i],
                });
            }
          perMip.push({ channel, mip, differingBytes, maxByteDifference, alphaDifferences, first });
          offset += values.length;
        }
      const exact = storedHash === fresh.artifact.contentHash;
      return {
        id,
        decodedBytes: bytes.length,
        verifiedFreshSource: exact,
        sourceComparison: {
          exact,
          inputHash: fresh.artifact.inputHash,
          storedHash,
          freshHash: fresh.artifact.contentHash,
          storedCenter: loaded.center,
          freshCenter: fresh.artifact.center,
          storedSpan: loaded.worldSpan,
          freshSpan: fresh.artifact.worldSpan,
          perMip,
        },
        fresh: exact ? null : await snapshot(fresh.artifact, fresh.bytes),
      };
    },
    dispose() {
      renderer.dispose();
      cached = undefined;
    },
  },
});
