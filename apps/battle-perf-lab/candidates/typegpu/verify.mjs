import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { PNG } from "../../../../web/node_modules/pngjs/lib/png.js";
import { mkdir, writeFile } from "node:fs/promises";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";

// Requires the shared hardware slot. This is a correctness check, not timing.
const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_HARDWARE_FLAGS });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(process.env.TYPEGPU_PREFLIGHT_URL ?? "http://127.0.0.1:5187");
  await page.waitForFunction(() => window.__typegpuPreflight !== undefined);
  const report = await page.evaluate(() => window.__typegpuPreflight);
  const png = await page.locator("canvas").screenshot();
  const decoded = PNG.sync.read(png);
  const at = (x, y) => Array.from(decoded.data.subarray((y * decoded.width + x) * 4, (y * decoded.width + x) * 4 + 4));
  const triangle = at(240, 240);
  const background = at(10, 10);
  const rasterPassed = triangle[0] > 150 && triangle[1] > 75 && triangle[2] < 100 && background[0] < 40;
  const result = { ...report, pageErrors, pixels: { triangle, background }, rasterPassed };
  const evidence = new URL("./evidence/", import.meta.url);
  await mkdir(evidence, { recursive: true });
  await writeFile(new URL("preflight.png", evidence), png);
  await writeFile(new URL("preflight.json", evidence), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (!report.passed || !rasterPassed || pageErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
