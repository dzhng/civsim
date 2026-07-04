import { PNG } from "pngjs";

const BASE_QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&grassTechnique=off&groundDiagnostic=layout-clay";

export const meta = {
  name: "battle-map-reference-heightmap-layout",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/heightmap-layout-topdown",
    "map-reference/heightmap-layout-perspective",
  ],
  describe:
    "Slice 10: the authored macro heightmap source rendered as clay-only top-down and hilltop perspective review shots.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("heightmap layout shots require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const topdown = await capture(ctx, "topdown", `${BASE_QUERY}&view=layout-topdown&zoom=0.34`);
  const perspective = await capture(ctx, "perspective", `${BASE_QUERY}&view=layout-perspective`);
  assertHeightmapStats(ctx, topdown.stats, "topdown");
  assertHeightmapStats(ctx, perspective.stats, "perspective");
  assertClayShot(ctx, topdown.image, "topdown");
  assertClayShot(ctx, perspective.image, "perspective");

  await ctx.snap(null, "map-reference/heightmap-layout-topdown", {
    shot: PNG.sync.write(topdown.image),
  });
  await ctx.snap(null, "map-reference/heightmap-layout-perspective", {
    shot: PNG.sync.write(perspective.image),
  });
}

async function capture(ctx, id, query) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `battle-map-reference-heightmap-layout-${id}`,
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${query}`);
  await page.waitForFunction(
    (view) =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.view === view &&
      window.__rendererLabStats?.stats?.terrainSource === "heightmap-layout",
    id === "topdown" ? "layout-topdown" : "layout-perspective",
    { timeout: 20000 },
  );
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const shot = await page.locator("#renderer-canvas").screenshot();
  await page.close();
  return { stats, image: PNG.sync.read(shot) };
}

function assertHeightmapStats(ctx, stats, label) {
  const heightmap = stats?.referenceHeightmap;
  const slopeCount = heightmap
    ? heightmap.slopeHistogram.flat +
      heightmap.slopeHistogram.rolling +
      heightmap.slopeHistogram.steep +
      heightmap.slopeHistogram.cliff
    : 0;
  const expectedCells = heightmap
    ? Math.round((heightmap.worldBounds.maxX - heightmap.worldBounds.minX) / heightmap.cellSize) *
      Math.round((heightmap.worldBounds.maxY - heightmap.worldBounds.minY) / heightmap.cellSize)
    : 0;
  ctx.check(
    `${label} route uses the authored heightmap source`,
    stats?.route === "battle-terrain-3d" &&
      stats?.gate === "highland-valley" &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.grassTechnique === "off" &&
      stats?.ground?.diagnosticMode === "layout-clay" &&
      heightmap?.sourceKind === "continuous-field" &&
      heightmap?.sourceRows >= 300 &&
      heightmap?.sourceColumns >= 300 &&
      heightmap?.gridRows >= 300 &&
      heightmap?.gridColumns >= 300 &&
      heightmap?.outputCellsPerSourceCell === null,
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      terrainSource: stats?.terrainSource,
      grassTechnique: stats?.grassTechnique,
      ground: stats?.ground,
      heightmap,
    }),
  );
  ctx.check(
    `${label} heightmap publishes usable terrain spans and masks`,
    heightmap?.heightSpan?.span > 20 &&
      heightmap?.cellSize === 6 &&
      heightmap?.lakeMaskRatio > 0.005 &&
      heightmap?.impassableRatio > 0.08 &&
      heightmap?.passability?.pathChecks?.valleyCorridorReachable === true &&
      heightmap?.passability?.pathChecks?.westCliffBandIsolatesValley === true &&
      heightmap?.passability?.pathChecks?.eastCliffBandIsolatesValley === true &&
      slopeCount === expectedCells,
    JSON.stringify(heightmap),
  );
  ctx.check(
    `${label} camera hill anchor sits above the valley floor`,
    heightmap?.cameraHillAnchor?.height > heightmap?.cameraHillAnchor?.valleyFloorHeight + 2,
    JSON.stringify(heightmap?.cameraHillAnchor),
  );
}

function assertClayShot(ctx, image, label) {
  const metrics = clayMetrics(image);
  ctx.check(
    `${label} clay terrain fills the frame with relief contrast`,
    metrics.cover > 0.7 && metrics.contrast > 34,
    JSON.stringify(metrics),
  );
}

function clayMetrics(image) {
  let cover = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const total = image.width * image.height;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (!(b > r && b > g && b > 165)) {
        cover++;
        if (luma < minLuma) minLuma = luma;
        if (luma > maxLuma) maxLuma = luma;
      }
    }
  }
  return {
    cover: Number((cover / total).toFixed(3)),
    contrast: Number((maxLuma - minLuma).toFixed(1)),
  };
}
