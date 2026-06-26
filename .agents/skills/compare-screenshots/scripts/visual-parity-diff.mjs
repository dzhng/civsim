import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = resolve(process.env.REPO_ROOT ?? process.cwd());
const require = createRequire(resolve(repoRoot, 'web/package.json'));
const { PNG } = require('pngjs');
const pixelmatch = (await import(require.resolve('pixelmatch'))).default;

const pairs = [
  {
    id: 'campaign-label-zoom',
    current: 'specs/webgpu-skinned-crowd/visualizations/current-renderer/campaign-label-zoom.png',
    candidate: 'specs/webgpu-skinned-crowd/visualizations/visual-report/campaign-label-zoom.png',
  },
  {
    id: 'battle-selection-hud-dpr2',
    current: 'specs/webgpu-skinned-crowd/visualizations/current-renderer/battle-selection-hud-dpr2.png',
    candidate: 'specs/webgpu-skinned-crowd/visualizations/visual-report/battle-selection-hud-dpr2.png',
  },
];

const outDir = resolve(repoRoot, 'specs/webgpu-skinned-crowd/visualizations/visual-diff');
await mkdir(outDir, { recursive: true });

const results = [];
for (const pair of pairs) {
  const currentPath = resolve(repoRoot, pair.current);
  const candidatePath = resolve(repoRoot, pair.candidate);
  const current = PNG.sync.read(await readFile(currentPath));
  const candidate = PNG.sync.read(await readFile(candidatePath));
  if (current.width !== candidate.width || current.height !== candidate.height) {
    throw new Error(`${pair.id}: image sizes differ: current=${current.width}x${current.height} candidate=${candidate.width}x${candidate.height}`);
  }

  const width = current.width;
  const height = current.height;
  const grayCurrent = new PNG({ width, height });
  const grayCandidate = new PNG({ width, height });
  const absDiff = new PNG({ width, height });
  const edgeCurrent = new PNG({ width, height });
  const edgeCandidate = new PNG({ width, height });
  const edgeDiff = new PNG({ width, height });
  const currentGray = new Float32Array(width * height);
  const candidateGray = new Float32Array(width * height);

  let sumAbs = 0;
  let sumSq = 0;
  let over16 = 0;
  let over32 = 0;
  let over64 = 0;
  let blackCurrent = 0;
  let blackCandidate = 0;
  let terrainCurrent = 0;
  let terrainCandidate = 0;

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const cg = luminance(current.data[o], current.data[o + 1], current.data[o + 2]);
    const wg = luminance(candidate.data[o], candidate.data[o + 1], candidate.data[o + 2]);
    currentGray[i] = cg;
    candidateGray[i] = wg;
    const d = Math.abs(cg - wg);
    sumAbs += d;
    sumSq += d * d;
    if (d > 16) over16++;
    if (d > 32) over32++;
    if (d > 64) over64++;
    if (cg < 24) blackCurrent++;
    if (wg < 24) blackCandidate++;
    if (isTerrainLike(current.data[o], current.data[o + 1], current.data[o + 2])) terrainCurrent++;
    if (isTerrainLike(candidate.data[o], candidate.data[o + 1], candidate.data[o + 2])) terrainCandidate++;
    writeGray(grayCurrent, o, cg);
    writeGray(grayCandidate, o, wg);
    const heat = Math.min(255, d * 4);
    absDiff.data[o] = heat;
    absDiff.data[o + 1] = Math.max(0, 160 - heat);
    absDiff.data[o + 2] = Math.max(0, 255 - heat);
    absDiff.data[o + 3] = 255;
  }

  const edgeStats = writeEdges(currentGray, candidateGray, edgeCurrent, edgeCandidate, edgeDiff, width, height);
  const pixelmatchDiff = new PNG({ width, height });
  const mismatched = pixelmatch(
    grayCurrent.data,
    grayCandidate.data,
    pixelmatchDiff.data,
    width,
    height,
    { threshold: 0.08, includeAA: true },
  );

  await writePng(resolve(outDir, `${pair.id}-current-gray.png`), grayCurrent);
  await writePng(resolve(outDir, `${pair.id}-candidate-gray.png`), grayCandidate);
  await writePng(resolve(outDir, `${pair.id}-absdiff.png`), absDiff);
  await writePng(resolve(outDir, `${pair.id}-pixelmatch.png`), pixelmatchDiff);
  await writePng(resolve(outDir, `${pair.id}-current-edges.png`), edgeCurrent);
  await writePng(resolve(outDir, `${pair.id}-candidate-edges.png`), edgeCandidate);
  await writePng(resolve(outDir, `${pair.id}-edge-diff.png`), edgeDiff);

  const total = width * height;
  const diffRatio32 = over32 / total;
  const pixelmatchRatio = mismatched / total;
  const edgeDiffRatio32 = edgeStats.diffOver32 / total;
  const edgeEnergyRatio = edgeStats.candidateEnergy / Math.max(0.0001, edgeStats.currentEnergy);
  const parityDistance =
    0.35 * diffRatio32
    + 0.25 * pixelmatchRatio
    + 0.25 * edgeDiffRatio32
    + 0.15 * Math.min(1, Math.abs(Math.log2(edgeEnergyRatio)));

  results.push({
    id: pair.id,
    current: relative(repoRoot, currentPath),
    candidate: relative(repoRoot, candidatePath),
    dimensions: { width, height },
    parityDistance: round(parityDistance),
    grayscale: {
      mae: round(sumAbs / total),
      rmse: round(Math.sqrt(sumSq / total)),
      diffRatio16: round(over16 / total),
      diffRatio32: round(diffRatio32),
      diffRatio64: round(over64 / total),
      pixelmatchRatio: round(pixelmatchRatio),
    },
    contentProxies: {
      blackRatioCurrent: round(blackCurrent / total),
      blackRatioCandidate: round(blackCandidate / total),
      terrainLikeRatioCurrent: round(terrainCurrent / total),
      terrainLikeRatioCandidate: round(terrainCandidate / total),
      edgeEnergyCurrent: round(edgeStats.currentEnergy),
      edgeEnergyCandidate: round(edgeStats.candidateEnergy),
      edgeEnergyRatio: round(edgeEnergyRatio),
      edgeDiffRatio32: round(edgeDiffRatio32),
    },
    artifacts: {
      currentGray: `visual-diff/${pair.id}-current-gray.png`,
      candidateGray: `visual-diff/${pair.id}-candidate-gray.png`,
      absDiff: `visual-diff/${pair.id}-absdiff.png`,
      pixelmatch: `visual-diff/${pair.id}-pixelmatch.png`,
      currentEdges: `visual-diff/${pair.id}-current-edges.png`,
      candidateEdges: `visual-diff/${pair.id}-candidate-edges.png`,
      edgeDiff: `visual-diff/${pair.id}-edge-diff.png`,
    },
  });
}

const report = {
  kind: 'screenshot-parity-diff',
  generatedAt: new Date().toISOString(),
  note: 'Lower parityDistance means the candidate is closer to archived current-renderer parity. This is a parity metric, not an aesthetics acceptance gate.',
  results,
};

const reportPath = resolve(outDir, 'visual-parity-diff.json');
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`wrote ${relative(repoRoot, reportPath)}`);

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isTerrainLike(r, g, b) {
  return g > 72 && r > 62 && b > 38 && r > b * 0.92 && g > b * 0.92;
}

function writeGray(png, offset, value) {
  const v = Math.max(0, Math.min(255, Math.round(value)));
  png.data[offset] = v;
  png.data[offset + 1] = v;
  png.data[offset + 2] = v;
  png.data[offset + 3] = 255;
}

function writeEdges(currentGray, candidateGray, edgeCurrent, edgeCandidate, edgeDiff, width, height) {
  let currentEnergy = 0;
  let candidateEnergy = 0;
  let diffOver32 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const ce = sobel(currentGray, width, height, x, y);
      const we = sobel(candidateGray, width, height, x, y);
      currentEnergy += ce / 255;
      candidateEnergy += we / 255;
      const d = Math.abs(ce - we);
      if (d > 32) diffOver32++;
      writeGray(edgeCurrent, o, ce);
      writeGray(edgeCandidate, o, we);
      edgeDiff.data[o] = Math.min(255, d * 4);
      edgeDiff.data[o + 1] = Math.max(0, 180 - d * 3);
      edgeDiff.data[o + 2] = Math.max(0, 255 - d * 4);
      edgeDiff.data[o + 3] = 255;
    }
  }
  const total = width * height;
  return {
    currentEnergy: currentEnergy / total,
    candidateEnergy: candidateEnergy / total,
    diffOver32,
  };
}

function sobel(gray, width, height, x, y) {
  const xm = Math.max(0, x - 1);
  const xp = Math.min(width - 1, x + 1);
  const ym = Math.max(0, y - 1);
  const yp = Math.min(height - 1, y + 1);
  const a = gray[ym * width + xm];
  const b = gray[ym * width + x];
  const c = gray[ym * width + xp];
  const d = gray[y * width + xm];
  const f = gray[y * width + xp];
  const g = gray[yp * width + xm];
  const h = gray[yp * width + x];
  const i = gray[yp * width + xp];
  const gx = -a - 2 * d - g + c + 2 * f + i;
  const gy = -a - 2 * b - c + g + 2 * h + i;
  return Math.min(255, Math.sqrt(gx * gx + gy * gy));
}

async function writePng(path, png) {
  await writeFile(path, PNG.sync.write(png));
}

function round(value) {
  return Number(value.toFixed(5));
}

export const scriptUrl = pathToFileURL(import.meta.url).href;
