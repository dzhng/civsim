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
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.goto(
    process.env.TYPEGPU_IMPOSTOR_RECORD_URL ?? "http://127.0.0.1:5187/impostor-record-check.html",
  );
  await page.waitForFunction(() => window.__typegpuImpostorRecords !== undefined, null, {
    timeout: 120000,
  });
  const adapter = await page.evaluate(async () => {
    const found = await navigator.gpu.requestAdapter();
    return found?.info
      ? { vendor: found.info.vendor, architecture: found.info.architecture }
      : null;
  });
  const report = {
    ...(await page.evaluate(() => window.__typegpuImpostorRecords)),
    adapter,
    pageErrors,
  };
  const output = new URL(
    process.env.TYPEGPU_IMPOSTOR_RECORD_REPORT ??
      "../../../../throwaway/typegpu-impostor-records/impostor-record-check.json",
    import.meta.url,
  );
  await mkdir(new URL("./", output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed || pageErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
