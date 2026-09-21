import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";

// Requires the coordinated GPU slot; numerical correctness, not a timing run.
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: GPU_HARDWARE_FLAGS,
});
try {
  const reports = [];
  for (const backend of ["raw", "typegpu", "vgpu"]) {
    const page = await browser.newPage();
    const pageErrors = [],
      warnings = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
      if (message.type() === "warning") warnings.push(message.text());
    });
    await page.goto(
      (process.env.RAW_POST_URL ?? "http://127.0.0.1:5188/check.html") + "?backend=" + backend,
    );
    await page.waitForFunction(() => window.__rawPostCheck !== undefined, null, {
      timeout: 120000,
    });
    reports.push({ ...(await page.evaluate(() => window.__rawPostCheck)), pageErrors, warnings });
    await page.close();
  }
  const report = {
    passed: reports.every((r) => r.passed && !r.pageErrors.length && !r.warnings.length),
    reports,
  };
  const directory = new URL(
    "../../../../specs/done/battle-performance/assets/02-raw/frame-lifecycle/",
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("post.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
