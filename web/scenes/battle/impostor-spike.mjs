import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

export const meta = {
  name: 'impostor-spike',
  kind: 'flow',
  world: 'renderer-lab',
  tier: 'full',
  snapshots: [],
  describe: 'Octahedral impostor spike route: per-mode liveness, stats identity, fixed-time determinism.',
};

const SUBSTRATE = 'threejs-webgpu-tsl';
const PROJECTION = 'camera3d';
const FIXED_TIME = 0.6;
const COUNT = 10000;
const MODES = ['mesh', 'impostor', 'split'];
const SHOT_DIR = new URL('../../shots-spike/', import.meta.url);

function countPixels(png) {
  let nonBlank = 0;
  let faction = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (r + g + b > 60) nonBlank += 1;
    if ((b > r + 24 && b > g + 8) || (r > b + 24 && r > g + 8)) faction += 1;
  }
  return { nonBlank, faction, total: png.width * png.height };
}

function identityOk(stats) {
  return (
    stats?.ok === true &&
    stats.route === 'impostor-spike' &&
    stats.substrate === SUBSTRATE &&
    stats.projection === PROJECTION &&
    stats.environment === 'golden'
  );
}

function statsOk(stats, mode) {
  const s = stats?.stats;
  return (
    s?.mode === mode &&
    s.count === COUNT &&
    s.cameraPreset === 'vista' &&
    typeof s.drawCalls === 'number' &&
    s.drawCalls > 0 &&
    typeof s.triangles === 'number' &&
    s.triangles > 0 &&
    (s.gpuTimeMs === null || typeof s.gpuTimeMs === 'number') &&
    typeof s.frames === 'number'
  );
}

async function openMode(ctx, mode) {
  const page = await ctx.newPage({ viewport: { width: 1100, height: 700 }, errorPrefix: `impostor-${mode}` });
  await page.goto(`${ctx.target}/renderer/impostor-spike?mode=${mode}&count=${COUNT}&t=${FIXED_TIME}`);
  await page.waitForFunction(
    ([expectedMode, expectedTime]) =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.route === 'impostor-spike' &&
      window.__rendererLabStats?.stats?.mode === expectedMode &&
      window.__rendererLabStats?.stats?.timeSeconds === expectedTime,
    [mode, FIXED_TIME],
    { timeout: 90000 },
  );
  await page.waitForTimeout(300);
  return page;
}

export async function run(ctx) {
  await mkdir(SHOT_DIR, { recursive: true });
  for (const mode of MODES) {
    const page = await openMode(ctx, mode);
    const stats = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      `${mode}: identity fields assert the single owners`,
      identityOk(stats),
      JSON.stringify({
        route: stats?.route,
        substrate: stats?.substrate,
        projection: stats?.projection,
        environment: stats?.environment,
      }),
    );
    ctx.check(`${mode}: route stats publish count/draw/gpu shape`, statsOk(stats, mode), JSON.stringify(stats?.stats));

    const clip = await page.locator('#renderer-canvas').boundingBox();
    const shotA = await page.screenshot({ clip, timeout: 180000 });
    const pixels = countPixels(PNG.sync.read(shotA));
    ctx.check(
      `${mode}: canvas is non-blank with faction pixels`,
      pixels.nonBlank > pixels.total * 0.35 && pixels.faction > 100,
      JSON.stringify(pixels),
    );
    const shotB = await page.screenshot({ clip, timeout: 180000 });
    ctx.check(
      `${mode}: fixed setTime renders byte-identical frames`,
      Buffer.compare(shotA, shotB) === 0,
      JSON.stringify({ bytesA: shotA.length, bytesB: shotB.length }),
    );
    await writeFile(new URL(`impostor-spike-${mode}.png`, SHOT_DIR), shotA);
    await page.close();
  }
}
