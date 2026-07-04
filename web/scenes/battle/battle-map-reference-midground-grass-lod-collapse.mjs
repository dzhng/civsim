import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import {
  captureRoute,
  cropRatio,
  paste,
  resizeToWidth,
  solidPng,
  structureMetrics,
} from "./battle-map-reference-grass-legibility-lib.js";

const BASE_QUERY =
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
  "../../../specs/battle-map-reference/assets/slice-15-midground-grass-lod-collapse/",
  import.meta.url,
);

export const meta = {
  name: "battle-map-reference-midground-grass-lod-collapse",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/midground-grass-lod-collapse",
    "map-reference/midground-grass-lod-collapse-bands",
  ],
  describe:
    "Slice 15: verifies that the heightmap scene keeps close grass geometry while mid/far grass records collapse into a soft meadow mass.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("midground grass LOD requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const capture = await captureRoute(ctx, BASE_QUERY, "midground-grass-lod-collapse", meta.name);
  const stats = capture.stats;
  const crops = cropBands(capture.image, stats?.cameraComposition?.crops);
  const bandSheet = composeBandSheet(crops);
  const metrics = {
    foreground: structureMetrics(crops.foreground),
    midground: structureMetrics(crops.midground),
    background: structureMetrics(crops.background),
  };
  assertRoute(ctx, stats);
  assertLodTelemetry(ctx, stats);
  assertMidgroundVisual(ctx, metrics);

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ capture, crops, bandSheet, metrics });
  }

  await ctx.snap(null, "map-reference/midground-grass-lod-collapse", {
    shot: PNG.sync.write(capture.image),
  });
  await ctx.snap(null, "map-reference/midground-grass-lod-collapse-bands", {
    shot: PNG.sync.write(bandSheet),
  });
}

function assertRoute(ctx, stats) {
  const grass = stats?.grass;
  const meadow = stats?.ground?.meadow;
  ctx.check(
    "midground LOD uses the retained field-owned grass route",
    stats?.route === "battle-terrain-3d" &&
      stats?.view === "heightmap-vista" &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.cameraComposition?.horizonYRatio > 0.47 &&
      stats?.cameraComposition?.horizonYRatio < 0.54 &&
      stats?.grassTechnique === "field-accent" &&
      grass?.terrainMasked === true &&
      grass?.prepMode === "packed-field" &&
      grass?.grassPrimitiveFamily === "field-fiber-shell" &&
      grass?.accentAggregation === "field-near" &&
      grass?.drawCalls === 1 &&
      grass?.invalidTintTufts === 0 &&
      meadow?.enabled === true &&
      meadow?.source === "field" &&
      meadow?.fieldRecords === grass?.fieldRecords,
    JSON.stringify({
      route: stats?.route,
      view: stats?.view,
      terrainSource: stats?.terrainSource,
      cameraComposition: stats?.cameraComposition,
      grass,
      meadow,
    }),
  );
}

function assertLodTelemetry(ctx, stats) {
  const grass = stats?.grass ?? {};
  const meadow = stats?.ground?.meadow ?? {};
  const fieldLodTotal = sum(grass.fieldLodCounts);
  const accentLodTotal = sum(grass.accentLodCounts);
  ctx.check(
    "grass field publishes near/mid/far LOD bands and keeps mid/far records for meadow collapse",
    fieldLodTotal === grass.fieldRecords &&
      grass.fieldLodNearRadius === 0.26 &&
      grass.fieldLodMidRadius === 0.62 &&
      grass.fieldLodNearRecords > 0 &&
      grass.fieldLodMidRecords > 0 &&
      grass.fieldLodFarRecords > 0 &&
      grass.fieldLodMidRecords + grass.fieldLodFarRecords > grass.fieldLodNearRecords &&
      meadow.fieldCoverage > 0.025 &&
      meadow.avgDensity > 0.024 &&
      meadow.farStrength >= 0.5,
    JSON.stringify({ grass, meadow }),
  );
  ctx.check(
    "close grass geometry is bounded while distant field records collapse into meadow material",
    accentLodTotal === grass.accentTufts &&
      grass.accentTufts > 0 &&
      grass.accentTufts < grass.fieldRecords &&
      grass.accentCulledFieldRecords > grass.fieldRecords * 0.35 &&
      grass.accentBudgetDroppedRecords >= 0 &&
      grass.accentLodFarRecords < grass.fieldLodFarRecords * 0.35,
    JSON.stringify({ grass, meadow }),
  );
}

function assertMidgroundVisual(ctx, metrics) {
  ctx.check(
    "midground band reads as soft green meadow instead of bare terrain or foreground strands",
    metrics.midground.base.green > 0.82 &&
      metrics.midground.base.darkVoid < 0.01 &&
      metrics.midground.base.contrast < metrics.background.base.contrast * 0.12 &&
      metrics.midground.tile4.cv < metrics.background.tile4.cv * 0.5 &&
      metrics.midground.verticalRun.tallColumnRatio < 0.04 &&
      metrics.midground.verticalRun.p90Height < 0.14,
    JSON.stringify(metrics),
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

function composeBandSheet(crops) {
  const labels = [
    ["foreground", crops.foreground],
    ["midground", crops.midground],
    ["background", crops.background],
  ];
  const width = 520;
  const gap = 12;
  const scaled = labels.map(([label, image]) => [label, resizeToWidth(image, width)]);
  const out = solidPng(
    width,
    scaled.reduce((total, [, image]) => total + image.height, 0) + gap * 2,
    [32, 36, 38, 255],
  );
  let y = 0;
  for (const [, image] of scaled) {
    paste(out, image, 0, y);
    y += image.height + gap;
  }
  return out;
}

async function writeArtifacts({ capture, crops, bandSheet, metrics }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(
      new URL("midground-grass-lod-collapse.png", ASSET_DIR),
      PNG.sync.write(capture.image),
    ),
    writeFile(
      new URL("midground-grass-lod-collapse-bands.png", ASSET_DIR),
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
    camera: stats?.camera,
    cameraComposition: stats?.cameraComposition,
    ground: {
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
      accentCulledFieldRecords: stats?.grass?.accentCulledFieldRecords,
      accentBudgetDroppedRecords: stats?.grass?.accentBudgetDroppedRecords,
      submittedTriangles: stats?.grass?.submittedTriangles,
      drawCalls: stats?.grass?.drawCalls,
      invalidTintTufts: stats?.grass?.invalidTintTufts,
      terrainMasked: stats?.grass?.terrainMasked,
    },
    metrics,
  };
}

function sum(values) {
  return Array.isArray(values) ? values.reduce((total, value) => total + value, 0) : 0;
}
