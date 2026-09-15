import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileListSha256, type FetchedResource } from "./provenance.ts";

export const fixtureSha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Writes the smallest tree with the shape the fixed-build generator emits: one
 * build output directory plus the shared public/atlas trees it links, and a
 * server that returns those same bytes. Tests mutate one piece at a time to
 * exercise a single provenance failure.
 */
export async function writeFixedBuildFixture(root: string) {
  const outDir = join(root, "raw");
  const publicDir = join(root, "shared-public");
  const atlasDir = join(root, "shared-atlas");
  await mkdir(outDir, { recursive: true });
  await mkdir(join(publicDir, "fonts"), { recursive: true });
  await mkdir(atlasDir, { recursive: true });
  const index = "<html>fixed</html>";
  const font = "font-bytes";
  const catalog = '{"appearances":{"0":"a.json"}}';
  await writeFile(join(outDir, "index.html"), index);
  await writeFile(join(publicDir, "fonts", "Cinzel.ttf"), font);
  await writeFile(join(atlasDir, "catalog.json"), catalog);

  const artifactFiles = [{ path: "index.html", bytes: index.length, sha256: fixtureSha256(index) }];
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
  const renderConfig = '{"shadowResolution":2048}';
  await writeFile(renderConfigPath, renderConfig);

  const isolation = {
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
  };
  const encode = (text: string) => new TextEncoder().encode(text);
  const served = new Map<string, FetchedResource>([
    ["http://fixed.test/", { status: 200, headers: isolation, bytes: encode(index) }],
    [
      "http://fixed.test/benchmark-atlas/catalog.json",
      { status: 200, headers: isolation, bytes: encode(catalog) },
    ],
  ]);
  const fetchResource = async (url: string): Promise<FetchedResource> =>
    served.get(url) ?? { status: 404, headers: {}, bytes: new Uint8Array() };

  return {
    index,
    catalog,
    renderConfig,
    manifestPath,
    renderConfigPath,
    publicDir,
    atlasDir,
    served,
    fetchResource,
    options: {
      backend: "raw" as const,
      manifestPath,
      url: "http://fixed.test/",
      renderConfigPath,
    },
  };
}
