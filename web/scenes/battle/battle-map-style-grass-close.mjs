import { PNG } from "pngjs";
import {
  cropRatio,
  legibilityVerdict,
  structureMetrics,
} from "./battle-map-style-legibility-lib.js";
import { BAND_CROPS, CLOSE_GATE_CAMERA, VIEWPORT } from "./battle-map-style.mjs";

const ROUTE = "blade-field";
const CROP = BAND_CROPS["near-grass"];
const BASE_QUERY = {
  map: CLOSE_GATE_CAMERA.map,
  ref: "1",
  env: CLOSE_GATE_CAMERA.env,
  t: String(CLOSE_GATE_CAMERA.t),
  ticks: String(CLOSE_GATE_CAMERA.ticks),
  zoom: String(CLOSE_GATE_CAMERA.zoom),
  cx: String(CLOSE_GATE_CAMERA.cx),
  cy: String(CLOSE_GATE_CAMERA.cy),
  camYaw: String(CLOSE_GATE_CAMERA.camYaw),
  shadows: "off",
  post: "off",
};

export const meta = {
  name: "battle-map-style-grass-close",
  kind: "visual",
  world: "renderer-lab-blade-field-close-gate",
  tier: "full",
  snapshots: [
    "battle-map-style/grass-close",
    "battle-map-style/grass-close-off",
    "battle-map-style/grass-close-shifted",
  ],
  describe:
    "BMS10-SLICE-C4D1: False Earth blade-field layer close-gate oracle, grass-off control, and camera-snap stability.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "battle-map-style grass close gate requires browser GPU flags",
      true,
      "set VERIFY_GPU=1",
    );
    return;
  }

  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-map-style-grass-close",
  });
  try {
    const on = await captureBladeField(ctx, page, {});
    assertBladeFieldStats(ctx, on.stats, false);
    assertVerdict(ctx, "blade-field close-gate crop passes legibility oracle", on.crop, true);
    await ctx.snap(null, "battle-map-style/grass-close", {
      shot: PNG.sync.write(on.crop),
    });

    const off = await captureBladeField(ctx, page, { grass: "off" });
    assertBladeFieldStats(ctx, off.stats, true);
    assertVerdict(ctx, "grass-off control fails legibility oracle", off.crop, false);
    await ctx.snap(null, "battle-map-style/grass-close-off", {
      shot: PNG.sync.write(off.crop),
    });

    const shifted = await captureBladeField(ctx, page, { camDx: "1.25", camDy: "0.75" });
    assertBladeFieldStats(ctx, shifted.stats, false);
    ctx.check(
      "camera-snap stability: small camera translation keeps the same packed records",
      on.stats?.bladeField?.recordHash === shifted.stats?.bladeField?.recordHash &&
        on.stats?.sample?.snapX === shifted.stats?.sample?.snapX &&
        on.stats?.sample?.snapY === shifted.stats?.sample?.snapY &&
        on.stats?.sample?.acceptedRecords === shifted.stats?.sample?.acceptedRecords,
      JSON.stringify({
        base: snapSummary(on.stats),
        shifted: snapSummary(shifted.stats),
      }),
    );
    await ctx.snap(null, "battle-map-style/grass-close-shifted", {
      shot: PNG.sync.write(shifted.crop),
    });
  } finally {
    await page.close();
  }
}

async function captureBladeField(ctx, page, overrides) {
  await page.goto(`${ctx.target}/renderer/${ROUTE}?${profileQuery(overrides)}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.route === "blade-field" &&
      window.__rendererLabStats?.stats?.bladeField?.drawCalls === 3,
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__bladeFieldWorld?.settlePresentedFrame?.());
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const shot = await page.locator("#renderer-canvas").screenshot({ timeout: 180000 });
  const image = PNG.sync.read(shot);
  return { stats, image, crop: cropRatio(image, CROP.x, CROP.y, CROP.width, CROP.height) };
}

function assertBladeFieldStats(ctx, stats, layerDisabled) {
  const blade = stats?.bladeField;
  ctx.check(
    `blade-field stats publish source-storage core shape (${layerDisabled ? "off" : "on"})`,
    stats?.route === "blade-field" &&
      stats?.productionBattleIntegration === false &&
      stats?.fixture === "sim-tint" &&
      stats?.sample?.clumpCellSize === 1.55 &&
      stats?.sample?.snapCellSize === 8 &&
      stats?.sample?.acceptedRecords > 12000 &&
      blade?.packedBytesPerRecord === 64 &&
      blade?.drawCalls === 3 &&
      blade?.tierCountSource === "cpu-mirror-live-distance-rule" &&
      blade?.sourceStorageCore?.cpuRecordsOnly === true &&
      blade?.sourceStorageCore?.drawIndirect === true &&
      blade?.sourceStorageCore?.visibleIndexBuffers === 3 &&
      blade?.sourceStorageCore?.runtimeComputeRoute === "active" &&
      blade?.sourceStorageCore?.bezierBladeSpine === true &&
      blade?.sourceStorageCore?.viewDependentThickness === true &&
      blade?.enabled === !layerDisabled &&
      blade?.palette?.source?.includes("meadowPalette.ts MEADOW.blade"),
    JSON.stringify({
      sample: stats?.sample,
      bladeField: blade,
      layerDisabled,
    }),
  );
}

function assertVerdict(ctx, name, crop, shouldPass) {
  const metric = structureMetrics(crop);
  const verdict = legibilityVerdict(metric);
  ctx.check(name, verdict.ok === shouldPass, JSON.stringify({ verdict, metric, oracleCrop: CROP }));
}

function profileQuery(overrides) {
  return new URLSearchParams({ ...BASE_QUERY, ...overrides });
}

function snapSummary(stats) {
  return {
    snapX: stats?.sample?.snapX,
    snapY: stats?.sample?.snapY,
    snapCellSize: stats?.sample?.snapCellSize,
    acceptedRecords: stats?.sample?.acceptedRecords,
    lodCounts: stats?.sample?.lodCounts,
    recordHash: stats?.bladeField?.recordHash,
  };
}
