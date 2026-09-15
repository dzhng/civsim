import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  fileListSha256,
  hashBounded,
  hashFileStreaming,
  onDisk,
  recordedSize,
  sha256Bytes,
  verifyFiles,
  type Digest,
  type ManifestFile,
  type VerifiedFileGroup,
} from "./digest.ts";

export type TrialBackend = "three" | "raw" | "typegpu" | "vgpu";
export const TRIAL_BACKENDS: readonly TrialBackend[] = ["three", "raw", "typegpu", "vgpu"];

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

export interface FetchLimits {
  /** The seam must stop reading past this; the digest refuses anything over it. */
  maxBytes: number;
  timeoutMs: number;
}
export interface FetchedResponse {
  status: number;
  headers: Record<string, string>;
  /** Body chunks, never materialized whole. */
  body: AsyncIterable<Uint8Array>;
}
export type FetchResource = (url: string, limits: FetchLimits) => Promise<FetchedResponse>;

export interface ProvenanceOptions {
  backend: TrialBackend;
  manifestPath: string;
  url: string;
  renderConfigPath: string;
}

/**
 * How a served path reaches the tree whose digests were verified on disk.
 * Shared assets are gigabytes, so they are hashed locally; this mapping is the
 * evidence that the local tree is the one the server hands out.
 */
export interface SharedTreeMapping {
  /** The served path, as the browser asks for it. */
  urlPath: string;
  /** Where the build's own output directory reaches it. */
  servedFrom: string;
  /** What that path resolves to, or nothing when it does not exist. */
  resolvedTo: string | null;
  /** The declared tree the recorded digests under it were taken from. */
  hashedTree: string;
  linked: boolean;
  /** How many recorded shared files this one link stands in for. */
  recordedFiles: number;
}

/**
 * The operator's declaration of what the fixed build compiled in. Its bytes
 * become `configSha256`; on their own they verify nothing, so the declared
 * graphics are compared against the recording's own identity.
 */
export interface RenderConfigDeclaration {
  path: string;
  sha256: string;
  graphics: Record<string, unknown> | null;
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
  renderConfig: RenderConfigDeclaration;
  artifacts: VerifiedFileGroup;
  sharedAssets: VerifiedFileGroup;
  served: {
    url: string;
    indexSha256: string | null;
    atlasCatalogSha256: string | null;
    isolationHeaders: Record<string, string | null>;
    /** The emitted JS/WASM/CSS the server actually hands out, not just its index. */
    artifacts: VerifiedFileGroup;
    sharedTrees: SharedTreeMapping[];
  };
}

const SHA256 = /^[a-f0-9]{64}$/i;
const isFileList = (value: unknown) =>
  Array.isArray(value) && value.every((file) => typeof file?.path === "string");
const ISOLATION_HEADERS = ["cross-origin-opener-policy", "cross-origin-embedder-policy"];
/**
 * Ceilings on the whole sweep, not tunables: a manifest that declares far more
 * than a real build must fail fast rather than stall the operator holding the
 * GPU. The served ceiling is the smaller one because those bytes cross HTTP and
 * only cover the emitted build output, never the shared asset trees.
 */
const LOCAL_READ_BUDGET_BYTES = 8 * 1024 ** 3;
const SERVED_READ_BUDGET_BYTES = 512 * 1024 ** 2;
const SERVED_TIMEOUT_MS = 20_000;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A response that carried nothing to read. */
export async function* emptyBody(): AsyncGenerator<Uint8Array> {}

/**
 * Releases a body we will not hash, so the connection does not leak, and
 * reports what that cost — those bytes crossed the wire like any other.
 */
async function discardBody(body: AsyncIterable<Uint8Array>): Promise<number> {
  for await (const chunk of body) return chunk.length;
  return 0;
}

/** One bounded served read: the limit is set before the request is made. */
async function fetchFile(
  url: string,
  recorded: ManifestFile,
  readLimitBytes: number,
  fetchResource: FetchResource,
): Promise<{ headers: Record<string, string>; digest: Digest }> {
  const size = recordedSize(recorded.bytes);
  if (size === null)
    return {
      headers: {},
      digest: { bytes: 0, error: `recorded size ${recorded.bytes} is not a byte count` },
    };
  const limit = Math.min(size, Math.max(0, readLimitBytes));
  let response: FetchedResponse;
  try {
    // One past the limit, so a longer body always reveals itself as longer
    // instead of being silently truncated to a matching prefix.
    response = await fetchResource(url, { maxBytes: limit + 1, timeoutMs: SERVED_TIMEOUT_MS });
  } catch (error) {
    return { headers: {}, digest: { bytes: 0, error: `unreachable: ${message(error)}` } };
  }
  if (response.status !== 200) {
    const discarded = await discardBody(response.body).catch(() => 0);
    return {
      headers: response.headers,
      digest: { bytes: discarded, error: `returned status ${response.status}` },
    };
  }
  return {
    headers: response.headers,
    digest: await hashBounded(() => response.body, recorded.bytes, readLimitBytes),
  };
}

/**
 * One recorded shared file seen from both sides: the path the build serves it
 * from, and the path it was hashed at. The public tree is copied to the site
 * root, so each of its top-level entries is served from there; the atlas hangs
 * off the prefix its catalog URL declares. Both sides are derived here together,
 * so the served path and the hashed path can never be resolved by drifting rules.
 */
interface SharedBranch {
  servedRoot: string;
  hashedRoot: string;
  /** Segments below both roots — every one of them a possible link. */
  tail: string[];
}

/** Shared files are recorded under a tree prefix rather than an absolute path. */
function sharedBranch(
  manifest: FixedBuildManifest,
  build: ManifestBuild,
  file: ManifestFile,
): SharedBranch | null {
  const [root, ...tail] = file.path.split("/");
  if (root === "atlas") {
    const segment = firstSegment(manifest.atlasCatalogUrl);
    return segment === null
      ? null
      : { servedRoot: join(build.outDir, segment), hashedRoot: manifest.sharedAtlas, tail };
  }
  if (root === "public" && tail.length > 0)
    return {
      servedRoot: join(build.outDir, tail[0]),
      hashedRoot: join(manifest.sharedPublic, tail[0]),
      tail: tail.slice(1),
    };
  return null;
}

const servedAt = (branch: SharedBranch, depth: number) =>
  join(branch.servedRoot, ...branch.tail.slice(0, depth));
const hashedAt = (branch: SharedBranch, depth: number) =>
  join(branch.hashedRoot, ...branch.tail.slice(0, depth));

const servedUrl = (base: string, path: string) =>
  new URL(path.split("/").map(encodeURIComponent).join("/"), base).href;

const realpathOrNull = (path: string) => realpath(path).catch(() => null);

function firstSegment(url: string): string | null {
  try {
    return new URL(url, "http://trial.invalid/").pathname.split("/").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

/** One `lstat` per served path, however many recorded files walk through it. */
function linkProbe(): (path: string) => Promise<boolean> {
  const probed = new Map<string, Promise<boolean>>();
  return (path) => {
    let isLink = probed.get(path);
    if (!isLink) {
      isLink = lstat(path).then(
        (info) => info.isSymbolicLink(),
        () => false,
      );
      probed.set(path, isLink);
    }
    return isLink;
  };
}

/** The shallowest step of a branch the build actually linked, if it linked one. */
async function linkedDepth(
  branch: SharedBranch,
  isLink: (path: string) => Promise<boolean>,
): Promise<number | null> {
  for (let depth = 0; depth <= branch.tail.length; depth += 1)
    if (await isLink(servedAt(branch, depth))) return depth;
  return null;
}

/**
 * Which served paths stand in for which hashed tree, read off the links the
 * build actually made rather than assumed to sit at the top of each prefix: a
 * Vite build emits its own `assets/` directory and links shared subtrees inside
 * it, so that prefix is a real directory and only the subtree below it is a
 * link. Every recorded shared file is walked down to the shallowest link above
 * it; one that reaches no link at all is attributed to the prefix it should have
 * been served through, so it is rejected there rather than going unexamined.
 */
async function mapSharedTrees(
  manifest: FixedBuildManifest,
  build: ManifestBuild,
): Promise<SharedTreeMapping[]> {
  const isLink = linkProbe();
  const found: (Omit<SharedTreeMapping, "urlPath" | "resolvedTo" | "linked"> & {
    /** A link with recorded files below it is a tree; one with none is a file. */
    tree: boolean;
  })[] = [];
  for (const file of manifest.sharedAssetFiles) {
    // A path no shared tree owns is already refused by its own digest.
    const branch = sharedBranch(manifest, build, file);
    if (!branch) continue;
    const depth = (await linkedDepth(branch, isLink)) ?? 0;
    const servedFrom = servedAt(branch, depth);
    const hashedTree = hashedAt(branch, depth);
    // Matched on both ends, so one served path that two shared trees each claim
    // stays two mappings and cannot pass on the strength of either.
    const mapping = found.find(
      (entry) => entry.servedFrom === servedFrom && entry.hashedTree === hashedTree,
    );
    if (mapping) mapping.recordedFiles += 1;
    else found.push({ servedFrom, hashedTree, tree: depth < branch.tail.length, recordedFiles: 1 });
  }
  return Promise.all(
    found.map(async ({ tree, ...mapping }) => {
      const [resolvedTo, hashedTree] = await Promise.all([
        realpathOrNull(mapping.servedFrom),
        realpathOrNull(mapping.hashedTree),
      ]);
      return {
        ...mapping,
        urlPath: `/${relative(build.outDir, mapping.servedFrom)}${tree ? "/" : ""}`,
        resolvedTo,
        linked: resolvedTo !== null && resolvedTo === hashedTree,
      };
    }),
  );
}

/** An object of empty objects declares nothing; only a leaf is a setting. */
function declaresSetting(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  return Object.values(value as Record<string, unknown>).some(declaresSetting);
}

/** The declaration is read as data, because its fields are checked later. */
async function readRenderConfig(path: string, issues: string[]): Promise<RenderConfigDeclaration> {
  const info = await stat(path).catch(() => null);
  const digest = info
    ? await hashFileStreaming(path, info.size)
    : ({ bytes: 0, error: "not readable" } as Digest);
  if ("error" in digest) {
    issues.push(`render configuration declaration: ${digest.error}`);
    return { path, sha256: "", graphics: null };
  }
  let graphics: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    const declared =
      parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const value = declared.graphics;
    if (value && typeof value === "object" && !Array.isArray(value))
      graphics = value as Record<string, unknown>;
  } catch (error) {
    issues.push(`render configuration declaration is not JSON: ${message(error)}`);
    return { path, sha256: digest.sha256, graphics: null };
  }
  // An unchecked declaration is the defect this file exists to avoid, so a
  // `graphics` object that compares against nothing is no better than none.
  const unusable = !graphics
    ? "has no `graphics` object"
    : declaresSetting(graphics)
      ? null
      : "declares no graphics settings";
  if (unusable) {
    issues.push(`render configuration declaration ${unusable} to check the recording against`);
    return { path, sha256: digest.sha256, graphics: null };
  }
  return { path, sha256: digest.sha256, graphics };
}

/**
 * Names the manifest fields the sweep resolves its paths and file lists from.
 * Without this a field the producer left out only surfaces far inside `join` as
 * "path must be of type string", which says nothing about which field is absent
 * — and the answer to a manifest missing one is to record it, never to read a
 * second field in its place.
 */
function requireManifestFields(manifest: FixedBuildManifest, build: ManifestBuild): void {
  const absent = (
    [
      ["commit", typeof manifest.commit === "string"],
      ["sharedPublic", typeof manifest.sharedPublic === "string"],
      ["sharedAtlas", typeof manifest.sharedAtlas === "string"],
      ["atlasCatalogUrl", typeof manifest.atlasCatalogUrl === "string"],
      ["sharedAssetFiles", isFileList(manifest.sharedAssetFiles)],
      [`builds[${build.backend}].outDir`, typeof build.outDir === "string"],
      [`builds[${build.backend}].artifactFiles`, isFileList(build.artifactFiles)],
    ] as const
  )
    .filter(([, present]) => !present)
    .map(([field]) => field);
  if (absent.length) throw Error(`build manifest is missing ${absent.join(", ")}`);
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
  requireManifestFields(manifest, build);

  const renderConfig = await readRenderConfig(options.renderConfigPath, issues);

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

  const localBudget = { remaining: LOCAL_READ_BUDGET_BYTES };
  const artifacts = await verifyFiles(
    build.artifactFiles,
    onDisk((file) => join(build.outDir, file.path)),
    localBudget,
  );
  const sharedAssets = await verifyFiles(
    manifest.sharedAssetFiles,
    onDisk((file) => {
      const branch = sharedBranch(manifest, build, file);
      return branch && hashedAt(branch, branch.tail.length);
    }),
    localBudget,
  );

  const base = options.url.endsWith("/") ? options.url : `${options.url}/`;
  const servedBudget = { remaining: SERVED_READ_BUDGET_BYTES };
  const served: ProvenanceReport["served"] = {
    url: options.url,
    indexSha256: null,
    atlasCatalogSha256: null,
    isolationHeaders: {},
    artifacts: { total: 0, verified: 0, bytes: 0, mismatches: [] },
    sharedTrees: await mapSharedTrees(manifest, build),
  };
  for (const mapping of served.sharedTrees)
    if (!mapping.linked)
      issues.push(
        `served ${mapping.urlPath} stands in for ${mapping.recordedFiles} recorded shared file(s)` +
          ` but resolves to ${mapping.resolvedTo ?? "nothing"}, not the hashed shared tree` +
          ` ${mapping.hashedTree}`,
      );

  /**
   * The two resources the browser reaches by a manifest-declared URL rather
   * than by their recorded path, so each is fetched by name and judged here.
   */
  async function verifyEntryPoint(
    entry: string,
    mismatch: string,
    url: string,
    recorded: ManifestFile | undefined,
  ): Promise<{ sha256: string; headers: Record<string, string> } | null> {
    if (!recorded) {
      issues.push(`build manifest has no ${entry} entry`);
      return null;
    }
    const fetched = await fetchFile(url, recorded, servedBudget.remaining, fetchResource);
    servedBudget.remaining -= fetched.digest.bytes;
    if ("error" in fetched.digest) {
      issues.push(`${mismatch}: ${fetched.digest.error}`);
      return null;
    }
    if (fetched.digest.sha256 !== recorded.sha256) issues.push(mismatch);
    return { sha256: fetched.digest.sha256, headers: fetched.headers };
  }

  const index = await verifyEntryPoint(
    "index.html",
    `served index.html is not the ${options.backend} fixed build`,
    base,
    build.artifactFiles.find((file) => file.path === "index.html"),
  );
  if (index) {
    served.indexSha256 = index.sha256;
    for (const header of ISOLATION_HEADERS)
      served.isolationHeaders[header] = index.headers[header] ?? null;
    if (served.isolationHeaders["cross-origin-opener-policy"] !== "same-origin")
      issues.push("served index.html lost its cross-origin isolation opener header");
    if (served.isolationHeaders["cross-origin-embedder-policy"] !== "require-corp")
      issues.push("served index.html lost its cross-origin isolation embedder header");
  }
  const catalog = await verifyEntryPoint(
    "atlas catalog",
    "served atlas catalog is not the verified appearance atlas",
    new URL(manifest.atlasCatalogUrl, base).href,
    manifest.sharedAssetFiles.find((file) => file.path === "atlas/catalog.json"),
  );
  if (catalog) served.atlasCatalogSha256 = catalog.sha256;

  // Every other emitted artifact, from the server rather than from disk: a stale
  // directory can hand out the recorded index beside somebody else's bundles.
  served.artifacts = await verifyFiles(
    build.artifactFiles.filter((file) => file.path !== "index.html"),
    (file, readLimitBytes) =>
      fetchFile(servedUrl(base, file.path), file, readLimitBytes, fetchResource).then(
        (fetched) => fetched.digest,
      ),
    servedBudget,
  );

  for (const [name, group] of [
    ["build artifact", artifacts],
    ["shared asset", sharedAssets],
    ["served build artifact", served.artifacts],
  ] as const)
    if (group.mismatches.length)
      issues.push(
        `${group.mismatches.length} ${name} mismatch(es): ${group.mismatches.slice(0, 3).join("; ")}`,
      );

  return {
    ok: issues.length === 0,
    issues,
    backend: options.backend,
    manifestPath: options.manifestPath,
    manifestSha256: sha256Bytes(manifestBytes),
    commit: manifest.commit,
    dirtyDiffSha256: manifest.trackedDirtyDiffSha256,
    buildSha256: build.buildSha256,
    configSha256: renderConfig.sha256,
    dependenciesSha256: manifest.lockfileSha256,
    assetsSha256: manifest.sharedAssetsSha256,
    wasmSha256: manifest.wasmSha256,
    outDir: build.outDir,
    renderConfig,
    artifacts,
    sharedAssets,
    served,
  };
}
