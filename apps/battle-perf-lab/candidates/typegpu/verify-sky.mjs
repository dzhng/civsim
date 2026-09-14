import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";

// Requires the coordinated GPU slot; numerical correctness, not a timing run.
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: GPU_HARDWARE_FLAGS,
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.goto(process.env.TYPEGPU_SKY_URL ?? "http://127.0.0.1:5187/sky-check.html");
  await page.waitForFunction(() => window.__typegpuSky !== undefined, null, { timeout: 120000 });
  const report = { ...(await page.evaluate(() => window.__typegpuSky)), pageErrors };
  await writeFile(
    new URL("./evidence/sky.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed || pageErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
