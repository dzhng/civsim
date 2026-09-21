// @vitest-environment node
import { expect, test } from "vitest";
import {
  IMPOSTOR_ATLAS_POLICY,
  impostorAtlasContentHash,
  packImpostorAtlas,
  readImpostorAtlas,
  type ImpostorAtlasData,
} from "@packages/soldier-assets/src/impostorAtlas";

test("offline property payload preserves channel and mip bytes and rejects stale or damaged data", async () => {
  const chain = (channel: number) => {
    const mips: Uint8Array[] = [];
    for (
      let width = 768, height = 768, level = 0;
      ;
      width = Math.max(1, width >> 1), height = Math.max(1, height >> 1), level++
    ) {
      const bytes = new Uint8Array(width * height * 4);
      bytes[0] = channel * 50 + level;
      bytes[bytes.length - 1] = 200 - level;
      mips.push(bytes);
      if (width === 1 && height === 1) return mips;
    }
  };
  const data: ImpostorAtlasData = {
    ...IMPOSTOR_ATLAS_POLICY,
    center: [0.1, 0.2, 0.3],
    worldSpan: 4,
    albedo: chain(1),
    normal: chain(2),
    orm: chain(3),
  };
  const bytes = packImpostorAtlas(data);
  const artifact = {
    ...IMPOSTOR_ATLAS_POLICY,
    center: data.center,
    worldSpan: data.worldSpan,
    policy: IMPOSTOR_ATLAS_POLICY.revision,
    inputHash: "expected",
    contentHash: await impostorAtlasContentHash(data, bytes),
    payload: "atlas.bin.gz",
  };
  const result = await readImpostorAtlas(artifact, bytes, "expected");
  expect(result.center).toEqual([0.1, 0.2, 0.3]);
  expect(result.worldSpan).toBe(4);
  for (const [c, name] of ["albedo", "normal", "orm"].entries()) {
    const mips = result[name as "albedo" | "normal" | "orm"];
    expect(mips[0][0]).toBe((c + 1) * 50);
    expect(mips.at(-1)).toEqual(new Uint8Array([(c + 1) * 50 + 9, 0, 0, 191]));
  }
  await expect(readImpostorAtlas(artifact, bytes, "changed")).rejects.toThrow("Stale");
  await expect(
    readImpostorAtlas({ ...artifact, policy: "obsolete" }, bytes, "expected"),
  ).rejects.toThrow("Stale");
  await expect(
    readImpostorAtlas({ ...artifact, center: [1, 2, 3] }, bytes, "expected"),
  ).rejects.toThrow("digest");
  bytes[100] ^= 1;
  await expect(readImpostorAtlas(artifact, bytes, "expected")).rejects.toThrow("digest");
  expect(() => packImpostorAtlas({ ...data, normal: data.normal.slice(1) })).toThrow("Incomplete");
});

test("cache identity follows posed geometry, authored properties and image bytes", async () => {
  const { readFile } = await import("node:fs/promises");
  const { vi } = await import("vitest");
  const { loadAppearanceBundle } = await import("@packages/soldier-assets/src/appearanceBundle");
  const { impostorAtlasInput, loadImpostorAtlas } =
    await import("@packages/soldier-assets/src/impostorAtlas");
  const catalogUrl = new URL("../public/assets/soldiers/catalog.json", import.meta.url);
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
  vi.stubGlobal("fetch", async (url: string | URL) => new Response(await readFile(new URL(url))));
  try {
    const bundle = await loadAppearanceBundle(new URL(catalog.appearances[3], catalogUrl).href);
    const original = (await impostorAtlasInput(bundle)).inputHash;
    bundle.manifest.name = "display name only";
    expect((await impostorAtlasInput(bundle)).inputHash).toBe(original);
    const p = bundle.farMesh.positions[0];
    bundle.farMesh.positions[0] = p + 0.125;
    expect((await impostorAtlasInput(bundle)).inputHash).not.toBe(original);
    bundle.farMesh.positions[0] = p;
    const r = bundle.surface.materials[0].roughness;
    bundle.surface.materials[0].roughness = r === 0 ? 1 : 0;
    expect((await impostorAtlasInput(bundle)).inputHash).not.toBe(original);
    bundle.surface.materials[0].roughness = r;
    const image = Object.values(bundle.surface.textures)[0]!.image;
    image[0] ^= 1;
    expect((await impostorAtlasInput(bundle)).inputHash).not.toBe(original);
    image[0] ^= 1;
    expect((await impostorAtlasInput(bundle)).inputHash).toBe(original);
    const { gzipSync } = await import("node:zlib");
    const oversized = gzipSync(new Uint8Array(16 * 1024 * 1024));
    vi.stubGlobal("fetch", async (url: string | URL) =>
      String(url).endsWith(".gz")
        ? new Response(oversized)
        : new Response(
            JSON.stringify({
              ...IMPOSTOR_ATLAS_POLICY,
              policy: IMPOSTOR_ATLAS_POLICY.revision,
              inputHash: original,
              contentHash: "unused",
              payload: "payload.gz",
              center: [0, 0, 0],
              worldSpan: 1,
            }),
          ),
    );
    await expect(loadImpostorAtlas("https://atlas.test/manifest.json", bundle)).rejects.toThrow(
      "exceeds expected byte count",
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

test("typed texture uploads isolate packed views while preserving exact buffer bytes", async () => {
  const { typegpuTextureBytes } =
    await import("../../packages/battle-renderer/src/world/textureUpload");
  const packed = new Uint8Array([9, 8, 7, 6, 5, 4]);
  const slice = typegpuTextureBytes(packed.subarray(2, 5));
  expect([...new Uint8Array(slice.buffer)]).toEqual([7, 6, 5]);
  expect(typegpuTextureBytes(packed).buffer).toBe(packed.buffer);
  const half = new Uint16Array([0x1234, 0x5678]);
  expect([...typegpuTextureBytes(half)]).toEqual([...new Uint8Array(half.buffer)]);
});
