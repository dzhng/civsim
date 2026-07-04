import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const TARGET = new URL(
  "../../../specs/battle-map-reference/assets/target-battle-map.png",
  import.meta.url,
);
const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/slice-14a-foreground-grass-foundation/",
  import.meta.url,
);
const BASE_QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&environment=overcast-foggy&geometryProbe=midground-valley&zoom=2.35&pitch=1.34";
const GRASS_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassPrimitiveFamily=texture-carrier` +
  "&grassRadius=360&grassFieldCell=1.8&grassFieldRecords=20000&grassMinNormalZ=0.72" +
  "&grassAccentClumps=20000&grassAccentTufts=20000&grassAccentFootprint=2.4" +
  "&grassBlades=4&grassBladeHeight=0.78&grassBladeWidth=0.084";
const GRASS_OFF_QUERY = `${BASE_QUERY}&grassTechnique=off`;

export const meta = {
  name: "battle-map-reference-foreground-grass-foundation",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/foreground-grass-foundation-candidate",
    "map-reference/foreground-grass-foundation-crops",
    "map-reference/foreground-grass-foundation-off",
  ],
  describe: "Slice 14a: field-driven foreground grass plumbing over the accepted heightmap vista.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("foreground grass foundation requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const [candidate, grassOff] = await Promise.all([
    captureRoute(ctx, GRASS_QUERY, "grass"),
    captureRoute(ctx, GRASS_OFF_QUERY, "grass-off"),
  ]);
  const target = PNG.sync.read(await readFile(TARGET));

  assertRoute(ctx, candidate.stats);
  assertGrassArchitecture(ctx, candidate.stats);

  const candidateForeground = cropRatio(candidate.image, 0.0, 0.56, 1.0, 0.38);
  const grassOffForeground = cropRatio(grassOff.image, 0.0, 0.56, 1.0, 0.38);
  const targetForeground = cropRatio(target, 0.0, 0.56, 1.0, 0.38);
  const candidateMidground = cropRatio(candidate.image, 0.0, 0.34, 1.0, 0.2);
  const grassOffMidground = cropRatio(grassOff.image, 0.0, 0.34, 1.0, 0.2);
  const crops = {
    candidateForeground,
    grassOffForeground,
    targetForeground,
    candidateMidground,
    grassOffMidground,
  };
  const candidateForegroundMetrics = bandMetrics(candidateForeground);
  const grassOffForegroundMetrics = bandMetrics(grassOffForeground);
  const targetForegroundMetrics = bandMetrics(targetForeground);
  const candidateMidgroundMetrics = bandMetrics(candidateMidground);
  const foregroundBodyMetrics = {
    candidate: candidateForegroundMetrics,
    grassOff: grassOffForegroundMetrics,
    target: targetForegroundMetrics,
    midground: candidateMidgroundMetrics,
  };
  assertForegroundBody(ctx, foregroundBodyMetrics);

  const cropSheet = composeCropSheet(crops);
  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ candidate, grassOff, cropSheet, crops, foregroundBodyMetrics });
  }

  await ctx.snap(null, "map-reference/foreground-grass-foundation-candidate", {
    shot: PNG.sync.write(candidate.image),
  });
  await ctx.snap(null, "map-reference/foreground-grass-foundation-crops", {
    shot: PNG.sync.write(cropSheet),
  });
  await ctx.snap(null, "map-reference/foreground-grass-foundation-off", {
    shot: PNG.sync.write(grassOff.image),
  });
}

async function captureRoute(ctx, query, id) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `battle-map-reference-foreground-grass-foundation:${id}`,
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${query}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.view === "heightmap-vista" &&
      window.__rendererLabStats?.stats?.terrainSource === "heightmap-layout",
    { timeout: 20000 },
  );
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const rawShot = await page.locator("#renderer-canvas").screenshot();
  const canvasSize = await page.evaluate(() => {
    const canvas = document.querySelector("#renderer-canvas");
    return canvas ? { width: canvas.width, height: canvas.height } : null;
  });
  await page.close();
  return {
    stats,
    image: cropToSize(PNG.sync.read(rawShot), canvasSize?.width, canvasSize?.height),
  };
}

function assertRoute(ctx, stats) {
  ctx.check(
    "foreground grass route uses heightmap vista with shared overcast environment",
    stats?.route === "battle-terrain-3d" &&
      stats?.gate === "highland-valley" &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.view === "heightmap-vista" &&
      stats?.environment?.id === "overcast-foggy" &&
      stats?.ground?.environment?.id === "overcast-foggy" &&
      stats?.grass?.environment?.id === "overcast-foggy" &&
      stats?.referenceHeightmap?.sourceKind === "continuous-field",
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      terrainSource: stats?.terrainSource,
      view: stats?.view,
      environment: stats?.environment,
      ground: stats?.ground?.environment,
      grass: stats?.grass?.environment,
      heightmap: stats?.referenceHeightmap,
    }),
  );
}

function assertGrassArchitecture(ctx, stats) {
  const grass = stats?.grass;
  const meadow = stats?.ground?.meadow;
  ctx.check(
    "foreground grass reuses field-owned meadow and texture-carrier accent path",
    stats?.grassTechnique === "field-accent" &&
      grass?.terrainMasked === true &&
      grass?.prepMode === "packed-field" &&
      grass?.grassPrimitiveFamily === "texture-carrier" &&
      grass?.accentAggregation === "field-cell" &&
      grass?.fieldRecords >= 4500 &&
      grass?.fieldRecords <= 20000 &&
      grass?.accentTufts >= 10000 &&
      grass?.accentTufts <= 14000 &&
      grass?.blockedTintCells > 2000 &&
      Number.isFinite(grass?.fieldRejectedSlopeCells) &&
      grass?.invalidTintTufts === 0 &&
      grass?.drawCalls === 1 &&
      meadow?.enabled === true &&
      meadow?.source === "field" &&
      meadow?.rootMassEnabled === true &&
      meadow?.fieldRecords === grass?.fieldRecords &&
      meadow?.fieldCoverage >= 0.018 &&
      meadow?.rootMassCoverage > 0.005,
    JSON.stringify({ grassTechnique: stats?.grassTechnique, grass, meadow }),
  );
}

function assertForegroundBody(ctx, metrics) {
  ctx.check(
    "foreground grass foundation adds visible nonvoid body over the grass-off heightmap",
    metrics.candidate.greenRatio > 0.35 &&
      metrics.candidate.darkVoidRatio < 0.08 &&
      metrics.candidate.edgeEnergy > metrics.grassOff.edgeEnergy * 1.08 &&
      metrics.candidate.edgeEnergy > 1.6 &&
      metrics.candidate.redDominantRatio < 0.06 &&
      metrics.candidate.avg[1] > metrics.candidate.avg[0] &&
      metrics.candidate.avg[1] > metrics.candidate.avg[2],
    JSON.stringify(metrics),
  );
}

async function writeArtifacts({ candidate, grassOff, cropSheet, crops, foregroundBodyMetrics }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(
      new URL("foreground-grass-foundation-candidate.png", ASSET_DIR),
      PNG.sync.write(candidate.image),
    ),
    writeFile(
      new URL("foreground-grass-foundation-off.png", ASSET_DIR),
      PNG.sync.write(grassOff.image),
    ),
    writeFile(
      new URL("foreground-grass-foundation-crops.png", ASSET_DIR),
      PNG.sync.write(cropSheet),
    ),
    writeFile(
      new URL("candidate-foreground.png", ASSET_DIR),
      PNG.sync.write(crops.candidateForeground),
    ),
    writeFile(
      new URL("grass-off-foreground.png", ASSET_DIR),
      PNG.sync.write(crops.grassOffForeground),
    ),
    writeFile(new URL("target-foreground.png", ASSET_DIR), PNG.sync.write(crops.targetForeground)),
    writeFile(
      new URL("candidate-midground.png", ASSET_DIR),
      PNG.sync.write(crops.candidateMidground),
    ),
    writeFile(
      new URL("route-stats.json", ASSET_DIR),
      `${JSON.stringify(
        {
          candidate: summarizeStats(candidate.stats),
          grassOff: summarizeStats(grassOff.stats),
          foregroundBodyMetrics,
        },
        null,
        2,
      )}\n`,
    ),
  ]);
}

function summarizeStats(stats) {
  return {
    route: stats?.route,
    gate: stats?.gate,
    view: stats?.view,
    terrainSource: stats?.terrainSource,
    environment: stats?.environment,
    camera: stats?.camera,
    heightmap: stats?.referenceHeightmap,
    materialBands: stats?.ground?.materialBands,
    meadow: stats?.ground?.meadow,
    ground: stats?.ground,
    grassTechnique: stats?.grassTechnique,
    grass: stats?.grass,
    midgroundOcclusion: stats?.midgroundOcclusion?.summary,
  };
}

function composeCropSheet(crops) {
  const columns = [
    [resizeToWidth(crops.targetForeground, 410), resizeToWidth(crops.candidateForeground, 410)],
    [resizeToWidth(crops.grassOffForeground, 410), resizeToWidth(crops.candidateMidground, 410)],
    [resizeToWidth(crops.grassOffMidground, 410), resizeToWidth(crops.candidateForeground, 410)],
  ];
  const gap = 12;
  const rowGap = 12;
  const width = 410 * columns.length + gap * (columns.length - 1);
  const rowHeights = [
    Math.max(...columns.map((column) => column[0].height)),
    Math.max(...columns.map((column) => column[1].height)),
  ];
  const out = solidPng(width, rowHeights[0] + rowGap + rowHeights[1], [218, 224, 224, 255]);
  let x = 0;
  for (const column of columns) {
    paste(out, column[0], x, 0);
    paste(out, column[1], x, rowHeights[0] + rowGap);
    x += 410 + gap;
  }
  return out;
}

function bandMetrics(png) {
  let count = 0;
  let green = 0;
  let redDominant = 0;
  let darkVoid = 0;
  let edge = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const [r, g, b] = rgbAt(png, x, y);
      rSum += r;
      gSum += g;
      bSum += b;
      if (g > b * 1.04 && g >= r * 0.82 && r > 32 && b > 28) green++;
      if (r > g * 1.25 && r > b * 1.25) redDominant++;
      if (r + g + b < 54) darkVoid++;
      if (x + 1 < png.width) edge += Math.abs(luma(r, g, b) - luma(...rgbAt(png, x + 1, y)));
      if (y + 1 < png.height) edge += Math.abs(luma(r, g, b) - luma(...rgbAt(png, x, y + 1)));
      count++;
    }
  }
  return {
    greenRatio: Number((green / count).toFixed(3)),
    redDominantRatio: Number((redDominant / count).toFixed(3)),
    darkVoidRatio: Number((darkVoid / count).toFixed(3)),
    edgeEnergy: Number((edge / Math.max(1, count * 2)).toFixed(2)),
    avg: [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)],
  };
}

function cropRatio(src, xRatio, yRatio, wRatio, hRatio) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(src.width * xRatio)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(src.height * yRatio)));
  const w = Math.max(1, Math.min(src.width - x0, Math.floor(src.width * wRatio)));
  const h = Math.max(1, Math.min(src.height - y0, Math.floor(src.height * hRatio)));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) copyPixel(src, x0 + x, y0 + y, out, x, y);
  }
  return out;
}

function cropToSize(src, width, height) {
  const w = Math.max(1, Math.min(src.width, Math.floor(width ?? src.width)));
  const h = Math.max(1, Math.min(src.height, Math.floor(height ?? src.height)));
  if (w === src.width && h === src.height) return src;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) copyPixel(src, x, y, out, x, y);
  }
  return out;
}

function resizeToWidth(src, width) {
  return resize(src, width, Math.max(1, Math.round(src.height * (width / src.width))));
}

function resize(src, width, height) {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / height) * src.height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / width) * src.width));
      copyPixel(src, sx, sy, out, x, y);
    }
  }
  return out;
}

function solidPng(width, height, rgba) {
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) out.data.set(rgba, i);
  return out;
}

function paste(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) copyPixel(src, x, y, dst, ox + x, oy + y);
  }
}

function copyPixel(src, sx, sy, dst, dx, dy) {
  const si = (sy * src.width + sx) * 4;
  const di = (dy * dst.width + dx) * 4;
  dst.data[di] = src.data[si];
  dst.data[di + 1] = src.data[si + 1];
  dst.data[di + 2] = src.data[si + 2];
  dst.data[di + 3] = src.data[si + 3];
}

function rgbAt(png, x, y) {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

function luma(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
