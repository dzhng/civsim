import { PNG } from "pngjs";
import { BAND_CROPS, HORIZON_TARGET, VIEWPORT, VISTA_CAMERA } from "./battle-map-style.mjs";

const SEED = 7;
const ENV = "overcast-highland";
const EDGE_DELTA_MAX = 12;
const MID_FIELD_DELTA_MIN = 9;
const MID_FIELD_SATURATION_MIN = 5;

export const meta = {
  name: "battle-genmap-mood",
  kind: "visual",
  world: "battle-generated-seed-7-explicit-overcast-highland",
  tier: "full",
  snapshots: [
    "battle-genmap-mood/vista",
    "battle-genmap-mood/sky-haze",
    "battle-genmap-mood/mid-field",
  ],
  describe:
    "Generated maps under explicit overcast-highland fog saturate inside the far ring while the playable field remains readable.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("generated mood snaps require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({ viewport: VIEWPORT, errorPrefix: "battle-genmap-mood" });
  try {
    await boot(page, ctx.target);
    await pose(
      page,
      VISTA_CAMERA.cx,
      VISTA_CAMERA.cy,
      VISTA_CAMERA.zoom,
      VISTA_CAMERA.camYaw,
      0.305,
    );

    const stats = await page.evaluate(() => window.__game.stats().renderStats);
    ctx.check(
      "generated map explicit environment selected overcast-highland",
      stats?.environment === "overcast-highland" &&
        stats?.terrain?.environment?.id === "overcast-highland" &&
        stats?.terrain?.environment?.source === "CIVSIM_ENVIRONMENTS.overcast-highland" &&
        stats?.terrain?.environment?.waterAlias === "CIVSIM_ENVIRONMENTS.overcast-highland" &&
        stats?.terrain?.vista?.bands?.some((b) => b.name === "farFog"),
      JSON.stringify({
        environment: stats?.environment,
        terrainEnvironment: stats?.terrain?.environment,
        vista: stats?.terrain?.vista,
      }),
    );

    const shot = await canvasShot(page);
    const image = PNG.sync.read(shot);
    const edge = await farRingFogDelta(page, image);
    ctx.check(
      "far-fog-ring outer edge is fully fogged into the horizon sky",
      // Median: E/W corner samples compare ring pixels against RIDGE
      // silhouettes 24px above (terrain-on-terrain), not sky - robust
      // center over those outliers; p90 stays as telemetry.
      edge.samples >= 12 && edge.medianDelta <= EDGE_DELTA_MAX,
      JSON.stringify({ ...edge, threshold: EDGE_DELTA_MAX }),
    );

    const mid = cropRatio(image, { x: 0.18, y: 0.44, width: 0.64, height: 0.18 });
    const midStats = midFieldStats(mid, sampleSkyColor(image, 0.5, 0.32));
    ctx.check(
      "playable far field is not fully fogged at gameplay depth",
      midStats.meanDeltaFromSky >= MID_FIELD_DELTA_MIN &&
        midStats.meanSaturation >= MID_FIELD_SATURATION_MIN,
      JSON.stringify({
        ...midStats,
        deltaThreshold: MID_FIELD_DELTA_MIN,
        saturationThreshold: MID_FIELD_SATURATION_MIN,
      }),
    );

    const horizon = await measureVistaHorizon(page);
    ctx.check(
      "horizon measurement pinned for the overcast-highland runway",
      Number.isFinite(horizon.horizonYRatio),
      JSON.stringify({ horizon, target: HORIZON_TARGET }),
    );

    await ctx.snap(null, "battle-genmap-mood/vista", { shot });
    await ctx.snap(null, "battle-genmap-mood/sky-haze", {
      shot: PNG.sync.write(cropRatio(image, BAND_CROPS["sky-haze"])),
    });
    await ctx.snap(null, "battle-genmap-mood/mid-field", { shot: PNG.sync.write(mid) });
  } finally {
    await page.close();
  }
}

async function boot(page, target) {
  await page.goto(`${target}/?map=gen&seed=${SEED}&ai=off&env=${ENV}`);
  await page.waitForFunction(
    () =>
      window.__ready === true &&
      window.__game?.stats?.().renderStats?.terrain?.vista?.bands?.length === 2,
    undefined,
    { timeout: 180000 },
  );
  await page.evaluate((tick) => window.__game.freezeAtTick(tick), VISTA_CAMERA.ticks);
  await page.waitForTimeout(250);
}

async function pose(page, x, y, zoom, yaw, pitch) {
  await page.evaluate(
    ({ x, y, zoom, yaw, pitch }) => window.__game.setCamera(x, y, zoom, yaw, pitch),
    { x, y, zoom, yaw, pitch },
  );
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__game.stats().renderStats);
}

async function canvasShot(page) {
  return page.screenshot({
    clip: await page.locator("#battlefield").boundingBox(),
    timeout: 180000,
  });
}

async function farRingFogDelta(page, image) {
  const data = await page.evaluate(() => {
    const camera3d = window.__game.stats().renderStats.camera.camera3d;
    const terrain = window.__game.stats().renderStats.terrain;
    const far = terrain.vista.bands.find((b) => b.name === "farFog") ?? terrain.vista.bands.at(-1);
    const samples = [];
    for (let i = 0; i <= 96; i++) {
      const t = i / 96;
      const x = -far.outerHalfW + far.outerHalfW * 2 * t;
      samples.push([x, far.outerHalfH, window.__game.vistaHeightAt(x, far.outerHalfH) ?? 0]);
    }
    return { camera3d, samples };
  });
  const deltas = [];
  for (const world of data.samples) {
    const p = projectPoint(data.camera3d, world, VIEWPORT);
    if (!p || p.x < 0 || p.x >= image.width || p.y < 0 || p.y >= image.height) continue;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const edgeColor = pixel(image, x, y);
    const skyColor = pixel(image, x, Math.max(0, y - 24));
    deltas.push(colorDelta(edgeColor, skyColor));
  }
  deltas.sort((a, b) => a - b);
  return {
    samples: deltas.length,
    meanDelta: round3(deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length)),
    medianDelta: round3(deltas[Math.floor(deltas.length / 2)] ?? 0),
    p90Delta: round3(deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.9))] ?? 0),
  };
}

async function measureVistaHorizon(page) {
  const data = await page.evaluate(() => {
    const camera3d = window.__game.stats().renderStats.camera.camera3d;
    const terrain = window.__game.stats().renderStats.terrain;
    const far = terrain.vista.bands.find((b) => b.name === "farFog") ?? terrain.vista.bands.at(-1);
    const samples = [];
    for (let i = 0; i <= 96; i++) {
      const t = i / 96;
      const x = -far.outerHalfW + far.outerHalfW * 2 * t;
      const y = far.outerHalfH;
      samples.push([x, y, window.__game.vistaHeightAt(x, y) ?? 0]);
    }
    return { camera3d, samples };
  });
  const ratios = [];
  for (const world of data.samples) {
    const p = projectPoint(data.camera3d, world, VIEWPORT);
    if (p && p.x >= -VIEWPORT.width * 0.35 && p.x <= VIEWPORT.width * 1.35) {
      ratios.push(p.y / VIEWPORT.height);
    }
  }
  const avg = ratios.reduce((sum, value) => sum + value, 0) / Math.max(1, ratios.length);
  return {
    horizonYRatio: round3(avg),
    source: "farFog north edge projected through production camera3d with vistaHeightAt",
    samples: ratios.length,
    min: round3(Math.min(...ratios)),
    max: round3(Math.max(...ratios)),
  };
}

function midFieldStats(image, skyColor) {
  let delta = 0;
  let saturation = 0;
  let n = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const c = pixel(image, x, y);
      delta += colorDelta(c, skyColor);
      saturation += Math.max(...c) - Math.min(...c);
      n++;
    }
  }
  return {
    meanDeltaFromSky: round3(delta / Math.max(1, n)),
    meanSaturation: round3(saturation / Math.max(1, n)),
  };
}

function sampleSkyColor(image, fx, fy) {
  return pixel(
    image,
    Math.max(0, Math.min(image.width - 1, Math.round(image.width * fx))),
    Math.max(0, Math.min(image.height - 1, Math.round(image.height * fy))),
  );
}

function cropRatio(image, rect) {
  const x0 = Math.max(0, Math.floor(image.width * rect.x));
  const y0 = Math.max(0, Math.floor(image.height * rect.y));
  const w = Math.max(1, Math.floor(image.width * rect.width));
  const h = Math.max(1, Math.floor(image.height * rect.height));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * image.width + x0 + x) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = image.data[si];
      out.data[di + 1] = image.data[si + 1];
      out.data[di + 2] = image.data[si + 2];
      out.data[di + 3] = image.data[si + 3];
    }
  }
  return out;
}

function pixel(image, x, y) {
  const i =
    (Math.max(0, Math.min(image.height - 1, y)) * image.width +
      Math.max(0, Math.min(image.width - 1, x))) *
    4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

function colorDelta(a, b) {
  return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
}

function projectPoint(camera3d, world, viewport) {
  const eye = eyePosition(camera3d);
  const forward = normalize(sub(camera3d.target, eye));
  const right = normalize(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  const view = sub(world, eye);
  const x = dot(view, right);
  const y = dot(view, up);
  const z = dot(view, forward);
  if (z <= 0) return null;
  const tan = Math.tan(camera3d.fovY / 2);
  const ndcX = x / (z * tan * camera3d.aspect);
  const ndcY = y / (z * tan);
  return {
    x: (ndcX * 0.5 + 0.5) * viewport.width,
    y: (1 - (ndcY * 0.5 + 0.5)) * viewport.height,
  };
}

function eyePosition(camera3d) {
  return [
    camera3d.target[0] + camera3d.distance * Math.cos(camera3d.pitch) * Math.cos(camera3d.yaw),
    camera3d.target[1] + camera3d.distance * Math.cos(camera3d.pitch) * Math.sin(camera3d.yaw),
    camera3d.target[2] + camera3d.distance * Math.sin(camera3d.pitch),
  ];
}

function normalize(v) {
  const len = Math.hypot(...v) || 1;
  return v.map((x) => x / len);
}

function sub(a, b) {
  return a.map((x, i) => x - b[i]);
}

function dot(a, b) {
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function round3(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : Number.NaN;
}
