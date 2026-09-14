import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";

const root = new URL("../../../", import.meta.url);
const { chromium } = await import(new URL("web/node_modules/playwright/index.mjs", root).href);
const { PNG } = await import(new URL("web/node_modules/pngjs/lib/png.js", root).href);
const base = process.argv[2] ?? "http://127.0.0.1:5189";
const output =
  process.argv[3] ?? fileURLToPath(new URL("specs/battle-performance/assets/02a-capture", root));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-unsafe-gpu", "--enable-features=WebGPU"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator("#menu-benchmark").click();
  await page.waitForFunction(() => !!window.__battleCapture);
  console.log("Recording actual presented prelude");
  const manifest = await page.evaluate(() =>
    Promise.race([
      window.__battleCapture.prelude(),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error("Prelude timeout: " + JSON.stringify(window.__battleCapture.status())),
            ),
          180000,
        ),
      ),
    ]),
  );
  await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2));
  assert.equal(manifest.boundaryBenchmark?.phase, "running");
  assert.equal(manifest.stopped, "running-boundary");
  assert.ok(manifest.frameCount > 1 && manifest.frameCount <= 120);
  assert.ok(manifest.windowBytes <= 128 * 1024 * 1024);
  assert.deepEqual(manifest.framebuffer, { width: 2880, height: 1800 });
  console.log(
    `Captured ${manifest.frameCount} presentations, ${manifest.windowBytes} retained bytes`,
  );
  await page.goto(`${base}/renderer/battle-replay`);
  await page.waitForFunction(() => !!window.__battleReplay);
  const summary = await page.evaluate(() => window.__battleReplay.summary);
  await writeFile(`${output}/replay-summary.json`, JSON.stringify(summary, null, 2));
  assert.deepEqual(summary.grassDraws.source, summary.grassDraws.replay);
  assert.deepEqual(summary.crowd.source, summary.crowd.replay);
  assert.deepEqual(summary.crowd.sourceShadow, summary.crowd.replayShadow);
  const replayPng = await page.evaluate(
    () => document.querySelector("#renderer-canvas").toDataURL("image/png").split(",")[1],
  );
  await writeFile(`${output}/replay.png`, Buffer.from(replayPng, "base64"));
  const sourceDownload = page.waitForEvent("download");
  await page.getByText(/Download source image/).click();
  await (await sourceDownload).saveAs(`${output}/source.png`);
  const archiveDownload = page.waitForEvent("download");
  await page.getByText("Download capture and hashes", { exact: true }).click();
  const archive = await archiveDownload;
  await writeFile(`${output}/capture.json.gz`, gzipSync(await readFile(await archive.path())));
  await writeFile(`${output}/browser-errors.json`, JSON.stringify(errors, null, 2));
  const source = PNG.sync.read(await readFile(`${output}/source.png`));
  const replay = PNG.sync.read(await readFile(`${output}/replay.png`));
  assert.equal(source.width, replay.width);
  assert.equal(source.height, replay.height);
  let changedPixels = 0,
    absoluteError = 0;
  for (let i = 0; i < source.data.length; i += 4) {
    let changed = false;
    for (let channel = 0; channel < 3; channel++) {
      const error = Math.abs(source.data[i + channel] - replay.data[i + channel]);
      absoluteError += error;
      changed ||= error !== 0;
    }
    if (changed) changedPixels++;
  }
  const comparison = {
    source: "source.png",
    replay: "replay.png",
    changedPixels,
    totalPixels: source.width * source.height,
    rgbMae: absoluteError / (source.width * source.height * 3),
  };
  await writeFile(`${output}/command-comparison.json`, JSON.stringify(comparison, null, 2));
  console.log(comparison);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(changedPixels, 0, "Presented source and replay differ");
} finally {
  await browser.close();
}
