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
const GRASS_OFF_QUERY = `${BASE_QUERY}&grassTechnique=off`;
const COMMON_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassRadius=360&grassMinNormalZ=0.72&meadowFar=0.50` +
  "&grassBodyDomainId=field-continuous-strand-texture&grassBodyDomainStrength=1.92" +
  "&grassBodyDomainScale=16.5&grassBodyDomainFiberFrequency=16.5&grassBodyDomainContrast=0.48" +
  "&grassBodyDomainFloor=0.52&grassBodyDomainDetail=1.6" +
  "&grassFieldCell=1.3&grassFieldRecords=20000&meadowDensityScale=3.4" +
  "&meadowSpread=190&meadowCoverageSpread=420&rootMassStrength=1.9&rootMassSpread=96";

const CANDIDATES = [
  {
    id: "vertical-fiber-body",
    query:
      `${COMMON_QUERY}&grassPrimitiveFamily=field-fiber-body&grassAccentAggregation=field-subcell` +
      "&grassAccentDepthNear=0&grassAccentDepthFar=680" +
      "&grassAccentClumps=5200&grassAccentSourcesPerCell=5&grassAccentTufts=20000" +
      "&grassAccentFootprint=3.2&grassBlades=20&grassBladeHeight=1.12" +
      "&grassBladeWidth=0.084&grassBend=0.18&grassSpread=0.160",
  },
  {
    id: "strand-mat",
    query:
      `${COMMON_QUERY}&grassPrimitiveFamily=field-strand-mat&grassAccentAggregation=field-subcell` +
      "&grassAccentClumps=4600&grassAccentSourcesPerCell=8&grassAccentTufts=20000" +
      "&grassAccentFootprint=4.05&grassBlades=18&grassBladeHeight=0.60" +
      "&grassBladeWidth=0.086&grassBend=0.10&grassSpread=0.218",
  },
  {
    id: "domain-micro-strand",
    query:
      `${COMMON_QUERY}&grassPrimitiveFamily=field-domain-micro-strand&grassAccentAggregation=field-cell` +
      "&grassAccentClumps=2600&grassAccentTufts=2600&grassAccentFootprint=2.2" +
      "&grassBlades=30&grassBladeHeight=0.90&grassBladeWidth=0.060" +
      "&grassBend=0.10&grassSpread=0.28&grassAccentSurface=0.54",
  },
  {
    id: "domain-shell",
    query:
      `${COMMON_QUERY}&grassPrimitiveFamily=field-domain-shell&grassAccentAggregation=field-cell` +
      "&grassAccentClumps=2600&grassAccentTufts=2600&grassAccentFootprint=2.8" +
      "&grassBlades=14&grassBladeHeight=0.90&grassBladeWidth=0.070" +
      "&grassBend=0.10&grassSpread=0.28&grassAccentSurface=0.54",
  },
  {
    id: "alpha-impostor",
    query:
      `${COMMON_QUERY}&grassPrimitiveFamily=alpha-impostor&grassAccentAggregation=clump` +
      "&grassAccentClumps=7600&grassAccentTufts=16000&grassAccentFootprint=4.0" +
      "&grassBlades=8&grassBladeHeight=0.95&grassBladeWidth=0.090" +
      "&grassBend=0.12&grassSpread=0.18&grassAccentSurface=0.42",
  },
  {
    id: "billboard-cluster",
    query:
      `${COMMON_QUERY}&grassPrimitiveFamily=billboard-cluster&grassAccentAggregation=clump` +
      "&grassAccentClumps=7600&grassAccentTufts=16000&grassAccentFootprint=4.0" +
      "&grassBlades=8&grassBladeHeight=1.05&grassBladeWidth=0.090" +
      "&grassBend=0.12&grassSpread=0.18&grassAccentSurface=0.42",
  },
  {
    id: "texture-micro-carrier",
    query:
      `${COMMON_QUERY}&grassPrimitiveFamily=texture-micro-carrier&grassAccentAggregation=field-cell` +
      "&grassAccentClumps=6400&grassAccentTufts=20000&grassAccentFootprint=1.9" +
      "&grassBlades=4&grassBladeHeight=0.82&grassBladeWidth=0.056" +
      "&grassBend=0.05&grassSpread=0.07&grassAccentSurface=0.34",
  },
];

export const meta = {
  name: "battle-map-reference-foreground-grass-primitive-bakeoff",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/foreground-grass-primitive-bakeoff-crops",
    "map-reference/foreground-grass-primitive-bakeoff-variants",
  ],
  describe:
    "Slice 14b2d: compares foreground grass primitive families, including grass-off and vertical-fiber controls, against the hardened blade-coherence oracle.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "foreground grass primitive bakeoff requires browser GPU flags",
      true,
      "set VERIFY_GPU=1",
    );
    return;
  }

  const grassOff = await captureRoute(ctx, GRASS_OFF_QUERY, "grass-off", meta.name);
  const captures = [];
  for (const candidate of CANDIDATES) {
    captures.push({
      ...candidate,
      ...(await captureRoute(ctx, candidate.query, candidate.id, meta.name)),
    });
  }
  const target = PNG.sync.read(await readFile(TARGET));
  const crops = {
    target: cropRatio(target, 0.0, 0.72, 1.0, 0.22),
    "grass-off": cropRatio(grassOff.image, 0.0, 0.72, 1.0, 0.22),
    ...Object.fromEntries(
      captures.map((capture) => [capture.id, cropRatio(capture.image, 0.0, 0.72, 1.0, 0.22)]),
    ),
  };
  const metrics = Object.fromEntries(
    Object.entries(crops).map(([id, crop]) => [id, structureMetrics(crop)]),
  );
  const verdicts = Object.fromEntries(
    Object.entries(metrics).map(([id, metric]) => [id, legibilityVerdict(metric)]),
  );

  assertBakeoffRoutes(ctx, { captures, grassOff });
  assertHardenedOracleStillRejectsCurrentFamilies(ctx, { metrics, verdicts });

  const cropSheet = composeCropSheet(crops);
  const variantSheet = composeVariantSheet(captures.map((capture) => capture.image));
  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ captures, grassOff, crops, metrics, verdicts, cropSheet, variantSheet });
  }

  await ctx.snap(null, "map-reference/foreground-grass-primitive-bakeoff-crops", {
    shot: PNG.sync.write(cropSheet),
  });
  await ctx.snap(null, "map-reference/foreground-grass-primitive-bakeoff-variants", {
    shot: PNG.sync.write(variantSheet),
  });
}

function assertBakeoffRoutes(ctx, { captures, grassOff }) {
  ctx.check(
    "foreground primitive bakeoff compares distinct real renderer families plus a grass-off negative anchor on the heightmap vista",
    grassOff.stats?.route === "battle-terrain-3d" &&
      grassOff.stats?.terrainSource === "heightmap-layout" &&
      grassOff.stats?.view === "heightmap-vista" &&
      grassOff.stats?.grass?.tuftInstances === 0 &&
      captures.every((capture) => {
        const grass = capture.stats?.grass;
        return (
          capture.stats?.route === "battle-terrain-3d" &&
          capture.stats?.terrainSource === "heightmap-layout" &&
          capture.stats?.view === "heightmap-vista" &&
          grass?.drawCalls === 1 &&
          grass?.invalidTintTufts === 0 &&
          grass?.grassPrimitiveFamily !== "legacy-tuft"
        );
      }) &&
      captures.some(
        (capture) => capture.stats?.grass?.grassPrimitiveFamily === "field-fiber-body",
      ) &&
      new Set(captures.map((capture) => capture.stats?.grass?.grassPrimitiveFamily)).size ===
        captures.length,
    JSON.stringify({
      grassOff: summarizeStats({ id: "grass-off", stats: grassOff.stats }),
      captures: captures.map((capture) => summarizeStats(capture)),
    }),
  );
}

function assertHardenedOracleStillRejectsCurrentFamilies(ctx, { metrics, verdicts }) {
  const candidateVerdicts = Object.entries(verdicts).filter(
    ([id]) => id !== "target" && id !== "grass-off",
  );
  ctx.check(
    "hardened oracle passes the target and rejects grass-off plus current primitive families as unratified blades",
    verdicts.target.ok === true &&
      verdicts["grass-off"].ok === false &&
      verdicts["grass-off"].failures.includes("low-structure-occupancy") &&
      candidateVerdicts.every(([, verdict]) => verdict.ok === false) &&
      candidateVerdicts.every(([, verdict]) => verdict.failures.includes("short-vertical-runs")) &&
      verdicts["strand-mat"].failures.includes("sparse-tall-runs") &&
      metrics["strand-mat"].verticalRun.p90Height < ORACLE.verticalRunP90HeightMin &&
      metrics["strand-mat"].verticalRun.tallColumnRatio < ORACLE.verticalRunTallColumnMin &&
      verdicts["vertical-fiber-body"].failures.includes("bad-structure-spread") &&
      verdicts["vertical-fiber-body"].failures.includes("isotropic-confetti") &&
      verdicts["vertical-fiber-body"].failures.includes("sparse-tall-runs") &&
      metrics["vertical-fiber-body"].tile4.occupancy3 >= ORACLE.tile4Occupancy3Min &&
      metrics["vertical-fiber-body"].verticalRun.tallColumnRatio < ORACLE.verticalRunTallColumnMin,
    JSON.stringify({ oracle: ORACLE, metrics, verdicts }),
  );
}

async function writeArtifacts({
  captures,
  grassOff,
  crops,
  metrics,
  verdicts,
  cropSheet,
  variantSheet,
}) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(
      new URL("foreground-grass-primitive-bakeoff-crops.png", ASSET_DIR),
      PNG.sync.write(cropSheet),
    ),
    writeFile(
      new URL("foreground-grass-primitive-bakeoff-variants.png", ASSET_DIR),
      PNG.sync.write(variantSheet),
    ),
    ...Object.entries(crops).map(([id, crop]) =>
      writeFile(
        new URL(`foreground-grass-primitive-bakeoff-${id}.png`, ASSET_DIR),
        PNG.sync.write(crop),
      ),
    ),
    writeFile(
      new URL("foreground-grass-primitive-bakeoff-metrics.json", ASSET_DIR),
      `${JSON.stringify(
        {
          oracle: ORACLE,
          metrics,
          verdicts,
          stats: Object.fromEntries([
            ["grass-off", summarizeStats({ id: "grass-off", stats: grassOff.stats })],
            ...captures.map((capture) => [capture.id, summarizeStats(capture)]),
          ]),
        },
        null,
        2,
      )}\n`,
    ),
  ]);
}

function summarizeStats(capture) {
  const grass = capture.stats?.grass;
  return {
    family: capture.id,
    grassPrimitiveFamily: grass?.grassPrimitiveFamily,
    grassPrimitiveRepresentation: grass?.grassPrimitiveRepresentation,
    accentAggregation: grass?.accentAggregation,
    accentTufts: grass?.accentTufts,
    accentClumps: grass?.accentClumps,
    submittedTriangles: grass?.submittedTriangles,
    drawCalls: grass?.drawCalls,
    sourceCells: grass?.grassPrimitiveSourceCells,
    domainCells: grass?.grassPrimitiveDomainCells,
    domainMicroStrands: grass?.grassPrimitiveDomainMicroStrands,
    invalidTintTufts: grass?.invalidTintTufts,
  };
}

function composeCropSheet(crops) {
  const images = Object.values(crops).map((crop) => resizeToWidth(crop, 300));
  return composeRow(images);
}

function composeVariantSheet(images) {
  return composeRow(
    images.map((image) => resizeToWidth(cropRatio(image, 0.0, 0.56, 1.0, 0.38), 300)),
  );
}

function composeRow(images) {
  const gap = 8;
  const width = images.reduce((sum, image) => sum + image.width, 0) + gap * (images.length - 1);
  const height = Math.max(...images.map((image) => image.height));
  const out = solidPng(width, height, [216, 222, 220, 255]);
  let x = 0;
  for (const image of images) {
    paste(out, image, x, 0);
    x += image.width + gap;
  }
  return out;
}
