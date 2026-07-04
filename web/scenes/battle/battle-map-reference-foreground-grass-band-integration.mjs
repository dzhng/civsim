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

const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/slice-17-foreground-grass-band-integration/",
  import.meta.url,
);

const BASE_QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista" +
  "&cameraProfile=horizon-band&environment=overcast-foggy&geometryProbe=midground-valley" +
  "&grassTechnique=field-accent&grassPrimitiveFamily=field-fiber-shell" +
  "&grassMinNormalZ=0.72" +
  "&grassLodStratified=1" +
  "&meadowDepthNear=0&meadowDepthFar=1040&meadowNear=1.0" +
  "&meadowSpread=132&meadowCoverageSpread=360";

const CURRENT_QUERY =
  `${BASE_QUERY}&fiberShellVariant=normal` +
  "&grassRadius=420" +
  "&grassFieldCell=2.2&grassFieldRecords=16000" +
  "&grassLodNearRadius=0.26&grassLodMidRadius=0.62" +
  "&grassAccentDepthNear=0&grassAccentDepthFar=150&grassAccentTufts=5200" +
  "&meadowFar=0.56&meadowDensityScale=1.55" +
  "&rootMassStrength=1.1&rootMassSpread=64";

const SHELL_OFF_QUERY =
  `${BASE_QUERY}&fiberShellVariant=off` +
  "&grassRadius=420" +
  "&grassFieldCell=2.2&grassFieldRecords=16000" +
  "&grassLodNearRadius=0.26&grassLodMidRadius=0.62" +
  "&grassAccentDepthNear=0&grassAccentDepthFar=150&grassAccentTufts=5200" +
  "&meadowFar=0.56&meadowDensityScale=1.55" +
  "&rootMassStrength=1.1&rootMassSpread=64";

const CANDIDATE_QUERY =
  `${BASE_QUERY}&fiberShellVariant=visibility&grassFocus=foreground-crop` +
  "&grassRadius=230&grassFieldCell=0.95&grassFieldRecords=20000" +
  "&grassLodNearRadius=0.30&grassLodMidRadius=0.66" +
  "&grassAccentDepthNear=-120&grassAccentDepthFar=300&grassAccentTufts=15000" +
  "&grassBlades=3&grassBladeHeight=0.90&grassBladeWidth=0.060&grassBend=0.08&grassSpread=0.070" +
  "&grassAccentSurface=0.62" +
  "&meadowFar=0.54&meadowDensityScale=1.70" +
  "&rootMassStrength=1.35&rootMassContrast=0.72&rootMassSpread=112";

export const meta = {
  name: "battle-map-reference-foreground-grass-band-integration",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/foreground-grass-band-integration",
    "map-reference/foreground-grass-band-integration-crops",
  ],
  describe:
    "Slice 17: proves visible foreground shell-grass occupancy in the locked lower band before judging color/rooting.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "foreground grass band integration requires browser GPU flags",
      true,
      "set VERIFY_GPU=1",
    );
    return;
  }

  const [shellOff, current, candidate] = await Promise.all([
    captureRoute(ctx, SHELL_OFF_QUERY, "shell-off", meta.name),
    captureRoute(ctx, CURRENT_QUERY, "current-shell", meta.name),
    captureRoute(ctx, CANDIDATE_QUERY, "candidate-shell", meta.name),
  ]);

  assertLockedCamera(ctx, shellOff.stats, "shell-off");
  assertLockedCamera(ctx, current.stats, "current-shell");
  assertLockedCamera(ctx, candidate.stats, "candidate-shell");
  assertRoute(ctx, shellOff.stats, current.stats, candidate.stats);

  const crops = cropForegroundBands({ shellOff, current, candidate });
  const metrics = {
    shellOff: foregroundMetrics(crops.shellOff),
    current: foregroundMetrics(crops.current),
    candidate: foregroundMetrics(crops.candidate),
    currentShellDelta: deltaMetrics(crops.current, crops.shellOff),
    candidateShellDelta: deltaMetrics(crops.candidate, crops.shellOff),
  };
  assertForegroundShellOccupancy(ctx, metrics, candidate.stats);

  const sheet = composeSheet([current.image, candidate.image], 520, 16);
  const cropSheet = composeSheet([crops.shellOff, crops.current, crops.candidate], 520, 12);

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ shellOff, current, candidate, crops, metrics, sheet, cropSheet });
  }

  await ctx.snap(null, "map-reference/foreground-grass-band-integration", {
    shot: PNG.sync.write(sheet),
  });
  await ctx.snap(null, "map-reference/foreground-grass-band-integration-crops", {
    shot: PNG.sync.write(cropSheet),
  });
}

function assertLockedCamera(ctx, stats, id) {
  const composition = stats?.cameraComposition;
  ctx.check(
    `${id} keeps the Slice 16 locked camera and crop contract`,
    stats?.route === "battle-terrain-3d" &&
      stats?.view === "heightmap-vista" &&
      stats?.terrainSource === "heightmap-layout" &&
      composition?.horizonYRatio >= 0.47 &&
      composition?.horizonYRatio <= 0.53 &&
      composition?.crops?.foreground?.x === 0.06 &&
      composition?.crops?.foreground?.y === 0.72 &&
      composition?.crops?.foreground?.w === 0.88 &&
      composition?.crops?.foreground?.h === 0.25,
    JSON.stringify({ route: stats?.route, view: stats?.view, cameraComposition: composition }),
  );
}

function assertRoute(ctx, shellOffStats, currentStats, candidateStats) {
  const offGrass = shellOffStats?.grass;
  const currentGrass = currentStats?.grass;
  const candidateGrass = candidateStats?.grass;
  ctx.check(
    "shell-off control keeps the field meadow but disables shell geometry",
    shellOffStats?.grassTechnique === "field-accent" &&
      offGrass?.grassPrimitiveFamily === "field-fiber-shell" &&
      offGrass?.fiberShellVariant === "off" &&
      offGrass?.accentTufts === 0 &&
      shellOffStats?.ground?.meadow?.source === "field" &&
      shellOffStats?.ground?.meadow?.fieldRecords === offGrass?.fieldRecords,
    JSON.stringify({ grass: offGrass, meadow: shellOffStats?.ground?.meadow }),
  );
  ctx.check(
    "candidate keeps the accepted field-fiber-shell route with one terrain-masked draw call",
    currentGrass?.grassPrimitiveFamily === "field-fiber-shell" &&
      candidateGrass?.grassPrimitiveFamily === "field-fiber-shell" &&
      candidateGrass?.accentAggregation === "field-near" &&
      candidateGrass?.fiberShellVariant === "visibility" &&
      candidateGrass?.fieldRecords >= 20000 &&
      candidateGrass?.accentTufts >= 12000 &&
      candidateGrass?.submittedTriangles <= 260000 &&
      candidateGrass?.drawCalls === 1 &&
      candidateGrass?.invalidTintTufts === 0 &&
      candidateGrass?.terrainMasked === true &&
      candidateStats?.ground?.meadow?.bodyDomainEnabled === false,
    JSON.stringify({ currentGrass, candidateGrass, meadow: candidateStats?.ground?.meadow }),
  );
}

function assertForegroundShellOccupancy(ctx, metrics, stats) {
  const current = metrics.currentShellDelta;
  const candidate = metrics.candidateShellDelta;
  const screen = stats?.grass?.screenCoverage?.accent;
  ctx.check(
    "candidate shell geometry visibly occupies the locked foreground crop instead of only submitting records",
    candidate.strongRatio > Math.max(0.018, current.strongRatio * 1.85) &&
      candidate.lowerHalfStrongRatio > Math.max(0.01, current.lowerHalfStrongRatio * 1.65) &&
      candidate.bottomThirdStrongRatio > Math.max(0.006, current.bottomThirdStrongRatio * 1.35) &&
      candidate.meanDelta > current.meanDelta * 1.35 &&
      candidate.topThirdStrongRatio / Math.max(0.001, candidate.bottomThirdStrongRatio) < 7.5 &&
      screen?.inCrop >= 900 &&
      screen?.bottomThirdInCrop >= 180 &&
      screen?.projectedBladePxP50 >= 16,
    JSON.stringify({ metrics, grass: stats?.grass, meadow: stats?.ground?.meadow }),
  );
  ctx.check(
    "candidate foreground remains green/olive and avoids raw carpet contrast",
    metrics.candidate.greenRatio > 0.92 &&
      metrics.candidate.base.avg[1] > metrics.candidate.base.avg[2] &&
      metrics.candidate.base.avg[1] > metrics.candidate.base.avg[0] &&
      metrics.candidate.darkRootRatio > 0.12 &&
      metrics.candidate.base.edge < 2.1 &&
      metrics.candidate.base.contrast < 6.2 &&
      metrics.candidate.retention4 >= 0.8 &&
      metrics.candidate.retention4 <= 1.45 &&
      metrics.candidate.tile4.occupancy2 > 0.55 &&
      metrics.candidate.tile4.cv < 0.36,
    JSON.stringify({ metrics, grass: stats?.grass, meadow: stats?.ground?.meadow }),
  );
}

function cropForegroundBands({ shellOff, current, candidate }) {
  const rect = candidate.stats?.cameraComposition?.crops?.foreground ?? {
    x: 0.06,
    y: 0.72,
    w: 0.88,
    h: 0.25,
  };
  return {
    shellOff: cropRatio(shellOff.image, rect.x, rect.y, rect.w, rect.h),
    current: cropRatio(current.image, rect.x, rect.y, rect.w, rect.h),
    candidate: cropRatio(candidate.image, rect.x, rect.y, rect.w, rect.h),
  };
}

function foregroundMetrics(image) {
  const structure = structureMetrics(image);
  let green = 0;
  let darkRoot = 0;
  const count = image.width * image.height;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      if (g > r * 1.02 && g > b * 1.04 && r > 36 && b > 28) green++;
      if (g > r * 0.94 && g > b * 1.01 && r + g + b < 330) darkRoot++;
    }
  }
  return {
    ...structure,
    greenRatio: round4(green / Math.max(1, count)),
    darkRootRatio: round4(darkRoot / Math.max(1, count)),
  };
}

function deltaMetrics(on, off) {
  let strong = 0;
  let sum = 0;
  let topStrong = 0;
  let lowerHalfStrong = 0;
  let bottomStrong = 0;
  const count = Math.min(on.width, off.width) * Math.min(on.height, off.height);
  const width = Math.min(on.width, off.width);
  const height = Math.min(on.height, off.height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * on.width + x) * 4;
      const j = (y * off.width + x) * 4;
      const delta =
        Math.abs(on.data[i] - off.data[j]) +
        Math.abs(on.data[i + 1] - off.data[j + 1]) +
        Math.abs(on.data[i + 2] - off.data[j + 2]);
      sum += delta;
      if (delta > 20) {
        strong++;
        if (y < height / 3) topStrong++;
        if (y >= height / 2) lowerHalfStrong++;
        if (y >= (height * 2) / 3) bottomStrong++;
      }
    }
  }
  return {
    strongRatio: round4(strong / Math.max(1, count)),
    topThirdStrongRatio: round4(topStrong / Math.max(1, Math.floor((width * height) / 3))),
    lowerHalfStrongRatio: round4(lowerHalfStrong / Math.max(1, Math.floor((width * height) / 2))),
    bottomThirdStrongRatio: round4(bottomStrong / Math.max(1, Math.floor((width * height) / 3))),
    meanDelta: round4(sum / Math.max(1, count)),
  };
}

function composeSheet(images, width, gap) {
  const scaled = images.map((image) => resizeToWidth(image, width));
  const out = solidPng(
    width,
    scaled.reduce((total, image) => total + image.height, 0) + gap * (scaled.length - 1),
    [32, 36, 38, 255],
  );
  let y = 0;
  for (const image of scaled) {
    paste(out, image, 0, y);
    y += image.height + gap;
  }
  return out;
}

async function writeArtifacts({ shellOff, current, candidate, crops, metrics, sheet, cropSheet }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("foreground-grass-band-integration.png", ASSET_DIR), PNG.sync.write(sheet)),
    writeFile(
      new URL("foreground-grass-band-integration-crops.png", ASSET_DIR),
      PNG.sync.write(cropSheet),
    ),
    writeFile(new URL("shell-off-foreground.png", ASSET_DIR), PNG.sync.write(crops.shellOff)),
    writeFile(new URL("current-shell-foreground.png", ASSET_DIR), PNG.sync.write(crops.current)),
    writeFile(
      new URL("candidate-shell-foreground.png", ASSET_DIR),
      PNG.sync.write(crops.candidate),
    ),
    writeFile(
      new URL("route-stats.json", ASSET_DIR),
      `${JSON.stringify(
        {
          queries: {
            shellOff: SHELL_OFF_QUERY,
            current: CURRENT_QUERY,
            candidate: CANDIDATE_QUERY,
          },
          shellOff: summarizeStats(shellOff.stats),
          current: summarizeStats(current.stats),
          candidate: summarizeStats(candidate.stats),
          metrics,
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
    view: stats?.view,
    terrainSource: stats?.terrainSource,
    environment: stats?.environment,
    cameraComposition: stats?.cameraComposition,
    grassTechnique: stats?.grassTechnique,
    grass: stats?.grass,
    meadow: stats?.ground?.meadow,
  };
}

function round4(value) {
  return Number(value.toFixed(4));
}
