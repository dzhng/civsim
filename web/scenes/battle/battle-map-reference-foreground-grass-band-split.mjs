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
const STRAND_CANDIDATE_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassRadius=360&grassMinNormalZ=0.72&meadowFar=0.50` +
  "&grassBodyDomainId=field-continuous-strand-texture&grassBodyDomainStrength=1.92" +
  "&grassBodyDomainScale=16.5&grassBodyDomainFiberFrequency=16.5&grassBodyDomainContrast=0.48" +
  "&grassBodyDomainFloor=0.52&grassBodyDomainDetail=1.6" +
  "&grassFieldCell=1.3&grassFieldRecords=22000&meadowDensityScale=3.4" +
  "&meadowSpread=190&meadowCoverageSpread=420&rootMassStrength=1.9&rootMassSpread=96" +
  "&grassPrimitiveFamily=field-strand-mat&grassAccentAggregation=field-subcell" +
  "&grassAccentClumps=4600&grassAccentSourcesPerCell=8&grassAccentTufts=22000" +
  "&grassAccentFootprint=4.05&grassBlades=18&grassBladeHeight=0.60" +
  "&grassBladeWidth=0.086&grassBend=0.10&grassSpread=0.218";
const BROAD_FIBER_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassRadius=360&grassMinNormalZ=0.72&meadowFar=0.50` +
  "&grassBodyDomainId=field-continuous-strand-texture&grassBodyDomainStrength=1.92" +
  "&grassBodyDomainScale=16.5&grassBodyDomainFiberFrequency=16.5&grassBodyDomainContrast=0.48" +
  "&grassFieldCell=1.65&grassFieldRecords=20000&meadowDensityScale=2.2" +
  "&meadowSpread=150&meadowCoverageSpread=340&rootMassStrength=1.55&rootMassSpread=84" +
  "&grassPrimitiveFamily=field-fiber-body&grassAccentAggregation=field-subcell" +
  "&grassAccentDepthNear=0&grassAccentDepthFar=820&grassAccentClumps=4800" +
  "&grassAccentSourcesPerCell=5&grassAccentTufts=20000&grassAccentFootprint=4.6" +
  "&grassBlades=24&grassBladeHeight=1.28&grassBladeWidth=0.118&grassBend=0.22&grassSpread=0.260";

const CROP_BANDS = {
  full: [0.0, 0.56, 1.0, 0.38],
  transition: [0.0, 0.56, 1.0, 0.16],
  lower: [0.0, 0.72, 1.0, 0.22],
};

export const meta = {
  name: "battle-map-reference-foreground-grass-band-split",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/foreground-grass-band-split-crops",
    "map-reference/foreground-grass-band-split-strand",
  ],
  describe:
    "Slice 14b2b: splits lower foreground numeric occupancy from unratified blade coherence and transition debt.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("foreground grass band split requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const [strand, fiber] = await Promise.all([
    captureRoute(ctx, STRAND_CANDIDATE_QUERY, "strand-band-split", meta.name),
    captureRoute(ctx, BROAD_FIBER_QUERY, "broad-fiber-control", meta.name),
  ]);
  const target = PNG.sync.read(await readFile(TARGET));
  const crops = bandCrops({ target, strand: strand.image, fiber: fiber.image });
  const metrics = metricBands(crops);
  const verdicts = verdictBands(metrics);

  assertRouteSupport(ctx, { strand: strand.stats, fiber: fiber.stats });
  assertBandSplit(ctx, { metrics, verdicts });

  const cropSheet = composeCropSheet(crops);
  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ captures: { strand, fiber }, crops, metrics, verdicts, cropSheet });
  }

  await ctx.snap(null, "map-reference/foreground-grass-band-split-crops", {
    shot: PNG.sync.write(cropSheet),
  });
  await ctx.snap(null, "map-reference/foreground-grass-band-split-strand", {
    shot: PNG.sync.write(strand.image),
  });
}

function assertRouteSupport(ctx, { strand, fiber }) {
  const strandGrass = strand?.grass;
  const fiberGrass = fiber?.grass;
  ctx.check(
    "foreground band split compares real strand geometry against rejected broad-fiber control",
    strand?.route === "battle-terrain-3d" &&
      strand?.terrainSource === "heightmap-layout" &&
      strand?.view === "heightmap-vista" &&
      strandGrass?.grassPrimitiveFamily === "field-strand-mat" &&
      strandGrass?.grassPrimitiveRepresentation === "continuous-strand-mat" &&
      strandGrass?.grassPrimitiveSourceCellSizeScale === 1 &&
      strandGrass?.drawCalls === 1 &&
      strandGrass?.invalidTintTufts === 0 &&
      fiberGrass?.grassPrimitiveFamily === "field-fiber-body" &&
      fiberGrass?.drawCalls === 1,
    JSON.stringify({ strand: strandGrass, fiber: fiberGrass }),
  );
}

function assertBandSplit(ctx, { metrics, verdicts }) {
  ctx.check(
    "lower foreground and transition bands expose separate grass failures",
    verdicts.target.full.ok === true &&
      verdicts.target.lower.ok === true &&
      verdicts.target.transition.ok === true &&
      verdicts.strand.full.ok === false &&
      verdicts.strand.full.failures.includes("low-structure-occupancy") &&
      verdicts.strand.lower.ok === false &&
      metrics.strand.lower.tile4.occupancy2 >= 0.9 &&
      metrics.strand.lower.tile4.occupancy3 >= ORACLE.tile4Occupancy3Min &&
      metrics.strand.lower.down4.edgeYOverX >= ORACLE.down4VerticalEdgeRatioMin &&
      verdicts.strand.lower.failures.includes("short-vertical-runs") &&
      verdicts.strand.transition.ok === false &&
      verdicts.strand.transition.failures.includes("low-structure-occupancy") &&
      metrics.strand.transition.tile4.occupancy3 <= 0.05 &&
      verdicts.fiber.lower.ok === false &&
      verdicts.fiber.lower.failures.includes("isotropic-confetti"),
    JSON.stringify({ oracle: ORACLE, metrics, verdicts }),
  );
}

async function writeArtifacts({ captures, crops, metrics, verdicts, cropSheet }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(
      new URL("foreground-grass-band-split-crops.png", ASSET_DIR),
      PNG.sync.write(cropSheet),
    ),
    writeFile(
      new URL("foreground-grass-band-split-strand.png", ASSET_DIR),
      PNG.sync.write(captures.strand.image),
    ),
    writeFile(
      new URL("foreground-grass-band-split-strand-lower.png", ASSET_DIR),
      PNG.sync.write(crops.strand.lower),
    ),
    writeFile(
      new URL("foreground-grass-band-split-strand-transition.png", ASSET_DIR),
      PNG.sync.write(crops.strand.transition),
    ),
    writeFile(
      new URL("foreground-grass-band-split-metrics.json", ASSET_DIR),
      `${JSON.stringify(
        {
          oracle: ORACLE,
          metrics,
          verdicts,
          stats: {
            strand: summarizeStats(captures.strand.stats),
            fiber: summarizeStats(captures.fiber.stats),
          },
        },
        null,
        2,
      )}\n`,
    ),
  ]);
}

function bandCrops(images) {
  return Object.fromEntries(
    Object.entries(images).map(([name, image]) => [
      name,
      Object.fromEntries(
        Object.entries(CROP_BANDS).map(([band, ratios]) => [band, cropRatio(image, ...ratios)]),
      ),
    ]),
  );
}

function metricBands(crops) {
  return Object.fromEntries(
    Object.entries(crops).map(([name, bands]) => [
      name,
      Object.fromEntries(
        Object.entries(bands).map(([band, crop]) => [band, structureMetrics(crop)]),
      ),
    ]),
  );
}

function verdictBands(metrics) {
  return Object.fromEntries(
    Object.entries(metrics).map(([name, bands]) => [
      name,
      Object.fromEntries(
        Object.entries(bands).map(([band, metric]) => [band, legibilityVerdict(metric)]),
      ),
    ]),
  );
}

function composeCropSheet(crops) {
  const rows = ["target", "strand", "fiber"].map((name) =>
    ["transition", "lower"].map((band) => resizeToWidth(crops[name][band], 420)),
  );
  const gap = 10;
  const width = rows[0].reduce((sum, image) => sum + image.width, 0) + gap;
  const height =
    rows.reduce((sum, row) => sum + Math.max(...row.map((image) => image.height)), 0) +
    gap * (rows.length - 1);
  const out = solidPng(width, height, [216, 222, 220, 255]);
  let y = 0;
  for (const row of rows) {
    let x = 0;
    const rowHeight = Math.max(...row.map((image) => image.height));
    for (const image of row) {
      paste(out, image, x, y);
      x += image.width + gap;
    }
    y += rowHeight + gap;
  }
  return out;
}

function summarizeStats(stats) {
  const grass = stats?.grass;
  return {
    route: stats?.route,
    view: stats?.view,
    terrainSource: stats?.terrainSource,
    environment: stats?.environment?.id,
    grass: {
      grassPrimitiveFamily: grass?.grassPrimitiveFamily,
      grassPrimitiveRepresentation: grass?.grassPrimitiveRepresentation,
      accentTufts: grass?.accentTufts,
      accentClumps: grass?.accentClumps,
      grassPrimitiveSourceCellSize: grass?.grassPrimitiveSourceCellSize,
      grassPrimitiveSourceCellSizeScale: grass?.grassPrimitiveSourceCellSizeScale,
      grassPrimitiveSourcesPerCell: grass?.grassPrimitiveSourcesPerCell,
      drawCalls: grass?.drawCalls,
      submittedTriangles: grass?.submittedTriangles,
      invalidTintTufts: grass?.invalidTintTufts,
    },
  };
}
