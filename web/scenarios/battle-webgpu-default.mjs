import { PNG } from 'pngjs';
import { battleReal } from './worlds.mjs';

export const meta = {
  name: 'battle-webgpu-default',
  kind: 'flow',
  world: 'battle-real',
  tier: 'quick',
  snapshots: [],
  describe: 'Normal battle launch uses the raw WebGPU renderer by default.',
};

export async function run(ctx) {
  if (process.env.VERIFY_WEBGPU !== '1') {
    ctx.check('requires WebGPU browser flags', true, 'set VERIFY_WEBGPU=1 to exercise the default renderer');
    return;
  }

  const page = await battleReal(ctx, { settle: 500, errorPrefix: 'webgpu-default' });
  await page.waitForFunction(() => {
    const stats = window.__game?.stats?.();
    return stats?.renderer === 'webgpu'
      && stats.renderStats?.ready === true
      && stats.renderStats.soldiers === stats.soldiers;
  }, undefined, { timeout: 12000 });
  const stats = await page.evaluate(() => window.__game.stats());
  ctx.check(
    'battle default renderer is raw WebGPU',
    stats.renderer === 'webgpu'
      && stats.renderStats?.ready === true
      && stats.renderStats.soldiers === stats.soldiers
      && stats.renderStats.atmosphere === 'aegean-sky-haze'
      && stats.renderStats.cameraContract === 'shared-world-camera-wgsl'
      && stats.renderStats.skinnedCameraContract === 'shared-world-camera-wgsl'
      && stats.renderStats.depth?.allocated === true
      && stats.renderStats.depth?.format === 'depth24plus'
      && hasFramePhaseOrder(stats.renderStats.phases),
    JSON.stringify(stats),
  );
  ctx.check(
    'WebGPU renderer drew the full battle crowd',
    stats.renderStats?.soldiers >= 25000 && stats.renderStats?.drawCalls === 1,
    JSON.stringify(stats.renderStats),
  );
  ctx.check(
    'WebGPU battle terrain includes sim-sourced feature detail',
    stats.renderStats?.terrain?.fixture === 'sim-tint'
      && stats.renderStats.terrain.quads > 1000
      && stats.renderStats.terrain.sceneryQuads > 800,
    JSON.stringify(stats.renderStats?.terrain),
  );

  const shot = await page.screenshot();
  const png = PNG.sync.read(shot);
  let warm = 0;
  let blue = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (r > 140 && g > 120 && b < 120) warm++;
    if (b > r + 24 && b > g + 8) blue++;
  }
  ctx.check('WebGPU battle frame has visible terrain and team color', warm > 20000 && blue > 300, JSON.stringify({ warm, blue }));
  await page.close();

  for (const retired of ['2d', '3d']) {
    const legacyPage = await ctx.newPage({ errorPrefix: `retired-gfx-${retired}` });
    await legacyPage.goto(`${ctx.target}?battle=duel&a=0&b=0&ai=off&gfx=${retired}`);
    await legacyPage.waitForFunction(() => {
      const stats = window.__game?.stats?.();
      return window.__ready === true
        && stats?.renderer === 'webgpu'
        && stats.renderStats?.ready === true
        && stats.renderStats.soldiers === stats.soldiers;
    }, undefined, { timeout: 12000 });
    const retiredStats = await legacyPage.evaluate(() => window.__game.stats());
    ctx.check(
      `retired gfx=${retired} battle route still uses raw WebGPU`,
      retiredStats.renderer === 'webgpu'
        && retiredStats.renderStats?.drawCalls === 1
        && retiredStats.renderStats?.cameraContract === 'shared-world-camera-wgsl'
        && retiredStats.renderStats?.skinnedCameraContract === 'shared-world-camera-wgsl'
        && retiredStats.renderStats?.depth?.allocated === true
        && hasFramePhaseOrder(retiredStats.renderStats?.phases),
      JSON.stringify(retiredStats),
    );
    await legacyPage.close();
  }
}

function hasFramePhaseOrder(phases) {
  const kinds = Array.isArray(phases) ? phases.map((phase) => phase?.kind) : [];
  const background = kinds.indexOf('background');
  const world = kinds.indexOf('world-depth');
  const overlay = kinds.includes('overlay') ? kinds.indexOf('overlay') : kinds.length;
  return background === 0 && world > background && overlay > world;
}
