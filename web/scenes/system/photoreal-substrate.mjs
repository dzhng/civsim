import { PNG } from "pngjs";

// The retained Three material authoring route must be nonblank, publish its
// ownership and renderer stats, and remain deterministic at a fixed time.
export const meta = {
  name: "photoreal-substrate",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["photoreal-pbr"],
  describe: "Photoreal material authoring: identity, sphere grid and byte-determinism.",
};

const SUBSTRATE = "threejs-webgpu-tsl";
const PROJECTION = "camera3d";
const FIXED_TIME = 0.6;

function countNonBlank(png) {
  let nonBlank = 0;
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i] + png.data[i + 1] + png.data[i + 2] > 60) nonBlank += 1;
    const value = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
    sum += value;
    squares += value * value;
  }
  const total = png.width * png.height;
  return { nonBlank, total, variance: squares / total - (sum / total) ** 2 };
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
  const clip = await page.locator("#renderer-canvas").boundingBox();
  const shotA = await page.screenshot({ clip, timeout: 120000 });
  const pixels = countNonBlank(PNG.sync.read(shotA));
  ctx.check(
    `${label}: canvas is non-blank`,
    pixels.nonBlank > pixels.total * 0.4 && pixels.variance > 4,
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
}
