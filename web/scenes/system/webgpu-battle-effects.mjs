import { PNG } from 'pngjs';

export const meta = {
  name: 'webgpu-battle-effects',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Fallen soldiers read as varied corpses (deathVariant reaches the GPU); impact dust/blood particles render and stay capped.',
};

function countNonBlank(png) {
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (Math.abs(r - 21) > 8 || Math.abs(g - 22) > 8 || Math.abs(b - 26) > 8) n++;
  }
  return n;
}

// Blood particles are a distinct dark red the terrain/soldiers never produce.
function countBloodPixels(png) {
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    if (r > 90 && r < 180 && g < 70 && b < 70) n++;
  }
  return n;
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 900, height: 560 }, errorPrefix: 'webgpu-battle-effects' });
  try {
    await page.goto(`${ctx.target}/webgpu/battle-effects`);
    await page.waitForFunction(
      () => window.__webgpuLabReady === true && window.__webgpuLabStats?.stats?.route === 'battle-effects',
      undefined,
      { timeout: 18000 },
    );
    const stats = await page.evaluate(() => window.__webgpuLabStats.stats);

    ctx.check(
      'battle-effects: deathVariant reaches the GPU with variety across the fallen',
      stats.corpses > 0 && stats.deathVariants.length >= 2,
      JSON.stringify({ corpses: stats.corpses, deathVariants: stats.deathVariants }),
    );
    ctx.check(
      'battle-effects: impact particles render and stay within the cap',
      stats.particles > 0 && stats.capped === 0,
      JSON.stringify({ particles: stats.particles, capped: stats.capped }),
    );

    const png = PNG.sync.read(await page.screenshot());
    ctx.check('battle-effects: living + corpses + particles render a nonblank frame', countNonBlank(png) > 120000, JSON.stringify({ nonBlank: countNonBlank(png) }));
    ctx.check('battle-effects: blood particles paint distinct red impacts', countBloodPixels(png) > 80, JSON.stringify({ bloodPixels: countBloodPixels(png) }));
  } finally {
    await page.close();
  }
}
