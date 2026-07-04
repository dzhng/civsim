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
  "gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&cameraProfile=horizon-band&environment=overcast-foggy&grassTechnique=field-accent&grassPrimitiveFamily=texture-carrier&geometryProbe=midground-valley" +
  "&grassRadius=360&grassFieldCell=1.8&grassFieldRecords=20000&grassMinNormalZ=0.72" +
  "&grassAccentClumps=20000&grassAccentTufts=20000&grassAccentFootprint=2.4" +
  "&grassBlades=4&grassBladeHeight=0.78&grassBladeWidth=0.084";
const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/slice-12b-horizon-band-camera/",
  import.meta.url,
);

export const meta = {
  name: "battle-map-reference-horizon-band-camera",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: ["map-reference/horizon-band-camera", "map-reference/horizon-band-camera-crops"],
  describe:
    "Slice 12b: pins the battle-map-reference hilltop camera horizon and foreground/midground/background review bands on the composed terrain surface.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("horizon band camera requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const capture = await captureRoute(ctx, QUERY, "horizon-band-camera", meta.name);
  assertRoute(ctx, capture.stats);
  assertComposition(ctx, capture.stats?.cameraComposition);

  const annotated = annotateHorizon(capture.image, capture.stats?.cameraComposition);
  const crops = cropBands(capture.image, capture.stats?.cameraComposition?.crops);
  const cropSheet = composeCropSheet(crops);
  assertBandReadability(ctx, capture.image, crops);

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ capture, annotated, cropSheet, crops });
  }

  await ctx.snap(null, "map-reference/horizon-band-camera", {
    shot: PNG.sync.write(annotated),
  });
  await ctx.snap(null, "map-reference/horizon-band-camera-crops", {
    shot: PNG.sync.write(cropSheet),
  });
}

function assertRoute(ctx, stats) {
  ctx.check(
    "horizon band camera uses the heightmap band-composition route",
    stats?.route === "battle-terrain-3d" &&
      stats?.gate === "highland-valley" &&
      stats?.view === "heightmap-vista" &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.ground?.diagnosticMode === "normal" &&
      stats?.grassTechnique === "field-accent" &&
      stats?.grass?.terrainMasked === true &&
      stats?.grass?.grassPrimitiveFamily !== "legacy-tuft" &&
      stats?.grass?.invalidTintTufts === 0 &&
      stats?.grass?.fieldRecords >= 4500 &&
      stats?.grass?.accentTufts >= 10000 &&
      stats?.referenceHeightmap?.sourceKind === "continuous-field" &&
      stats?.cameraComposition,
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      view: stats?.view,
      terrainSource: stats?.terrainSource,
      ground: stats?.ground,
      grassTechnique: stats?.grassTechnique,
      grass: stats?.grass,
      camera: stats?.camera,
      cameraComposition: stats?.cameraComposition,
    }),
  );
}

function assertBandReadability(ctx, image, crops) {
  const foreground = bandMetrics(crops.foreground);
  const midground = bandMetrics(crops.midground);
  const background = bandMetrics(crops.background);
  ctx.check(
    "foreground and midground bands contain visible terrain instead of clear-color void",
    foreground.greenRatio > 0.45 &&
      foreground.clearRatio < 0.05 &&
      midground.greenRatio > 0.25 &&
      midground.clearRatio < 0.15,
    JSON.stringify({ foreground, midground }),
  );
  ctx.check(
    "background band retains terrain silhouettes below the sky",
    background.clearRatio > 0.25 && background.greenRatio > 0.02,
    JSON.stringify(background),
  );
}

function assertComposition(ctx, composition) {
  const horizon = composition?.horizonYRatio;
  const target = composition?.targetHorizonYRatio;
  const tolerance = composition?.horizonTolerance;
  const crops = composition?.crops;
  ctx.check(
    "implied ground-plane horizon is centered vertically",
    Number.isFinite(horizon) && Math.abs(horizon - target) <= tolerance,
    JSON.stringify(composition ?? null),
  );
  ctx.check(
    "foreground, midground, and background review bands are published",
    validRect(crops?.foreground) &&
      validRect(crops?.midground) &&
      validRect(crops?.background) &&
      crops.foreground.y > crops.midground.y &&
      crops.midground.y > crops.background.y,
    JSON.stringify(crops ?? null),
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

function bandMetrics(image) {
  let green = 0;
  let clear = 0;
  const count = image.width * image.height;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      if (g > r * 1.02 && g > b * 1.02 && g > 45) green++;
      if (b > r + 8 && b > g + 2 && r > 150 && g > 155) clear++;
    }
  }
  return {
    greenRatio: round3(green / Math.max(1, count)),
    clearRatio: round3(clear / Math.max(1, count)),
  };
}

function round3(value) {
  return Number(value.toFixed(3));
}

function cropFromRect(image, rect) {
  return cropRatio(image, rect?.x ?? 0, rect?.y ?? 0, rect?.w ?? 1, rect?.h ?? 1);
}

function annotateHorizon(image, composition) {
  const out = PNG.sync.read(PNG.sync.write(image));
  const y = Math.max(
    0,
    Math.min(out.height - 1, Math.round((composition?.horizonYRatio ?? 0.5) * out.height)),
  );
  for (let dy = -1; dy <= 1; dy++) {
    const row = y + dy;
    if (row < 0 || row >= out.height) continue;
    for (let x = 0; x < out.width; x++) {
      const i = (row * out.width + x) * 4;
      out.data[i] = 250;
      out.data[i + 1] = 244;
      out.data[i + 2] = 210;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

function composeCropSheet(crops) {
  const labels = [
    ["foreground", crops.foreground],
    ["midground", crops.midground],
    ["background", crops.background],
  ];
  const width = 420;
  const gap = 12;
  const scaled = labels.map(([label, image]) => [label, resizeToWidth(image, width)]);
  const out = solidPng(
    width,
    scaled.reduce((sum, [, image]) => sum + image.height, 0) + gap * 2,
    [32, 36, 38, 255],
  );
  let y = 0;
  for (const [, image] of scaled) {
    paste(out, image, 0, y);
    y += image.height + gap;
  }
  return out;
}

async function writeArtifacts({ capture, annotated, cropSheet, crops }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("horizon-band-camera.png", ASSET_DIR), PNG.sync.write(annotated)),
    writeFile(new URL("horizon-band-camera-crops.png", ASSET_DIR), PNG.sync.write(cropSheet)),
    writeFile(new URL("foreground-band.png", ASSET_DIR), PNG.sync.write(crops.foreground)),
    writeFile(new URL("midground-band.png", ASSET_DIR), PNG.sync.write(crops.midground)),
    writeFile(new URL("background-band.png", ASSET_DIR), PNG.sync.write(crops.background)),
    writeFile(
      new URL("route-stats.json", ASSET_DIR),
      `${JSON.stringify(summarizeStats(capture.stats), null, 2)}\n`,
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
    cameraComposition: stats?.cameraComposition,
    heightmap: stats?.referenceHeightmap,
    midgroundOcclusion: stats?.midgroundOcclusion?.summary,
    ground: stats?.ground,
    grassTechnique: stats?.grassTechnique,
    grass: {
      family: stats?.grass?.grassPrimitiveFamily,
      aggregation: stats?.grass?.accentAggregation,
      fieldRecords: stats?.grass?.fieldRecords,
      accentTufts: stats?.grass?.accentTufts,
      invalidTintTufts: stats?.grass?.invalidTintTufts,
      terrainMasked: stats?.grass?.terrainMasked,
    },
  };
}
