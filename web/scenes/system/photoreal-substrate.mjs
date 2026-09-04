import { PNG } from "pngjs";

// Both three.js routes must render
// non-blank on the camera3d spine, publish the ownership identity fields
// { substrate, projection, environment } plus renderer.info-backed stats, hold
// the 06 bake-off count floors, and — the determinism rule — two snaps at the
// same fixed setTime are byte-identical. On a hardware adapter
// (VERIFY_GPU_ADAPTER=hardware) it also runs the crowd frame-time gate that
// opens the ladder's perf ledger (budget 33 ms; 06 baseline ~6 ms).
export const meta = {
  name: "photoreal-substrate",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: ["photoreal-pbr", "photoreal-crowd-mid"],
  describe: "Photoreal three.js WebGPU routes: identity fields, count floors, byte-determinism.",
};

const SUBSTRATE = "threejs-webgpu-tsl";
const PROJECTION = "camera3d";
const FIXED_TIME = 0.6;
const PERF_BUDGET_MS = 33;

function countNonBlank(png) {
  let nonBlank = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i] + png.data[i + 1] + png.data[i + 2] > 60) nonBlank += 1;
  }
  return { nonBlank, total: png.width * png.height };
}

async function openRoute(ctx, route, query, errorPrefix) {
  const page = await ctx.newPage({ viewport: { width: 1100, height: 700 }, errorPrefix });
  await page.goto(`${ctx.target}/renderer/${route}${query}`);
  await page.waitForFunction(
    (expected) =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.route === expected,
    route,
    { timeout: 60000 },
  );
  return page;
}

function identityOk(stats, environment) {
  return (
    stats?.ok === true &&
    stats.substrate === SUBSTRATE &&
    stats.projection === PROJECTION &&
    stats.environment === environment
  );
}

function statsShapeOk(stats) {
  const s = stats?.stats;
  return (
    typeof s?.drawCalls === "number" &&
    s.drawCalls > 0 &&
    typeof s?.triangles === "number" &&
    s.triangles > 0 &&
    (s.gpuTimeMs === null || typeof s.gpuTimeMs === "number") &&
    typeof s?.frames === "number"
  );
}

async function fixedTimeChecks(ctx, page, label, extraStatsOk) {
  await page.waitForFunction(
    (t) => window.__rendererLabStats?.stats?.timeSeconds === t,
    FIXED_TIME,
    { timeout: 20000 },
  );
  await page.waitForTimeout(300);
  const stats = await page.evaluate(() => window.__rendererLabStats);
  ctx.check(
    `${label}: identity fields assert the single owners`,
    identityOk(stats, "golden"),
    JSON.stringify({
      substrate: stats?.substrate,
      projection: stats?.projection,
      environment: stats?.environment,
    }),
  );
  ctx.check(
    `${label}: stats backed by renderer.info + timestamps`,
    statsShapeOk(stats) && extraStatsOk(stats.stats),
    JSON.stringify(stats?.stats),
  );
  // Clipped page screenshots, not locator.screenshot(): the element-stability
  // wait needs consecutive fast rAF ticks, and one full-scale crowd frame costs
  // ~30 s of SwiftShader software rasterization (hence the long timeout too).
  const clip = await page.locator("#renderer-canvas").boundingBox();
  const shotA = await page.screenshot({ clip, timeout: 120000 });
  const pixels = countNonBlank(PNG.sync.read(shotA));
  ctx.check(
    `${label}: canvas is non-blank`,
    pixels.nonBlank > pixels.total * 0.4,
    JSON.stringify(pixels),
  );
  const shotB = await page.screenshot({ clip, timeout: 120000 });
  ctx.check(
    `${label}: fixed setTime renders byte-identical frames`,
    Buffer.compare(shotA, shotB) === 0,
    JSON.stringify({ bytesA: shotA.length, bytesB: shotB.length }),
  );
  return shotA;
}

export async function run(ctx) {
  const hardware = process.env.VERIFY_GPU_ADAPTER === "hardware";

  // --- /renderer/photoreal-pbr: sphere grid under the golden preset IBL ------
  {
    const page = await openRoute(ctx, "photoreal-pbr", `?t=${FIXED_TIME}`, "photoreal-pbr");
    const shot = await fixedTimeChecks(ctx, page, "photoreal-pbr", (s) => s.spheres === 49);
    // Baselines are SwiftShader artifacts; a hardware run must not diff them.
    if (!hardware) await ctx.snap(page, "photoreal-pbr", { shot });
    await page.close();
  }

  // --- /renderer/photoreal-crowd (mid): the 30,400 + foliage count floors ----
  {
    const page = await openRoute(ctx, "photoreal-crowd", `?t=${FIXED_TIME}`, "photoreal-crowd-mid");
    const shot = await fixedTimeChecks(
      ctx,
      page,
      "photoreal-crowd mid",
      (s) =>
        s.cameraPreset === "mid" &&
        s.soldiers >= 30400 &&
        s.grassBlades >= 200000 &&
        s.trees >= 3000,
    );
    if (!hardware) await ctx.snap(page, "photoreal-crowd-mid", { shot });
    await page.close();
  }

  // --- /renderer/photoreal-crowd (vista): second contract camera -------------
  {
    const page = await openRoute(
      ctx,
      "photoreal-crowd",
      `?cam=vista&t=${FIXED_TIME}`,
      "photoreal-crowd-vista",
    );
    await fixedTimeChecks(ctx, page, "photoreal-crowd vista", (s) => s.cameraPreset === "vista");
    await page.close();
  }

  // --- Hardware frame-time gate (the ladder's perf ledger) -------------------
  if (hardware) {
    const page = await openRoute(ctx, "photoreal-crowd", "", "photoreal-crowd-perf");
    await page.waitForFunction(
      () =>
        window.__rendererLabStats?.stats?.frames >= 120 &&
        window.__rendererLabStats?.stats?.gpuTimeMs !== null,
      undefined,
      { timeout: 30000 },
    );
    const s = await page.evaluate(() => window.__rendererLabStats.stats);
    ctx.check(
      `photoreal-crowd perf: median rAF and GPU ms within the ${PERF_BUDGET_MS} ms budget`,
      s.medianMs !== null && s.medianMs <= PERF_BUDGET_MS && s.gpuTimeMs <= PERF_BUDGET_MS,
      JSON.stringify({
        medianMs: s.medianMs,
        p95Ms: s.p95Ms,
        gpuTimeMs: s.gpuTimeMs,
        drawCalls: s.drawCalls,
      }),
    );
    await page.close();
  }
}
