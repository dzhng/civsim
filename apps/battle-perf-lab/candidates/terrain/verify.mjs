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
  await page.goto(process.env.TERRAIN_CHECK_URL ?? "http://127.0.0.1:5199/check.html");
  await page.waitForFunction(() => window.__terrainCheck !== undefined, null, { timeout: 120000 });
  const report = { ...(await page.evaluate(() => window.__terrainCheck)), pageErrors };
  for (const capture of report.captures ?? [])
    await writeFile(
      new URL(
        `./evidence/${report.canonicalProjection ? "canonical-" : ""}${capture.name}.png`,
        import.meta.url,
      ),
      Buffer.from(capture.png.split(",")[1], "base64"),
    );
  delete report.captures;
  await writeFile(
    new URL(
      report.visualReview
        ? "./evidence/terrain-visual.json"
        : report.canonicalProjection
          ? "./evidence/terrain-canonical.json"
          : "./evidence/terrain.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed || pageErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
