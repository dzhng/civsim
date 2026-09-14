import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";
const url = new URL(process.env.TERRAIN_CHECK_URL ?? "http://127.0.0.1:5199/check.html");
const requestedBackend = url.searchParams.get("backend");
const backend =
  requestedBackend === "typegpu" || requestedBackend === "vgpu" ? requestedBackend : "raw";
const sampleCount = url.searchParams.get("samples") === "4" ? 4 : 1;
const invariantPosition = backend === "raw" && url.searchParams.get("invariant") !== "0";
const stem = `terrain-${sampleCount}x-${invariantPosition ? "invariant" : "ordinary"}${url.searchParams.has("visual") ? "-visual" : ""}${url.searchParams.has("canonical") ? "-canonical" : ""}-vertex-normal-runtime-targets`;
const evidenceRoot = new URL(
  `../../../../specs/battle-performance/assets/02-${backend}/terrain/`,
  import.meta.url,
);
await mkdir(evidenceRoot, { recursive: true });
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
  await page.goto(url.href);
  await page.waitForFunction(() => window.__terrainCheck !== undefined, null, { timeout: 120000 });
  const report = { ...(await page.evaluate(() => window.__terrainCheck)), pageErrors };
  for (const capture of report.captures ?? [])
    await writeFile(
      new URL(`${stem}-${capture.name}.png`, evidenceRoot),
      Buffer.from(capture.png.split(",")[1], "base64"),
    );
  delete report.captures;
  if (report.shaderSources?.length) {
    await mkdir("/tmp/terrain-shaders", { recursive: true });
    for (const shader of report.shaderSources)
      for (const stage of ["vertexShader", "fragmentShader"])
        await writeFile(
          `/tmp/terrain-shaders/${report.canonicalProjection ? "canonical-" : ""}${shader.name}-${stage}.wgsl`,
          shader[stage],
        );
  }
  delete report.shaderSources;
  await writeFile(new URL(`${stem}.json`, evidenceRoot), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed || pageErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
