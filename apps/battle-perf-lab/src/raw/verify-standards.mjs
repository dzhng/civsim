import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { PNG } from "../../../../web/node_modules/pngjs/lib/png.js";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const url =
  process.env.STANDARDS_CHECK_URL ??
  "http://127.0.0.1:5203/standards-check.html?backend=raw&samples=1";
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
    if (["error", "warning"].includes(m.type())) pageErrors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__standardsCheck !== undefined, null, {
    timeout: 120000,
  });
  const result = await page.evaluate(() => window.__standardsCheck);
  const dir = new URL(
    `../../../../specs/battle-performance/assets/02-preflight/standards/${result.backend ?? "error"}-${result.samples ?? 1}x/`,
    import.meta.url,
  );
  await mkdir(dir, { recursive: true });
  for (const r of result.results ?? [])
    for (const key of ["actual", "expected"]) {
      const png = new PNG({ width: r.width, height: r.height });
      png.data = Buffer.from(r[key], "base64");
      await writeFile(new URL(`${r.name}-${key}.png`, dir), PNG.sync.write(png));
      delete r[key];
    }
  const report = { ...result, pageErrors, passed: result.passed && pageErrors.length === 0 };
  await writeFile(new URL("report.json", dir), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
