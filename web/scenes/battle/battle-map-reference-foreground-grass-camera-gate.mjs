import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import {
  captureRoute,
  paste,
  resizeToWidth,
  solidPng,
} from "./battle-map-reference-grass-legibility-lib.js";

const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/slice-14b-foreground-blade-legibility/",
  import.meta.url,
);

const BASE_QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&environment=overcast-foggy&geometryProbe=midground-valley";
const GRASS_QUERY =
  `${BASE_QUERY}&grassTechnique=field-accent&grassPrimitiveFamily=field-fiber-body&grassAccentAggregation=field-subcell` +
  "&grassRadius=220&grassDepthNear=-180&grassDepthFar=220&grassMinNormalZ=0.72" +
  "&grassFieldRecords=20000&grassAccentDepthNear=-180&grassAccentDepthFar=220" +
  "&grassAccentClumps=5200&grassAccentSourcesPerCell=5&grassAccentTufts=20000" +
  "&grassAccentFootprint=3.2&grassBlades=20&grassBladeHeight=1.12" +
  "&grassBladeWidth=0.084&grassBend=0.18&grassSpread=0.160";
const INTEGRATION_QUERY = `${GRASS_QUERY}&zoom=2.35&pitch=1.34`;
const CLOSE_QUERY = `${GRASS_QUERY}&zoom=8&pitch=1.12`;

const MIN_CLOSE_BLADE_PX = 12;
const MAX_INTEGRATION_BLADE_PX = 6;

export const meta = {
  name: "battle-map-reference-foreground-grass-camera-gate",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: ["map-reference/foreground-grass-camera-gate"],
  describe:
    "Slice 14b2d: proves the current vista crop is too distant for blade pixels and establishes a close foreground heightmap camera gate.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("foreground grass camera gate requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const [integration, close] = await Promise.all([
    captureRoute(ctx, INTEGRATION_QUERY, "integration-vista", meta.name),
    captureRoute(ctx, CLOSE_QUERY, "close-foreground", meta.name),
  ]);

  assertRoute(ctx, integration.stats, "integration-vista");
  assertRoute(ctx, close.stats, "close-foreground");
  assertProjectionGate(ctx, integration.stats, close.stats);

  const sheet = composeSheet(integration.image, close.image);
  const metrics = {
    integration: summarizeProjection(integration.stats),
    close: summarizeProjection(close.stats),
    thresholds: {
      maxIntegrationBladePx: MAX_INTEGRATION_BLADE_PX,
      minCloseBladePx: MIN_CLOSE_BLADE_PX,
    },
  };

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ integration, close, sheet, metrics });
  }

  await ctx.snap(null, "map-reference/foreground-grass-camera-gate", {
    shot: PNG.sync.write(sheet),
  });
}

function assertRoute(ctx, stats, id) {
  ctx.check(
    `${id} uses the heightmap vista with field-owned grass`,
    stats?.route === "battle-terrain-3d" &&
      stats?.gate === "highland-valley" &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.view === "heightmap-vista" &&
      stats?.grassTechnique === "field-accent" &&
      stats?.grass?.terrainMasked === true &&
      stats?.grass?.invalidTintTufts === 0 &&
      stats?.grass?.grassPrimitiveFamily === "field-fiber-body" &&
      stats?.foregroundBladeProjection?.bladeHeight === 1.12,
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      terrainSource: stats?.terrainSource,
      view: stats?.view,
      grassTechnique: stats?.grassTechnique,
      grass: stats?.grass,
      projection: stats?.foregroundBladeProjection,
    }),
  );
}

function assertProjectionGate(ctx, integration, close) {
  const integrationProjection = integration?.foregroundBladeProjection;
  const closeProjection = close?.foregroundBladeProjection;
  ctx.check(
    "accepted integration vista is too distant to ratify foreground blade geometry",
    integrationProjection?.projectedBladePx > 0 &&
      integrationProjection.projectedBladePx < MAX_INTEGRATION_BLADE_PX &&
      integrationProjection.verticalBladePx < MAX_INTEGRATION_BLADE_PX,
    JSON.stringify(integrationProjection),
  );
  ctx.check(
    "close foreground gate makes nominal blades large enough for vertical-run evidence",
    closeProjection?.projectedBladePx >= MIN_CLOSE_BLADE_PX &&
      closeProjection.verticalBladePx >= MIN_CLOSE_BLADE_PX * 0.7 &&
      closeProjection.camera.zoom > (integrationProjection?.camera?.zoom ?? Infinity) * 3,
    JSON.stringify({ integration: integrationProjection, close: closeProjection }),
  );
}

function summarizeProjection(stats) {
  return {
    camera: stats?.camera,
    projection: stats?.foregroundBladeProjection,
    grass: {
      family: stats?.grass?.grassPrimitiveFamily,
      aggregation: stats?.grass?.accentAggregation,
      tufts: stats?.grass?.tuftInstances,
      clumps: stats?.grass?.accentClumps,
      drawCalls: stats?.grass?.drawCalls,
      invalidTintTufts: stats?.grass?.invalidTintTufts,
    },
  };
}

function composeSheet(left, right) {
  const a = resizeToWidth(left, 640);
  const b = resizeToWidth(right, 640);
  const gap = 24;
  const width = a.width + b.width + gap;
  const height = Math.max(a.height, b.height);
  const out = solidPng(width, height, [32, 36, 38, 255]);
  paste(out, a, 0, 0);
  paste(out, b, a.width + gap, 0);
  return out;
}

async function writeArtifacts({ integration, close, sheet, metrics }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("foreground-grass-camera-gate.png", ASSET_DIR), PNG.sync.write(sheet)),
    writeFile(
      new URL("foreground-grass-camera-gate-integration.png", ASSET_DIR),
      PNG.sync.write(integration.image),
    ),
    writeFile(
      new URL("foreground-grass-camera-gate-close.png", ASSET_DIR),
      PNG.sync.write(close.image),
    ),
    writeFile(
      new URL("foreground-grass-camera-gate-metrics.json", ASSET_DIR),
      `${JSON.stringify(metrics, null, 2)}\n`,
    ),
  ]);
}
