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
    await checkPhaseReturn(ctx, page);
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
