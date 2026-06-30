import { PNG } from 'pngjs';

export const meta = {
  name: 'battle-elevation',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Battle soldiers sit on terrain relief (world Z = sampled height) and cast a grounding shadow under their feet.',
};

function countNonBlank(png) {
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (Math.abs(r - 21) > 8 || Math.abs(g - 22) > 8 || Math.abs(b - 26) > 8) n++;
  }
  return n;
}

// Shadow ellipses darken the olive ground beneath each soldier — count pixels
// that are distinctly darker than terrain but still greenish (not soldier blue).
function countShadowPixels(png) {
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    const greenish = g >= r && g >= b;
    if (greenish && g < 120 && b < 110) n++;
  }
  return n;
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 900, height: 560 }, errorPrefix: 'battle-elevation' });
  try {
    await page.goto(`${ctx.target}/renderer/battle-elevation`);
    await page.waitForFunction(
      () => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.route === 'battle-elevation',
      undefined,
      { timeout: 18000 },
    );
    const stats = await page.evaluate(() => window.__rendererLabStats.stats);

    ctx.check(
      'battle-elevation: each soldier world Z matches the sampled terrain height',
      stats.elevationMatches === true,
      JSON.stringify({ elevationMatches: stats.elevationMatches }),
    );
    ctx.check(
      'battle-elevation: soldiers actually climb the ridge (non-trivial elevation span)',
      stats.elevationSpan > 1,
      JSON.stringify({ elevationSpan: stats.elevationSpan }),
    );
    ctx.check(
      'battle-elevation: a grounding shadow is emitted per soldier',
      stats.shadows === stats.soldiers && stats.shadows > 0,
      JSON.stringify({ shadows: stats.shadows, soldiers: stats.soldiers }),
    );

    const png = PNG.sync.read(await page.screenshot());
    ctx.check('battle-elevation: soldiers render a nonblank frame', countNonBlank(png) > 120000, JSON.stringify({ nonBlank: countNonBlank(png) }));
    ctx.check('battle-elevation: grounding shadows darken the ground under the soldiers', countShadowPixels(png) > 1500, JSON.stringify({ shadowPixels: countShadowPixels(png) }));
  } finally {
    await page.close();
  }
}
