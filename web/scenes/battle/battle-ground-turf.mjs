import { PNG } from "pngjs";
import { VISTA_CAMERA, VIEWPORT } from "./battle-map-style.mjs";
import { turfTelemetry } from "./turf-telemetry-lib.js";

export const meta = {
  name: "battle-ground-turf",
  kind: "visual",
  world: "production-photoreal-battle",
  tier: "full",
  snapshots: [
    "ground-turf/full-close",
    "ground-turf/full-rts",
    "ground-turf/full-topdown",
    "ground-turf/ground-only-close",
    "ground-turf/ground-only-rts",
    "ground-turf/ground-only-topdown",
    "ground-turf/dirt-edge",
    "ground-turf/road-edge",
    "ground-turf/road-scree-rts",
    "ground-turf/edge-ruler",
  ],
  describe:
    "Production grass-visible meadow proof at real cameras, paired with substrate-only controls.",
};

const GROUND_LAYERS = [
  "photoreal-sky",
  "battle-backdrop",
  "battle-terrain",
  "battle-ground",
  "battle-vista",
  "battle-horizon",
].join(",");

const EDGE_LAYERS = ["battle-ground", "battle-grass", "battle-edge-ruler"].join(",");
const EDGE_RULER_LAYERS = ["battle-ground", "battle-edge-ruler"].join(",");

const EDGE_PROFILES = [
  { name: "dirt-edge", zoom: 12, cx: -69, cy: -35, camYaw: -Math.PI / 2 },
  { name: "road-edge", zoom: 12, cx: 0, cy: -35, camYaw: -Math.PI / 2 },
  { name: "road-scree-rts", zoom: 9, cx: 20, cy: -105 },
  {
    name: "edge-ruler",
    zoom: 20,
    cx: -69,
    cy: -10,
    camYaw: -Math.PI / 2,
    only: EDGE_RULER_LAYERS,
  },
].map((profile) => ({
  ...VISTA_CAMERA,
  ...profile,
  map: "A",
  env: "golden-hour",
  camYaw: profile.camYaw ?? 0,
  terrain: "edge",
  only: profile.only ?? EDGE_LAYERS,
}));

const PROFILES = [
  {
    name: "close",
    grassEnabled: true,
    camera: { ...VISTA_CAMERA, zoom: 7.86, cx: 0, cy: -360 },
  },
  {
    name: "rts",
    grassEnabled: true,
    camera: { ...VISTA_CAMERA },
  },
  {
    name: "topdown",
    grassEnabled: false,
    camera: { ...VISTA_CAMERA, zoom: 1, cx: 0, cy: -100 },
  },
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("turf production proof requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-ground-turf-production",
  });
  try {
    if (process.env.TURF_EDGE_ONLY !== "1") {
      for (const profile of PROFILES) {
        const full = await captureProfile(ctx, page, profile.camera);
        const fullCold = await captureProfile(ctx, page, profile.camera);
        ctx.check(
          `${profile.name} full-production frame is deterministic across cold boots`,
          changedPixelCount(full.shot, fullCold.shot) === 0,
        );
        ctx.check(
          `${profile.name} full-production frame keeps blade-field ownership and its production cutoff`,
          full.isolation?.grassVisible === true &&
            full.grass?.recordCount > 0 &&
            full.grass?.enabled === profile.grassEnabled,
          JSON.stringify({ isolation: full.isolation, grass: full.grass }),
        );
        ctx.check(
          `${profile.name} production substrate exposes no synthetic fine-detail mode`,
          full.groundDetail?.fineMode === undefined &&
            ["ground", "vista", "terrain-quad"].every((owner) =>
              full.groundDetail?.appliedTo?.includes(owner),
            ),
          JSON.stringify(full.groundDetail),
        );
        await ctx.snap(null, `ground-turf/full-${profile.name}`, { shot: full.shot });

        const groundOnly = await captureProfile(ctx, page, {
          ...profile.camera,
          only: GROUND_LAYERS,
        });
        const groundOnlyCold = await captureProfile(ctx, page, {
          ...profile.camera,
          only: GROUND_LAYERS,
        });
        ctx.check(
          `${profile.name} ground-only control is deterministic across cold boots`,
          changedPixelCount(groundOnly.shot, groundOnlyCold.shot) === 0,
        );
        ctx.check(
          `${profile.name} ground-only control persistently disables blade geometry`,
          groundOnly.isolation?.grassVisible === false,
          JSON.stringify(groundOnly.isolation),
        );
        ctx.check(
          `${profile.name} ground-only frame telemetry is finite`,
          finiteTelemetry(groundOnly.shot),
          JSON.stringify(turfTelemetry(PNG.sync.read(groundOnly.shot))),
        );
        await ctx.snap(null, `ground-turf/ground-only-${profile.name}`, {
          shot: groundOnly.shot,
        });
      }
    }
    const requestedEdgeProfile = process.env.TURF_EDGE_PROFILE;
    for (const profile of EDGE_PROFILES.filter(
      ({ name }) => !requestedEdgeProfile || name === requestedEdgeProfile,
    )) {
      const edge = await captureProfile(ctx, page, profile);
      const widths = edge.edgeFixture;
      ctx.check(
        `${profile.name} uses the single playable-ground RG8 earth-edge resource`,
        edge.groundDetail?.earthEdges?.owner === "playable-ground" &&
          edge.groundDetail?.earthEdges?.format === "rg8-unorm" &&
          edge.groundDetail?.earthEdges?.textureResources === 1 &&
          edge.groundDetail?.earthEdges?.vistaSamples === 0,
        JSON.stringify(edge.groundDetail?.earthEdges),
      );
      ctx.check(
        `${profile.name} keeps every measured 10-90 edge feather within 1-2m`,
        [widths?.mudWidthMeters, widths?.roadLeftWidthMeters, widths?.roadRightWidthMeters].every(
          (width) => Number.isFinite(width) && width >= 1 && width <= 2,
        ) && widths?.detachedIslands === 0,
        JSON.stringify(widths),
      );
      await ctx.snap(null, `ground-turf/${profile.name}`, { shot: edge.shot });
    }
    if (process.env.TURF_EDGE_ONLY !== "1") await checkPhaseReturn(ctx, page);
  } finally {
    await page.close();
  }
}

async function checkPhaseReturn(ctx, page) {
  const initial = await captureProfile(ctx, page, { ...VISTA_CAMERA, only: GROUND_LAYERS });
  await page.evaluate(() => {
    window.__cam?.setViewCenter(260, -650);
    window.__cam?.clampView();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.());
  await page.evaluate(() => {
    window.__cam?.setViewCenter(0, -650);
    window.__cam?.clampView();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.());
  const returned = await page.locator("#renderer-canvas").screenshot({ timeout: 180000 });
  ctx.check(
    "ground substrate returns pixel-identically after a camera pan",
    changedPixelCount(initial.shot, returned) === 0,
  );
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
  });
  if (profile.only) params.set("only", profile.only);
  if (profile.terrain) params.set("terrain", profile.terrain);
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
  if (!profile.only) {
    await page.waitForFunction(
      () => {
        const grass = window.__rendererLabStats?.stats?.renderStats?.terrain?.grass;
        return grass?.recordCount > 0 && grass?.rebuild?.pending !== true;
      },
      undefined,
      { timeout: 30000 },
    );
  }
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.());
  return {
    shot: await page.locator("#renderer-canvas").screenshot({ timeout: 180000 }),
    groundDetail: await page.evaluate(
      () => window.__rendererLabStats?.stats?.renderStats?.groundDetail ?? null,
    ),
    grass: await page.evaluate(
      () => window.__rendererLabStats?.stats?.renderStats?.terrain?.grass ?? null,
    ),
    isolation: await page.evaluate(() => window.__rendererLabStats?.stats?.isolation ?? null),
    edgeFixture: await page.evaluate(() => window.__rendererLabStats?.stats?.edgeFixture ?? null),
  };
}

function finiteTelemetry(buffer) {
  const telemetry = turfTelemetry(PNG.sync.read(buffer));
  return [
    telemetry.meanLuma,
    telemetry.lumaSpanP90P10,
    telemetry.midBandRms,
    telemetry.oklab.meanHueDeg,
    telemetry.oklab.meanChroma,
  ].every(Number.isFinite);
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
