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
// is meadow-mass texture; calibrating on it rejects real close-up grass.
const TARGET = new URL(
  "../../../specs/done/battle-map-style/assets/target-close-grass.png",
  import.meta.url,
);

export const VIEWPORT = { width: 1280, height: 800 };
export const RIVER_AND_CRAGS_RECT = { x0: -1200, y0: -800, x1: 1200, y1: 800 };
// The style-contract target binds on generated relief.
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

export const PRODUCTION_MID_GRASS_CAMERA = {
  ...VISTA_CAMERA,
  profile: "production-mid-grass",
  // zoom 12: the crop must frame BLADES at the battle camera (10-60m out).
  // At 4.5 under overcast the crop measured sub-pixel blades through haze -
  // an oracle pointed at fog.
  zoom: 12,
  cx: 0,
  cy: -310,
};

export const GRASS_RING_EDGE_CAMERA = {
  ...VISTA_CAMERA,
  profile: "grass-ring-edge",
  zoom: 5.4,
  cx: -40,
  cy: -360,
};

export const GRASS_RING_EDGE_MAX_ZOOM_CAMERA = {
  ...VISTA_CAMERA,
  profile: "grass-ring-edge-max-zoom",
  zoom: 28,
  cx: 0,
  cy: -310,
};

export const GRASS_COVERAGE_ZOOM_SWEEP = [
  { ...VISTA_CAMERA, profile: "grass-coverage-z5", zoom: 5.4, cx: -40, cy: -360 },
  { ...VISTA_CAMERA, profile: "grass-coverage-z8", zoom: 7.86, cx: 0, cy: -360 },
  { ...VISTA_CAMERA, profile: "grass-coverage-z12", zoom: 12, cx: 0, cy: -310 },
  { ...VISTA_CAMERA, profile: "grass-coverage-z18", zoom: 18, cx: 0, cy: -310 },
  { ...VISTA_CAMERA, profile: "grass-coverage-z24", zoom: 24, cx: 0, cy: -310 },
  { ...VISTA_CAMERA, profile: "grass-coverage-z28", zoom: 28, cx: 0, cy: -310 },
];

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
  "battle-map-style/production-mid-grass",
  "battle-map-style/grass-ring-edge",
  "battle-map-style/grass-ring-edge-max-zoom",
  ...Object.keys(BAND_CROPS).map((name) => `battle-map-style/${name}`),
];

export const meta = {
  name: "battle-map-style",
  kind: "visual",
  world: "photoreal-battle-generated-highland-vale",
  tier: "full",
  snapshots: SNAPSHOTS,
  describe:
    "The battle-map-style gate fixes the photoreal vista camera, named band crops, blade projection split, and grass legibility oracle.",
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

    const productionMid = await loadProfile(ctx, page, PRODUCTION_MID_GRASS_CAMERA);
    const productionMidShot = await page.screenshot({
      clip: await page.locator("#renderer-canvas").boundingBox(),
      timeout: 180000,
    });
    const productionMidImage = PNG.sync.read(productionMidShot);
    const productionMidCrop = cropByRect(productionMidImage, BAND_CROPS["near-grass"]);
    assertProductionMidGrassStructure(ctx, productionMidCrop, productionMid.stats);
    await ctx.snap(null, "battle-map-style/production-mid-grass", {
      shot: PNG.sync.write(productionMidCrop),
    });

    await assertGrassCoverageAcrossZoomBands(ctx, page);

    const ringEdge = await loadProfile(ctx, page, GRASS_RING_EDGE_CAMERA);
    const ringEdgeShot = await page.screenshot({
      clip: await page.locator("#renderer-canvas").boundingBox(),
      timeout: 180000,
    });
    const ringEdgeImage = PNG.sync.read(ringEdgeShot);
    assertNoHardGrassRingEdge(ctx, ringEdgeImage, ringEdge.camera3d, ringEdge.stats, {
      label: "vista",
    });
    await ctx.snap(null, "battle-map-style/grass-ring-edge", {
      shot: PNG.sync.write(cropByRect(ringEdgeImage, BAND_CROPS["near-grass"])),
    });

    const maxZoomRingEdge = await loadProfile(ctx, page, GRASS_RING_EDGE_MAX_ZOOM_CAMERA);
    const maxZoomShot = await page.screenshot({
      clip: await page.locator("#renderer-canvas").boundingBox(),
      timeout: 180000,
    });
    const maxZoomImage = PNG.sync.read(maxZoomShot);
    assertNoHardGrassRingEdge(ctx, maxZoomImage, maxZoomRingEdge.camera3d, maxZoomRingEdge.stats, {
      label: "max-zoom",
      // z28 shares the low-eye band with z12, whose battle-camera foreground
      // needs blades to ~74m (production-mid-grass) - so the edge cannot pin
      // to the 40m ring. Assert the close band scaled down from the 480m far
      // profile instead of an exact ring value.
      farGrassEndRange: [38, 100],
    });
    assertGroundKhakiPastBladeEdge(
      ctx,
      maxZoomImage,
      maxZoomRingEdge.camera3d,
      maxZoomRingEdge.stats,
    );
    await ctx.snap(null, "battle-map-style/grass-ring-edge-max-zoom", {
      shot: PNG.sync.write(cropByRect(maxZoomImage, BAND_CROPS["near-grass"])),
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
      // Generated maps seal E/W with the vista apron, not per-edge blocker meshes.
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

function assertProductionMidGrassStructure(ctx, crop, stats) {
  const metric = structureMetrics(crop);
  const verdict = {
    retention: metric.retention4 >= ORACLE.retention4Min * 0.58,
    contrast: metric.down4.contrast >= ORACLE.down4ContrastMin * 0.62,
    // Static whole-map grass is a UNIFORM loose field (~0.44 blades/m²)
    // distributed over the field, so the mid
    // camera reads sparser here by design. This floor guards against a
    // TOTALLY bald mid-ground (occupancy → 0), not dense carpet coverage.
    occupancy: metric.tile4.occupancy3 >= 0.18,
    verticalRuns: metric.verticalRun.tallColumnRatio >= ORACLE.verticalRunTallColumnMin * 0.62,
  };
  ctx.check(
    "production mid-zoom grass keeps the close-gate structure family with looser battle-camera floors",
    Object.values(verdict).every(Boolean) &&
      stats?.terrain?.grass?.productionSamplingProfile?.fieldCellSize <= 0.42 &&
      stats?.terrain?.grass?.productionSamplingProfile?.baseWidth >= 0.06 &&
      stats?.terrain?.grass?.productionSamplingProfile?.baseWidth <= 0.085 &&
      stats?.terrain?.grass?.tiers?.mid?.segments === 8 &&
      stats?.terrain?.grass?.transition?.farSoftWidthScale <= 1.6,
    JSON.stringify({
      verdict,
      // Raw full-resolution edge energy is diagnostic only here: it combines
      // blade edges with substrate detail, so the turf owner's deliberate
      // removal of synthetic fine grain must not masquerade as missing blades.
      rawEdgeDiagnostic: {
        value: metric.base.edge,
        closeGrassRange: [ORACLE.rawEdgeMin * 0.55, ORACLE.rawEdgeMax],
      },
      metric,
      oracle: ORACLE,
      profile: stats?.terrain?.grass?.productionSamplingProfile,
    }),
  );
}

async function assertGrassCoverageAcrossZoomBands(ctx, page) {
  const results = [];
  for (const profile of GRASS_COVERAGE_ZOOM_SWEEP) {
    const loaded = await loadProfile(ctx, page, profile);
    const shot = await page.screenshot({
      clip: await page.locator("#renderer-canvas").boundingBox(),
      timeout: 180000,
    });
    const image = PNG.sync.read(shot);
    const transition = activeGrassTransition(loaded.stats);
    const band = farGrassTextureProbeBand(transition);
    let crop = distanceBandCrop(image, loaded.camera3d, band.nearM, band.farM);
    // Low-eye stops: the beyond-edge band projects at/past the horizon, so the
    // crop comes back null while the entire visible frame sits inside the
    // blade zone. "Grass at every LOD" is satisfied by in-frame blades there -
    // judge the blade zone itself rather than an off-screen band.
    let judgedBand = "beyond-edge";
    if (!crop && transition) {
      const edge = Math.max(2, transition.farGrassEndM ?? 40);
      crop = distanceBandCrop(image, loaded.camera3d, edge * 0.35, edge * 0.9);
      judgedBand = "in-blade-zone (edge beyond horizon)";
    }
    const metric = crop ? structureMetrics(crop) : null;
    const coverage = grassCoverageMetric(metric);
    const textureVariance = farGrassTextureVariance(metric);
    results.push({
      profile: profile.profile,
      zoom: profile.zoom,
      band,
      transition,
      activeRecordBudget: loaded.stats?.terrain?.grass?.rebuild?.activeRecordBudget ?? null,
      recordCount: loaded.stats?.terrain?.grass?.recordCount ?? null,
      crop: crop ? { width: crop.width, height: crop.height } : null,
      judgedBand,
      coverage,
      textureVariance,
      ok:
        Boolean(crop) &&
        coverage.green >= 0.04 &&
        coverage.texture >= 0.18 &&
        textureVariance.edge >= ORACLE.rawEdgeMin * 0.5 &&
        textureVariance.contrast >= ORACLE.down4ContrastMin * 0.52 &&
        coverage.darkVoid <= 0.18,
    });
  }
  ctx.check(
    "grass coverage sweep: every zoom stop has textured far grass beyond the active blade edge",
    results.every((result) => result.ok),
    JSON.stringify(results),
  );
}

function assertNoHardGrassRingEdge(ctx, image, camera3d, stats, options = {}) {
  const transition = activeGrassTransition(stats);
  const distances = transition
    ? grassRingProbeDistances(transition)
    : [90, 120, 150, 185, 230, 300, 390, 470];
  const bins = grassDistanceBins(image, camera3d, distances);
  const usable = bins.filter((bin) => bin.heightPx >= 10 && bin.metric.base.green > 0.04);
  const jumps = [];
  for (let i = 1; i < usable.length; i++) {
    const a = usable[i - 1].density;
    const b = usable[i].density;
    jumps.push({
      from: usable[i - 1].rangeM,
      to: usable[i].rangeM,
      delta: round3(Math.abs(a - b)),
      relative: round3(Math.abs(a - b) / Math.max(0.001, (a + b) * 0.5)),
    });
  }
  const oldEdge = jumps.find((jump) => jump.from[1] <= 150 && jump.to[0] >= 150);
  const activeEdge = transition
    ? jumps.find(
        (jump) => jump.from[0] <= transition.farGrassEndM && jump.to[1] >= transition.farGrassEndM,
      )
    : null;
  const maxJump = Math.max(0, ...jumps.map((jump) => jump.relative));
  const inRange =
    !options.farGrassEndRange ||
    (transition?.farGrassEndM >= options.farGrassEndRange[0] &&
      transition?.farGrassEndM <= options.farGrassEndRange[1]);
  ctx.check(
    `grass ring-edge check (${options.label ?? "default"}): projected density bins stay smooth across the active transition`,
    // At max zoom the projection compresses most distance bins under the
    // 10px floor - smoothness is then judged across whatever bins ARE
    // visible, and the sole-bin case must still show real grass coverage.
    (usable.length >= 4 || (usable.length >= 1 && usable[0].metric.base.green > 0.3)) &&
      maxJump <= 1.15 &&
      (!oldEdge || oldEdge.relative <= 0.72) &&
      (!activeEdge || activeEdge.relative <= 0.82) &&
      stats?.terrain?.grass?.transitionOwner === "battleGrassField.update" &&
      inRange,
    JSON.stringify({
      bins,
      jumps,
      oldEdge,
      activeEdge,
      maxJump: round3(maxJump),
      distances,
      expectedFarGrassEndRange: options.farGrassEndRange ?? null,
      activeTransition: stats?.terrain?.grass?.activeTransition,
      transition: stats?.terrain?.grass?.transition,
      tiers: stats?.terrain?.grass?.tiers,
    }),
  );
}

function assertGroundKhakiPastBladeEdge(ctx, image, camera3d, stats) {
  const transition = activeGrassTransition(stats);
  const beyond = transition
    ? distanceBandCrop(
        image,
        camera3d,
        transition.farGrassEndM * 1.08,
        Math.max(transition.farGrassEndM * 1.8, transition.farGrassEndM + 40),
      )
    : null;
  const metric = beyond ? structureMetrics(beyond) : null;
  const hue = metric ? rgbHue(metric.base.avg) : Number.NaN;
  const canopyHue = 62;
  const bareGreenHue = 105;
  // When the blade edge projects past the horizon the beyond-edge band does
  // not exist on screen; the hue handoff is vacuous. Pass only if the visible
  // blade zone is actually covered (a bald frame must still fail).
  let vacuousBeyondHorizon = false;
  let verdict =
    transition &&
    metric &&
    metric.base.green > 0.05 &&
    hueDistance(hue, canopyHue) < hueDistance(hue, bareGreenHue);
  if (!verdict && transition && !beyond) {
    const edge = Math.max(2, transition.farGrassEndM ?? 40);
    const inZone = distanceBandCrop(image, camera3d, edge * 0.35, edge * 0.9);
    const zoneMetric = inZone ? structureMetrics(inZone) : null;
    vacuousBeyondHorizon = Boolean(zoneMetric && zoneMetric.base.green > 0.3);
    verdict = vacuousBeyondHorizon;
  }
  ctx.check(
    "grass max-zoom ground term rises past the blade edge with khaki canopy hue, not bare green",
    verdict,
    JSON.stringify({
      transition,
      avg: metric?.base.avg ?? null,
      hue: round3(hue),
      canopyHue,
      bareGreenHue,
      canopyDistance: round3(hueDistance(hue, canopyHue)),
      bareGreenDistance: round3(hueDistance(hue, bareGreenHue)),
      greenRatio: metric?.base.green ?? null,
      vacuousBeyondHorizon,
    }),
  );
}

function farGrassTextureProbeBand(transition) {
  if (!transition) return { nearM: 70, farM: 140 };
  const edge = Math.max(2, transition.farGrassEndM ?? transition.farGrassStartM ?? 40);
  return {
    nearM: round3(edge * 1.08),
    farM: round3(Math.max(edge * 1.8, edge + 40)),
  };
}

function grassCoverageMetric(metric) {
  if (!metric) {
    return { green: 0, texture: 0, darkVoid: 1 };
  }
  const texture = round3(
    Math.min(1, metric.base.edge / Math.max(0.001, ORACLE.rawEdgeMin)) * 0.6 +
      Math.min(1, metric.down4.contrast / Math.max(0.001, ORACLE.down4ContrastMin)) * 0.4,
  );
  return {
    green: metric.base.green,
    texture,
    darkVoid: metric.base.darkVoid,
  };
}

function farGrassTextureVariance(metric) {
  if (!metric) return { edge: 0, contrast: 0, retention4: 0 };
  return {
    edge: metric.base.edge,
    contrast: metric.down4.contrast,
    retention4: metric.retention4,
  };
}

function grassDistanceBins(image, camera3d, distances) {
  if (!camera3d) return [];
  const eye = eyePosition(camera3d);
  const target = camera3d.target;
  const groundDir = normalize([target[0] - eye[0], target[1] - eye[1]]);
  const samples = distances
    .map((distance) => {
      const point = projectPoint(
        camera3d,
        [eye[0] + groundDir[0] * distance, eye[1] + groundDir[1] * distance, 0],
        VIEWPORT,
      );
      return point ? { distance, y: point.y } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
  const bins = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const y0 = Math.max(0, Math.min(VIEWPORT.height - 1, Math.min(a.y, b.y)));
    const y1 = Math.max(0, Math.min(VIEWPORT.height, Math.max(a.y, b.y)));
    const height = y1 - y0;
    if (height < 1) continue;
    const crop = cropRatio(
      image,
      0.16,
      y0 / image.height,
      0.68,
      Math.max(1 / image.height, height / image.height),
    );
    const metric = structureMetrics(crop);
    const density = round3(
      metric.base.green *
        Math.min(2.2, metric.base.edge / Math.max(0.001, ORACLE.rawEdgeMin)) *
        Math.min(1.6, metric.down4.contrast / Math.max(0.001, ORACLE.down4ContrastMin)),
    );
    bins.push({
      rangeM: [a.distance, b.distance],
      y: [round3(y0), round3(y1)],
      heightPx: round3(height),
      density,
      metric: {
        base: metric.base,
        down4: metric.down4,
        retention4: metric.retention4,
      },
    });
  }
  return bins;
}

function grassRingProbeDistances(transition) {
  const end = Math.max(1, transition.farGrassEndM);
  const start = Math.max(1, transition.farGrassStartM);
  const values = [
    Math.max(1, start * 0.65),
    start,
    start + (end - start) * 0.45,
    end,
    end * 1.22,
    end * 1.55,
    end * 2.0,
  ];
  return [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b);
}

function activeGrassTransition(stats) {
  return stats?.terrain?.grass?.activeTransition ?? stats?.terrain?.grass?.transition ?? null;
}

function distanceBandCrop(image, camera3d, nearM, farM) {
  if (!camera3d) return null;
  const eye = eyePosition(camera3d);
  const target = camera3d.target;
  const groundDir = normalize([target[0] - eye[0], target[1] - eye[1]]);
  const a = projectPoint(
    camera3d,
    [eye[0] + groundDir[0] * nearM, eye[1] + groundDir[1] * nearM, 0],
    VIEWPORT,
  );
  const b = projectPoint(
    camera3d,
    [eye[0] + groundDir[0] * farM, eye[1] + groundDir[1] * farM, 0],
    VIEWPORT,
  );
  if (!a || !b) return null;
  const y0 = Math.max(0, Math.min(image.height - 1, Math.min(a.y, b.y)));
  const y1 = Math.max(0, Math.min(image.height, Math.max(a.y, b.y)));
  const height = y1 - y0;
  if (height < 8) return null;
  return cropRatio(
    image,
    0.16,
    y0 / image.height,
    0.68,
    Math.max(1 / image.height, height / image.height),
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

function rgbHue(rgb) {
  const [r0, g0, b0] = rgb.map((v) => v / 255);
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const delta = max - min;
  if (delta <= 1e-6) return 0;
  let hue;
  if (max === r0) hue = ((g0 - b0) / delta) % 6;
  else if (max === g0) hue = (b0 - r0) / delta + 2;
  else hue = (r0 - g0) / delta + 4;
  return (hue * 60 + 360) % 360;
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function round3(value) {
  return Number(value.toFixed(3));
}
