import { PNG } from 'pngjs';

export const meta = {
  name: 'webgpu-mounted-units',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Mounted units carry the mount flag and scale with LOD (every mounted class incl. 14); cavalry renders as horse + rider.',
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
  const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, errorPrefix: 'webgpu-mounted-units' });
  try {
    await page.goto(`${ctx.target}/webgpu/mounted-units`);
    await page.waitForFunction(
      () => window.__webgpuLabReady === true && window.__webgpuLabStats?.stats?.route === 'mounted-units',
      undefined,
      { timeout: 18000 },
    );
    const stats = await page.evaluate(() => window.__webgpuLabStats.stats);

    ctx.check(
      'mounted-units: every mounted class (6, 7, 14) scales above foot units',
      stats.allMountedScaled === true && stats.mountedEqual === true,
      JSON.stringify({ footSize: stats.footSize, mountedSizes: stats.mountedSizes }),
    );
    ctx.check(
      'mounted-units: cavalry class 14 is now LOD-scaled (was missing from the hardcoded 6/7 list)',
      stats.class14Scaled === true,
      JSON.stringify({ footSize: stats.footSize, class14: stats.mountedSizes['14'] }),
    );
    ctx.check(
      'mounted-units: the mount flag tracks the mounted archetypes',
      stats.mountedFlags.find((f) => f.classId === 0).mounted === false
        && stats.mountedFlags.filter((f) => f.classId !== 0).every((f) => f.mounted === true),
      JSON.stringify(stats.mountedFlags),
    );

    const pixels = countNonBlank(PNG.sync.read(await page.screenshot()));
    ctx.check('mounted-units: cavalry + foot render as horse + rider (nonblank)', pixels > 120000, JSON.stringify({ pixels }));
  } finally {
    await page.close();
  }
}
