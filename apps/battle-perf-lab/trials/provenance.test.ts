/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureSha256, writeFixedBuildFixture } from "./fixedBuildFixture.ts";
import { fileListSha256, hashFileStreaming } from "./digest.ts";
import { verifyProvenance } from "./provenance.ts";

const OVERSIZE = 4096;
/** The runner streams a megabyte at a time, so a stop is only visible past one. */
const READ_CHUNK_BYTES = 1024 * 1024;

describe("fixed-build provenance", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "trial-provenance-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("digests a recorded file list the way the fixed-build generator does", () => {
    // Pinned against python `json.dumps(files, sort_keys=True, separators=(',', ':'))`,
    // which is how the fixed builds recorded buildSha256 and sharedAssetsSha256.
    expect(
      fileListSha256([
        { path: "b.js", bytes: 2, sha256: "beef" },
        { path: "a.js", bytes: 1, sha256: "dead" },
      ]),
    ).toBe("bb84205dd5261027130208c0a82a124c9298db0a956a264115ad0143dcfa0021");
  });

  it("streams a file and refuses one that is not the recorded length", async () => {
    const path = join(root, "sample.bin");
    await writeFile(path, "sample");
    expect(await hashFileStreaming(path, 6)).toEqual({ sha256: fixtureSha256("sample"), bytes: 6 });
    expect(await hashFileStreaming(path, 5)).toEqual({
      bytes: 6,
      error: "larger than the recorded 5 bytes",
    });
    expect(await hashFileStreaming(path, 7)).toEqual({ bytes: 6, error: "read 6 of 7 bytes" });
    expect(await hashFileStreaming(join(root, "absent"), 1)).toMatchObject({
      bytes: 0,
      error: expect.stringContaining("ENOENT"),
    });
  });

  it("refuses a recorded size that is not a byte count instead of reading unbounded", async () => {
    const path = join(root, "big.bin");
    await writeFile(path, "x".repeat(OVERSIZE));
    // Without a usable limit there is nothing to stop at, so the read must not
    // start at all rather than run to the end of whatever is on disk.
    for (const size of [Number.NaN, Infinity, -1, 1.5]) {
      const result = await hashFileStreaming(path, size);
      expect(result).toEqual({ bytes: 0, error: `recorded size ${size} is not a byte count` });
    }
  });

  it("stops at the remaining budget and still charges what it read", async () => {
    const path = join(root, "budgeted.bin");
    const size = 3 * READ_CHUNK_BYTES;
    await writeFile(path, "x".repeat(size));
    const result = await hashFileStreaming(path, size, 16);
    expect(result).toMatchObject({ error: "exceeds the remaining 16 byte read budget" });
    // Stopped at the first chunk boundary past the budget, not at the file end.
    expect((result as { bytes: number }).bytes).toBeLessThanOrEqual(16 + READ_CHUNK_BYTES);
    expect((result as { bytes: number }).bytes).toBeLessThan(size);
  });

  it("charges a refused read to the budget so oversized entries cannot read forever", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    // Every shared asset claims a gigabyte; the files on disk are tiny, so each
    // one is read whole before its length is refused.
    manifest.sharedAssetFiles = Array.from({ length: 12 }, () => ({
      path: "public/fonts/Cinzel.ttf",
      bytes: 1024 ** 3,
      sha256: "0".repeat(64),
    }));
    manifest.sharedAssetsSha256 = fileListSha256(manifest.sharedAssetFiles);
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    expect(report.sharedAssets.verified).toBe(0);
    // Ten bytes a file, all of them counted rather than read for free.
    expect(report.sharedAssets.bytes).toBe(12 * "font-bytes".length);
    expect(report.sharedAssets.mismatches).toHaveLength(12);
  });

  it("accepts a build whose artifacts, shared assets and served bytes all match", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.artifacts.verified).toBe(2);
    expect(report.sharedAssets.verified).toBe(2);
    expect(report.served.indexSha256).toBe(fixtureSha256(fixture.index));
    expect(report.served.artifacts).toMatchObject({ total: 1, verified: 1, mismatches: [] });
    expect(report.configSha256).toBe(fixtureSha256(fixture.renderConfig));
    expect(report.renderConfig.graphics).toEqual({
      shadows: "single",
      grassQuality: "standard",
      grass: true,
      bloom: true,
    });
  });

  it("rejects served bundles that are not the emitted artifacts behind a matching index", async () => {
    const fixture = await writeFixedBuildFixture(root);
    // The index is byte-identical; only the bundle it loads was swapped, which
    // is exactly what a stale directory at the same port hands out.
    fixture.served.set("http://fixed.test/assets/menu-a1b2c3.js", {
      status: 200,
      headers: {},
      bytes: new TextEncoder().encode("console.log('other build')"),
    });
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    expect(report.served.indexSha256).toBe(fixtureSha256(fixture.index));
    expect(report.served.artifacts.verified).toBe(0);
    expect(report.issues.join(" ")).toContain("served build artifact mismatch");
    expect(report.issues.join(" ")).toContain("assets/menu-a1b2c3.js");
  });

  it("rejects an emitted artifact the server does not have at all", async () => {
    const fixture = await writeFixedBuildFixture(root);
    fixture.served.delete("http://fixed.test/assets/menu-a1b2c3.js");
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    expect(report.issues.join(" ")).toContain("returned status 404");
  });

  it("charges an error body it had to drain, so misses cannot read off budget", async () => {
    const fixture = await writeFixedBuildFixture(root);
    fixture.served.set("http://fixed.test/assets/menu-a1b2c3.js", {
      status: 404,
      headers: {},
      bytes: new TextEncoder().encode("not found page body"),
    });
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    const drained = fixture.requested.at(-1)!.read.bytes;
    expect(drained).toBeGreaterThan(0);
    expect(report.served.artifacts.bytes).toBe(drained);
  });

  it("bounds every served read to the recorded size and never fetches the shared assets", async () => {
    const fixture = await writeFixedBuildFixture(root);
    await verifyProvenance(fixture.options, fixture.fetchResource);
    const sizes = new Map(
      [...fixture.manifest.builds[0].artifactFiles, ...fixture.manifest.sharedAssetFiles].map(
        (file) => [file.path, file.bytes],
      ),
    );
    expect(fixture.requested.map((request) => request.url)).toEqual([
      "http://fixed.test/",
      "http://fixed.test/benchmark-atlas/catalog.json",
      "http://fixed.test/assets/menu-a1b2c3.js",
    ]);
    // The 2.6 GB public tree is hashed on disk, never pulled over HTTP.
    expect(fixture.requested.some((request) => request.url.includes("fonts"))).toBe(false);
    for (const request of fixture.requested) {
      expect(request.limits.timeoutMs).toBeGreaterThan(0);
      expect(request.limits.maxBytes).toBeLessThanOrEqual(Math.max(...sizes.values()) + 1);
      expect(request.read.bytes).toBeLessThanOrEqual(request.limits.maxBytes + 8);
    }
  });

  it("refuses a served body longer than the artifact it claims to be", async () => {
    const fixture = await writeFixedBuildFixture(root);
    fixture.served.set("http://fixed.test/assets/menu-a1b2c3.js", {
      status: 200,
      headers: {},
      bytes: new TextEncoder().encode(fixture.bundle + "x".repeat(OVERSIZE)),
    });
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    expect(report.issues.join(" ")).toContain("larger than the recorded");
    // Stopped a chunk past the bound rather than streaming the whole body.
    expect(fixture.requested.at(-1)!.read.bytes).toBeLessThan(OVERSIZE);
  });

  it("will not let a local shared digest speak for a tree the build does not reach", async () => {
    const fixture = await writeFixedBuildFixture(root);
    // A build serving its own copy of the atlas, not the tree that was hashed.
    await rm(join(fixture.outDir, "benchmark-atlas"));
    await mkdir(join(fixture.outDir, "benchmark-atlas"));
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    expect(report.served.sharedTrees).toContainEqual(
      expect.objectContaining({ urlPath: "/benchmark-atlas/", linked: false }),
    );
    expect(report.issues.join(" ")).toContain("not the hashed shared tree");
  });

  it("rejects a shared asset that changed since the build was recorded", async () => {
    const fixture = await writeFixedBuildFixture(root);
    await writeFile(join(fixture.atlasDir, "catalog.json"), '{"appearances":{"0":"b.json"}}');
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    expect(report.issues.join(" ")).toContain("atlas/catalog.json");
    expect(report.sharedAssets.verified).toBe(1);
  });

  it("rejects a server that is not hosting this backend's fixed build", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const index = fixture.served.get(fixture.options.url)!;
    fixture.served.set(fixture.options.url, {
      ...index,
      bytes: new TextEncoder().encode("<html>another build</html>"),
    });
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    expect(report.issues.join(" ")).toContain("served index.html is not the raw fixed build");
  });

  it("rejects a server that dropped cross-origin isolation", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const index = fixture.served.get(fixture.options.url)!;
    fixture.served.set(fixture.options.url, { ...index, headers: {} });
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    expect(report.issues.join(" ")).toContain("cross-origin isolation");
  });

  it("rejects a manifest whose own recorded digest does not describe its file list", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    manifest.sharedAssetsSha256 = "0".repeat(64);
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.ok).toBe(false);
    expect(report.issues.join(" ")).toContain("recorded shared-asset digest");
  });

  it("refuses a declaration that carries no settings to check the recording against", async () => {
    const fixture = await writeFixedBuildFixture(root);
    await writeFile(fixture.renderConfigPath, '{"shadowResolution":2048}');
    const missing = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(missing.ok).toBe(false);
    expect(missing.renderConfig.graphics).toBeNull();
    expect(missing.issues.join(" ")).toContain("no `graphics` object");

    // A `graphics` object that compares against nothing is the same defect
    // wearing the right shape: it would let the hash vouch for itself again.
    for (const empty of ['{"graphics":{}}', '{"graphics":{"audio":{}}}']) {
      await writeFile(fixture.renderConfigPath, empty);
      const report = await verifyProvenance(fixture.options, fixture.fetchResource);
      expect(report.ok).toBe(false);
      expect(report.renderConfig.graphics).toBeNull();
      expect(report.issues.join(" ")).toContain("declares no graphics settings");
    }
  });

  it("reports the render configuration declaration as missing rather than inventing a digest", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const report = await verifyProvenance(
      { ...fixture.options, renderConfigPath: join(root, "absent.json") },
      fixture.fetchResource,
    );
    expect(report.ok).toBe(false);
    expect(report.configSha256).toBe("");
    expect(report.issues.join(" ")).toContain("render configuration declaration");
  });
});
