import { PNG } from 'pngjs';

export const meta = {
  name: 'battle-grass-field',
  kind: 'visual',
  world: 'battle-grass-field',
  tier: 'full',
  snapshots: ['grass/field-packed-tilt'],
  describe: 'Packed grass-field route proving terrain-normal attributes, slope rejects, and world-depth draw order.',
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('packed grass field shot requires browser GPU flags', true, 'set VERIFY_GPU=1 to capture');
    return;
  }

  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'battle-grass-field' });
  await page.goto(`${ctx.target}/renderer/battle-grass-field?mode=packed-tilt`);
  await page.waitForFunction(() => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.route === 'battle-grass-field', { timeout: 18000 });
  await page.waitForTimeout(160);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== 'battle-grass-field' || stats?.mode !== 'packed-tilt') {
    await page.close();
    throw new Error(`battle grass field did not publish valid stats: ${JSON.stringify(stats)}`);
  }

  ctx.check('packed field route publishes slope/stride telemetry', hasPackedTelemetry(stats), JSON.stringify(stats.grass));
  ctx.check('packed field stays in world-depth phase', hasPackedWorldDepthPass(stats.framePhases), JSON.stringify(stats.framePhases));
  const shot = await page.locator('#renderer-canvas').screenshot();
  const png = PNG.sync.read(shot);
  const metrics = packedGrassMetrics(png);
  ctx.check(
    'packed field screenshot shows grass on rolling ground and a clear steep ramp',
    metrics.grassField.edge > 0.015 && metrics.steepRamp.edge < 0.006 && metrics.grassField.cover > 0.90,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, 'grass/field-packed-tilt', { shot });
  await page.close();
}

function hasPackedTelemetry(stats) {
  const grass = stats?.grass;
  return grass?.prepMode === 'packed-field'
    && grass.fieldRecords > 100
    && grass.fieldRejectedSlopeCells > 0
    && grass.packedStrideFloats === 16
    && grass.fieldRecordStrideFloats === 16
    && grass.instanceBytes === grass.fieldRecords * 16 * 4
    && grass.submittedTriangles > 0
    && grass.drawCalls === 1;
}

function hasPackedWorldDepthPass(phases) {
  return Array.isArray(phases) && phases.some((phase) =>
    phase?.kind === 'world-depth'
    && phase.passIds?.includes('battle-grass-field-packed-tilt')
    && phase.depthPasses?.some((pass) => pass.id === 'battle-grass-field-packed-tilt' && pass.mode === 'read-write')
    && phase.passRoles?.some((pass) => pass.id === 'battle-grass-field-packed-tilt' && pass.role === 'world-opaque'));
}

function packedGrassMetrics(png) {
  return {
    grassField: regionMetrics(png, 0.02, 0.08, 0.30, 0.82),
    steepRamp: regionMetrics(png, 0.45, 0.08, 0.48, 0.82),
  };
}

function regionMetrics(png, rx, ry, rw, rh) {
  let total = 0;
  let cover = 0;
  let edge = 0;
  const x0 = Math.floor(png.width * rx);
  const x1 = Math.floor(png.width * (rx + rw));
  const y0 = Math.floor(png.height * ry);
  const y1 = Math.floor(png.height * (ry + rh));
  for (let y = y0 + 1; y < y1; y++) {
    for (let x = x0 + 1; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const left = (y * png.width + x - 1) * 4;
      const up = ((y - 1) * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      if (!(b > r && b > g && b > 170)) cover++;
      const delta = Math.abs(r - png.data[left])
        + Math.abs(g - png.data[left + 1])
        + Math.abs(b - png.data[left + 2])
        + Math.abs(r - png.data[up])
        + Math.abs(g - png.data[up + 1])
        + Math.abs(b - png.data[up + 2]);
      if (delta > 32) edge++;
    }
  }
  return {
    cover: Number((cover / total).toFixed(3)),
    edge: Number((edge / total).toFixed(4)),
  };
}
