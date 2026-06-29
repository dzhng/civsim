import { PNG } from 'pngjs';

export const meta = {
  name: 'mounted-units',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Mounted units carry the mount flag and scale with LOD; real medium phalanx stays foot while the render-only shock-cav sidearm remains mounted.',
};

function countNonBlank(png) {
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (Math.abs(r - 21) > 8 || Math.abs(g - 22) > 8 || Math.abs(b - 26) > 8) n++;
  }
  return n;
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, errorPrefix: 'mounted-units' });
  try {
    await page.goto(`${ctx.target}/renderer/mounted-units`);
    await page.waitForFunction(
      () => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.route === 'mounted-units',
      undefined,
      { timeout: 18000 },
    );
    const stats = await page.evaluate(() => window.__rendererLabStats.stats);

    ctx.check(
      `mounted-units: every mounted class (6, 7, ${stats.sidearmClass}) scales above foot units`,
      stats.allMountedScaled === true && stats.mountedEqual === true,
      JSON.stringify({ footSize: stats.footSize, mountedSizes: stats.mountedSizes }),
    );
    ctx.check(
      'mounted-units: real class 14 medium phalanx remains a foot unit',
      stats.class14Foot === true,
      JSON.stringify({ footSize: stats.footSize, class14: stats.phalanxSize }),
    );
    ctx.check(
      `mounted-units: render-only cavalry sidearm class ${stats.sidearmClass} is LOD-scaled`,
      stats.sidearmScaled === true,
      JSON.stringify({ footSize: stats.footSize, sidearm: stats.mountedSizes[String(stats.sidearmClass)] }),
    );
    ctx.check(
      'mounted-units: the mount flag tracks the mounted archetypes',
      stats.mountedFlags.find((f) => f.classId === 0).mounted === false
        && stats.mountedFlags.find((f) => f.classId === 14).mounted === false
        && stats.mountedFlags.filter((f) => f.classId !== 0 && f.classId !== 14).every((f) => f.mounted === true),
      JSON.stringify(stats.mountedFlags),
    );

    const pixels = countNonBlank(PNG.sync.read(await page.screenshot()));
    ctx.check('mounted-units: cavalry + foot render as horse + rider (nonblank)', pixels > 120000, JSON.stringify({ pixels }));
  } finally {
    await page.close();
  }
}
