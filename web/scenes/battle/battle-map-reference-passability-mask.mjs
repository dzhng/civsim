import { PNG } from "pngjs";

const QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&view=layout-topdown&grassTechnique=off&groundDiagnostic=passability-mask";

export const meta = {
  name: "battle-map-reference-passability-mask",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: ["map-reference/passability-mask-topdown"],
  describe:
    "Slice 11: slope-derived passable, slow, impassible, and water regions from the heightmap speed mask.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("passability mask shot requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-map-reference-passability-mask",
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${QUERY}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.terrainSource === "heightmap-layout" &&
      window.__rendererLabStats?.stats?.ground?.diagnosticMode === "passability-mask",
    { timeout: 20000 },
  );
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const shot = await page.locator("#renderer-canvas").screenshot();
  await page.close();

  const image = PNG.sync.read(shot);
  assertPassabilityStats(ctx, stats);
  assertMaskPixels(ctx, image);

  await ctx.snap(null, "map-reference/passability-mask-topdown", {
    shot: PNG.sync.write(image),
  });
}

function assertPassabilityStats(ctx, stats) {
  const heightmap = stats?.referenceHeightmap;
  const passability = heightmap?.passability;
  ctx.check(
    "passability derives from the heightfield and publishes the visual mask source",
    stats?.route === "battle-terrain-3d" &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.grassTechnique === "off" &&
      stats?.ground?.diagnosticMode === "passability-mask" &&
      passability?.source === "heightfield-slope-cap" &&
      passability?.visualMaskSource === "grid.speed" &&
      passability?.cliffSlopeThreshold > passability?.slowSlopeThreshold,
    JSON.stringify({
      route: stats?.route,
      terrainSource: stats?.terrainSource,
      ground: stats?.ground,
      passability,
    }),
  );
  ctx.check(
    "passability ratios expose side cliffs and preserve the valley floor",
    passability?.passableRatio > 0.4 &&
      passability?.passableRatio < 0.7 &&
      passability?.slowScreeRatio > 0.01 &&
      passability?.cliffMaskRatio > 0.35 &&
      passability?.cliffMaskRatio < 0.6 &&
      passability?.valleyFloorPassableRatio > 0.85,
    JSON.stringify(passability),
  );
  ctx.check(
    "path probes cross the valley but not the flanking cliff bands",
    passability?.pathChecks?.valleyCorridorReachable === true &&
      passability?.pathChecks?.westCliffBandIsolatesValley === true &&
      passability?.pathChecks?.eastCliffBandIsolatesValley === true,
    JSON.stringify(passability?.pathChecks),
  );
}

function assertMaskPixels(ctx, image) {
  const metrics = passabilityMaskMetrics(image);
  ctx.check(
    "passability mask renders distinct passable, slow, blocked, and water regions",
    metrics.passable > 0.25 &&
      metrics.slow > 0.005 &&
      metrics.blocked > 0.04 &&
      metrics.water > 0.02 &&
      metrics.other < 0.08,
    JSON.stringify(metrics),
  );
}

function passabilityMaskMetrics(image) {
  const colors = {
    passable: [0.18, 0.62, 0.24].map(toByte),
    slow: [0.92, 0.66, 0.12].map(toByte),
    blocked: [0.08, 0.08, 0.08].map(toByte),
    water: [0.12, 0.45, 0.68].map(toByte),
  };
  const counts = { passable: 0, slow: 0, blocked: 0, water: 0, other: 0 };
  const total = image.width * image.height;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const rgb = [image.data[i], image.data[i + 1], image.data[i + 2]];
      const match = nearestColor(rgb, colors);
      counts[match]++;
    }
  }
  return {
    passable: ratio(counts.passable, total),
    slow: ratio(counts.slow, total),
    blocked: ratio(counts.blocked, total),
    water: ratio(counts.water, total),
    other: ratio(counts.other, total),
  };
}

function nearestColor(rgb, colors) {
  let best = "other";
  let bestDistance = Infinity;
  for (const [name, color] of Object.entries(colors)) {
    const distance = colorDistance(rgb, color);
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return bestDistance <= 42 ? best : "other";
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function toByte(v) {
  return Math.round(v * 255);
}

function ratio(count, total) {
  return Number((count / total).toFixed(4));
}
