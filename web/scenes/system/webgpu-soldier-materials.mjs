import { PNG } from 'pngjs';

export const meta = {
  name: 'webgpu-soldier-materials',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Soldiers sample material textures; faction color localizes to the mask (crest/shield) instead of flooding the whole body.',
};

// Average RGB over a fixed body box. Terrain inside the box is identical across
// captures, so it cancels when we difference two factions — the remaining
// difference is the soldier's faction tint.
function boxAverage(png) {
  const x0 = Math.floor(png.width * 0.40), x1 = Math.floor(png.width * 0.60);
  const y0 = Math.floor(png.height * 0.26), y1 = Math.floor(png.height * 0.56);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * png.width + x) * 4;
      r += png.data[o]; g += png.data[o + 1]; b += png.data[o + 2]; n++;
    }
  }
  return [r / n, g / n, b / n];
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function capture(ctx, strength, team) {
  const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, errorPrefix: `soldier-materials-${strength}-${team}` });
  try {
    await page.goto(`${ctx.target}/webgpu/soldier-materials?strength=${strength}&team=${team}&class=0`);
    await page.waitForFunction(
      () => window.__webgpuLabReady === true && window.__webgpuLabStats?.stats?.route === 'soldier-materials',
      undefined,
      { timeout: 18000 },
    );
    await page.waitForTimeout(250);
    return boxAverage(PNG.sync.read(await page.locator('#webgpu-canvas').screenshot()));
  } finally {
    await page.close();
  }
}

export async function run(ctx) {
  const broadBlue = await capture(ctx, 0, 0);
  const broadRed = await capture(ctx, 0, 1);
  const maskBlue = await capture(ctx, 1, 0);
  const maskRed = await capture(ctx, 1, 1);

  const broadFactionDiff = dist(broadBlue, broadRed);
  const maskFactionDiff = dist(maskBlue, maskRed);

  ctx.check(
    'soldier-materials: legacy broad tint makes the two factions differ across the body',
    broadFactionDiff > 12,
    JSON.stringify({ broadBlue, broadRed, broadFactionDiff }),
  );
  ctx.check(
    'soldier-materials: faction mask localizes color — body faction difference shrinks',
    maskFactionDiff < broadFactionDiff * 0.6,
    JSON.stringify({ maskFactionDiff, broadFactionDiff, ratio: (maskFactionDiff / Math.max(1, broadFactionDiff)).toFixed(2) }),
  );
}
