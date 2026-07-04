import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import {
  ORACLE,
  captureRoute,
  cropRatio,
  legibilityVerdict,
  paste,
  resizeToWidth,
  solidPng,
  structureMetrics,
} from "./battle-map-reference-grass-legibility-lib.js";

const TARGET = new URL(
  "../../../specs/battle-map-reference/assets/target-battle-map.png",
  import.meta.url,
);
const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/slice-14b-foreground-blade-legibility/",
  import.meta.url,
);

const BASE_QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&environment=overcast-foggy&geometryProbe=midground-valley&zoom=2.35&pitch=1.34";
const STRAND_BASELINE_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassRadius=360&grassMinNormalZ=0.72` +
  "&grassFieldCell=2.0&grassFieldRecords=20000&meadowFar=0.50" +
  "&grassBodyDomainId=field-continuous-strand-texture&grassBodyDomainStrength=1.62" +
  "&grassBodyDomainScale=10.5&grassBodyDomainFiberFrequency=10.5&grassBodyDomainContrast=0.58" +
  "&grassPrimitiveFamily=field-strand-mat&grassAccentAggregation=field-subcell" +
  "&grassAccentClumps=1600&grassAccentSourcesPerCell=8&grassAccentTufts=12800" +
  "&grassAccentFootprint=2.2&grassBlades=12&grassBladeHeight=0.56&grassBladeWidth=0.052" +
  "&grassBend=0.10&grassSpread=0.110";
const VERTICAL_FIBER_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassRadius=360&grassMinNormalZ=0.72` +
  "&grassFieldCell=1.45&grassFieldRecords=20000&meadowFar=0.50" +
  "&meadowDensityScale=2.4&meadowSpread=150&meadowCoverageSpread=320" +
  "&rootMassStrength=1.6&rootMassSpread=72" +
  "&grassBodyDomainId=field-continuous-strand-texture&grassBodyDomainStrength=1.62" +
  "&grassBodyDomainScale=10.5&grassBodyDomainFiberFrequency=10.5&grassBodyDomainContrast=0.58" +
  "&grassPrimitiveFamily=field-fiber-body&grassAccentAggregation=field-subcell" +
  "&grassAccentDepthNear=0&grassAccentDepthFar=680" +
  "&grassAccentClumps=5200&grassAccentSourcesPerCell=5&grassAccentTufts=20000" +
  "&grassAccentFootprint=3.2&grassBlades=20&grassBladeHeight=1.12&grassBladeWidth=0.084" +
  "&grassBend=0.18&grassSpread=0.160";

export const meta = {
  name: "battle-map-reference-foreground-grass-accent-occupancy",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/foreground-grass-accent-occupancy-crops",
    "map-reference/foreground-grass-accent-occupancy-candidate",
  ],
  describe:
    "Slice 14b2a: proves vertical field-fiber geometry improves foreground occupancy without raw-edge stipple.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "foreground grass accent occupancy requires browser GPU flags",
      true,
      "set VERIFY_GPU=1",
    );
    return;
  }

  const [baseline, candidate] = await Promise.all([
    captureRoute(
      ctx,
      STRAND_BASELINE_QUERY,
      "strand-baseline",
      "battle-map-reference-foreground-grass-accent-occupancy",
    ),
    captureRoute(
      ctx,
      VERTICAL_FIBER_QUERY,
      "vertical-fiber",
      "battle-map-reference-foreground-grass-accent-occupancy",
    ),
  ]);
  const target = PNG.sync.read(await readFile(TARGET));
  const crops = {
    target: cropRatio(target, 0.0, 0.56, 1.0, 0.38),
    baseline: cropRatio(baseline.image, 0.0, 0.56, 1.0, 0.38),
    candidate: cropRatio(candidate.image, 0.0, 0.56, 1.0, 0.38),
  };
  const metrics = Object.fromEntries(
    Object.entries(crops).map(([name, crop]) => [name, structureMetrics(crop)]),
  );
  const verdicts = Object.fromEntries(
    Object.entries(metrics).map(([name, metric]) => [name, legibilityVerdict(metric)]),
  );

  assertCandidateRoute(ctx, candidate.stats);
  assertAccentOccupancy(ctx, { metrics, verdicts });
  assertSeamTelemetryCarried(ctx, { metrics });

  const cropSheet = composeCropSheet(crops);
  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ baseline, candidate, crops, cropSheet, metrics, verdicts });
  }
  await ctx.snap(null, "map-reference/foreground-grass-accent-occupancy-crops", {
    shot: PNG.sync.write(cropSheet),
  });
  await ctx.snap(null, "map-reference/foreground-grass-accent-occupancy-candidate", {
    shot: PNG.sync.write(candidate.image),
  });
}

function assertCandidateRoute(ctx, stats) {
  const grass = stats?.grass;
  const meadow = stats?.ground?.meadow;
  ctx.check(
    "foreground accent occupancy uses vertical field-fiber geometry on the heightmap vista",
    stats?.route === "battle-terrain-3d" &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.view === "heightmap-vista" &&
      grass?.grassPrimitiveFamily === "field-fiber-body" &&
      grass?.grassPrimitiveRepresentation === "field-fiber-body" &&
      grass?.accentAggregation === "field-subcell" &&
      grass?.grassPrimitiveSourceTopology === "field-subcell" &&
      grass?.grassPrimitiveSourcesPerCell === 5 &&
      grass?.accentTufts === 20000 &&
      grass?.drawCalls === 1 &&
      grass?.invalidTintTufts === 0 &&
      meadow?.bodyDomainEnabled === true,
    JSON.stringify({ grass, meadow }),
  );
}

function assertAccentOccupancy(ctx, { metrics, verdicts }) {
  const baseline = metrics.baseline;
  const candidate = metrics.candidate;
  ctx.check(
    "vertical field-fiber candidate improves real-geometry foreground occupancy without raw-edge stipple",
    verdicts.target.ok === true &&
      verdicts.baseline.ok === false &&
      verdicts.candidate.ok === false &&
      verdicts.candidate.failures.includes("low-structure-occupancy") &&
      verdicts.candidate.failures.includes("isotropic-confetti") &&
      verdicts.candidate.failures.includes("short-vertical-runs") &&
      candidate.base.edge <= ORACLE.rawEdgeMax &&
      candidate.down4.contrast >= ORACLE.down4ContrastMin &&
      candidate.retention4 >= ORACLE.retention4Min &&
      candidate.tile4.cv >= ORACLE.tile4CvMin &&
      candidate.tile4.cv <= ORACLE.tile4CvMax &&
      candidate.tile4.occupancy3 >= 0.6 &&
      candidate.tile4.occupancy3 >= baseline.tile4.occupancy3 + 0.12,
    JSON.stringify({
      oracle: ORACLE,
      metrics,
      verdicts,
    }),
  );
}

function assertSeamTelemetryCarried(ctx, { metrics }) {
  ctx.check(
    "foreground accent occupancy records the unsolved seam for 14b2b",
    metrics.baseline.seamJump > 0 && metrics.candidate.seamJump > 0,
    JSON.stringify({
      baseline: metrics.baseline.seamJump,
      candidate: metrics.candidate.seamJump,
      note: "14b2a is occupancy-only; rooting/seam remains a separate slice.",
    }),
  );
}

async function writeArtifacts({ baseline, candidate, crops, cropSheet, metrics, verdicts }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(
      new URL("foreground-grass-accent-occupancy-crops.png", ASSET_DIR),
      PNG.sync.write(cropSheet),
    ),
    writeFile(
      new URL("foreground-grass-accent-occupancy-candidate.png", ASSET_DIR),
      PNG.sync.write(candidate.image),
    ),
    writeFile(
      new URL("foreground-grass-accent-occupancy-baseline.png", ASSET_DIR),
      PNG.sync.write(baseline.image),
    ),
    writeFile(
      new URL("foreground-grass-accent-occupancy-target-crop.png", ASSET_DIR),
      PNG.sync.write(crops.target),
    ),
    writeFile(
      new URL("foreground-grass-accent-occupancy-candidate-crop.png", ASSET_DIR),
      PNG.sync.write(crops.candidate),
    ),
    writeFile(
      new URL("foreground-grass-accent-occupancy-metrics.json", ASSET_DIR),
      `${JSON.stringify(
        {
          oracle: ORACLE,
          metrics,
          verdicts,
          stats: {
            baseline: summarizeStats(baseline.stats),
            candidate: summarizeStats(candidate.stats),
          },
        },
        null,
        2,
      )}\n`,
    ),
  ]);
}

function summarizeStats(stats) {
  const grass = stats?.grass;
  const meadow = stats?.ground?.meadow;
  return {
    route: stats?.route,
    view: stats?.view,
    terrainSource: stats?.terrainSource,
    environment: stats?.environment?.id,
    grass: {
      grassPrimitiveFamily: grass?.grassPrimitiveFamily,
      grassPrimitiveRepresentation: grass?.grassPrimitiveRepresentation,
      grassPrimitiveSourceTopology: grass?.grassPrimitiveSourceTopology,
      grassPrimitiveSourcesPerCell: grass?.grassPrimitiveSourcesPerCell,
      accentAggregation: grass?.accentAggregation,
      accentTufts: grass?.accentTufts,
      accentClumps: grass?.accentClumps,
      drawCalls: grass?.drawCalls,
      submittedTriangles: grass?.submittedTriangles,
      invalidTintTufts: grass?.invalidTintTufts,
    },
    meadow: {
      bodyDomainEnabled: meadow?.bodyDomainEnabled,
      bodyDomainId: meadow?.bodyDomainId,
      bodyDomainCoverageAvg: meadow?.bodyDomainCoverageAvg,
      bodyDomainExposedGround: meadow?.bodyDomainExposedGround,
      rootMassStrength: meadow?.rootMassStrength,
      rootMassSpread: meadow?.rootMassSpread,
    },
  };
}

function composeCropSheet(crops) {
  const columns = [crops.target, crops.baseline, crops.candidate].map((crop) =>
    resizeToWidth(crop, 420),
  );
  const gap = 10;
  const width = columns.reduce((sum, image) => sum + image.width, 0) + gap * (columns.length - 1);
  const height = Math.max(...columns.map((image) => image.height));
  const out = solidPng(width, height, [216, 222, 220, 255]);
  let x = 0;
  for (const image of columns) {
    paste(out, image, x, 0);
    x += image.width + gap;
  }
  return out;
}
