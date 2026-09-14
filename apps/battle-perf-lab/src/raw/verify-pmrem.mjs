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
  await page.goto(process.env.PMREM_CHECK_URL ?? "http://localhost:5195/pmrem-check.html");
  await page.waitForFunction(() => window.__rawPmrem !== undefined, null, { timeout: 120000 });
  const result = await page.evaluate(() => window.__rawPmrem);
  const report = {
    ...result,
    pageErrors,
    passed: result.passed && pageErrors.length === 0,
    capturedAt: new Date().toISOString(),
  };
  const directory = new URL("../../../../specs/battle-performance/assets/02-raw/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("pmrem.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        error: report.error,
        errors: report.errors,
        pageErrors,
        presets: report.results?.map((x) => ({
          preset: x.preset,
          passed: x.passed,
          finite: x.finite,
          lods: x.lods.map((l) => ({ lod: l.lod, maxAbs: l.maxAbs, maxRelative: l.maxRelative })),
          sampled: x.sampled,
        })),
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
