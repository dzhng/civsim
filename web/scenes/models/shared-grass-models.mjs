import { PNG } from 'pngjs';

// Floors re-derived for the oblique camera3d review framing (slice 05b): the
// blades stand toward the camera instead of splaying under the fake top-down
// projection, so less of the silhouette reads as deep-shaded blade interior
// (measured 0.0035 tuft / 0.033 patch; floors keep ~40% margin).
const gates = [
  { id: 'tuft', label: 'Grass Tuft', minGrass: 0.010, minDark: 0.12, minDeepBlade: 0.002 },
  { id: 'patch', label: 'Grass Patch', minGrass: 0.035, minDark: 0.25, minDeepBlade: 0.02 },
];

export const meta = {
  name: 'shared-grass-models',
  kind: 'visual',
  world: 'shared-grass-models',
  tier: 'full',
  snapshots: gates.map((gate) => `shared/grass/${gate.id}`),
  describe: 'Captures reusable grass primitive baselines under web/shots/models/shared/grass.',
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('shared grass shots require browser GPU flags', true, 'set VERIFY_GPU=1 to capture shared grass shots');
    return;
  }

  for (const gate of gates) {
    await captureGate(ctx, gate);
  }
}

async function captureGate(ctx, gate) {
  const page = await ctx.newPage({ viewport: { width: 920, height: 720 }, errorPrefix: `shared-grass-${gate.id}` });
  await page.goto(`${ctx.target}/renderer/shared-grass-models?gate=${gate.id}`);
  await page.waitForFunction((id) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === id, gate.id, { timeout: 18000 });
  await page.waitForTimeout(160);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== 'shared-grass-models' || stats?.gate !== gate.id) {
    await page.close();
    throw new Error(`shared grass ${gate.id} did not publish valid stats: ${JSON.stringify(stats)}`);
  }
  ctx.check(`${gate.id} route publishes shared grass stats`, stats.bladeInstances >= stats.tuftInstances && stats.meshVertices > 0, JSON.stringify(stats));
  const shot = await page.locator('#renderer-canvas').screenshot();
  const metrics = grassModelMetrics(PNG.sync.read(shot));
  ctx.check(
    `${gate.id} grass silhouette is visible`,
    metrics.grass >= gate.minGrass && metrics.dark >= gate.minDark && metrics.deepBlade >= gate.minDeepBlade,
    JSON.stringify({ label: gate.label, metrics }),
  );
  await ctx.snap(page, `shared/grass/${gate.id}`, { shot });
  await page.close();
}

function grassModelMetrics(png) {
  let total = 0;
  let grass = 0;
  let dark = 0;
  let deepBlade = 0;
  const x0 = Math.floor(png.width * 0.18);
  const x1 = Math.floor(png.width * 0.82);
  const y0 = Math.floor(png.height * 0.14);
  const y1 = Math.floor(png.height * 0.84);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      if (g > 72 && g > b * 1.08 && r > 38 && r < 190 && b < 140) grass++;
      if (r < 54 && g < 64 && b < 58) dark++;
      if (g > 45 && g > b * 1.05 && r < 95 && b < 90) deepBlade++;
    }
  }
  return {
    grass: Number((grass / total).toFixed(4)),
    dark: Number((dark / total).toFixed(4)),
    deepBlade: Number((deepBlade / total).toFixed(4)),
  };
}
