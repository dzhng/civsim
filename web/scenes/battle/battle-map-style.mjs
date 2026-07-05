import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import {
  ORACLE,
  cropRatio,
  legibilityVerdict,
  structureMetrics,
} from "./battle-map-style-legibility-lib.js";

// Close-gate oracle calibration target: the archived close-lab hero crop
// (resolvable blades), NOT the vista reference's near-grass band - that band
// is meadow-mass texture and calibrating on it rejects real close-up grass
// (slice-00 trap, recorded in the slice file).
const TARGET = new URL(
  "../../../specs/done/battle-map-style/assets/target-close-grass.png",
  import.meta.url,
);

export const VIEWPORT = { width: 1280, height: 800 };
export const RIVER_AND_CRAGS_RECT = { x0: -1200, y0: -800, x1: 1200, y1: 800 };
// The style-contract target: binds on generated relief (slice 02 onward).
// 0.187: the ACCEPTED composition (compose gate round 3). The north is
// OPEN by design - armies arrive there and haze closes the horizon (spec
// invariant; the 0.5 aspiration predates that ruling and would demand
// ranges across the open end).
export const HORIZON_TARGET = { ratio: 0.187, tolerance: 0.02 };
export const NOMINAL_BLADE_HEIGHT_M = 1.0;

// Both cameras are the REAL production rig (zoom -> pitch/distance/fovY via
// battleCameraRig), rotated to face north along the corridor with the route's
// camYaw param. Never use the route's ?pitch/?yaw here - those only patch the
// reported stats snapshot, not the render camera.
export const VISTA_CAMERA = {
  route: "photoreal-battle",
  map: "gen",
  seed: 7,
  mapId: "highland-vale",
  env: "overcast-foggy",
  t: 0,
  ticks: 60,
  zoom: 7.76, // rig: pitch 0.305, distance 198, eye ~59 m - the hill-crest vista
  cx: 0,
  cy: -650,
  camYaw: -Math.PI / 2,
};

export const CLOSE_GATE_CAMERA = {
  ...VISTA_CAMERA,
  profile: "close-gate",
  zoom: 7.86, // rig: pitch 0.263, distance 76, eye ~20 m - blades ratify here
};

export const BAND_CROPS = {
  "near-grass": { x: 0, y: 0.56, width: 1, height: 0.38 },
  "mid-field": { x: 0.12, y: 0.38, width: 0.76, height: 0.18 },
  "flank-cliff-west": { x: 0, y: 0.25, width: 0.26, height: 0.34 },
  "flank-cliff-east": { x: 0.74, y: 0.25, width: 0.26, height: 0.34 },
  "sky-haze": { x: 0, y: 0.02, width: 1, height: 0.25 },
};

const SNAPSHOTS = [
  "battle-map-style/vista",
  "battle-map-style/close-gate",
  ...Object.keys(BAND_CROPS).map((name) => `battle-map-style/${name}`),
];

export const meta = {
  name: "battle-map-style",
  kind: "visual",
  world: "photoreal-battle-generated-highland-vale",
  tier: "full",
  snapshots: SNAPSHOTS,
  describe:
    "BMS00-SLICE-A7F3: locks the battle-map-style photoreal vista camera, named band crops, blade projection split, and grass legibility oracle.",
};

export async function run(ctx) {
  await runOracleCalibration(ctx);

  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "battle-map-style photoreal snaps require browser GPU flags",
      true,
      "set VERIFY_GPU=1",
    );
    return;
  }

  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-map-style",
  });
  try {
    const vista = await loadProfile(ctx, page, VISTA_CAMERA);
    assertPhotorealRoute(ctx, vista.stats);

    const horizon = measureFarTerrainHorizon(vista.camera3d);
    ctx.check(
      "far-terrain horizon measurement runs on the real render camera and meets the generated-relief target",
      Number.isFinite(horizon.horizonYRatio) &&
        Math.abs(horizon.horizonYRatio - HORIZON_TARGET.ratio) <= HORIZON_TARGET.tolerance,
      JSON.stringify(horizon),
    );

    const shot = await page.screenshot({
      clip: await page.locator("#renderer-canvas").boundingBox(),
      timeout: 180000,
    });
    const image = PNG.sync.read(shot);
    await ctx.snap(null, "battle-map-style/vista", { shot });
    for (const [name, rect] of Object.entries(BAND_CROPS)) {
      await ctx.snap(null, `battle-map-style/${name}`, {
        shot: PNG.sync.write(cropByRect(image, rect)),
      });
    }

    const close = await loadProfile(ctx, page, CLOSE_GATE_CAMERA);
    const closeProjection = projectedBladePx(close.camera3d);
    const vistaProjection = projectedBladePx(vista.camera3d);
    ctx.check(
      "blade projection split is locked on the real rig: close gate ratifies blade shape, vista only composes it",
      closeProjection >= 10.5 &&
        closeProjection <= 12.5 &&
        vistaProjection >= 4.0 &&
        vistaProjection <= 4.8,
      JSON.stringify({
        nominalBladeHeightM: NOMINAL_BLADE_HEIGHT_M,
        closeGatePx: round3(closeProjection),
        vistaPx: round3(vistaProjection),
        closeGate: cameraSummary(close.camera3d),
        vista: cameraSummary(vista.camera3d),
      }),
    );
    await ctx.snap(null, "battle-map-style/close-gate", {
      shot: await page.screenshot({
        clip: await page.locator("#renderer-canvas").boundingBox(),
        timeout: 180000,
      }),
    });
  } finally {
    await page.close();
  }
}

async function loadProfile(ctx, page, profile) {
  await page.goto(`${ctx.target}/renderer/photoreal-battle?${profileQuery(profile)}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.route === "photoreal-battle" &&
      window.__rendererLabStats?.stats?.renderStats?.terrain &&
      window.__rendererLabStats?.stats?.renderStats?.camera?.camera3d,
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.());
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats?.renderStats ?? null);
  return { stats, camera3d: stats?.camera?.camera3d ?? null };
}

function cameraSummary(camera3d) {
  if (!camera3d) return null;
  return {
    target: camera3d.target.map((v) => round3(v)),
    distance: round3(camera3d.distance),
    pitch: round3(camera3d.pitch),
    yaw: round3(camera3d.yaw),
    fovY: round3(camera3d.fovY),
  };
}

async function runOracleCalibration(ctx) {
  const target = PNG.sync.read(await readFile(TARGET));
  const targetCrop = target;
  const samples = {
    target: targetCrop,
    "grass-off": synthGrassOff(targetCrop),
    "stipple-carpet": synthStippleCarpet(targetCrop),
    "smooth-painted-meadow": synthSmoothPaintedMeadow(targetCrop),
  };
  const metrics = Object.fromEntries(
    Object.entries(samples).map(([name, image]) => [name, structureMetrics(image)]),
  );
  const verdicts = Object.fromEntries(
    Object.entries(metrics).map(([name, metric]) => [name, legibilityVerdict(metric)]),
  );
  ctx.check(
    "oracle calibration: target passes; controls fail with named failure modes",
    verdicts.target.ok === true &&
      verdicts["grass-off"].ok === false &&
      verdicts["grass-off"].failures.includes("no-fine-strand-detail") &&
      verdicts["grass-off"].failures.includes("low-structure-occupancy") &&
      verdicts["stipple-carpet"].ok === false &&
      verdicts["stipple-carpet"].failures.includes("raw-edge-stipple") &&
      verdicts["smooth-painted-meadow"].ok === false &&
      verdicts["smooth-painted-meadow"].failures.includes("no-fine-strand-detail"),
    JSON.stringify({ oracle: ORACLE, target: "target-close-grass.png", verdicts, metrics }),
  );
}

function assertPhotorealRoute(ctx, stats) {
  const terrain = stats?.terrain;
  ctx.check(
    "vista boots Highland Vale on the photoreal battle route with terrain, scenery, and grass",
    stats?.renderer === "gpu" &&
      stats?.projection === "camera3d" &&
      terrain?.environment?.id === "overcast-foggy" &&
      terrain?.fixture === "sim-tint" &&
      terrain?.groundCover === "green-grass" &&
      // Generated maps seal E/W with the vista apron (slice 14), not the
      // legacy per-edge blocker meshes.
      terrain?.sealedEdges?.includes("generated:vista") &&
      terrain?.groundTriangles > 100000 &&
      terrain?.scenery > 0 &&
      terrain?.grass?.layer === "photoreal-blade-field" &&
      terrain?.grass?.recordCount > 0 &&
      terrain?.grass?.packedStrideFloats === 16 &&
      terrain?.grass?.sourceStorageCore?.runtimeComputeRoute === "active" &&
      // Tint/slope rejection counts are focus-dependent (a mid-plain 64 m
      // window has nothing to reject) - eligibility is the data owner's
      // contract, not this boot check's.
      terrain?.grass?.sample?.acceptedRecords > 0,
    JSON.stringify({
      renderer: stats?.renderer,
      projection: stats?.projection,
      environment: stats?.environment,
      terrain,
    }),
  );
}

function profileQuery(profile) {
  const params = new URLSearchParams({
    map: profile.map,
    ref: "1",
    env: profile.env,
    t: String(profile.t),
    ticks: String(profile.ticks),
    zoom: String(profile.zoom),
    cx: String(profile.cx),
    cy: String(profile.cy),
    camYaw: String(profile.camYaw),
    only: [
      "photoreal-sky",
      "battle-backdrop",
      "battle-terrain",
      "battle-ground",
      "battle-horizon",
      "battle-scenery",
      "battle-grass",
      "battle-ocean",
    ].join(","),
  });
  if (profile.seed !== undefined) params.set("seed", String(profile.seed));
  return params;
}

function cropByRect(image, rect) {
  return cropRatio(image, rect.x, rect.y, rect.width, rect.height);
}

function measureFarTerrainHorizon(camera3d) {
  if (!camera3d) return { horizonYRatio: Number.NaN, samples: 0 };
  const ratios = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const x = RIVER_AND_CRAGS_RECT.x0 + (RIVER_AND_CRAGS_RECT.x1 - RIVER_AND_CRAGS_RECT.x0) * t;
    const point = projectPoint(camera3d, [x, RIVER_AND_CRAGS_RECT.y1, 0], VIEWPORT);
    if (point && point.x >= -VIEWPORT.width * 0.25 && point.x <= VIEWPORT.width * 1.25) {
      ratios.push(point.y / VIEWPORT.height);
    }
  }
  return {
    horizonYRatio: round3(avg(ratios)),
    deferredTarget: HORIZON_TARGET.ratio,
    source: "projected north far terrain perimeter",
    samples: ratios.length,
    min: round3(Math.min(...ratios)),
    max: round3(Math.max(...ratios)),
  };
}

function projectedBladePx(camera3d, bladeHeight = NOMINAL_BLADE_HEIGHT_M) {
  const [x, y, z] = camera3d.target;
  const base = projectPoint(camera3d, [x, y, z], VIEWPORT);
  const tip = projectPoint(camera3d, [x, y, z + bladeHeight], VIEWPORT);
  if (!base || !tip) return Number.NaN;
  return Math.hypot(tip.x - base.x, tip.y - base.y);
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

function synthGrassOff(src) {
  const out = new PNG({ width: src.width, height: src.height });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      const l = luma(src.data[i], src.data[i + 1], src.data[i + 2]);
      out.data[i] = Math.round(l * 0.82 + 58);
      out.data[i + 1] = Math.round(l * 0.78 + 64);
      out.data[i + 2] = Math.round(l * 0.55 + 44);
      out.data[i + 3] = 255;
    }
  }
  return synthSmoothPaintedMeadow(out);
}

function synthStippleCarpet(src) {
  const out = synthSmoothPaintedMeadow(src);
  let seed = 0x5eed1234;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) & 0xffff) / 0xffff;
  };
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4;
      if (rand() < 0.34) {
        const delta = rand() < 0.52 ? -58 - rand() * 36 : 42 + rand() * 52;
        out.data[i] = clampByte(out.data[i] + delta * 0.85);
        out.data[i + 1] = clampByte(out.data[i + 1] + delta);
        out.data[i + 2] = clampByte(out.data[i + 2] + delta * 0.72);
      }
    }
  }
  return out;
}

function synthSmoothPaintedMeadow(src) {
  const out = new PNG({ width: src.width, height: src.height });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = -6; yy <= 6; yy++) {
        const sy = Math.max(0, Math.min(src.height - 1, y + yy));
        for (let xx = -6; xx <= 6; xx++) {
          const sx = Math.max(0, Math.min(src.width - 1, x + xx));
          const i = (sy * src.width + sx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          a += src.data[i + 3];
          n++;
        }
      }
      const shade = 1 + 0.035 * Math.sin(x * 0.055) + 0.025 * Math.sin((x + y) * 0.025);
      const o = (y * src.width + x) * 4;
      out.data[o] = clampByte((r / n) * shade);
      out.data[o + 1] = clampByte((g / n) * shade);
      out.data[o + 2] = clampByte((b / n) * shade);
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
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

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luma(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function round3(value) {
  return Number(value.toFixed(3));
}
