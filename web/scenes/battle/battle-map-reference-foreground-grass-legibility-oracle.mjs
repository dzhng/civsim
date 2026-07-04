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
const STIPPLE_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassPrimitiveFamily=texture-carrier` +
  "&grassRadius=360&grassFieldCell=1.8&grassFieldRecords=20000&grassMinNormalZ=0.72" +
  "&grassAccentClumps=20000&grassAccentTufts=20000&grassAccentFootprint=2.4" +
  "&grassBlades=4&grassBladeHeight=0.78&grassBladeWidth=0.084";
const BODY_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassRadius=360&grassFieldCell=2.4` +
  "&grassFieldRecords=18000&grassMinNormalZ=0.72&meadowFar=0.50" +
  "&grassBodyDomainId=field-continuous-strand-texture&grassBodyDomainStrength=1.62" +
  "&grassBodyDomainScale=10.5&grassBodyDomainFiberFrequency=10.5&grassBodyDomainContrast=0.58" +
  "&grassPrimitiveFamily=field-fiber-shell&fiberShellVariant=off&grassAccentTufts=0&grassBlades=0";
const STRAND_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassRadius=360&grassMinNormalZ=0.72` +
  "&grassFieldCell=2.0&grassFieldRecords=20000&meadowFar=0.50" +
  "&grassBodyDomainId=field-continuous-strand-texture&grassBodyDomainStrength=1.62" +
  "&grassBodyDomainScale=10.5&grassBodyDomainFiberFrequency=10.5&grassBodyDomainContrast=0.58" +
  "&grassPrimitiveFamily=field-strand-mat&grassAccentAggregation=field-subcell" +
  "&grassAccentClumps=1600&grassAccentSourcesPerCell=8&grassAccentTufts=12800" +
  "&grassAccentFootprint=2.2&grassBlades=12&grassBladeHeight=0.56&grassBladeWidth=0.052" +
  "&grassBend=0.10&grassSpread=0.110";
const GRASS_OFF_QUERY = `${BASE_QUERY}&grassTechnique=off`;

export const meta = {
  name: "battle-map-reference-foreground-grass-legibility-oracle",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/foreground-grass-legibility-oracle-crops",
    "map-reference/foreground-grass-legibility-oracle-strand",
  ],
  describe:
    "Slice 14b1: calibrates the foreground grass legibility oracle against known false positives.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "foreground grass legibility oracle requires browser GPU flags",
      true,
      "set VERIFY_GPU=1",
    );
    return;
  }

  const [stipple, body, strand, grassOff] = await Promise.all([
    captureRoute(ctx, STIPPLE_QUERY, "stipple"),
    captureRoute(ctx, BODY_QUERY, "body"),
    captureRoute(ctx, STRAND_QUERY, "strand"),
    captureRoute(ctx, GRASS_OFF_QUERY, "grass-off"),
  ]);
  const target = PNG.sync.read(await readFile(TARGET));

  const crops = {
    target: cropRatio(target, 0.0, 0.56, 1.0, 0.38),
    grassOff: cropRatio(grassOff.image, 0.0, 0.56, 1.0, 0.38),
    stipple: cropRatio(stipple.image, 0.0, 0.56, 1.0, 0.38),
    body: cropRatio(body.image, 0.0, 0.56, 1.0, 0.38),
    strand: cropRatio(strand.image, 0.0, 0.56, 1.0, 0.38),
  };
  const metrics = Object.fromEntries(
    Object.entries(crops).map(([name, crop]) => [name, structureMetrics(crop)]),
  );
  const verdicts = Object.fromEntries(
    Object.entries(metrics).map(([name, metric]) => [name, legibilityVerdict(metric)]),
  );

  assertRouteSupport(ctx, { body: body.stats, strand: strand.stats });
  assertOracleCalibration(ctx, { metrics, verdicts });
  assertSeamTelemetry(ctx, { metrics });

  const cropSheet = composeCropSheet(crops, verdicts);
  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({
      captures: { stipple, body, strand, grassOff },
      crops,
      metrics,
      verdicts,
      cropSheet,
    });
  }

  await ctx.snap(null, "map-reference/foreground-grass-legibility-oracle-crops", {
    shot: PNG.sync.write(cropSheet),
  });
  await ctx.snap(null, "map-reference/foreground-grass-legibility-oracle-strand", {
    shot: PNG.sync.write(strand.image),
  });
}

function assertRouteSupport(ctx, { body, strand }) {
  const bodyMeadow = body?.ground?.meadow;
  const strandGrass = strand?.grass;
  const strandMeadow = strand?.ground?.meadow;
  ctx.check(
    "foreground grass route exposes field-owned body-domain and field-subcell primitives",
    bodyMeadow?.bodyDomainEnabled === true &&
      bodyMeadow?.bodyDomainId === "field-continuous-strand-texture" &&
      bodyMeadow?.bodyDomainRepresentation === "continuous-strand-texture" &&
      body?.grass?.drawCalls === 0 &&
      strandGrass?.grassPrimitiveFamily === "field-strand-mat" &&
      strandGrass?.grassPrimitiveRepresentation === "continuous-strand-mat" &&
      strandGrass?.accentAggregation === "field-subcell" &&
      strandGrass?.grassPrimitiveSourceCells > 0 &&
      strandGrass?.grassPrimitiveSourcesPerCell >= 7 &&
      strandGrass?.drawCalls === 1 &&
      strandGrass?.invalidTintTufts === 0 &&
      strandMeadow?.bodyDomainEnabled === true,
    JSON.stringify({
      body: { grass: body?.grass, meadow: bodyMeadow },
      strand: { grass: strandGrass, meadow: strandMeadow },
    }),
  );
}

function assertOracleCalibration(ctx, { metrics, verdicts }) {
  ctx.check(
    "foreground legibility oracle passes the style target and rejects known false positives",
    verdicts.target.ok === true &&
      verdicts.stipple.ok === false &&
      verdicts.stipple.failures.includes("raw-edge-stipple") &&
      verdicts.body.ok === false &&
      verdicts.body.failures.includes("low-clump-contrast") &&
      verdicts.body.failures.includes("low-structure-occupancy") &&
      verdicts.strand.ok === false &&
      verdicts.strand.failures.includes("low-clump-contrast") &&
      verdicts.strand.failures.includes("low-structure-occupancy"),
    JSON.stringify({ oracle: ORACLE, metrics, verdicts }),
  );
}

function assertSeamTelemetry(ctx, { metrics }) {
  ctx.check(
    "foreground seam telemetry compares candidates against the same grass-off route",
    metrics.stipple.seamJump > metrics.grassOff.seamJump + 1.0 &&
      metrics.body.seamJump <= metrics.grassOff.seamJump + 1.0 &&
      metrics.strand.seamJump > metrics.grassOff.seamJump + 1.0,
    JSON.stringify({
      grassOff: metrics.grassOff.seamJump,
      stipple: metrics.stipple.seamJump,
      body: metrics.body.seamJump,
      strand: metrics.strand.seamJump,
    }),
  );
}

async function writeArtifacts({ captures, crops, metrics, verdicts, cropSheet }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(
      new URL("foreground-grass-legibility-oracle-crops.png", ASSET_DIR),
      PNG.sync.write(cropSheet),
    ),
    writeFile(
      new URL("foreground-grass-legibility-oracle-strand.png", ASSET_DIR),
      PNG.sync.write(captures.strand.image),
    ),
    writeFile(new URL("target-foreground.png", ASSET_DIR), PNG.sync.write(crops.target)),
    writeFile(new URL("grass-off-foreground.png", ASSET_DIR), PNG.sync.write(crops.grassOff)),
    writeFile(new URL("stipple-foreground.png", ASSET_DIR), PNG.sync.write(crops.stipple)),
    writeFile(new URL("body-domain-foreground.png", ASSET_DIR), PNG.sync.write(crops.body)),
    writeFile(new URL("strand-mat-foreground.png", ASSET_DIR), PNG.sync.write(crops.strand)),
    writeFile(
      new URL("oracle-metrics.json", ASSET_DIR),
      `${JSON.stringify(
        {
          oracle: ORACLE,
          metrics,
          verdicts,
          stats: {
            stipple: summarizeStats(captures.stipple.stats),
            body: summarizeStats(captures.body.stats),
            strand: summarizeStats(captures.strand.stats),
            grassOff: summarizeStats(captures.grassOff.stats),
          },
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
    grassTechnique: stats?.grassTechnique,
    meadow: stats?.ground?.meadow,
    grass: stats?.grass,
  };
}

function composeCropSheet(crops, verdicts) {
  const columns = [crops.target, crops.grassOff, crops.stipple, crops.body, crops.strand].map(
    (crop) => resizeToWidth(crop, 360),
  );
  const gap = 10;
  const width = columns.reduce((sum, image) => sum + image.width, 0) + gap * (columns.length - 1);
  const height = Math.max(...columns.map((image) => image.height));
  const out = solidPng(
    width,
    height,
    verdicts.target.ok ? [218, 224, 224, 255] : [190, 80, 80, 255],
  );
  let x = 0;
  for (const image of columns) {
    paste(out, image, x, 0);
    x += image.width + gap;
  }
  return out;
}
