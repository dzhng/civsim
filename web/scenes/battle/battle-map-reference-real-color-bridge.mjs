import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

const TARGET = new URL(
  "../../../specs/battle-map-reference/assets/target-battle-map.png",
  import.meta.url,
);

const DEFAULT_QUERY = "gate=highland-valley&view=reference";
const BRIDGE_QUERY = `${DEFAULT_QUERY}&referenceGrassBridge=real-color`;

export const meta = {
  name: "battle-map-reference-real-color-bridge",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/real-color-bridge-default",
    "map-reference/real-color-bridge-candidate",
    "map-reference/real-color-bridge-crops",
  ],
  describe:
    "BF3R bridge: captures the actual battle reference route with real grass colors, alongside the current default.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "real-color bridge shots require browser GPU flags",
      true,
      "set VERIFY_GPU=1 to capture",
    );
    return;
  }

  const [baseline, bridge] = await Promise.all([
    capture(ctx, "default", DEFAULT_QUERY),
    capture(ctx, "bridge", BRIDGE_QUERY),
  ]);
  const target = PNG.sync.read(await readFile(TARGET));
  const targetForeground = bandMetrics(target, 0.62, 0.98);
  const baselineForeground = bandMetrics(baseline.png, 0.62, 0.98);
  const bridgeForeground = bandMetrics(bridge.png, 0.62, 0.98);

  ctx.check(
    "bridge uses actual reference route and shared overcast environment",
    bridge.stats?.route === "battle-terrain-3d" &&
      bridge.stats?.view === "reference" &&
      bridge.stats?.gate === "highland-valley" &&
      bridge.stats?.environment?.id === "overcast-foggy" &&
      bridge.stats?.environment?.source === "CIVSIM_ENVIRONMENTS.overcast" &&
      bridge.stats?.referenceGrassBridge?.id === "real-color" &&
      bridge.stats?.referenceGrassBridge?.falseEarthDebugPalette === false &&
      bridge.stats?.referenceGrassBridge?.lodBands?.accentDepthNear === 0 &&
      bridge.stats?.referenceGrassBridge?.lodBands?.accentDepthFar === 520,
    JSON.stringify({
      route: bridge.stats?.route,
      view: bridge.stats?.view,
      gate: bridge.stats?.gate,
      environment: bridge.stats?.environment,
      bridge: bridge.stats?.referenceGrassBridge,
    }),
  );
  ctx.check(
    "bridge publishes real battle grass palette and denser field telemetry",
    bridge.stats?.groundCover === "green-grass" &&
      bridge.stats?.grassTechnique === "field-accent" &&
      bridge.stats?.grass?.grassPrimitiveFamily === "texture-carrier" &&
      bridge.stats?.grass?.fieldRecords >= baseline.stats?.grass?.fieldRecords &&
      bridge.stats?.grass?.bladeInstances > baseline.stats?.grass?.bladeInstances &&
      bridge.stats?.grass?.submittedTriangles > baseline.stats?.grass?.submittedTriangles &&
      bridge.stats?.grass?.drawCalls === 1,
    JSON.stringify({
      baseline: grassSummary(baseline.stats),
      bridge: grassSummary(bridge.stats),
    }),
  );
  ctx.check(
    "bridge foreground stays green/olive, not false-earth red",
    bridgeForeground.greenRatio > 0.35 &&
      bridgeForeground.redDominantRatio < 0.08 &&
      bridgeForeground.avg[1] > bridgeForeground.avg[0] &&
      bridgeForeground.avg[1] > bridgeForeground.avg[2],
    JSON.stringify({ targetForeground, baselineForeground, bridgeForeground }),
  );

  await ctx.snap(null, "map-reference/real-color-bridge-default", {
    shot: PNG.sync.write(baseline.png),
  });
  await ctx.snap(null, "map-reference/real-color-bridge-candidate", {
    shot: PNG.sync.write(bridge.png),
  });
  await ctx.snap(null, "map-reference/real-color-bridge-crops", {
    shot: PNG.sync.write(composeGrassCrops(target, baseline.png, bridge.png)),
  });
}

async function capture(ctx, id, query) {
  const page = await ctx.newPage({
    viewport: { width: 1638, height: 800 },
    errorPrefix: `battle-map-reference-real-color-bridge-${id}`,
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${query}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true && window.__rendererLabStats?.stats?.view === "reference",
    { timeout: 20000 },
  );
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const rawShot = await page.locator("#renderer-canvas").screenshot();
  const canvasSize = await page.evaluate(() => {
    const canvas = document.querySelector("#renderer-canvas");
    return canvas ? { width: canvas.width, height: canvas.height } : null;
  });
  await page.close();
  return { stats, png: cropToSize(PNG.sync.read(rawShot), canvasSize?.width, canvasSize?.height) };
}

function grassSummary(stats) {
  return {
    bridge: stats?.referenceGrassBridge,
    technique: stats?.grassTechnique,
    family: stats?.grass?.grassPrimitiveFamily,
    fieldRecords: stats?.grass?.fieldRecords,
    accentTufts: stats?.grass?.accentTufts,
    bladeInstances: stats?.grass?.bladeInstances,
    submittedTriangles: stats?.grass?.submittedTriangles,
    bridgeLodBands: stats?.referenceGrassBridge?.lodBands,
  };
}

function composeGrassCrops(target, baseline, bridge) {
  const crops = [
    cropRatio(target, 0, 0.62, 1, 0.34),
    cropRatio(baseline, 0, 0.62, 1, 0.34),
    cropRatio(bridge, 0, 0.62, 1, 0.34),
    cropRatio(target, 0, 0.42, 1, 0.2),
    cropRatio(baseline, 0, 0.42, 1, 0.2),
    cropRatio(bridge, 0, 0.42, 1, 0.2),
  ].map((png) => resizeToWidth(png, 520));
  const gap = 12;
  const rowGap = 12;
  const rowW = 520 * 3 + gap * 2;
  const rowH = crops[0].height;
  const midH = crops[3].height;
  const out = solidPng(rowW, rowH + rowGap + midH, [218, 224, 224, 255]);
  for (let i = 0; i < 3; i++) paste(out, crops[i], i * (520 + gap), 0);
  for (let i = 0; i < 3; i++) paste(out, crops[i + 3], i * (520 + gap), rowH + rowGap);
  return out;
}

function bandMetrics(png, y0Ratio, y1Ratio) {
  const y0 = Math.max(0, Math.min(png.height - 1, Math.floor(png.height * y0Ratio)));
  const y1 = Math.max(y0 + 1, Math.min(png.height, Math.ceil(png.height * y1Ratio)));
  let count = 0;
  let green = 0;
  let redDominant = 0;
  let edge = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < png.width; x++) {
      const [r, g, b] = rgbAt(png, x, y);
      rSum += r;
      gSum += g;
      bSum += b;
      if (g > b * 1.08 && g >= r * 0.88 && r > 45 && b > 30) green++;
      if (r > g * 1.25 && r > b * 1.25) redDominant++;
      if (x + 1 < png.width) edge += Math.abs(luma(r, g, b) - luma(...rgbAt(png, x + 1, y)));
      if (y + 1 < y1) edge += Math.abs(luma(r, g, b) - luma(...rgbAt(png, x, y + 1)));
      count++;
    }
  }
  return {
    greenRatio: Number((green / count).toFixed(3)),
    redDominantRatio: Number((redDominant / count).toFixed(3)),
    edgeEnergy: Number((edge / Math.max(1, count * 2)).toFixed(2)),
    avg: [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)],
  };
}

function cropRatio(src, xRatio, yRatio, wRatio, hRatio) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(src.width * xRatio)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(src.height * yRatio)));
  const w = Math.max(1, Math.min(src.width - x0, Math.floor(src.width * wRatio)));
  const h = Math.max(1, Math.min(src.height - y0, Math.floor(src.height * hRatio)));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) copyPixel(src, x0 + x, y0 + y, out, x, y);
  }
  return out;
}

function cropToSize(src, width, height) {
  const w = Math.max(1, Math.min(src.width, Math.floor(width ?? src.width)));
  const h = Math.max(1, Math.min(src.height, Math.floor(height ?? src.height)));
  if (w === src.width && h === src.height) return src;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) copyPixel(src, x, y, out, x, y);
  }
  return out;
}

function resizeToWidth(src, width) {
  return resize(src, width, Math.max(1, Math.round(src.height * (width / src.width))));
}

function resize(src, width, height) {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / height) * src.height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / width) * src.width));
      copyPixel(src, sx, sy, out, x, y);
    }
  }
  return out;
}

function solidPng(width, height, rgba) {
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) out.data.set(rgba, i);
  return out;
}

function paste(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) copyPixel(src, x, y, dst, ox + x, oy + y);
  }
}

function copyPixel(src, sx, sy, dst, dx, dy) {
  const si = (sy * src.width + sx) * 4;
  const di = (dy * dst.width + dx) * 4;
  dst.data[di] = src.data[si];
  dst.data[di + 1] = src.data[si + 1];
  dst.data[di + 2] = src.data[si + 2];
  dst.data[di + 3] = src.data[si + 3];
}

function rgbAt(png, x, y) {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
