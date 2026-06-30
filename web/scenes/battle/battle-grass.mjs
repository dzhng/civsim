import { PNG } from 'pngjs';

export const meta = {
  name: 'battle-grass',
  kind: 'visual',
  world: 'battle-grass',
  tier: 'full',
  snapshots: ['grass/flat-field', 'grass/wind-phase'],
  describe: 'Flat-field BattleGrassPass workbench with deterministic instanced blades and fixed-phase wind verification.',
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('battle grass shots require browser GPU flags', true, 'set VERIFY_GPU=1 to capture');
    return;
  }

  const still = await captureGrass(ctx, { phase: 0, shotName: 'grass/flat-field' });
  const moved = await captureGrass(ctx, { phase: 1.55, shotName: 'grass/wind-phase' });
  const diff = phaseDiff(still.png, moved.png);
  ctx.check('fixed wind phase moves blade pixels', diff.changedRatio > 0.003 && diff.changedRatio < 0.16, JSON.stringify(diff));
}

async function captureGrass(ctx, { phase, shotName }) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: `battle-grass-${phase}` });
  await page.goto(`${ctx.target}/renderer/battle-grass?gate=flat-field&phase=${phase}`);
  await page.waitForFunction((p) => window.__rendererLabReady === true && Math.abs((window.__rendererLabStats?.stats?.windPhase ?? -999) - p) < 0.0001, phase, { timeout: 18000 });
  await page.waitForTimeout(160);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== 'battle-grass' || stats?.gate !== 'flat-field') {
    await page.close();
    throw new Error(`battle grass did not publish valid stats: ${JSON.stringify(stats)}`);
  }
  ctx.check('grass pass publishes bounded instance budget', stats.tuftInstances > 300 && stats.tuftInstances <= stats.maxTufts && stats.cappedTufts > 0, JSON.stringify(stats));
  ctx.check('grass pass stays in world-depth phase', hasWorldDepthGrassPass(stats.framePhases), JSON.stringify(stats.framePhases));
  const shot = await page.locator('#renderer-canvas').screenshot();
  const png = PNG.sync.read(shot);
  const metrics = grassFieldMetrics(png);
  ctx.check(`${shotName} fills the field with readable blades`, metrics.cover > 0.78 && metrics.blade > 0.012 && metrics.texture > 0.18, JSON.stringify(metrics));
  await ctx.snap(page, shotName, { shot });
  await page.close();
  return { stats, png };
}

function hasWorldDepthGrassPass(phases) {
  return Array.isArray(phases) && phases.some((phase) =>
    phase?.kind === 'world-depth'
    && phase.passIds?.includes('battle-grass-flat-field')
    && phase.depthPasses?.some((pass) => pass.id === 'battle-grass-flat-field' && pass.mode === 'read-write')
    && phase.passRoles?.some((pass) => pass.id === 'battle-grass-flat-field' && pass.role === 'world-opaque'));
}

function grassFieldMetrics(png) {
  let total = 0;
  let cover = 0;
  let blade = 0;
  let texture = 0;
  const x0 = Math.floor(png.width * 0.08);
  const x1 = Math.floor(png.width * 0.92);
  const y0 = Math.floor(png.height * 0.10);
  const y1 = Math.floor(png.height * 0.86);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      if (!(b > r && b > g && b > 170)) cover++;
      if (g > 80 && g > b * 1.08 && r > 45 && r < 190 && b < 150) blade++;
      if (Math.abs(g - r) + Math.abs(g - b) > 42) texture++;
    }
  }
  return {
    cover: Number((cover / total).toFixed(3)),
    blade: Number((blade / total).toFixed(4)),
    texture: Number((texture / total).toFixed(3)),
  };
}

function phaseDiff(a, b) {
  let changed = 0;
  let total = 0;
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  for (let y = Math.floor(h * 0.12); y < Math.floor(h * 0.84); y++) {
    for (let x = Math.floor(w * 0.08); x < Math.floor(w * 0.92); x++) {
      const i = (y * a.width + x) * 4;
      const j = (y * b.width + x) * 4;
      const d = Math.abs(a.data[i] - b.data[j])
        + Math.abs(a.data[i + 1] - b.data[j + 1])
        + Math.abs(a.data[i + 2] - b.data[j + 2]);
      if (d > 28) changed++;
      total++;
    }
  }
  return { changedRatio: Number((changed / total).toFixed(4)), total };
}
