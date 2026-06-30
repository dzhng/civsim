import { PNG } from 'pngjs';

export const meta = {
  name: 'asset-workbench',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Asset workbench bakes a dropped .glb to a VAT beside the placeholder; malformed input shows a precise error, never a crash.',
};

function countNonBlank(png) {
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (Math.abs(r - 21) > 8 || Math.abs(g - 22) > 8 || Math.abs(b - 26) > 8) n++;
  }
  return n;
}

const REQUIRED_HUMAN_CLIPS = ['idle', 'march', 'run', 'attack_a', 'hit_a', 'death_a', 'at_ease'];

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, errorPrefix: 'asset-workbench' });
  try {
    await page.goto(`${ctx.target}/renderer/asset-workbench`);
    await page.waitForFunction(
      () => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.route === 'asset-workbench',
      undefined,
      { timeout: 18000 },
    );
    await page.waitForFunction(() => window.__rendererLabStats?.stats?.imported != null, undefined, { timeout: 8000 });
    const stats = await page.evaluate(() => window.__rendererLabStats.stats);

    ctx.check(
      'asset-workbench: placeholder default path renders without an asset dropped',
      stats.placeholderRendered === true && typeof stats.placeholderVat === 'string',
      JSON.stringify({ placeholderRendered: stats.placeholderRendered, placeholderVat: stats.placeholderVat }),
    );
    ctx.check(
      'asset-workbench: the test .glb bakes to a valid VAT (2 bones, required clips)',
      stats.imported?.ok === true
        && stats.imported?.bones === 2
        && REQUIRED_HUMAN_CLIPS.every((c) => stats.imported.clips.includes(c))
        && stats.imported?.errors.length === 0,
      JSON.stringify(stats.imported),
    );

    const pixels = countNonBlank(PNG.sync.read(await page.screenshot()));
    ctx.check('asset-workbench: placeholder + imported skeleton render a nonblank frame', pixels > 150000, JSON.stringify({ pixels }));

    // Malformed asset → precise validation error, not a crash.
    const malformed = await page.evaluate(() => {
      window.__assetWorkbench.loadBase64Glb(btoa('not a glb at all'), 'malformed.glb');
      return window.__rendererLabStats.stats.imported;
    });
    ctx.check(
      'asset-workbench: malformed .glb surfaces a precise error, not a crash',
      malformed?.ok === false && malformed?.errors.length > 0 && typeof malformed?.error === 'string',
      JSON.stringify(malformed),
    );
    const stillAlive = await page.evaluate(() => window.__rendererLabStats?.stats?.placeholderRendered === true);
    ctx.check('asset-workbench: placeholder still renders after a bad import', stillAlive, JSON.stringify({ stillAlive }));
  } finally {
    await page.close();
  }
}
