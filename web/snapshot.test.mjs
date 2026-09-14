// @vitest-environment node
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { onTestFinished, test, vi } from "vitest";
import { PNG } from "pngjs";
import { snapCheck } from "./snapshot.mjs";

function pngBuffer(pixels, options = {}) {
  const png = new PNG({ width: 2, height: 1 });
  png.data.set(pixels);
  return PNG.sync.write(png, options);
}

function withUpdateShots() {
  const previous = process.env.UPDATE_SHOTS;
  process.env.UPDATE_SHOTS = "1";
  onTestFinished(() => {
    if (previous === undefined) delete process.env.UPDATE_SHOTS;
    else process.env.UPDATE_SHOTS = previous;
  });
}

test("SNAP comma filters capture only matching names and ignore empty fields", async () => {
  vi.stubEnv("SNAP", " head , , hand ");
  onTestFinished(() => vi.unstubAllEnvs());
  const dir = await mkdtemp(join(tmpdir(), "snapshot-filter-test-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const shot = pngBuffer(Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]));
  const results = [];
  for (const name of ["head-detail", "walk-frames", "hand-detail"]) {
    results.push(await snapCheck(null, name, () => {}, { shot, baseDir: `${dir}/` }));
  }
  assert.equal(results[1], undefined);
  assert.deepEqual((await readdir(dir)).sort(), ["hand-detail.png", "head-detail.png"]);
});

test("a selected snapshot still rejects a one-pixel change at exact tolerance", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapshot-mutation-"));
  const name = basename(dir);
  vi.stubEnv("SNAP", name);
  vi.stubEnv("UPDATE_SHOTS", "");
  onTestFinished(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
    for (const suffix of [".png", "-actual.png"])
      await rm(new URL(`./shots/diff/${name}${suffix}`, import.meta.url), { force: true });
  });
  const baseline = pngBuffer(Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]));
  const changed = pngBuffer(Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]));
  await writeFile(join(dir, `${name}.png`), baseline);
  const events = [];
  await snapCheck(null, name, (label, ok) => events.push({ label, ok }), {
    shot: changed,
    baseDir: `${dir}/`,
    threshold: 0,
    maxDiffRatio: 0,
  });
  assert.deepEqual(events, [{ label: `snapshot ${name}`, ok: false }]);
  assert.deepEqual(await readFile(join(dir, `${name}.png`)), baseline);
});

test("UPDATE_SHOTS keeps an existing baseline when decoded pixels are unchanged", async () => {
  withUpdateShots();
  const dir = await mkdtemp(join(tmpdir(), "snapshot-test-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
  const baseline = pngBuffer(pixels, { deflateLevel: 0 });
  const samePixelsDifferentEncoding = pngBuffer(pixels, { deflateLevel: 9 });
  assert.notDeepEqual(baseline, samePixelsDifferentEncoding);

  const file = join(dir, "same.png");
  await writeFile(file, baseline);
  const events = [];
  const result = await snapCheck(
    null,
    "same",
    (label, ok, detail) => {
      events.push({ label, ok, detail });
    },
    { shot: samePixelsDifferentEncoding, baseDir: `${dir}/` },
  );

  assert.equal(result.status, "unchanged");
  assert.deepEqual(await readFile(file), baseline);
  assert.deepEqual(events, [
    {
      label: "snapshot same",
      ok: true,
      detail: "baseline unchanged",
    },
  ]);
});

test("UPDATE_SHOTS rewrites an existing baseline when pixels changed", async () => {
  withUpdateShots();
  const dir = await mkdtemp(join(tmpdir(), "snapshot-test-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const baseline = pngBuffer(Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]));
  const changed = pngBuffer(Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]));

  const file = join(dir, "changed.png");
  await writeFile(file, baseline);
  const result = await snapCheck(null, "changed", () => {}, { shot: changed, baseDir: `${dir}/` });

  assert.equal(result.status, "updated");
  assert.deepEqual(await readFile(file), changed);
});

test.each(["antialiased edges", "transparent RGB"])(
  "exact snapshots reject changes on %s",
  async (kind) => {
    const dir = await mkdtemp(join(tmpdir(), "snapshot-edge-"));
    const name = basename(dir);
    vi.stubEnv("SNAP", name);
    vi.stubEnv("UPDATE_SHOTS", "");
    onTestFinished(async () => {
      vi.unstubAllEnvs();
      await rm(dir, { recursive: true, force: true });
      for (const suffix of [".png", "-actual.png"])
        await rm(new URL(`./shots/diff/${name}${suffix}`, import.meta.url), { force: true });
    });
    const image = new PNG({ width: 7, height: 7 });
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const grey = x < 2 ? 0 : x === 2 ? 128 : 255;
        image.data.set([grey, grey, grey, 255], (y * 7 + x) * 4);
      }
    const alpha = kind === "transparent RGB" ? 0 : 255;
    image.data[(3 * 7 + 2) * 4 + 3] = alpha;
    await writeFile(join(dir, `${name}.png`), PNG.sync.write(image));
    image.data.set([129, 129, 129, alpha], (3 * 7 + 2) * 4);
    const result = await snapCheck(null, name, () => {}, {
      shot: PNG.sync.write(image),
      baseDir: `${dir}/`,
      threshold: 0,
      maxDiffRatio: 0,
    });
    assert.equal(result.status, "failed");
  },
);
