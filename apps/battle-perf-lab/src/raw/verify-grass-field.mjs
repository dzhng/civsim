import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";
import { PNG } from "../../../../web/node_modules/pngjs/lib/png.js";
import { mkdir, writeFile } from "node:fs/promises";
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
  await page.goto(
    process.env.GRASS_FIELD_CHECK_URL ?? "http://127.0.0.1:5203/grass-field-check.html",
  );
  await page.waitForFunction(() => window.__grassFieldCheck !== undefined, null, {
    timeout: 120000,
  });
  const report = { ...(await page.evaluate(() => window.__grassFieldCheck)), pageErrors };
  const dir = new URL(
    "../../../../specs/battle-performance/assets/02-raw/grass-residency/",
    import.meta.url,
  );
  await mkdir(dir, { recursive: true });
  for (const result of report.results ?? []) {
    for (const key of ["actual", "expected", "ringOnly", "standalone"]) {
      if (!result[key]) continue;
      const image = new PNG({ width: result.width, height: result.height });
      image.data = Buffer.from(
        result[key].map((v, i) =>
          Math.round(
            255 *
              Math.min(
                1,
                Math.max(
                  0,
                  i % 4 === 3 ? v : v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055,
                ),
              ),
          ),
        ),
      );
      await writeFile(new URL(`${result.label}-${key}.png`, dir), PNG.sync.write(image));
      delete result[key];
    }
  }
  await writeFile(new URL("report.json", dir), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  const sourcePublicationPassed =
    report.results?.find((r) => r.label === "interior-far-hidden")?.sourceStandalone
      ?.sourceStandaloneParity === true;
  const selectedGate = process.argv.includes("--source-publication")
    ? sourcePublicationPassed
    : report.passed;
  if (!selectedGate || report.errors?.length || pageErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
