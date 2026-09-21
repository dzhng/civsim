import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";
const backend = process.env.POSE_BACKEND ?? "typegpu";
if (!["typegpu", "vgpu"].includes(backend)) throw new Error("Unknown pose backend");
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: GPU_HARDWARE_FLAGS,
});
try {
  const page = await browser.newPage(),
    pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type())) pageErrors.push(m.text());
  });
  const url = new URL(process.env.POSE_CHECK_URL ?? "http://localhost:5198/pose-check.html");
  url.searchParams.set("backend", backend);
  await page.goto(url.href);
  await page.waitForFunction(() => window.__pose !== undefined, null, { timeout: 120000 });
  const result = await page.evaluate(() => window.__pose),
    report = {
      ...result,
      pageErrors,
      passed: result.passed && pageErrors.length === 0,
      capturedAt: new Date().toISOString(),
    };
  const directory = new URL(
    `../../../../specs/done/battle-performance/assets/02-${backend}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("pose.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
