import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { PNG } from "../../../../web/node_modules/pngjs/lib/png.js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";
const url = process.env.SCENE_CHECK_URL;
const directory = process.env.SCENE_EVIDENCE_DIR;
if (!url || !directory) throw Error("SCENE_CHECK_URL and SCENE_EVIDENCE_DIR are required");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: GPU_HARDWARE_FLAGS,
});
const pageErrors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (e) => {
    pageErrors.push(e.message);
    console.error(e.message);
  });
  page.on("console", (message) => {
    if (message.text().startsWith("scene:")) console.log(message.text());
    if (["warning", "error"].includes(message.type())) pageErrors.push(message.text());
  });
  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__sceneCheck !== undefined, null, {
      timeout: Number(process.env.SCENE_TIMEOUT_MS ?? 600000),
    });
  } catch (error) {
    await writeFile(
      resolve(directory, "report.json"),
      JSON.stringify(
        {
          error: String(error),
          pageErrors,
          url,
        },
        null,
        2,
      ) + "\n",
    );
    throw error;
  }
  const result = await page.evaluate(() => window.__sceneCheck);
  await browser.close();
  for (const pair of result.results ?? []) {
    const images = {};
    for (const key of ["source", "actual"]) {
      const bytes = Buffer.from(pair[key].split(",")[1], "base64");
      await writeFile(resolve(directory, `${pair.label}-${key}.png`), bytes);
      images[key] = PNG.sync.read(bytes);
      delete pair[key];
    }
    const a = images.source,
      b = images.actual;
    if (a.width !== b.width || a.height !== b.height) throw Error("Scene dimensions differ");
    let changedPixels = 0,
      maximumChannelDifference = 0,
      total = 0,
      nonzeroRgb = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      let changed = false;
      for (let c = 0; c < 4; c++) {
        const delta = Math.abs(a.data[i + c] - b.data[i + c]);
        maximumChannelDifference = Math.max(maximumChannelDifference, delta);
        total += delta;
        changed ||= delta > 0;
        if (c < 3 && b.data[i + c]) nonzeroRgb++;
      }
      if (changed) changedPixels++;
    }
    pair.countsMatch =
      pair.sourceStats.soldiers === result.instances &&
      pair.actualStats.crowd.instances === result.instances &&
      pair.sourceStats.crowd.culling.viewVisible === pair.actualStats.crowd.mainVisible &&
      pair.sourceStats.crowd.culling.shadowOnly === pair.actualStats.crowd.shadowOnly &&
      pair.sourceStats.lod.impostors === pair.actualStats.crowd.mesh.impostorsPending;
    pair.image = {
      width: a.width,
      height: a.height,
      changedPixels,
      maximumChannelDifference,
      meanChannelDifference: total / a.data.length,
      nonzeroRgb,
    };
  }
  const report = { ...result, pageErrors };
  await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        error: result.error,
        errors: result.errors,
        pageErrors,
        remaining: result.remaining,
        instances: result.instances,
        frames: result.results?.map((p) => ({ label: p.label, image: p.image })),
      },
      null,
      2,
    ),
  );
  if (
    result.error ||
    result.errors?.length ||
    pageErrors.length ||
    result.remaining?.textures ||
    result.remaining?.buffers ||
    !result.results?.every((p) => p.image.nonzeroRgb > 0 && p.countsMatch)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
