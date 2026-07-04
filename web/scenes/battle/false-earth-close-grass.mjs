import { PNG } from "pngjs";

export const meta = {
  name: "false-earth-close-grass",
  kind: "visual",
  world: "false-earth-close-grass",
  tier: "full",
  snapshots: ["grass/false-earth-close-material"],
  describe:
    "Standalone Three/WebGPU false-earth close grass source-path spike with true 3D storage-backed blade geometry.",
};

export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass",
  });
  await page.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage`,
  );
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass",
    undefined,
    { timeout: 60000 },
  );
  await page.waitForTimeout(200);

  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  ctx.check(
    "route publishes true 3D false-earth lab stats",
    stats?.route === "false-earth-close-grass" &&
      stats?.renderer === "Three.js WebGPURenderer" &&
      stats?.productionBattleIntegration === false,
    JSON.stringify(stats),
  );
  ctx.check(
    "source architecture variables are represented",
    stats?.cameraSnappedGrid === true &&
      stats?.deterministicWorldSeeds === true &&
      stats?.packedVec4PerBlade === 4 &&
      stats?.voronoiClumpBlend === true &&
      stats?.bezierBladeSpine === true &&
      stats?.terrainNormalAlignment === true &&
      stats?.viewDependentThickness === true &&
      stats?.proceduralBladeShading === true &&
      stats?.backend === "source-storage" &&
      stats?.sourceInstancedPlanes === true &&
      stats?.sharedBladePlaneGeometry === true &&
      stats?.visibleIndexBuffers === 3 &&
      stats?.drawIndirect === true,
    JSON.stringify(stats),
  );
  ctx.check(
    "runtime draw work is GPU-routed and culled through indirect LOD buffers",
    stats?.gpuRuntimeLodRouting === true &&
      stats?.gpuRuntimeCulling === true &&
      Number.isFinite(stats?.gpuRuntimeCulledRecords) &&
      /GPU compute/.test(stats?.computeStatus ?? ""),
    JSON.stringify({
      gpuRuntimeLodRouting: stats?.gpuRuntimeLodRouting,
      gpuRuntimeCulling: stats?.gpuRuntimeCulling,
      gpuRuntimeCulledRecords: stats?.gpuRuntimeCulledRecords,
      computeStatus: stats?.computeStatus,
    }),
  );
  const cullPage = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass-cull-proof",
  });
  await cullPage.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage&cullProof=1`,
  );
  await cullPage.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass" &&
      window.__rendererLabStats?.stats?.cullProof === true,
    undefined,
    { timeout: 60000 },
  );
  const cullStats = await cullPage.evaluate(() => window.__rendererLabStats?.stats ?? null);
  ctx.check(
    "cull-proof route actually removes far records",
    cullStats?.gpuRuntimeLodRouting === true &&
      cullStats?.gpuRuntimeCulling === true &&
      cullStats?.gpuRuntimeCulledRecords > 0 &&
      cullStats?.submittedTriangles < stats?.submittedTriangles,
    JSON.stringify({
      gpuRuntimeCulledRecords: cullStats?.gpuRuntimeCulledRecords,
      defaultTriangles: stats?.submittedTriangles,
      cullProofTriangles: cullStats?.submittedTriangles,
    }),
  );
  await cullPage.close();

  const gpuRecordsPage = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass-gpu-records",
  });
  await gpuRecordsPage.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage&records=gpu`,
  );
  await gpuRecordsPage.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass" &&
      window.__rendererLabStats?.stats?.recordSource === "gpu-generated",
    undefined,
    { timeout: 60000 },
  );
  const gpuRecordsStats = await gpuRecordsPage.evaluate(
    () => window.__rendererLabStats?.stats ?? null,
  );
  ctx.check(
    "gpu-record route generates source records on the GPU before LOD routing",
    gpuRecordsStats?.gpuComputedBladeData === true &&
      gpuRecordsStats?.recordSource === "gpu-generated" &&
      gpuRecordsStats?.gpuRuntimeLodRouting === true &&
      gpuRecordsStats?.gpuRuntimeCulling === true &&
      gpuRecordsStats?.storageRecords > stats?.storageRecords &&
      /generates camera-snapped packed blade records/.test(gpuRecordsStats?.computeStatus ?? ""),
    JSON.stringify({
      gpuComputedBladeData: gpuRecordsStats?.gpuComputedBladeData,
      recordSource: gpuRecordsStats?.recordSource,
      storageRecords: gpuRecordsStats?.storageRecords,
      baselineStorageRecords: stats?.storageRecords,
      gpuRuntimeLodRouting: gpuRecordsStats?.gpuRuntimeLodRouting,
      gpuRuntimeCulling: gpuRecordsStats?.gpuRuntimeCulling,
      computeStatus: gpuRecordsStats?.computeStatus,
    }),
  );
  await gpuRecordsPage.close();
  const hierarchyPage = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass-blade-hierarchy",
  });
  await hierarchyPage.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage&materialVariant=blade-owned-hierarchy`,
  );
  await hierarchyPage.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass" &&
      window.__rendererLabStats?.stats?.materialVariant === "blade-owned-hierarchy",
    undefined,
    { timeout: 60000 },
  );
  const hierarchyStats = await hierarchyPage.evaluate(
    () => window.__rendererLabStats?.stats ?? null,
  );
  const hierarchyShot = await hierarchyPage.locator("#renderer-canvas").screenshot();
  ctx.check(
    "blade-owned hierarchy route keeps source as coverage and expands visible sub-blades",
    hierarchyStats?.bladeHierarchy?.enabled === true &&
      hierarchyStats?.bladeHierarchy?.sourceRole ===
        "coverage/density/slope/orientation hints only" &&
      hierarchyStats?.bladeHierarchy?.subBladesPerRecord >= 7 &&
      hierarchyStats?.submittedTriangles > stats?.submittedTriangles,
    JSON.stringify({
      bladeHierarchy: hierarchyStats?.bladeHierarchy,
      candidateTriangles: hierarchyStats?.submittedTriangles,
      baselineTriangles: stats?.submittedTriangles,
    }),
  );
  const floorPage = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass-floor-diagnostic",
  });
  await floorPage.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage&materialVariant=blade-owned-hierarchy&floorDebug=terrain-chroma`,
  );
  await floorPage.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass" &&
      window.__rendererLabStats?.stats?.materialVariant === "blade-owned-hierarchy" &&
      window.__rendererLabStats?.stats?.floorDiagnostic?.enabled === true,
    undefined,
    { timeout: 60000 },
  );
  const floorStats = await floorPage.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const floorShot = await floorPage.locator("#renderer-canvas").screenshot();
  const floorMetrics = floorVisibilityMetrics(PNG.sync.read(floorShot));
  ctx.check(
    "floor diagnostic preserves AJ hierarchy geometry and publishes terrain chroma contract",
    floorStats?.floorDiagnostic?.mode === "terrain-chroma" &&
      floorStats?.floorDiagnostic?.keyColor === "#ff00ff" &&
      floorStats?.floorDiagnostic?.terrainOnly === true &&
      floorStats?.floorDiagnostic?.preservesGrassGeometry === true &&
      floorStats?.floorDiagnostic?.preservesGrassMaterial === true &&
      floorStats?.drawCalls === hierarchyStats?.drawCalls &&
      floorStats?.submittedTriangles === hierarchyStats?.submittedTriangles &&
      floorStats?.bladeRecords === hierarchyStats?.bladeRecords,
    JSON.stringify({
      floorDiagnostic: floorStats?.floorDiagnostic,
      floorDrawCalls: floorStats?.drawCalls,
      hierarchyDrawCalls: hierarchyStats?.drawCalls,
      floorTriangles: floorStats?.submittedTriangles,
      hierarchyTriangles: hierarchyStats?.submittedTriangles,
      floorBladeRecords: floorStats?.bladeRecords,
      hierarchyBladeRecords: hierarchyStats?.bladeRecords,
    }),
  );
  ctx.check(
    "floor diagnostic exposes measurable terrain without collapsing to an all-floor mask",
    floorMetrics.floorVisibleRatio > 0.02 && floorMetrics.floorVisibleRatio < 0.9,
    JSON.stringify(floorMetrics),
  );
  await ctx.snap(page, "grass/false-earth-close-floor-diagnostic", { shot: floorShot });
  await floorPage.close();

  const bf2Page = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass-bf2-density",
  });
  await bf2Page.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage&densityCoverage=bf2-density-parity`,
  );
  await bf2Page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass" &&
      window.__rendererLabStats?.stats?.densityCoverage?.mode === "bf2-density-parity",
    undefined,
    { timeout: 60000 },
  );
  const bf2Stats = await bf2Page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  ctx.check(
    "BF2 density candidate publishes one-plane false-earth coverage stats",
    bf2Stats?.densityCoverage?.requested === true &&
      bf2Stats?.densityCoverage?.onePlanePerBlade === true &&
      bf2Stats?.densityCoverage?.targetDensityPerM2 === 163.84 &&
      bf2Stats?.densityCoverage?.gridStepMatchesSnap === true &&
      bf2Stats?.densityCoverage?.recordSource === "cpu-preseeded" &&
      bf2Stats?.densityCoverage?.lodDistances?.[0]?.segments === 15 &&
      bf2Stats?.densityCoverage?.lodDistances?.[1]?.segments === 5 &&
      bf2Stats?.densityCoverage?.lodDistances?.[2]?.segments === 2 &&
      bf2Stats?.bladeHierarchy?.enabled === false &&
      bf2Stats?.drawCalls === 3,
    JSON.stringify({
      densityCoverage: bf2Stats?.densityCoverage,
      bladeHierarchy: bf2Stats?.bladeHierarchy,
      drawCalls: bf2Stats?.drawCalls,
      materialVariant: bf2Stats?.materialVariant,
    }),
  );
  ctx.check(
    "BF2 density candidate is materially denser than the source-close one-plane control",
    bf2Stats?.densityCoverage?.acceptedDensityPerM2 > 120 &&
      bf2Stats?.densityCoverage?.acceptedRecords > stats?.bladeRecords,
    JSON.stringify({
      bf2Density: bf2Stats?.densityCoverage?.acceptedDensityPerM2,
      bf2Records: bf2Stats?.densityCoverage?.acceptedRecords,
      controlRecords: stats?.bladeRecords,
    }),
  );
  const bf2Shot = await bf2Page.locator("#renderer-canvas").screenshot();
  await ctx.snap(bf2Page, "grass/false-earth-close-bf2-density", { shot: bf2Shot });

  const bf2FloorPage = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass-bf2-density-floor",
  });
  await bf2FloorPage.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage&densityCoverage=bf2-density-parity&floorDebug=terrain-chroma&materialVariant=blade-owned-hierarchy&records=gpu`,
  );
  await bf2FloorPage.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass" &&
      window.__rendererLabStats?.stats?.densityCoverage?.mode === "bf2-density-parity" &&
      window.__rendererLabStats?.stats?.floorDiagnostic?.enabled === true,
    undefined,
    { timeout: 60000 },
  );
  const bf2FloorStats = await bf2FloorPage.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const bf2FloorShot = await bf2FloorPage.locator("#renderer-canvas").screenshot();
  const bf2FloorMetrics = floorVisibilityMetrics(PNG.sync.read(bf2FloorShot));
  ctx.check(
    "BF2 floor diagnostic normalizes contract-violating params instead of misreporting geometry",
    bf2FloorStats?.densityCoverage?.onePlanePerBlade === true &&
      bf2FloorStats?.recordSource === "cpu-preseeded" &&
      bf2FloorStats?.materialVariant === "source-pbr" &&
      bf2FloorStats?.densityCoverage?.normalizedQuery?.some((note) =>
        /blade-owned-hierarchy/.test(note),
      ) &&
      bf2FloorStats?.densityCoverage?.normalizedQuery?.some((note) => /records=gpu/.test(note)),
    JSON.stringify({
      recordSource: bf2FloorStats?.recordSource,
      materialVariant: bf2FloorStats?.materialVariant,
      densityCoverage: bf2FloorStats?.densityCoverage,
    }),
  );
  ctx.check(
    "BF2 one-plane density improves lower-foreground terrain occlusion over AJ hierarchy",
    bf2FloorMetrics.floorVisibleRatio < floorMetrics.floorVisibleRatio - 0.03,
    JSON.stringify({
      ajFloor: floorMetrics,
      bf2Floor: bf2FloorMetrics,
    }),
  );
  await ctx.snap(bf2FloorPage, "grass/false-earth-close-bf2-density-floor", {
    shot: bf2FloorShot,
  });
  await bf2FloorPage.close();

  const bf3Page = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass-bf3-value",
  });
  await bf3Page.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage&densityCoverage=bf2-density-parity&valueStructure=bf3-source`,
  );
  await bf3Page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass" &&
      window.__rendererLabStats?.stats?.materialFeatures?.mode === "bf3-source",
    undefined,
    { timeout: 60000 },
  );
  const bf3Stats = await bf3Page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  ctx.check(
    "BF3 source-value route keeps BF2 density and draw stats frozen",
    JSON.stringify(densityStatsForComparison(bf3Stats?.densityCoverage)) ===
      JSON.stringify(densityStatsForComparison(bf2Stats?.densityCoverage)) &&
      bf3Stats?.submittedTriangles === bf2Stats?.submittedTriangles &&
      bf3Stats?.drawCalls === bf2Stats?.drawCalls &&
      bf3Stats?.storageRecords === bf2Stats?.storageRecords,
    JSON.stringify({
      bf2Density: densityStatsForComparison(bf2Stats?.densityCoverage),
      bf3Density: densityStatsForComparison(bf3Stats?.densityCoverage),
      bf2Triangles: bf2Stats?.submittedTriangles,
      bf3Triangles: bf3Stats?.submittedTriangles,
      bf2DrawCalls: bf2Stats?.drawCalls,
      bf3DrawCalls: bf3Stats?.drawCalls,
    }),
  );
  ctx.check(
    "BF3 publishes source-value material features without re-enabling hierarchy",
    bf3Stats?.materialVariant === "source-value-structure" &&
      bf3Stats?.materialFeatures?.valueProfile === "source-value" &&
      bf3Stats?.materialFeatures?.sourceHeightAO === true &&
      bf3Stats?.materialFeatures?.sourceHeightColorBlend === true &&
      bf3Stats?.materialFeatures?.sourceDistanceDesaturation === true &&
      bf3Stats?.materialFeatures?.sourceWidthNormalShaping === true &&
      bf3Stats?.materialFeatures?.sourceViewDependentThickness === true &&
      bf3Stats?.materialFeatures?.roughnessFollowsAO === true &&
      bf3Stats?.materialFeatures?.geometryStatsFrozen === true &&
      bf3Stats?.bladeHierarchy?.enabled === false,
    JSON.stringify({
      materialVariant: bf3Stats?.materialVariant,
      materialFeatures: bf3Stats?.materialFeatures,
      bladeHierarchy: bf3Stats?.bladeHierarchy,
    }),
  );
  const bf3Shot = await bf3Page.locator("#renderer-canvas").screenshot();
  const bf3Metrics = screenshotMetrics(PNG.sync.read(bf3Shot));
  ctx.check(
    "BF3 source-value candidate remains nonblank and detailed enough for visual review",
    bf3Metrics.lowerVariance > 120 && bf3Metrics.lowerDarkCoverage < 0.99,
    JSON.stringify(bf3Metrics),
  );
  await ctx.snap(bf3Page, "grass/false-earth-close-bf3-value", { shot: bf3Shot });

  const bf3FloorPage = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass-bf3-value-floor",
  });
  await bf3FloorPage.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage&densityCoverage=bf2-density-parity&valueStructure=bf3-source&floorDebug=terrain-chroma`,
  );
  await bf3FloorPage.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass" &&
      window.__rendererLabStats?.stats?.materialFeatures?.mode === "bf3-source" &&
      window.__rendererLabStats?.stats?.floorDiagnostic?.enabled === true,
    undefined,
    { timeout: 60000 },
  );
  const bf3FloorStats = await bf3FloorPage.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const bf3FloorShot = await bf3FloorPage.locator("#renderer-canvas").screenshot();
  const bf3FloorMetrics = floorVisibilityMetrics(PNG.sync.read(bf3FloorShot));
  ctx.check(
    "BF3 floor diagnostic keeps the BF2 one-plane material contract",
    bf3FloorStats?.materialVariant === "source-value-structure" &&
      bf3FloorStats?.densityCoverage?.onePlanePerBlade === true &&
      bf3FloorStats?.recordSource === "cpu-preseeded" &&
      bf3FloorStats?.drawCalls === bf2Stats?.drawCalls &&
      bf3FloorStats?.submittedTriangles === bf2Stats?.submittedTriangles,
    JSON.stringify({
      materialVariant: bf3FloorStats?.materialVariant,
      densityCoverage: bf3FloorStats?.densityCoverage,
      recordSource: bf3FloorStats?.recordSource,
      drawCalls: bf3FloorStats?.drawCalls,
      submittedTriangles: bf3FloorStats?.submittedTriangles,
      bf3Floor: bf3FloorMetrics,
      bf2Floor: bf2FloorMetrics,
    }),
  );
  await ctx.snap(bf3FloorPage, "grass/false-earth-close-bf3-value-floor", {
    shot: bf3FloorShot,
  });
  await bf3FloorPage.close();
  await bf3Page.close();
  await bf2Page.close();
  await hierarchyPage.close();
  const fixturePage = await ctx.newPage({
    viewport: { width: 1280, height: 960 },
    errorPrefix: "false-earth-close-grass-near-owner-fixture",
  });
  await fixturePage.goto(
    `${ctx.target}/renderer/false-earth-close-grass?view=reference&backend=source-storage&materialVariant=blade-owned-hierarchy&nearBody=fixture`,
  );
  await fixturePage.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "false-earth-close-grass" &&
      window.__rendererLabStats?.stats?.materialVariant === "blade-owned-hierarchy" &&
      window.__rendererLabStats?.stats?.nearBodyOwner?.enabled === true,
    undefined,
    { timeout: 60000 },
  );
  const fixtureStats = await fixturePage.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const fixtureShot = await fixturePage.locator("#renderer-canvas").screenshot();
  const hierarchyPng = PNG.sync.read(hierarchyShot);
  const fixturePng = PNG.sync.read(fixtureShot);
  const fixturePixelDiff = pixelDiffCount(hierarchyPng, fixturePng);
  const fixturePixelCount = hierarchyPng.width * hierarchyPng.height;
  ctx.check(
    "near-owner fixture publishes an inert owner seam",
    fixtureStats?.nearBodyOwner?.variant === "fixture" &&
      fixtureStats?.nearBodyOwner?.drawCalls === 0 &&
      fixtureStats?.nearBodyOwner?.submittedTriangleDelta === 0 &&
      fixtureStats?.drawCalls === hierarchyStats?.drawCalls &&
      fixtureStats?.submittedTriangles === hierarchyStats?.submittedTriangles,
    JSON.stringify({
      nearBodyOwner: fixtureStats?.nearBodyOwner,
      fixtureDrawCalls: fixtureStats?.drawCalls,
      hierarchyDrawCalls: hierarchyStats?.drawCalls,
      fixtureTriangles: fixtureStats?.submittedTriangles,
      hierarchyTriangles: hierarchyStats?.submittedTriangles,
    }),
  );
  ctx.check(
    "near-owner fixture is visually unchanged from the AJ hierarchy control",
    fixturePixelDiff <= fixturePixelCount * 0.00011,
    JSON.stringify({
      fixturePixelDiff,
      diffRatio: Number((fixturePixelDiff / fixturePixelCount).toFixed(8)),
    }),
  );
  await fixturePage.close();
  ctx.check(
    "bounded lab is dense enough to judge close body",
    stats?.bladeRecords >= 30000 && stats?.submittedTriangles >= 250000 && stats?.drawCalls === 3,
    JSON.stringify({
      bladeRecords: stats?.bladeRecords,
      submittedTriangles: stats?.submittedTriangles,
      drawCalls: stats?.drawCalls,
    }),
  );

  const shot = await page.locator("#renderer-canvas").screenshot();
  const png = PNG.sync.read(shot);
  const metrics = screenshotMetrics(png);
  ctx.check(
    "screenshot contains nonblank dense lower foreground",
    metrics.lowerVariance > 120 && metrics.lowerDarkCoverage > 0.18,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, "grass/false-earth-close-material", { shot });
  await page.close();
}

function screenshotMetrics(png) {
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  let n = 0;
  const y0 = Math.floor(png.height * 0.58);
  for (let y = y0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const lum = png.data[i] * 0.2126 + png.data[i + 1] * 0.7152 + png.data[i + 2] * 0.0722;
      sum += lum;
      sumSq += lum * lum;
      if (lum < 92) dark++;
      n++;
    }
  }
  const mean = sum / n;
  return {
    lowerMean: Number(mean.toFixed(3)),
    lowerVariance: Number((sumSq / n - mean * mean).toFixed(3)),
    lowerDarkCoverage: Number((dark / n).toFixed(5)),
  };
}

function floorVisibilityMetrics(png) {
  let floor = 0;
  let n = 0;
  const y0 = Math.floor(png.height * 0.58);
  for (let y = y0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (r > 180 && g < 90 && b > 180 && Math.abs(r - b) < 80) floor++;
      n++;
    }
  }
  return {
    crop: "lower-foreground",
    keyColor: "#ff00ff",
    floorVisiblePixels: floor,
    sampledPixels: n,
    floorVisibleRatio: Number((floor / Math.max(1, n)).toFixed(5)),
  };
}

function pixelDiffCount(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY;
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2] ||
      a.data[i + 3] !== b.data[i + 3]
    ) {
      diff++;
    }
  }
  return diff;
}

function densityStatsForComparison(stats) {
  if (!stats) return null;
  return {
    mode: stats.mode,
    requested: stats.requested,
    onePlanePerBlade: stats.onePlanePerBlade,
    targetBladesPerAxis: stats.targetBladesPerAxis,
    targetDensityPerM2: stats.targetDensityPerM2,
    actualColumns: stats.actualColumns,
    actualRows: stats.actualRows,
    actualAreaM2: stats.actualAreaM2,
    gridStepX: stats.gridStepX,
    gridStepZ: stats.gridStepZ,
    gridStepMatchesSnap: stats.gridStepMatchesSnap,
    candidateCount: stats.candidateCount,
    acceptedRecords: stats.acceptedRecords,
    renderedRecords: stats.renderedRecords,
    acceptedDensityPerM2: stats.acceptedDensityPerM2,
    renderedDensityPerM2: stats.renderedDensityPerM2,
    recordSource: stats.recordSource,
    lodDistances: stats.lodDistances,
    drawCalls: stats.drawCalls,
    submittedTriangles: stats.submittedTriangles,
    cap: stats.cap,
  };
}
