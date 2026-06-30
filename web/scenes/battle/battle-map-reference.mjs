import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const TARGET = new URL('../../../specs/battle-map-reference/assets/target-battle-map.png', import.meta.url);

export const meta = {
  name: 'battle-map-reference',
  kind: 'visual',
  world: 'battle-map-reference',
  tier: 'full',
  snapshots: [
    'map-reference/candidate-vista',
    'map-reference/reference-comparison',
    'map-reference/grass-crops',
  ],
  describe: 'Captures the current battle terrain at the zoomed-in reference camera, plus target/candidate comparison artifacts.',
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('battle map reference shots require browser GPU flags', true, 'set VERIFY_GPU=1 to capture');
    return;
  }

  const page = await ctx.newPage({ viewport: { width: 1600, height: 781 }, errorPrefix: 'battle-map-reference' });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?gate=highland-valley&view=reference`);
  await page.waitForFunction(() => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.view === 'reference', { timeout: 20000 });
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== 'battle-terrain-3d' || stats?.view !== 'reference') {
    await page.close();
    throw new Error(`battle map reference route did not publish valid stats: ${JSON.stringify(stats)}`);
  }

  ctx.check(
    'reference candidate uses the zoomed-in vista grass budget',
    stats.grass?.terrainMasked === true
      && stats.grass?.zoomT === 1
      && stats.grass?.tuftInstances >= 26000
      && stats.grass?.invalidTintTufts === 0,
    JSON.stringify(stats.grass),
  );
  ctx.check(
    'reference candidate uses highland-valley relief fixture',
    stats.gate === 'highland-valley'
      && stats.mapId === 'highland-valley'
      && stats.heightSpan > 20
      && stats.heightSpan < 40
      && stats.edges?.west === 'cliff'
      && stats.edges?.east === 'ocean',
    JSON.stringify({ gate: stats.gate, mapId: stats.mapId, heightSpan: stats.heightSpan, edges: stats.edges }),
  );

  const shot = await page.locator('#renderer-canvas').screenshot();
  const candidate = PNG.sync.read(shot);
  const target = PNG.sync.read(await readFile(TARGET));
  const candidateForeground = bandMetrics(candidate, 0.62, 0.98);
  const targetForeground = bandMetrics(target, 0.62, 0.98);
  ctx.check(
    'candidate foreground has visible green grass color',
    candidateForeground.greenRatio > 0.35
      && candidateForeground.avg[1] > candidateForeground.avg[0]
      && candidateForeground.avg[1] > candidateForeground.avg[2],
    JSON.stringify({ candidateForeground, targetForeground }),
  );

  await ctx.snap(null, 'map-reference/candidate-vista', { shot });
  await ctx.snap(null, 'map-reference/reference-comparison', { shot: composeComparison(target, candidate) });
  await ctx.snap(null, 'map-reference/grass-crops', { shot: composeGrassCrops(target, candidate) });
  await page.close();
}

function composeComparison(target, candidate) {
  const targetFit = resizeToHeight(target, candidate.height);
  const gap = 16;
  const out = solidPng(targetFit.width + gap + candidate.width, candidate.height, [218, 224, 224, 255]);
  paste(out, targetFit, 0, 0);
  paste(out, candidate, targetFit.width + gap, 0);
  return PNG.sync.write(out);
}

function composeGrassCrops(target, candidate) {
  const targetFg = cropRatio(target, 0, 0.62, 1, 0.34);
  const candidateFg = cropRatio(candidate, 0, 0.62, 1, 0.34);
  const targetMid = cropRatio(target, 0, 0.42, 1, 0.20);
  const candidateMid = cropRatio(candidate, 0, 0.42, 1, 0.20);
  const targetFgFit = resizeToWidth(targetFg, 780);
  const candidateFgFit = resizeToWidth(candidateFg, 780);
  const targetMidFit = resizeToWidth(targetMid, 780);
  const candidateMidFit = resizeToWidth(candidateMid, 780);
  const gap = 16;
  const rowGap = 16;
  const rowW = 780 * 2 + gap;
  const out = solidPng(rowW, targetFgFit.height + rowGap + targetMidFit.height, [218, 224, 224, 255]);
  paste(out, targetFgFit, 0, 0);
  paste(out, candidateFgFit, 780 + gap, 0);
  paste(out, targetMidFit, 0, targetFgFit.height + rowGap);
  paste(out, candidateMidFit, 780 + gap, targetFgFit.height + rowGap);
  return PNG.sync.write(out);
}

function bandMetrics(png, y0Ratio, y1Ratio) {
  const y0 = Math.max(0, Math.min(png.height - 1, Math.floor(png.height * y0Ratio)));
  const y1 = Math.max(y0 + 1, Math.min(png.height, Math.ceil(png.height * y1Ratio)));
  let count = 0;
  let green = 0;
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
      if (x + 1 < png.width) edge += Math.abs(luma(r, g, b) - luma(...rgbAt(png, x + 1, y)));
      if (y + 1 < y1) edge += Math.abs(luma(r, g, b) - luma(...rgbAt(png, x, y + 1)));
      count++;
    }
  }
  return {
    greenRatio: Number((green / count).toFixed(3)),
    edgeEnergy: Number((edge / Math.max(1, count * 2)).toFixed(2)),
    avg: [
      Math.round(rSum / count),
      Math.round(gSum / count),
      Math.round(bSum / count),
    ],
  };
}

function cropRatio(src, xRatio, yRatio, wRatio, hRatio) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(src.width * xRatio)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(src.height * yRatio)));
  const w = Math.max(1, Math.min(src.width - x0, Math.floor(src.width * wRatio)));
  const h = Math.max(1, Math.min(src.height - y0, Math.floor(src.height * hRatio)));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      copyPixel(src, x0 + x, y0 + y, out, x, y);
    }
  }
  return out;
}

function resizeToHeight(src, height) {
  return resize(src, Math.max(1, Math.round(src.width * (height / src.height))), height);
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
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = rgba[0];
    out.data[i + 1] = rgba[1];
    out.data[i + 2] = rgba[2];
    out.data[i + 3] = rgba[3];
  }
  return out;
}

function paste(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      copyPixel(src, x, y, dst, dx + x, dy + y);
    }
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
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
