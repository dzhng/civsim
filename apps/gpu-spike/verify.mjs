import { compare } from "./image-compare.mjs";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const url = process.env.SPIKE_URL ?? "http://127.0.0.1:5197";
const output = new URL("./artifacts/", import.meta.url);
await mkdir(output, { recursive: true });
const software = process.env.SPIKE_SOFTWARE === "1";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: software
    ? [
        "--enable-unsafe-webgpu",
        "--use-angle=swiftshader",
        "--enable-features=Vulkan",
        "--use-vulkan=swiftshader",
      ]
    : ["--enable-unsafe-webgpu"],
});
const report = {
  capturedAt: new Date().toISOString(),
  software,
  cases: [],
  comparisons: [],
  semanticChecks: [],
};
const captures = new Map();
const check = (ok, message) => assert.ok(ok, message);

try {
  for (const mode of ["raw-msaa4", "raw-msaa1"])
    for (const backend of ["raw", "typegpu", "vgpu"]) {
      const page = await browser.newPage({
        viewport: { width: 980, height: 1050 },
        deviceScaleFactor: 1,
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (["error", "warning"].includes(m.type())) errors.push(m.text());
      });
      await page.goto(`${url}/?backend=${backend}&mode=${mode}`);
      await page.waitForFunction(() => window.spike || window.spikeError, null, { timeout: 30000 });
      const error = await page.evaluate(() => window.spikeError);
      check(!error, `${backend}: ${error}`);
      const info = await page.evaluate(() => ({
        details: window.spike.details,
        stats: window.spike.stats(),
      }));
      check(
        software || !/swiftshader|software|llvmpipe/i.test(info.stats.device),
        "Hardware run selected a software adapter",
      );
      for (const state of ["initial", "zero", "partial", "restored", "moved", "resized"]) {
        if (state === "zero") await page.evaluate(() => window.spike.setCount(0));
        if (state === "partial") await page.evaluate(() => window.spike.setCount(4));
        if (state === "restored") await page.evaluate(() => window.spike.setCount(9));
        if (state === "moved") await page.evaluate(() => window.spike.move());
        if (state === "resized") await page.evaluate(() => window.spike.resize());
        const file = `${mode}-${backend}-${state}.png`;
        const bytes = await page
          .locator("canvas")
          .screenshot({ path: new URL(file, output).pathname });
        captures.set(`${mode}-${backend}-${state}`, PNG.sync.read(bytes));
        if (backend !== "raw") {
          const diff = compare(captures.get(`${mode}-raw-${state}`), PNG.sync.read(bytes));
          report.comparisons.push({ mode, backend, state, ...diff });
          check(
            diff.mismatchRatioAbove2 < 0.001,
            `${mode}/${backend}/${state} differs from raw: ${JSON.stringify(diff)}`,
          );
        }
      }
      const initial = captures.get(`${mode}-${backend}-initial`),
        empty = captures.get(`${mode}-${backend}-zero`);
      let darkened = 0,
        occluderPixels = 0,
        changedOccluderPixels = 0;
      for (let i = 0; i < empty.data.length; i += 4) {
        const [r, g, b] = empty.data.subarray(i, i + 3);
        if (r > 120 && g > 105 && b > 70 && r > g * 1.1) {
          occluderPixels++;
          if (
            Math.abs(initial.data[i] - r) > 2 ||
            Math.abs(initial.data[i + 1] - g) > 2 ||
            Math.abs(initial.data[i + 2] - b) > 2
          )
            changedOccluderPixels++;
        }
        if (r - initial.data[i] > 5 && g - initial.data[i + 1] > 5) darkened++;
      }
      check(darkened > 500, `${backend}/${mode}: shadows missing`);
      check(occluderPixels > 500, `${backend}/${mode}: occluders missing`);
      check(
        changedOccluderPixels / occluderPixels < 0.01,
        `${backend}/${mode}: shadows painted over occluders`,
      );
      check(
        compare(initial, captures.get(`${mode}-${backend}-restored`)).maxChannelDelta === 0,
        "Restoring count did not restore pixels",
      );
      check(
        compare(initial, captures.get(`${mode}-${backend}-moved`)).mismatchRatioAbove2 > 0.02,
        "Camera update produced no image change",
      );
      report.semanticChecks.push({
        mode,
        backend,
        darkened,
        occluderPixels,
        changedOccluderPixels,
      });
      const disposal = await page.evaluate(() => window.spike.dispose());
      check(!errors.length && !disposal.failures.length, JSON.stringify({ errors, disposal }));
      report.cases.push({ mode, backend, ...info, disposal });
      console.log(
        `PASS ${mode}/${backend}: pixel parity, shadow coverage, depth occlusion, count updates, camera, resize, disposal`,
      );
      await page.close();
    }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(
    new URL(software ? "software-results.json" : "results.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
