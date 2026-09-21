import { chromium } from "../../../web/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { GPU_HARDWARE_FLAGS } from "../../../web/renderer-probe-lib.mjs";

// Acquire the shared GPU slot first. Numerical correctness only, never performance evidence.
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: GPU_HARDWARE_FLAGS,
});
try {
  for (const [backend, path] of [
    ["vgpu", "src/vgpu"],
    ["typegpu", "candidates/typegpu"],
    ["raw", "src/raw"],
  ]) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") pageErrors.push(m.text());
    });
    try {
      await page.goto(
        `${process.env.SKY_CHECK_ORIGIN ?? "http://localhost:5194"}/${path}/sky-check.html`,
      );
      const key = `__${backend}Sky`;
      await page.waitForFunction((key) => window[key] !== undefined, key, { timeout: 120000 });
      const result = await page.evaluate((key) => window[key], key);
      const report = {
        ...result,
        backend,
        capturedAt: new Date().toISOString(),
        pageErrors,
        passed: result.passed && pageErrors.length === 0,
      };
      const directory = new URL(
        `../../../specs/done/battle-performance/assets/02-${backend}/`,
        import.meta.url,
      );
      await mkdir(directory, { recursive: true });
      await writeFile(new URL("sky.json", directory), JSON.stringify(report, null, 2) + "\n");
      console.log(
        JSON.stringify({
          backend,
          passed: report.passed,
          error: report.error,
          pageErrors,
          presets: report.results?.length,
          maxAbs: Math.max(
            ...(report.results ?? [])
              .flatMap((x) => [x.lut, ...x.backgrounds])
              .map((x) => x.maxAbs),
          ),
        }),
      );
      if (!report.passed) process.exitCode = 1;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
