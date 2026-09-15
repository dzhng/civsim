/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureSha256, writeFixedBuildFixture } from "./fixedBuildFixture.ts";
import { fileListSha256, hashFileStreaming, verifyProvenance } from "./provenance.ts";

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
    expect(await hashFileStreaming(path, 5)).toEqual({ error: "larger than the recorded 5 bytes" });
    expect(await hashFileStreaming(path, 7)).toEqual({ error: "read 6 of 7 bytes" });
    expect(await hashFileStreaming(join(root, "absent"), 1)).toMatchObject({
      error: expect.stringContaining("ENOENT"),
    });
  });

  it("accepts a build whose artifacts, shared assets and served bytes all match", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const report = await verifyProvenance(fixture.options, fixture.fetchResource);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.artifacts.verified).toBe(1);
    expect(report.sharedAssets.verified).toBe(2);
    expect(report.served.indexSha256).toBe(fixtureSha256(fixture.index));
    expect(report.configSha256).toBe(fixtureSha256(fixture.renderConfig));
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
    expect(report.issues).toContain("served index.html is not the raw fixed build");
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
