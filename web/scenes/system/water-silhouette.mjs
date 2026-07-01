import { PNG } from 'pngjs';

// Water Slice 2 — wave silhouette / displacement gate. The bake-off winner
// (Gerstner) displaced and shaded in neutral grey through the shared `waterShade`
// on the open-sea plane; this pins that the swell renders, holds a deterministic
// frozen-clock baseline of its geometry, and stays inside the Slice 1 GPU budget.
// Colour/foam/glint are later slices and deliberately absent here.
//
// GPU only (VERIFY_GPU=1); on macOS that means headful + hardware.

const WINNER = 'gerstner';
const BUDGET_MS = 8;

export const meta = {
  name: 'water-silhouette',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [`water/silhouette-${WINNER}`],
  describe: 'Water Slice 2: the winner\'s wave silhouette on the open-sea plane, neutral grey, frozen clock.',
};

const waitReady = (page) => page.waitForFunction(
  () => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.route === 'water-bakeoff',
  undefined,
  { timeout: 25000 },
);

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1000, height: 600 }, errorPrefix: WINNER });
  try {
    await page.goto(`${ctx.target}/renderer/water-bakeoff?tech=${WINNER}&t=3.0`);
    await waitReady(page);

    const stats = (await page.evaluate(() => window.__rendererLabStats)).stats;
    ctx.check(
      'silhouette: the winner field is live and single-tech',
      stats.tech === WINNER && stats.compare === false,
      JSON.stringify({ tech: stats.tech, compare: stats.compare }),
    );

    // Sample the GPU time over a few frames — the swell must stay within budget.
    let gpuMs = null;
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(60);
      const v = await page.evaluate(() => window.__rendererLabStats?.stats?.gpuTimeMs);
      if (typeof v === 'number' && v >= 0) gpuMs = gpuMs === null ? v : Math.min(gpuMs, v);
    }
    if (stats.timestampQuery) {
      ctx.check(
        `silhouette: displaced plane within the ${BUDGET_MS}ms Slice 1 budget`,
        gpuMs !== null && gpuMs < BUDGET_MS,
        JSON.stringify({ gpuMs }),
      );
    } else {
      ctx.check('silhouette: GPU timestamp unavailable (perf n/a)', true, 'no timestamp-query');
    }

    // The swell must actually cover the lower frame — a flat/blank sea or a gap
    // where terrain shows through both fail this.
    const shot = await page.locator('#renderer-canvas').screenshot();
    const png = PNG.sync.read(shot);
    let sea = 0;
    let band = 0;
    const bandTop = Math.floor(png.height * 0.45);
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const o = (y * png.width + x) * 4;
        const r = png.data[o], g = png.data[o + 1], b = png.data[o + 2];
        // grey water: low saturation, mid-dark value (excludes the blue sky and
        // any olive terrain that would leak through a coverage gap).
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const grey = mx - mn < 22 && mx < 170;
        if (grey) sea++;
        if (grey && y >= bandTop) band++;
      }
    }
    const lowerArea = (png.height - bandTop) * png.width;
    ctx.check(
      'silhouette: grey swell fills the lower frame (no flat sheet, no terrain leak)',
      band > lowerArea * 0.9,
      JSON.stringify({ band, lowerArea, seaTotal: sea }),
    );

    await ctx.snap(page, `water/silhouette-${WINNER}`, { shot });
  } finally {
    await page.close();
  }
}
