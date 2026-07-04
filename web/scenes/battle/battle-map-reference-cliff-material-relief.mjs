import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const VISTA_QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&cameraProfile=horizon-band&environment=overcast-foggy&grassTechnique=off&groundDiagnostic=cliff-material&geometryProbe=midground-valley";
const TOPDOWN_QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&view=layout-topdown&environment=overcast-foggy&grassTechnique=off&groundDiagnostic=cliff-material";
const PRE_SLICE_13_SKY_BLOCK_HEIGHT_RATIO = 0.0927;
const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/slice-13-cliff-material-relief/",
  import.meta.url,
);

export const meta = {
  name: "battle-map-reference-cliff-material-relief",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/cliff-material-vista",
    "map-reference/cliff-material-crops",
    "map-reference/cliff-material-topdown",
  ],
  describe: "Slice 13: slope-owned cliff/scree material over the accepted heightmap vista.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("cliff material relief requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const vista = await captureRoute(ctx, VISTA_QUERY, "heightmap-vista");
  const topdown = await captureRoute(ctx, TOPDOWN_QUERY, "layout-topdown");

  assertRoute(ctx, vista.stats, "heightmap-vista");
  assertRoute(ctx, topdown.stats, "layout-topdown");
  assertMaterialBands(ctx, vista.stats?.ground?.materialBands);
  assertMaterialBands(ctx, topdown.stats?.ground?.materialBands);
  assertCliffSilhouette(ctx, vista.stats?.cliffSilhouette);

  const crops = {
    backgroundCliffs: crop(vista.image, vista.stats?.cameraComposition?.crops?.background),
    leftCliff: crop(vista.image, { x: 0.0, y: 0.08, w: 0.32, h: 0.42 }),
    centerRidge: crop(vista.image, { x: 0.36, y: 0.3, w: 0.3, h: 0.18 }),
    centralPlain: crop(vista.image, { x: 0.3, y: 0.51, w: 0.42, h: 0.15 }),
    rightSeam: crop(vista.image, { x: 0.7, y: 0.08, w: 0.3, h: 0.42 }),
  };
  const cropSheet = composeCropSheet(crops);
  assertCliffImage(ctx, vista.image, "vista");
  assertCliffImage(ctx, topdown.image, "topdown");
  assertCliffCrop(ctx, crops.leftCliff, "left cliff", { contrast: 42, edgeEnergy: 1.0 });
  assertCliffCrop(ctx, crops.centerRidge, "center background ridge", {
    contrast: 22,
    edgeEnergy: 0.55,
  });
  assertCliffCrop(ctx, crops.rightSeam, "right seam", { contrast: 28, edgeEnergy: 0.55 });
  assertFlatGrassCrop(ctx, crops.centralPlain, "central plain", { contrast: 28, edgeEnergy: 0.45 });

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ vista, topdown, cropSheet, crops });
  }

  await ctx.snap(null, "map-reference/cliff-material-vista", {
    shot: PNG.sync.write(vista.image),
  });
  await ctx.snap(null, "map-reference/cliff-material-crops", {
    shot: PNG.sync.write(cropSheet),
  });
  await ctx.snap(null, "map-reference/cliff-material-topdown", {
    shot: PNG.sync.write(topdown.image),
  });
}

async function captureRoute(ctx, query, expectedView) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `battle-map-reference-cliff-material-relief:${expectedView}`,
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${query}`);
  await page.waitForFunction(
    (view) =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.view === view &&
      window.__rendererLabStats?.stats?.terrainSource === "heightmap-layout" &&
      window.__rendererLabStats?.stats?.ground?.diagnosticMode === "cliff-material",
    expectedView,
    { timeout: 20000 },
  );
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const image = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
  await page.close();
  return { stats, image };
}

function assertRoute(ctx, stats, expectedView) {
  ctx.check(
    `cliff material ${expectedView} route uses heightmap diagnostic`,
    stats?.route === "battle-terrain-3d" &&
      stats?.gate === "highland-valley" &&
      stats?.view === expectedView &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.ground?.diagnosticMode === "cliff-material" &&
      stats?.grassTechnique === "off" &&
      stats?.grass?.bladeInstances === 0 &&
      stats?.referenceHeightmap?.sourceKind === "continuous-field" &&
      (expectedView !== "heightmap-vista" || stats?.cameraComposition),
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      view: stats?.view,
      terrainSource: stats?.terrainSource,
      ground: stats?.ground,
      grassTechnique: stats?.grassTechnique,
      grass: stats?.grass,
      heightmap: stats?.referenceHeightmap,
    }),
  );
}

function assertCliffSilhouette(ctx, silhouette) {
  const skyBlock = silhouette?.screenBounds?.skyBlockHeightRatio;
  const topY = silhouette?.screenBounds?.topYRatio;
  const passability = silhouette?.passability;
  const map = silhouette?.mapSpace;
  ctx.check(
    "background cliffs are projected terrain-owned impassible heightfield cells",
    silhouette?.source === "projected-heightfield-impassible-background-cliffs" &&
      silhouette?.terrainOwned === true &&
      silhouette?.sampledCells > 3000 &&
      map?.source === "heightfield-background-band" &&
      map?.cliffMaskRatio > 0.5 &&
      map?.impassableRatio > 0.5 &&
      map?.valleyFloorPassableRatio > 0.94,
    JSON.stringify(silhouette ?? null),
  );
  ctx.check(
    "background cliff silhouette blocks materially more sky than the pre-Slice-13 shelf",
    Number.isFinite(skyBlock) &&
      skyBlock >= PRE_SLICE_13_SKY_BLOCK_HEIGHT_RATIO * 2.2 &&
      Number.isFinite(topY) &&
      topY < 0.31,
    JSON.stringify({
      skyBlock,
      topY,
      preSlice13SkyBlock: PRE_SLICE_13_SKY_BLOCK_HEIGHT_RATIO,
      silhouette,
    }),
  );
  ctx.check(
    "cliff height increase preserves the playable valley corridor",
    passability?.pathChecks?.valleyCorridorReachable === true &&
      passability?.pathChecks?.westCliffBandIsolatesValley === true &&
      passability?.pathChecks?.eastCliffBandIsolatesValley === true &&
      passability?.valleyFloorPassableRatio > 0.94,
    JSON.stringify(passability ?? null),
  );
}

function assertMaterialBands(ctx, bands) {
  ctx.check(
    "cliff material stats expose grass, scree, rock, and water bands",
    bands?.source === "heightfield-slope-speed-tint" &&
      bands?.cells > 200000 &&
      bands?.grassRatio > 0.38 &&
      bands?.rockRatio > 0.35 &&
      bands?.screeRatio > 0.015 &&
      bands?.waterRatio > 0.005 &&
      bands?.slope?.p98 > bands?.slope?.p90 &&
      Math.abs(bands.grassRatio + bands.rockRatio + bands.screeRatio + bands.waterRatio - 1) < 0.02,
    JSON.stringify(bands ?? null),
  );
}

function assertCliffImage(ctx, image, label) {
  const metrics = imageMetrics(image);
  ctx.check(
    `cliff material ${label} image has terrain coverage and readable tonal relief`,
    metrics.cover > 0.78 && metrics.contrast > 35 && metrics.edgeEnergy > 0.3,
    JSON.stringify(metrics),
  );
}

function assertCliffCrop(ctx, image, label, threshold) {
  const metrics = imageMetrics(image);
  ctx.check(
    `cliff material ${label} crop carries local rock relief`,
    metrics.cover > 0.78 &&
      metrics.contrast > threshold.contrast &&
      metrics.edgeEnergy > threshold.edgeEnergy,
    JSON.stringify({ metrics, threshold }),
  );
}

function assertFlatGrassCrop(ctx, image, label, threshold) {
  const metrics = imageMetrics(image);
  ctx.check(
    `cliff material ${label} crop stays quiet where the heightfield is flat`,
    metrics.cover > 0.78 &&
      metrics.contrast < threshold.contrast &&
      metrics.edgeEnergy < threshold.edgeEnergy,
    JSON.stringify({ metrics, threshold }),
  );
}

async function writeArtifacts({ vista, topdown, cropSheet, crops }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("cliff-material-vista.png", ASSET_DIR), PNG.sync.write(vista.image)),
    writeFile(new URL("cliff-material-crops.png", ASSET_DIR), PNG.sync.write(cropSheet)),
    writeFile(new URL("cliff-material-topdown.png", ASSET_DIR), PNG.sync.write(topdown.image)),
    writeFile(new URL("background-cliffs.png", ASSET_DIR), PNG.sync.write(crops.backgroundCliffs)),
    writeFile(new URL("left-cliff.png", ASSET_DIR), PNG.sync.write(crops.leftCliff)),
    writeFile(new URL("center-ridge.png", ASSET_DIR), PNG.sync.write(crops.centerRidge)),
    writeFile(new URL("central-plain.png", ASSET_DIR), PNG.sync.write(crops.centralPlain)),
    writeFile(new URL("right-seam.png", ASSET_DIR), PNG.sync.write(crops.rightSeam)),
    writeFile(
      new URL("route-stats.json", ASSET_DIR),
      `${JSON.stringify({ vista: summarizeStats(vista.stats), topdown: summarizeStats(topdown.stats) }, null, 2)}\n`,
    ),
  ]);
}

function summarizeStats(stats) {
  return {
    route: stats?.route,
    gate: stats?.gate,
    view: stats?.view,
    terrainSource: stats?.terrainSource,
    camera: stats?.camera,
    heightmap: stats?.referenceHeightmap,
    materialBands: stats?.ground?.materialBands,
    cliffSilhouette: stats?.cliffSilhouette,
    midgroundOcclusion: stats?.midgroundOcclusion?.summary,
    ground: stats?.ground,
    grassTechnique: stats?.grassTechnique,
  };
}

function composeCropSheet(crops) {
  const labels = [
    ["background-cliffs", crops.backgroundCliffs],
    ["left-cliff", crops.leftCliff],
    ["center-ridge", crops.centerRidge],
    ["central-plain", crops.centralPlain],
    ["right-seam", crops.rightSeam],
  ];
  const gap = 12;
  const width = labels.reduce((sum, [, img]) => sum + img.width, 0) + gap * (labels.length - 1);
  const height = Math.max(...labels.map(([, img]) => img.height));
  const out = solidPng(width, height, [210, 211, 195, 255]);
  let x = 0;
  for (const [, img] of labels) {
    blit(out, img, x, 0);
    x += img.width + gap;
  }
  return out;
}

function crop(image, rect) {
  const r = rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.max(0, Math.round(r.x * image.width));
  const y0 = Math.max(0, Math.round(r.y * image.height));
  const w = Math.min(image.width - x0, Math.round(r.w * image.width));
  const h = Math.min(image.height - y0, Math.round(r.h * image.height));
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

function blit(out, image, ox, oy) {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const si = (y * image.width + x) * 4;
      const di = ((oy + y) * out.width + ox + x) * 4;
      out.data[di] = image.data[si];
      out.data[di + 1] = image.data[si + 1];
      out.data[di + 2] = image.data[si + 2];
      out.data[di + 3] = image.data[si + 3];
    }
  }
}

function imageMetrics(image) {
  let cover = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let edge = 0;
  const luma = new Float32Array(image.width * image.height);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = y * image.width + x;
      const o = i * 4;
      const value =
        image.data[o] * 0.2126 + image.data[o + 1] * 0.7152 + image.data[o + 2] * 0.0722;
      luma[i] = value;
      if (image.data[o] + image.data[o + 1] + image.data[o + 2] > 36) {
        cover++;
        minLuma = Math.min(minLuma, value);
        maxLuma = Math.max(maxLuma, value);
      }
    }
  }
  for (let y = 1; y < image.height - 1; y++) {
    for (let x = 1; x < image.width - 1; x++) {
      const i = y * image.width + x;
      const gx = luma[i + 1] - luma[i - 1];
      const gy = luma[i + image.width] - luma[i - image.width];
      edge += Math.hypot(gx, gy);
    }
  }
  const total = image.width * image.height;
  return {
    cover: Number((cover / total).toFixed(3)),
    contrast: Number((maxLuma - minLuma).toFixed(1)),
    edgeEnergy: Number((edge / total).toFixed(2)),
  };
}

function solidPng(width, height, color) {
  const out = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    out.data[i * 4] = color[0];
    out.data[i * 4 + 1] = color[1];
    out.data[i * 4 + 2] = color[2];
    out.data[i * 4 + 3] = color[3];
  }
  return out;
}
