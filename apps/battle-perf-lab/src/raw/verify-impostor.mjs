import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { PNG } from "../../../../web/node_modules/pngjs/lib/png.js";
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
  const url = process.env.IMPOSTOR_CHECK_URL ?? "http://localhost:5198/impostor-check.html";
  const selected = new URL(url).searchParams.get("candidate") ?? "raw";
  if (!["raw", "typegpu", "vgpu"].includes(selected)) throw new Error("Unknown impostor candidate");
  await page.goto(url);
  await page.waitForFunction(() => window.__impostorCheck !== undefined, null, { timeout: 120000 });
  const result = await page.evaluate(() => window.__impostorCheck);
  await browser.close();
  const directory = new URL(
    `../../../../specs/battle-performance/assets/02-${result.backend ?? selected}/impostor/samples-${result.samples ?? "error"}${result.canonicalProjection ? "-canonical" : ""}${result.diagnostic ? "-" + result.diagnostic : ""}${result.focused ? "-focused" : ""}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  for (const r of result.results ?? []) {
    for (const key of ["actualRgba", "expectedRgba"]) {
      const image = new PNG({ width: r.width, height: r.height });
      image.data = Buffer.from(r[key], "base64");
      await writeFile(new URL(`${r.label}-${key}.png`, directory), PNG.sync.write(image));
      delete r[key];
    }
  }
  const report = { ...result, pageErrors, passed: result.passed && pageErrors.length === 0 };
  await writeFile(new URL("report.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed || report.error || report.errors?.length || pageErrors.length)
    process.exitCode = 1;
} finally {
  await browser.close();
}
