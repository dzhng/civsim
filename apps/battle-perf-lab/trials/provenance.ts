import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type TrialBackend = "three" | "raw" | "typegpu" | "vgpu";
export const TRIAL_BACKENDS: readonly TrialBackend[] = ["three", "raw", "typegpu", "vgpu"];

/** One file exactly as the fixed-build manifest recorded it. */
export interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ManifestBuild {
  backend: string;
  outDir: string;
  buildSha256: string;
  configPath: string;
  configSha256: string;
  artifactFiles: ManifestFile[];
}

export interface FixedBuildManifest {
  kind: string;
  version: number;
  commit: string;
  trackedDirtyDiffSha256: string | null;
  lockfileSha256: string;
  wasmSha256: string;
  atlasCatalogUrl: string;
  sharedPublic: string;
  sharedAtlas: string;
  builds: ManifestBuild[];
  sharedAssetFiles: ManifestFile[];
  sharedAssetsSha256: string;
}

export interface FetchedResource {
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
}
export type FetchResource = (url: string) => Promise<FetchedResource>;

export interface ProvenanceOptions {
  backend: TrialBackend;
  manifestPath: string;
  url: string;
  renderConfigPath: string;
}

export interface VerifiedFileGroup {
  total: number;
  verified: number;
  bytes: number;
  mismatches: string[];
}

export interface ProvenanceReport {
  ok: boolean;
  issues: string[];
  backend: TrialBackend;
  manifestPath: string;
  manifestSha256: string;
  commit: string;
  dirtyDiffSha256: string | null;
  buildSha256: string;
  configSha256: string;
  dependenciesSha256: string;
  assetsSha256: string;
  wasmSha256: string;
  outDir: string;
  renderConfigPath: string;
  artifacts: VerifiedFileGroup;
  sharedAssets: VerifiedFileGroup;
  served: {
    url: string;
    indexSha256: string | null;
    atlasCatalogSha256: string | null;
    isolationHeaders: Record<string, string | null>;
  };
}

/** Streams 1 MiB at a time so a multi-gigabyte asset tree never lands in memory. */
const READ_CHUNK_BYTES = 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/i;
const ISOLATION_HEADERS = ["cross-origin-opener-policy", "cross-origin-embedder-policy"];

/**
 * Reproduces the fixed-build generator's digest of a recorded file list:
 * `sha256(json.dumps(files, sort_keys=True, separators=(',', ':')))`.
 */
export function fileListSha256(files: ManifestFile[]): string {
  const canonical = files.map((file) =>
    Object.fromEntries(
      (Object.keys(file) as (keyof ManifestFile)[]).sort().map((key) => [key, file[key]]),
    ),
  );
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Hashes one file without materializing it, refusing anything longer than the
 * recorded size so a swapped larger artifact cannot be read unbounded.
 */
export async function hashFileStreaming(
  path: string,
  expectedBytes: number,
): Promise<{ sha256: string; bytes: number } | { error: string }> {
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    const stream = createReadStream(path, { highWaterMark: READ_CHUNK_BYTES });
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > expectedBytes) {
        stream.destroy();
        return { error: `larger than the recorded ${expectedBytes} bytes` };
      }
      hash.update(chunk);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  if (bytes !== expectedBytes) return { error: `read ${bytes} of ${expectedBytes} bytes` };
  return { sha256: hash.digest("hex"), bytes };
}

async function verifyGroup(
  files: ManifestFile[],
  resolve: (file: ManifestFile) => string | null,
  budget: { remaining: number },
): Promise<VerifiedFileGroup> {
  const group: VerifiedFileGroup = { total: files.length, verified: 0, bytes: 0, mismatches: [] };
  for (const file of files) {
    if (file.bytes > budget.remaining) {
      group.mismatches.push(`${file.path}: exceeds the remaining read budget`);
      break;
    }
    const path = resolve(file);
    if (path === null) {
      group.mismatches.push(`${file.path}: no shared tree owns that path prefix`);
      continue;
    }
    const result = await hashFileStreaming(path, file.bytes);
    if ("error" in result) {
      group.mismatches.push(`${file.path}: ${result.error}`);
      continue;
    }
    budget.remaining -= result.bytes;
    group.bytes += result.bytes;
    if (result.sha256 !== file.sha256) {
      group.mismatches.push(`${file.path}: sha256 ${result.sha256} != ${file.sha256}`);
      continue;
    }
    group.verified += 1;
  }
  return group;
}

/** Shared files are recorded under a tree prefix rather than an absolute path. */
function sharedAssetPath(manifest: FixedBuildManifest, file: ManifestFile): string | null {
  const separator = file.path.indexOf("/");
  const roots: Record<string, string | undefined> = {
    public: manifest.sharedPublic,
    atlas: manifest.sharedAtlas,
  };
  const root = roots[file.path.slice(0, separator)];
  return root === undefined ? null : join(root, file.path.slice(separator + 1));
}

/**
 * Establishes that this trial will run the recorded fixed build over the
 * recorded shared assets, before any browser or timing work begins.
 */
export async function verifyProvenance(
  options: ProvenanceOptions,
  fetchResource: FetchResource,
): Promise<ProvenanceReport> {
  const issues: string[] = [];
  const manifestBytes = await readFile(options.manifestPath);
  const manifest = JSON.parse(manifestBytes.toString()) as FixedBuildManifest;
  if (manifest.kind !== "fixed-menu-production-builds" || manifest.version !== 1)
    issues.push(`unsupported build manifest ${manifest.kind}/${manifest.version}`);
  const build = manifest.builds?.find((entry) => entry.backend === options.backend);
  if (!build) throw Error(`build manifest has no ${options.backend} build`);

  const renderConfig = await stat(options.renderConfigPath).catch(() => null);
  const renderConfigHash = renderConfig
    ? await hashFileStreaming(options.renderConfigPath, renderConfig.size)
    : { error: "not readable" };
  if ("error" in renderConfigHash)
    issues.push(`render configuration declaration: ${renderConfigHash.error}`);

  const recordedBuild = fileListSha256(build.artifactFiles);
  if (recordedBuild !== build.buildSha256)
    issues.push(`recorded build digest disagrees with its own file list (${recordedBuild})`);
  const recordedAssets = fileListSha256(manifest.sharedAssetFiles);
  if (recordedAssets !== manifest.sharedAssetsSha256)
    issues.push(
      `recorded shared-asset digest disagrees with its own file list (${recordedAssets})`,
    );
  for (const [name, value] of [
    ["lockfileSha256", manifest.lockfileSha256],
    ["wasmSha256", manifest.wasmSha256],
  ] as const)
    if (!SHA256.test(String(value))) issues.push(`build manifest ${name} is not SHA-256`);

  // A ceiling on the whole sweep, not a tunable: a manifest that declares far
  // more than a real asset tree must fail fast rather than stall the operator
  // who is holding the GPU for the run that follows.
  const budget = { remaining: 8 * 1024 ** 3 };
  const artifacts = await verifyGroup(
    build.artifactFiles,
    (file) => join(build.outDir, file.path),
    budget,
  );
  const sharedAssets = await verifyGroup(
    manifest.sharedAssetFiles,
    (file) => sharedAssetPath(manifest, file),
    budget,
  );
  for (const [name, group] of [
    ["build artifact", artifacts],
    ["shared asset", sharedAssets],
  ] as const)
    if (group.mismatches.length)
      issues.push(
        `${group.mismatches.length} ${name} mismatch(es): ${group.mismatches.slice(0, 3).join("; ")}`,
      );

  const served = {
    url: options.url,
    indexSha256: null as string | null,
    atlasCatalogSha256: null as string | null,
    isolationHeaders: {} as Record<string, string | null>,
  };
  const unreachable = (): FetchedResource => ({ status: 0, headers: {}, bytes: new Uint8Array() });
  const base = options.url.endsWith("/") ? options.url : `${options.url}/`;
  const index = await fetchResource(base).catch(unreachable);
  if (index.status !== 200) issues.push(`served ${base} returned status ${index.status}`);
  else {
    served.indexSha256 = sha256Bytes(index.bytes);
    const recorded = build.artifactFiles.find((file) => file.path === "index.html");
    if (!recorded) issues.push("build manifest has no index.html entry");
    else if (recorded.sha256 !== served.indexSha256)
      issues.push(`served index.html is not the ${options.backend} fixed build`);
    for (const header of ISOLATION_HEADERS)
      served.isolationHeaders[header] = index.headers[header] ?? null;
    if (served.isolationHeaders["cross-origin-opener-policy"] !== "same-origin")
      issues.push("served index.html lost its cross-origin isolation opener header");
    if (served.isolationHeaders["cross-origin-embedder-policy"] !== "require-corp")
      issues.push("served index.html lost its cross-origin isolation embedder header");
  }
  const catalogUrl = new URL(manifest.atlasCatalogUrl, base).href;
  const catalog = await fetchResource(catalogUrl).catch(unreachable);
  if (catalog.status !== 200) issues.push(`served ${catalogUrl} returned status ${catalog.status}`);
  else {
    served.atlasCatalogSha256 = sha256Bytes(catalog.bytes);
    const recorded = manifest.sharedAssetFiles.find((file) => file.path === "atlas/catalog.json");
    if (!recorded) issues.push("build manifest has no atlas catalog entry");
    else if (recorded.sha256 !== served.atlasCatalogSha256)
      issues.push("served atlas catalog is not the verified appearance atlas");
  }

  return {
    ok: issues.length === 0,
    issues,
    backend: options.backend,
    manifestPath: options.manifestPath,
    manifestSha256: sha256Bytes(manifestBytes),
    commit: manifest.commit,
    dirtyDiffSha256: manifest.trackedDirtyDiffSha256,
    buildSha256: build.buildSha256,
    configSha256: "error" in renderConfigHash ? "" : renderConfigHash.sha256,
    dependenciesSha256: manifest.lockfileSha256,
    assetsSha256: manifest.sharedAssetsSha256,
    wasmSha256: manifest.wasmSha256,
    outDir: build.outDir,
    renderConfigPath: options.renderConfigPath,
    artifacts,
    sharedAssets,
    served,
  };
}
