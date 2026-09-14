import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";
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
    if (m.type() === "error" || m.type() === "warning") pageErrors.push(m.text());
  });
  await page.goto(process.env.PBR_CHECK_URL ?? "http://127.0.0.1:5197/check.html");
  await page.waitForFunction(() => window.__pbrCheck !== undefined, null, { timeout: 120000 });
  const report = { ...(await page.evaluate(() => window.__pbrCheck)), pageErrors };
  await writeFile(
    new URL("./evidence/pbr.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed || pageErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
