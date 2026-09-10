import { chromium } from "playwright";
import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { compare } from "./image-compare.mjs";
const url = process.env.SPIKE_URL ?? "http://127.0.0.1:5197";
const output = new URL("./artifacts/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu"],
});
const report = { capturedAt: new Date().toISOString(), cases: [], comparisons: [] };
const images = new Map();
try {
  for (const backend of ["raw", "typegpu", "vgpu"]) {
    const page = await browser.newPage({
      viewport: { width: 980, height: 1000 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) errors.push(m.text());
    });
    await page.goto(`${url}/three.html?backend=${backend}`);
    await page.waitForFunction(() => window.threeSpike || window.spikeError, null, {
      timeout: 30000,
    });
    assert.ok(
      !(await page.evaluate(() => window.spikeError)),
      await page.evaluate(() => window.spikeError),
    );
    const result = await page.evaluate(() => ({
      compute: window.threeSpike.computeResult,
      stats: window.threeSpike.stats(),
    }));
    for (const time of [0, 1.5, 4.25, 0]) {
      await page.evaluate((time) => window.threeSpike.render(time), time);
      const bytes = await page
        .locator("canvas")
        .screenshot({ path: new URL(`three-${backend}-${time}.png`, output).pathname });
      const image = PNG.sync.read(bytes);
      const key = `${backend}-${time}`;
      if (images.has(key))
        assert.equal(
          compare(images.get(key), image).maxChannelDelta,
          0,
          "Frozen time must reproduce the same pixels",
        );
      images.set(key, image);
      if (backend !== "raw") {
        const diff = compare(images.get(`raw-${time}`), image);
        report.comparisons.push({ backend, time, ...diff });
        assert.ok(
          diff.mismatchRatioAbove2 < 0.001,
          `Three ${backend}/${time} differs from native TSL: ${JSON.stringify(diff)}`,
        );
      }
    }
    const movement = compare(images.get(`${backend}-0`), images.get(`${backend}-1.5`));
    assert.ok(movement.mismatchRatioAbove2 > 0.01, "Time update did not visibly animate the cloth");
    const failures = await page.evaluate(() => window.threeSpike.failures);
    assert.deepEqual(failures, []);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.threeSpike.dispose());
    report.cases.push({ backend, ...result, movement, failures, errors });
    console.log(
      `PASS Three/${backend}: visible animation, frozen-time replay, TSL parity, GPU compute reference`,
    );
    await page.close();
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = String(error.stack ?? error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(new URL("three-results.json", output), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
