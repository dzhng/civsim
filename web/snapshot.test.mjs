// @vitest-environment node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished, test } from "vitest";
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
