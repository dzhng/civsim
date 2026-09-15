import { createHash } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileListSha256 } from "./digest.ts";
import type { FetchedResponse, FetchLimits } from "./provenance.ts";

export const fixtureSha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Mirrors the real seam: small chunks, stopping one chunk past the caller's
 * limit, and recording how far it actually read.
 */
async function* chunks(bytes: Uint8Array, maxBytes: number, read: { bytes: number }) {
  for (let offset = 0; offset < bytes.byteLength; offset += 8) {
    const chunk = bytes.subarray(offset, offset + 8);
    read.bytes += chunk.byteLength;
    yield chunk;
    if (read.bytes > maxBytes) return;
  }
}

export interface ServedResource {
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
}

/**
 * Writes the smallest tree with the shape the fixed-build generator emits: one
 * build output directory holding an index and an emitted bundle, the shared
 * public/atlas trees it links to, and a server that returns those same bytes.
 * Tests mutate one piece at a time to exercise a single provenance failure.
 */
export async function writeFixedBuildFixture(root: string) {
  const outDir = join(root, "raw");
  const publicDir = join(root, "shared-public");
  const atlasDir = join(root, "shared-atlas");
  await mkdir(join(outDir, "assets"), { recursive: true });
  await mkdir(join(publicDir, "fonts"), { recursive: true });
  await mkdir(atlasDir, { recursive: true });
  const index = "<html>fixed</html>";
  const bundle = "console.log('fixed menu bundle')";
  const font = "font-bytes";
  const catalog = '{"appearances":{"0":"a.json"}}';
  await writeFile(join(outDir, "index.html"), index);
  await writeFile(join(outDir, "assets", "menu-a1b2c3.js"), bundle);
  await writeFile(join(publicDir, "fonts", "Cinzel.ttf"), font);
  await writeFile(join(atlasDir, "catalog.json"), catalog);
  // How the served build reaches the shared trees, and the only evidence that
  // the locally hashed bytes are the ones the server hands out.
  await symlink(atlasDir, join(outDir, "benchmark-atlas"));
  await symlink(join(publicDir, "fonts"), join(outDir, "fonts"));

  const artifactFiles = [
    { path: "index.html", bytes: index.length, sha256: fixtureSha256(index) },
    { path: "assets/menu-a1b2c3.js", bytes: bundle.length, sha256: fixtureSha256(bundle) },
  ];
  const sharedAssetFiles = [
    { path: "public/fonts/Cinzel.ttf", bytes: font.length, sha256: fixtureSha256(font) },
    { path: "atlas/catalog.json", bytes: catalog.length, sha256: fixtureSha256(catalog) },
  ];
  const manifest = {
    kind: "fixed-menu-production-builds",
    version: 1,
    commit: "a".repeat(40),
    trackedDirtyDiffSha256: null,
    lockfileSha256: "d".repeat(64),
    wasmSha256: "f".repeat(64),
    atlasCatalogUrl: "/benchmark-atlas/catalog.json",
    sharedPublic: publicDir,
    sharedAtlas: atlasDir,
    builds: [
      {
        backend: "raw",
        outDir,
        configPath: join(root, "native.config.mts"),
        configSha256: "c".repeat(64),
        artifactFiles,
        buildSha256: fileListSha256(artifactFiles),
      },
    ],
    sharedAssetFiles,
    sharedAssetsSha256: fileListSha256(sharedAssetFiles),
  };
  const manifestPath = join(root, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  const renderConfigPath = join(root, "render-config.json");
  // What the operator declares the fixed build compiled in, in the shape the
  // Menu recording reports its own settings.
  const renderConfig = JSON.stringify({
    graphics: { shadows: "single", grassQuality: "standard", grass: true, bloom: true },
  });
  await writeFile(renderConfigPath, renderConfig);

  const isolation = {
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
  };
  const encode = (text: string) => new TextEncoder().encode(text);
  const served = new Map<string, ServedResource>([
    ["http://fixed.test/", { status: 200, headers: isolation, bytes: encode(index) }],
    [
      "http://fixed.test/assets/menu-a1b2c3.js",
      { status: 200, headers: isolation, bytes: encode(bundle) },
    ],
    [
      "http://fixed.test/benchmark-atlas/catalog.json",
      { status: 200, headers: isolation, bytes: encode(catalog) },
    ],
  ]);
  /** What each request was allowed to read and what it read, for the bound tests. */
  const requested: { url: string; limits: FetchLimits; read: { bytes: number } }[] = [];
  const fetchResource = async (url: string, limits: FetchLimits): Promise<FetchedResponse> => {
    const read = { bytes: 0 };
    requested.push({ url, limits, read });
    const resource = served.get(url) ?? { status: 404, headers: {}, bytes: new Uint8Array() };
    return {
      status: resource.status,
      headers: resource.headers,
      body: chunks(resource.bytes, limits.maxBytes, read),
    };
  };

  return {
    index,
    bundle,
    catalog,
    renderConfig,
    manifest,
    manifestPath,
    renderConfigPath,
    outDir,
    publicDir,
    atlasDir,
    served,
    requested,
    fetchResource,
    options: {
      backend: "raw" as const,
      manifestPath,
      url: "http://fixed.test/",
      renderConfigPath,
    },
  };
}
