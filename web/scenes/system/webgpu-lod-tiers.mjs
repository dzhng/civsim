import { PNG } from 'pngjs';

export const meta = {
  name: 'webgpu-lod-tiers',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Real LOD mesh tiers (L0/L1/L2) reduce geometry; per-instance distance binning coarsens monotonically with hysteresis.',
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
  const page = await ctx.newPage({ viewport: { width: 900, height: 520 }, errorPrefix: 'webgpu-lod-tiers' });
  try {
    await page.goto(`${ctx.target}/webgpu/lod-tiers`);
    await page.waitForFunction(
      () => window.__webgpuLabReady === true && window.__webgpuLabStats?.stats?.route === 'lod-tiers',
      undefined,
      { timeout: 18000 },
    );
    const stats = await page.evaluate(() => window.__webgpuLabStats.stats);

    ctx.check(
      'lod-tiers: each coarser mesh tier draws fewer triangles',
      stats.reduces === true && stats.triCounts[0] > stats.triCounts[1] && stats.triCounts[1] > stats.triCounts[2],
      JSON.stringify({ triCounts: stats.triCounts }),
    );
    ctx.check(
      'lod-tiers: per-instance distance binning coarsens monotonically and reaches L0/L1/L2',
      stats.monotonic === true && stats.tiersReached >= 3,
      JSON.stringify({ probeLevels: stats.probeLevels, tiersReached: stats.tiersReached }),
    );
    ctx.check(
      'lod-tiers: hysteresis holds the tier inside the boundary deadband (no per-frame flip)',
      stats.hysteresis.heldL0 === 0 && stats.hysteresis.heldL1 === 1,
      JSON.stringify(stats.hysteresis),
    );
    ctx.check(
      'lod-tiers: the pipeline builds a resource per (class, lod) tier',
      stats.meshVariants === 45,
      JSON.stringify({ meshVariants: stats.meshVariants }),
    );

    const pixels = countNonBlank(PNG.sync.read(await page.screenshot()));
    ctx.check('lod-tiers: L0/L1/L2 soldiers render a nonblank frame', pixels > 100000, JSON.stringify({ pixels }));
  } finally {
    await page.close();
  }
}
