import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";
import { writeFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", args: GPU_HARDWARE_FLAGS });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (message) => {
  if (["warning", "error"].includes(message.type())) errors.push(message.text());
});
try {
  await page.goto(process.env.RAW_PREFLIGHT_URL ?? "http://127.0.0.1:4183/preflight.html");
  await page.waitForFunction(() => window.__rawPreflight, undefined, { timeout: 30000 });
  const report = await page.evaluate(() => ({
    result: window.__rawPreflight,
    userAgent: navigator.userAgent,
  }));
  console.log(JSON.stringify({ ...report, errors }));
  const out = new URL("../../../../specs/battle-performance/assets/02-preflight/", import.meta.url);
  await mkdir(out, { recursive: true });
  await writeFile(new URL("raw.json", out), JSON.stringify({ ...report, errors }, null, 2));
  if (!report.result.passed || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
