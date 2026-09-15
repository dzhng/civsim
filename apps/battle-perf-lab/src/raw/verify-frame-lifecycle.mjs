import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: GPU_HARDWARE_FLAGS,
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) pageErrors.push(m.text());
  });
  await page.goto(
    process.env.FRAME_LIFECYCLE_URL ?? "http://127.0.0.1:5210/frame-lifecycle-check.html",
  );
  await page.waitForFunction(() => window.__frameLifecycle !== undefined, null, {
    timeout: 120000,
  });
  const result = await page.evaluate(() => window.__frameLifecycle);
  const report = { ...result, pageErrors, passed: result.passed && !pageErrors.length };
  const path = new URL(
    "../../../../specs/battle-performance/assets/02-raw/frame-lifecycle/",
    import.meta.url,
  );
  await mkdir(path, { recursive: true });
  await writeFile(new URL("lifecycle.json", path), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
