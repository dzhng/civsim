import { PNG } from "pngjs";
import { VISTA_CAMERA, VIEWPORT } from "./battle-map-style.mjs";
import { turfTelemetry } from "./turf-telemetry-lib.js";

export const meta = {
  name: "battle-ground-turf",
  kind: "visual",
  world: "battle-ground-turf-workbench",
  tier: "full",
  snapshots: [
    "ground-turf/turf-tile",
    "ground-turf/turf-spike-topdown",
    "ground-turf/turf-spike-rts",
    "ground-turf/turf-spike-sizes",
    "ground-turf/rts",
    "ground-turf/topdown",
    "ground-turf/far-band",
    "ground-turf/attribution/mottle-off",
    "ground-turf/attribution/canopy-off",
    "ground-turf/attribution/mottle-topdown-off",
    "ground-turf/attribution/canopy-topdown-off",
    "ground-turf/attribution/quad-owner",
    "ground-turf/attribution/quad-flecks-quad-off",
    "ground-turf/attribution/scrub-quad-off",
  ],
  describe:
    "The archived turf bake workbench plus a fixed production meadow fixture, term-off attribution, and pure contrast telemetry.",
};

const VIEWS = [
  ["tile", "ground-turf/turf-tile"],
  ["topdown", "ground-turf/turf-spike-topdown"],
  ["rts", "ground-turf/turf-spike-rts"],
  ["sizes", "ground-turf/turf-spike-sizes"],
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("turf workbench requires browser GPU flags", true, "set VERIFY_GPU=1 to capture");
    return;
  }

  let firstHash = null;
  for (const [view, snapshot] of VIEWS) {
    const page = await openWorkbench(ctx, view);
    const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
    ctx.check(
      `${view} bake is byte-deterministic within a cold boot`,
      stats?.deterministic === true,
    );
    ctx.check(
      `${view} different seed changes baked bytes`,
      stats?.differentSeedDiffers === true && stats?.primaryHash !== stats?.alternateHash,
      JSON.stringify(stats),
    );
    if (firstHash === null) firstHash = stats?.primaryHash;
    else
      ctx.check(
        `${view} cold boot reproduces the primary byte hash`,
        stats?.primaryHash === firstHash,
        JSON.stringify({ firstHash, hash: stats?.primaryHash }),
      );
    if (view === "topdown" || view === "rts")
      ctx.check(
        `${view} framing comes from the production battle camera rig`,
        stats?.cameraContract === "battleCameraRig",
      );
    await ctx.snap(page, snapshot, { shot: await page.locator("#renderer-canvas").screenshot() });
    await page.close();
  }

  await captureProductionMeadow(ctx);
}

const GROUND_LAYERS = [
  "photoreal-sky",
  "battle-backdrop",
  "battle-terrain",
  "battle-ground",
  "battle-vista",
  "battle-horizon",
].join(",");
const QUAD_LAYERS = ["photoreal-sky", "battle-backdrop", "battle-terrain-quad"].join(",");
const RTS_CROP = { x: 0.12, y: 0.36, width: 0.76, height: 0.3 };
const TOPDOWN_CROP = { x: 0.08, y: 0.08, width: 0.84, height: 0.84 };
const FAR_CROP = { x: 0.08, y: 0.28, width: 0.84, height: 0.34 };

async function captureProductionMeadow(ctx) {
  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-ground-turf-production",
  });
  try {
    const rts = await captureProfile(ctx, page, { ...VISTA_CAMERA, only: GROUND_LAYERS });
    const rtsCrop = cropRatio(PNG.sync.read(rts.shot), RTS_CROP);
    const telemetry = turfTelemetry(rtsCrop);
    ctx.check(
      "production meadow telemetry is finite and published from the fixed ground-only crop",
      Object.values({
        meanLuma: telemetry.meanLuma,
        span: telemetry.lumaSpanP90P10,
        rms: telemetry.midBandRms,
        hue: telemetry.oklab.meanHueDeg,
        chroma: telemetry.oklab.meanChroma,
      }).every(Number.isFinite),
      JSON.stringify(telemetry),
    );
    await ctx.snap(null, "ground-turf/rts", { shot: PNG.sync.write(rtsCrop) });

    const topdown = await captureProfile(ctx, page, {
      ...VISTA_CAMERA,
      zoom: 1,
      cx: 0,
      cy: -100,
      only: GROUND_LAYERS,
    });
    await ctx.snap(null, "ground-turf/topdown", {
      shot: PNG.sync.write(cropRatio(PNG.sync.read(topdown.shot), TOPDOWN_CROP)),
    });

    const farDefault = await captureProfile(ctx, page, {
      ...VISTA_CAMERA,
      zoom: 1.3,
      cx: 0,
      cy: -100,
      only: GROUND_LAYERS,
    });
    const farWide = await captureProfile(ctx, page, {
      ...VISTA_CAMERA,
      zoom: 1,
      cx: 0,
      cy: -100,
      only: GROUND_LAYERS,
    });
    await ctx.snap(null, "ground-turf/far-band", {
      shot: PNG.sync.write(
        stackVertical([
          cropRatio(PNG.sync.read(farDefault.shot), FAR_CROP),
          cropRatio(PNG.sync.read(farWide.shot), FAR_CROP),
        ]),
      ),
    });

    for (const detail of ["mottle", "canopy"]) {
      const attribution = await captureProfile(ctx, page, {
        ...VISTA_CAMERA,
        only: GROUND_LAYERS,
        detail,
      });
      ctx.check(
        `${detail} attribution cold boot disables exactly that ground term`,
        attribution.groundDetail?.disabled === detail,
        JSON.stringify(attribution.groundDetail),
      );
      const crop = cropRatio(PNG.sync.read(attribution.shot), RTS_CROP);
      ctx.check(
        `${detail} attribution telemetry is finite`,
        Number.isFinite(turfTelemetry(crop).midBandRms),
        JSON.stringify(turfTelemetry(crop)),
      );
      await ctx.snap(null, `ground-turf/attribution/${detail}-off`, {
        shot: PNG.sync.write(crop),
      });
      const topdownAttribution = await captureProfile(ctx, page, {
        ...VISTA_CAMERA,
        zoom: 1,
        cx: 0,
        cy: -100,
        only: GROUND_LAYERS,
        detail,
      });
      await ctx.snap(null, `ground-turf/attribution/${detail}-topdown-off`, {
        shot: PNG.sync.write(cropRatio(PNG.sync.read(topdownAttribution.shot), TOPDOWN_CROP)),
      });
    }

    const quadOwner = await captureQuadPair(ctx, page);
    await ctx.snap(null, "ground-turf/attribution/quad-owner", { shot: quadOwner.shot });
    for (const detail of ["quad-flecks", "scrub"]) {
      const attribution = await captureQuadPair(ctx, page, detail);
      ctx.check(
        `${detail} attribution is applied by the world to the quad material family`,
        attribution.groundDetail?.disabled === detail &&
          attribution.groundDetail?.appliedTo?.includes("terrain-quad"),
        JSON.stringify(attribution.groundDetail),
      );
      const changed = changedPixelCount(quadOwner.shot, attribution.shot);
      ctx.check(
        `${detail} attribution changes pixels in its owning quad capture`,
        changed > 0,
        `${changed} changed pixels`,
      );
      await ctx.snap(null, `ground-turf/attribution/${detail}-quad-off`, {
        shot: attribution.shot,
      });
    }
  } finally {
    await page.close();
  }
}

async function captureProfile(ctx, page, profile) {
  const params = new URLSearchParams({
    map: profile.map,
    seed: String(profile.seed),
    ref: "1",
    env: profile.env,
    t: String(profile.t),
    ticks: String(profile.ticks),
    zoom: String(profile.zoom),
    cx: String(profile.cx),
    cy: String(profile.cy),
    camYaw: String(profile.camYaw),
    only: profile.only,
  });
  if (profile.detail) params.set("detail", profile.detail);
  await page.goto(`${ctx.target}/renderer/photoreal-battle?${params}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.route === "photoreal-battle" &&
      window.__rendererLabStats?.stats?.renderStats?.terrain,
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.());
  return {
    shot: await page.locator("#renderer-canvas").screenshot({ timeout: 180000 }),
    groundDetail: await page.evaluate(
      () => window.__rendererLabStats?.stats?.renderStats?.groundDetail ?? null,
    ),
  };
}

async function captureQuadPair(ctx, page, detail) {
  const frames = [];
  let groundDetail = null;
  for (const zoom of [1.3, 1]) {
    const capture = await captureProfile(ctx, page, {
      ...VISTA_CAMERA,
      zoom,
      cx: 0,
      cy: -100,
      only: QUAD_LAYERS,
      detail,
    });
    frames.push(cropRatio(PNG.sync.read(capture.shot), FAR_CROP));
    groundDetail = capture.groundDetail;
  }
  return { shot: PNG.sync.write(stackVertical(frames)), groundDetail };
}

function changedPixelCount(a, b) {
  const left = PNG.sync.read(a);
  const right = PNG.sync.read(b);
  if (left.width !== right.width || left.height !== right.height) return -1;
  let changed = 0;
  for (let i = 0; i < left.data.length; i += 4) {
    if (
      left.data[i] !== right.data[i] ||
      left.data[i + 1] !== right.data[i + 1] ||
      left.data[i + 2] !== right.data[i + 2] ||
      left.data[i + 3] !== right.data[i + 3]
    )
      changed++;
  }
  return changed;
}

function cropRatio(source, rect) {
  const x = Math.floor(source.width * rect.x);
  const y = Math.floor(source.height * rect.y);
  const width = Math.max(1, Math.floor(source.width * rect.width));
  const height = Math.max(1, Math.floor(source.height * rect.height));
  const out = new PNG({ width, height });
  PNG.bitblt(source, out, x, y, width, height, 0, 0);
  return out;
}

function stackVertical(images) {
  const width = Math.max(...images.map((image) => image.width));
  const height = images.reduce((sum, image) => sum + image.height, 0);
  const out = new PNG({ width, height });
  let y = 0;
  for (const image of images) {
    PNG.bitblt(image, out, 0, 0, image.width, image.height, 0, y);
    y += image.height;
  }
  return out;
}

async function openWorkbench(ctx, view) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `battle-ground-turf-${view}`,
  });
  await page.goto(`${ctx.target}/renderer/battle-ground-turf?view=${view}`);
  await page.waitForFunction(
    (expected) =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.stats?.view === expected,
    view,
    { timeout: 30000 },
  );
  await page.waitForTimeout(250);
  return page;
}
