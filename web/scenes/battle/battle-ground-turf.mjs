import { PNG } from "pngjs";
import { VISTA_CAMERA, VIEWPORT } from "./battle-map-style.mjs";
import { turfTelemetry } from "./turf-telemetry-lib.js";

export const meta = {
  name: "battle-ground-turf",
  kind: "visual",
  world: "production-typegpu-battle",
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
    // The production rig's nearest endpoint exposes individual foreground blades.
    camera: { ...VISTA_CAMERA, zoom: 8, cx: 0, cy: -360 },
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
  const requestedEdgeProfile = process.env.TURF_EDGE_PROFILE;
  if (requestedEdgeProfile && !EDGE_PROFILES.some(({ name }) => name === requestedEdgeProfile))
    throw Error(`Unknown turf edge profile: ${requestedEdgeProfile}`);
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
            full.grass?.layers?.some((layer) => layer.recordCount > 0) &&
            (full.grass?.visibility?.base || full.grass?.visibility?.ring) === profile.grassEnabled,
          JSON.stringify({ isolation: full.isolation, grass: full.grass }),
        );
        await ctx.snap(null, `ground-turf/full-${profile.name}`, {
          shot: full.shot,
          threshold: 0,
          maxDiffRatio: 0,
        });

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
          threshold: 0,
          maxDiffRatio: 0,
        });
      }
    }
    for (const profile of EDGE_PROFILES.filter(
      ({ name }) => !requestedEdgeProfile || name === requestedEdgeProfile,
    )) {
      const edge = await captureProfile(ctx, page, profile);
      const widths = edge.edgeFixture;
      ctx.check(
        `${profile.name} uses the single playable-ground RG8 earth-edge resource`,
        edge.earthEdges?.owner === "playable-ground" &&
          edge.earthEdges?.format === "rg8-unorm" &&
          edge.earthEdges?.textureResources === 1 &&
          edge.earthEdges?.vistaSamples === 0,
        JSON.stringify(edge.earthEdges),
      );
      ctx.check(
        `${profile.name} keeps every measured 10-90 edge feather within 1-2m`,
        [widths?.mudWidthMeters, widths?.roadLeftWidthMeters, widths?.roadRightWidthMeters].every(
          (width) => Number.isFinite(width) && width >= 1 && width <= 2,
        ) && widths?.detachedIslands === 0,
        JSON.stringify(widths),
      );
      await ctx.snap(null, `ground-turf/${profile.name}`, {
        shot: edge.shot,
        threshold: 0,
        maxDiffRatio: 0,
      });
    }
    if (process.env.TURF_EDGE_ONLY !== "1") await checkPhaseReturn(ctx, page);
  } finally {
    await page.close();
  }
}

async function checkPhaseReturn(ctx, page) {
  const initial = await captureProfile(ctx, page, { ...VISTA_CAMERA, only: GROUND_LAYERS });
  await moveAndWait(page, 260, -650);
  await moveAndWait(page, 0, -650);
  const returned = await page.locator("#renderer-canvas").screenshot({ timeout: 180000 });
  ctx.check(
    "ground substrate returns pixel-identically after a camera pan",
    changedPixelCount(initial.shot, returned) === 0,
  );
}

async function moveAndWait(page, x, y) {
  const previous = await page.evaluateHandle(() => window.__rendererLabStats);
  try {
    const requested = await page.evaluate(
      ([x, y]) => {
        window.__cam.setViewCenter(x, y);
        window.__cam.clampView();
        const [actualX, actualY] = window.__cam.viewCenter();
        return { x: actualX, y: actualY, zoom: window.__cam.zoom };
      },
      [x, y],
    );
    // The route replaces this object only after its GPU queue completes.
    // Read the published camera, not the live world's in-flight preparation.
    await page.waitForFunction(
      ({ previous, requested }) => {
        const frame = window.__rendererLabStats;
        if (frame?.ok === false) throw Error(`Turf route failed: ${JSON.stringify(frame.error)}`);
        const camera = frame?.renderStats?.preparedCamera;
        return (
          frame !== previous &&
          frame?.ok === true &&
          camera &&
          Math.abs(camera.x - requested.x) < 1e-6 &&
          Math.abs(camera.y - requested.y) < 1e-6 &&
          camera.zoom === requested.zoom
        );
      },
      { previous, requested },
      { timeout: 180000 },
    );
  } finally {
    await previous.dispose();
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
  });
  if (profile.only) params.set("only", profile.only);
  if (profile.terrain) params.set("terrain", profile.terrain);
  await page.goto(`${ctx.target}/renderer/photoreal-battle?${params}`);
  await page.waitForFunction(
    () => {
      const stats = window.__rendererLabStats;
      if (stats?.ok === false) throw Error(`Turf route failed: ${stats.error}`);
      return (
        window.__rendererLabReady === true &&
        stats?.ok === true &&
        stats.route === "photoreal-battle" &&
        stats.renderStats?.terrain
      );
    },
    undefined,
    { timeout: 180000 },
  );
  const grassVisible = await page.evaluate(() => window.__rendererLabStats.isolation.grassVisible);
  if (grassVisible) await waitForGrassResidency(page);
  const camera = await page.evaluate(() => ({
    actual: { center: window.__cam.viewCenter(), zoom: window.__cam.zoom },
    stats: window.__rendererLabStats.renderStats,
  }));
  ctx.check(
    "turf capture uses a completed production TypeGPU camera",
    camera.stats.substrate === "typegpu" &&
      Math.abs(camera.stats.preparedCamera.x - camera.actual.center[0]) < 1e-6 &&
      Math.abs(camera.stats.preparedCamera.y - camera.actual.center[1]) < 1e-6 &&
      camera.stats.preparedCamera.zoom === camera.actual.zoom,
    JSON.stringify(camera.stats.preparedCamera),
  );
  return {
    shot: await page.locator("#renderer-canvas").screenshot({ timeout: 180000 }),
    earthEdges: await page.evaluate(
      () => window.__rendererLabStats?.renderStats?.terrain?.earthEdges ?? null,
    ),
    grass: await page.evaluate(() => window.__rendererLabStats?.renderStats?.grass ?? null),
    isolation: await page.evaluate(() => window.__rendererLabStats?.isolation ?? null),
    edgeFixture: await page.evaluate(() => window.__rendererLabStats?.edgeFixture ?? null),
  };
}

async function waitForGrassResidency(page) {
  const budget = process.env.VERIFY_GPU_ADAPTER === "hardware" ? 180000 : 600000;
  const deadline = Date.now() + budget;
  let stalledFrames = 0;
  let previousProgress = null;
  let completedGeneration = null;
  let diagnostic = null;
  while (Date.now() < deadline) {
    const frame = await page.evaluateHandle(() => window.__rendererLabStats);
    try {
      const state = await frame.evaluate((published) => {
        const grass = published?.renderStats?.grass;
        const rebuild = grass?.residency?.rebuild;
        return {
          ok: published?.ok,
          error: published?.error,
          pending: rebuild?.pending,
          generation: rebuild?.requestedGeneration,
          required: rebuild?.requiredTiles,
          resident: rebuild?.residentTiles,
          missing: rebuild?.missingTiles,
          sampled: rebuild?.sampledCells,
          published: rebuild?.publishedRecords,
          uploads: grass?.uploads,
          ranges: grass?.ringRecordRanges,
        };
      });
      diagnostic = state;
      if (state.ok !== true) throw Error(`Turf route failed: ${JSON.stringify(state)}`);
      // Empty blade buffers at a distant camera are valid; their required
      // visibility and content remain separate assertions in the caller.
      // Sampling can finish during GPU submission. A later completed frame must
      // consume the final publication before its pixels are ready to capture.
      if (state.pending === false) {
        if (completedGeneration === state.generation) return;
        completedGeneration = state.generation;
      } else completedGeneration = null;
      const progress = JSON.stringify([
        state.generation,
        state.required,
        state.resident,
        state.missing,
        state.sampled,
        state.published,
        state.uploads,
        state.ranges,
      ]);
      stalledFrames = progress === previousProgress ? stalledFrames + 1 : 0;
      if (stalledFrames >= 8)
        throw Error(
          `Turf residency made no progress across 8 completed frames: ${JSON.stringify(state)}`,
        );
      previousProgress = progress;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        const next = await page.waitForFunction(
          (previous) =>
            window.__rendererLabStats !== previous || window.__rendererLabStats?.ok === false,
          frame,
          { timeout: Math.min(60000, remaining) },
        );
        await next.dispose();
      } catch (error) {
        throw Error(`Turf completed-frame wait failed: ${JSON.stringify(diagnostic)}`, {
          cause: error,
        });
      }
    } finally {
      await frame.dispose();
    }
  }
  throw Error(`Turf residency exceeded ${budget / 1000}s: ${JSON.stringify(diagnostic)}`);
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
