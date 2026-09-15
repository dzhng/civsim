import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";

const backend = process.argv[2] ?? "typegpu";
if (!["raw", "typegpu", "vgpu"].includes(backend)) throw Error("Expected raw, typegpu or vgpu");
const directory = resolve(process.argv[3] ?? `throwaway/post-timing-${backend}`);
await mkdir(directory, { recursive: true });
const report = { backend, passed: false, pageErrors: [], warnings: [] };
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_HARDWARE_FLAGS });
  const page = await browser.newPage();
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "warning") report.warnings.push(message.text());
    if (message.type() === "error") report.pageErrors.push(message.text());
  });
  await page.goto(
    `${process.env.POST_TIMING_URL ?? "http://127.0.0.1:5188/timing.html"}?backend=${backend}`,
  );
  await page.waitForFunction(() => window.__postTiming !== undefined, null, { timeout: 180000 });
  report.result = await page.evaluate(() => window.__postTiming);
  report.passed = report.result.passed && !report.pageErrors.length && !report.warnings.length;
} catch (error) {
  report.error = String(error);
} finally {
  await writeFile(resolve(directory, "timing.json"), JSON.stringify(report, null, 2) + "\n");
  await browser?.close();
}
console.log(JSON.stringify({ backend, passed: report.passed, directory }));
if (!report.passed) process.exitCode = 1;
