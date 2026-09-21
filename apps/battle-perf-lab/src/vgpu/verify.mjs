import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PNG } from "../../../../web/node_modules/pngjs/lib/png.js";

const installed = JSON.parse(
  await readFile(
    new URL("../../../../web/node_modules/vgpu/package.json", import.meta.url),
    "utf8",
  ),
);
const browser = await chromium.launch({ channel: "chrome", args: GPU_HARDWARE_FLAGS });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const pageErrors = [];
  const consoleMessages = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error")
      consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(process.env.VGPU_PREFLIGHT_URL ?? "http://127.0.0.1:4182/");
  await page.waitForFunction(() => window.vgpuPreflight || window.vgpuPreflightError, undefined, {
    timeout: 30000,
  });
  const observation = await page.evaluate(() => ({
    report: window.vgpuPreflight,
    failure: window.vgpuPreflightError ?? null,
    browser: navigator.userAgent,
  }));
  const output = new URL("../../../../specs/done/battle-performance/assets/02-vgpu/", import.meta.url);
  await mkdir(output, { recursive: true });
  for (const name of ["shared", "separate"]) {
    const test = observation.report?.[name];
    if (test?.imageRgba.length === 16 * 16 * 4) {
      const png = new PNG({ width: 16, height: 16 });
      png.data.set(test.imageRgba);
      await writeFile(new URL(`${name}.png`, output), PNG.sync.write(png));
    }
    if (test) delete test.imageRgba;
  }
  const result = {
    ...observation,
    installedVersion: installed.version,
    pageErrors,
    consoleMessages,
    capturedAt: new Date().toISOString(),
    measurement: "Hardware correctness preflight; no battle parity or performance ranking.",
  };
  await writeFile(new URL("preflight.json", output), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (
    installed.version !== observation.report?.identity.packageVersion ||
    pageErrors.length ||
    consoleMessages.some((message) =>
      /webgpu|vgpu|shader|pipeline|bind.group/i.test(message.text),
    ) ||
    observation.failure ||
    !observation.report?.separate.passed ||
    !observation.report?.shared.passed
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
