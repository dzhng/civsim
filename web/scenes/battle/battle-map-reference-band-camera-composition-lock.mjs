import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import {
  captureRoute,
  cropRatio,
  paste,
  resizeToWidth,
  solidPng,
} from "./battle-map-reference-grass-legibility-lib.js";

const QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista" +
  "&cameraProfile=horizon-band&environment=overcast-foggy&geometryProbe=midground-valley" +
  "&grassTechnique=field-accent&grassPrimitiveFamily=field-fiber-shell&fiberShellVariant=normal" +
  "&grassRadius=420&grassFieldCell=2.2&grassFieldRecords=16000&grassMinNormalZ=0.72" +
  "&grassLodNearRadius=0.26&grassLodMidRadius=0.62&grassLodStratified=1" +
  "&grassAccentDepthNear=0&grassAccentDepthFar=150&grassAccentTufts=5200" +
  "&meadowDepthNear=0&meadowDepthFar=1040&meadowNear=1.0&meadowFar=0.56" +
  "&meadowDensityScale=1.55&meadowSpread=132&meadowCoverageSpread=360" +
  "&rootMassStrength=1.1&rootMassSpread=64";

const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/slice-16-band-camera-composition-lock/",
  import.meta.url,
);

const BAND_ORDER = ["background", "midground", "foreground"];
const BAND_COLORS = {
  background: [115, 190, 255, 255],
  midground: [245, 210, 92, 255],
  foreground: [118, 230, 135, 255],
};

export const meta = {
  name: "battle-map-reference-band-camera-composition-lock",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/band-camera-composition-lock",
    "map-reference/band-camera-composition-lock-bands",
  ],
  describe:
    "Slice 16: locks the composed battle-map-reference camera, centered horizon, and foreground/midground/background review bands.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("band camera composition lock requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const capture = await captureRoute(ctx, QUERY, "band-camera-composition-lock", meta.name);
  const composition = capture.stats?.cameraComposition;
  assertRoute(ctx, capture.stats);
  assertComposition(ctx, composition);

  const crops = cropBands(capture.image, composition?.crops);
  const metrics = Object.fromEntries(
    Object.entries(crops).map(([name, image]) => [name, bandMetrics(image)]),
  );
  assertBandOccupancy(ctx, metrics);

  const annotated = annotateFrame(capture.image, composition);
  const bandSheet = composeBandSheet(crops);

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ capture, annotated, bandSheet, crops, metrics });
  }

  await ctx.snap(null, "map-reference/band-camera-composition-lock", {
    shot: PNG.sync.write(annotated),
  });
  await ctx.snap(null, "map-reference/band-camera-composition-lock-bands", {
    shot: PNG.sync.write(bandSheet),
  });
}

function assertRoute(ctx, stats) {
  const grass = stats?.grass;
  ctx.check(
    "band lock uses the current composed heightmap grass route",
    stats?.route === "battle-terrain-3d" &&
      stats?.gate === "highland-valley" &&
      stats?.view === "heightmap-vista" &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.environment?.id === "overcast-foggy" &&
      stats?.ground?.diagnosticMode === "normal" &&
      stats?.grassTechnique === "field-accent" &&
      grass?.grassPrimitiveFamily === "field-fiber-shell" &&
      grass?.accentAggregation === "field-near" &&
      grass?.terrainMasked === true &&
      grass?.invalidTintTufts === 0 &&
      grass?.drawCalls === 1 &&
      stats?.ground?.meadow?.enabled === true &&
      stats?.cameraComposition,
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      view: stats?.view,
      terrainSource: stats?.terrainSource,
      environment: stats?.environment,
      ground: stats?.ground,
      grassTechnique: stats?.grassTechnique,
      grass,
      cameraComposition: stats?.cameraComposition,
    }),
  );
}

function assertComposition(ctx, composition) {
  const horizon = composition?.horizonYRatio;
  const target = composition?.targetHorizonYRatio;
  const tolerance = composition?.horizonTolerance;
  const crops = composition?.crops;
  ctx.check(
    "true terrain horizon is centered vertically",
    Number.isFinite(horizon) && Math.abs(horizon - target) <= tolerance,
    JSON.stringify(composition ?? null),
  );
  ctx.check(
    "foreground, midground, and background crops are stable and vertically ordered",
    validRect(crops?.foreground) &&
      validRect(crops?.midground) &&
      validRect(crops?.background) &&
      crops.background.y < target - 0.18 &&
      crops.background.y + crops.background.h > target + 0.04 &&
      crops.midground.y >= crops.background.y + crops.background.h - 0.001 &&
      crops.foreground.y >= crops.midground.y + crops.midground.h - 0.001,
    JSON.stringify(crops ?? null),
  );
}

function assertBandOccupancy(ctx, metrics) {
  ctx.check(
    "foreground crop contains near terrain/grass review content",
    metrics.foreground.greenRatio > 0.42 &&
      metrics.foreground.skyRatio < 0.02 &&
      metrics.foreground.darkVoidRatio < 0.01,
    JSON.stringify(metrics.foreground),
  );
  ctx.check(
    "midground crop contains meadow/terrain review content without sky",
    metrics.midground.greenRatio > 0.36 &&
      metrics.midground.skyRatio < 0.04 &&
      metrics.midground.darkVoidRatio < 0.01,
    JSON.stringify(metrics.midground),
  );
  ctx.check(
    "background crop contains both sky and terrain/cliff review content",
    metrics.background.skyRatio > 0.18 &&
      metrics.background.skyRatio < 0.78 &&
      metrics.background.greenRatio > 0.03,
    JSON.stringify(metrics.background),
  );
}

function validRect(rect) {
  return (
    rect &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w > 0.1 &&
    rect.h > 0.1 &&
    rect.x + rect.w <= 1 &&
    rect.y + rect.h <= 1
  );
}

function cropBands(image, crops) {
  return {
    foreground: cropFromRect(image, crops?.foreground),
    midground: cropFromRect(image, crops?.midground),
    background: cropFromRect(image, crops?.background),
  };
}

function cropFromRect(image, rect) {
  return cropRatio(image, rect?.x ?? 0, rect?.y ?? 0, rect?.w ?? 1, rect?.h ?? 1);
}

function annotateFrame(image, composition) {
  const out = PNG.sync.read(PNG.sync.write(image));
  const horizonY = Math.round((composition?.horizonYRatio ?? 0.5) * out.height);
  drawHorizontalLine(out, horizonY, [250, 244, 210, 255], 3);
  for (const name of BAND_ORDER) {
    drawRect(out, composition?.crops?.[name], BAND_COLORS[name], 3);
  }
  return out;
}

function drawHorizontalLine(image, y, color, thickness) {
  for (let dy = -Math.floor(thickness / 2); dy <= Math.floor(thickness / 2); dy++) {
    const row = y + dy;
    if (row < 0 || row >= image.height) continue;
    for (let x = 0; x < image.width; x++) setPixel(image, x, row, color);
  }
}

function drawRect(image, rect, color, thickness) {
  if (!validRect(rect)) return;
  const x0 = Math.round(rect.x * image.width);
  const y0 = Math.round(rect.y * image.height);
  const x1 = Math.round((rect.x + rect.w) * image.width) - 1;
  const y1 = Math.round((rect.y + rect.h) * image.height) - 1;
  for (let t = 0; t < thickness; t++) {
    for (let x = x0; x <= x1; x++) {
      setPixel(image, x, y0 + t, color);
      setPixel(image, x, y1 - t, color);
    }
    for (let y = y0; y <= y1; y++) {
      setPixel(image, x0 + t, y, color);
      setPixel(image, x1 - t, y, color);
    }
  }
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 4;
  image.data[i] = color[0];
  image.data[i + 1] = color[1];
  image.data[i + 2] = color[2];
  image.data[i + 3] = color[3];
}

function composeBandSheet(crops) {
  const width = 520;
  const gap = 12;
  const scaled = BAND_ORDER.map((name) => [name, resizeToWidth(crops[name], width)]);
  const out = solidPng(
    width,
    scaled.reduce((total, [, image]) => total + image.height, 0) + gap * (scaled.length - 1),
    [32, 36, 38, 255],
  );
  let y = 0;
  for (const [name, image] of scaled) {
    const framed = PNG.sync.read(PNG.sync.write(image));
    drawRect(framed, { x: 0.005, y: 0.005, w: 0.99, h: 0.99 }, BAND_COLORS[name], 3);
    paste(out, framed, 0, y);
    y += image.height + gap;
  }
  return out;
}

function bandMetrics(image) {
  let green = 0;
  let sky = 0;
  let darkVoid = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const count = image.width * image.height;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      rSum += r;
      gSum += g;
      bSum += b;
      if (g > b * 1.04 && g >= r * 0.82 && r > 32 && b > 28) green++;
      if (b > r + 8 && b > g + 2 && r > 145 && g > 148) sky++;
      if (r + g + b < 54) darkVoid++;
    }
  }
  return {
    greenRatio: round3(green / Math.max(1, count)),
    skyRatio: round3(sky / Math.max(1, count)),
    darkVoidRatio: round3(darkVoid / Math.max(1, count)),
    avg: [
      Math.round(rSum / Math.max(1, count)),
      Math.round(gSum / Math.max(1, count)),
      Math.round(bSum / Math.max(1, count)),
    ],
  };
}

function round3(value) {
  return Number(value.toFixed(3));
}

async function writeArtifacts({ capture, annotated, bandSheet, crops, metrics }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("band-camera-composition-lock.png", ASSET_DIR), PNG.sync.write(annotated)),
    writeFile(
      new URL("band-camera-composition-lock-bands.png", ASSET_DIR),
      PNG.sync.write(bandSheet),
    ),
    writeFile(new URL("foreground-band.png", ASSET_DIR), PNG.sync.write(crops.foreground)),
    writeFile(new URL("midground-band.png", ASSET_DIR), PNG.sync.write(crops.midground)),
    writeFile(new URL("background-band.png", ASSET_DIR), PNG.sync.write(crops.background)),
    writeFile(
      new URL("route-stats.json", ASSET_DIR),
      `${JSON.stringify(summarizeStats(capture.stats, metrics), null, 2)}\n`,
    ),
  ]);
}

function summarizeStats(stats, metrics) {
  return {
    route: stats?.route,
    gate: stats?.gate,
    view: stats?.view,
    terrainSource: stats?.terrainSource,
    environment: stats?.environment,
    camera: stats?.camera,
    cameraComposition: stats?.cameraComposition,
    cliffSilhouette: stats?.cliffSilhouette,
    ground: {
      diagnosticMode: stats?.ground?.diagnosticMode,
      meadow: stats?.ground?.meadow,
    },
    grassTechnique: stats?.grassTechnique,
    grass: {
      family: stats?.grass?.grassPrimitiveFamily,
      aggregation: stats?.grass?.accentAggregation,
      fieldRecords: stats?.grass?.fieldRecords,
      fieldLodCounts: stats?.grass?.fieldLodCounts,
      accentTufts: stats?.grass?.accentTufts,
      accentLodCounts: stats?.grass?.accentLodCounts,
      drawCalls: stats?.grass?.drawCalls,
      invalidTintTufts: stats?.grass?.invalidTintTufts,
      terrainMasked: stats?.grass?.terrainMasked,
    },
    bandMetrics: metrics,
  };
}
