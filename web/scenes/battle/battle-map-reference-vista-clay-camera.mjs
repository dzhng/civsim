import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const QUERY =
  "gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&grassTechnique=off&groundDiagnostic=layout-clay&geometryProbe=midground-valley";
const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/slice-12-vista-clay-camera/",
  import.meta.url,
);

export const meta = {
  name: "battle-map-reference-vista-clay-camera",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: ["map-reference/vista-clay-camera", "map-reference/vista-clay-camera-crops"],
  describe:
    "Slice 12: the accepted continuous heightfield from the camera hill as a clay-only battle-reference vista.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("vista clay camera requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-map-reference-vista-clay-camera",
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${QUERY}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.view === "heightmap-vista" &&
      window.__rendererLabStats?.stats?.terrainSource === "heightmap-layout" &&
      window.__rendererLabStats?.stats?.midgroundOcclusion,
    { timeout: 20000 },
  );
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const image = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
  await page.close();

  assertRoute(ctx, stats);
  assertProbe(ctx, stats?.midgroundOcclusion);
  assertClayImage(ctx, image);

  const crops = {
    foreground: crop(image, { x: 0.18, y: 0.54, w: 0.62, h: 0.34 }),
    midground: crop(image, { x: 0.22, y: 0.28, w: 0.58, h: 0.3 }),
    background: crop(image, { x: 0.02, y: 0.02, w: 0.96, h: 0.26 }),
  };
  const cropSheet = composeCropSheet(crops);

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ image, cropSheet, crops, stats });
  }

  await ctx.snap(null, "map-reference/vista-clay-camera", {
    shot: PNG.sync.write(image),
  });
  await ctx.snap(null, "map-reference/vista-clay-camera-crops", {
    shot: PNG.sync.write(cropSheet),
  });
}

function assertRoute(ctx, stats) {
  const heightmap = stats?.referenceHeightmap;
  const camera = stats?.camera;
  ctx.check(
    "vista clay camera uses the continuous heightfield review route",
    stats?.route === "battle-terrain-3d" &&
      stats?.gate === "highland-valley" &&
      stats?.view === "heightmap-vista" &&
      stats?.terrainSource === "heightmap-layout" &&
      stats?.ground?.diagnosticMode === "layout-clay" &&
      stats?.grassTechnique === "off" &&
      stats?.grass?.bladeInstances === 0 &&
      heightmap?.sourceKind === "continuous-field" &&
      Math.abs(camera?.x - heightmap?.cameraHillAnchor?.worldX) < 20 &&
      camera?.y > heightmap?.cameraHillAnchor?.worldY,
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      view: stats?.view,
      terrainSource: stats?.terrainSource,
      ground: stats?.ground,
      grassTechnique: stats?.grassTechnique,
      grass: stats?.grass,
      camera,
      heightmap,
    }),
  );
}

function assertProbe(ctx, probe) {
  const summary = probe?.summary;
  ctx.check(
    "vista clay camera publishes real midground geometry probe samples",
    summary?.columnCount === 9 &&
      summary?.samplesPerColumn === 72 &&
      probe?.heightPatch?.cols === 64 &&
      probe?.heightPatch?.rows === 48,
    JSON.stringify(summary ?? null),
  );
  ctx.check(
    "vista clay camera has meter-scale recession and visible crest structure",
    summary?.meanRelief > 3 && summary?.maxRelief > 7 && summary?.maxVisibleCrests >= 1,
    JSON.stringify(summary ?? null),
  );
}

function assertClayImage(ctx, image) {
  const metrics = clayMetrics(image);
  ctx.check(
    "vista clay camera fills the frame with nonblank terrain relief",
    metrics.cover > 0.78 && metrics.contrast > 45,
    JSON.stringify(metrics),
  );
}

async function writeArtifacts({ image, cropSheet, crops, stats }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("vista-clay-camera.png", ASSET_DIR), PNG.sync.write(image)),
    writeFile(new URL("vista-clay-camera-crops.png", ASSET_DIR), PNG.sync.write(cropSheet)),
    writeFile(new URL("foreground-hill.png", ASSET_DIR), PNG.sync.write(crops.foreground)),
    writeFile(new URL("midground-valley.png", ASSET_DIR), PNG.sync.write(crops.midground)),
    writeFile(new URL("background-cliffs.png", ASSET_DIR), PNG.sync.write(crops.background)),
    writeFile(
      new URL("route-stats.json", ASSET_DIR),
      `${JSON.stringify(summarizeStats(stats), null, 2)}\n`,
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
    midgroundOcclusion: stats?.midgroundOcclusion?.summary,
    midgroundColumns: stats?.midgroundOcclusion?.columns,
    ground: stats?.ground,
    grassTechnique: stats?.grassTechnique,
  };
}

function composeCropSheet(crops) {
  const labels = [
    ["foreground", crops.foreground],
    ["midground", crops.midground],
    ["background", crops.background],
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
  const x0 = Math.max(0, Math.round(rect.x * image.width));
  const y0 = Math.max(0, Math.round(rect.y * image.height));
  const w = Math.min(image.width - x0, Math.round(rect.w * image.width));
  const h = Math.min(image.height - y0, Math.round(rect.h * image.height));
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

function clayMetrics(image) {
  let cover = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const total = image.width * image.height;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (r + g + b > 36) {
        cover++;
        if (luma < minLuma) minLuma = luma;
        if (luma > maxLuma) maxLuma = luma;
      }
    }
  }
  return {
    cover: Number((cover / total).toFixed(3)),
    contrast: Number((maxLuma - minLuma).toFixed(1)),
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
