import { PNG } from 'pngjs';

export const meta = {
  name: 'webgpu-capabilities',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Capability probe: granted limits/format, depth fallback decision, VAT-buffer guard, and live GPU-time readout.',
};

function countNonBlank(png) {
  let nonBlank = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (Math.abs(r - 21) > 8 || Math.abs(g - 22) > 8 || Math.abs(b - 26) > 8) nonBlank++;
  }
  return nonBlank;
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, errorPrefix: 'webgpu-capabilities' });
  try {
    await runProbe(ctx, page);
  } finally {
    await page.close();
  }
}

async function runProbe(ctx, page) {
  await page.goto(`${ctx.target}/webgpu/capabilities`);
  await page.waitForFunction(
    () => window.__webgpuLabReady === true && window.__webgpuLabStats?.stats?.route === 'capabilities',
    undefined,
    { timeout: 18000 },
  );
  const stats = await page.evaluate(() => window.__webgpuLabStats.stats);
  ctx.check(
    'capabilities: caps object is populated from the granted device',
    stats.caps?.maxStorageBufferBindingSize > 0
      && stats.caps?.depthFormat === 'depth24plus'
      && stats.caps?.msaaSupported === true
      && ['high-performance', 'low-power', 'default'].includes(stats.caps?.powerPreference),
    JSON.stringify(stats.caps),
  );
  ctx.check(
    'capabilities: depth fallback decision selects depth32float with a reason',
    stats.downgrade?.depthFormat === 'depth32float' && typeof stats.downgrade?.reason === 'string' && stats.downgrade.reason.length > 0,
    JSON.stringify(stats.downgrade),
  );
  ctx.check(
    'capabilities: granted limits expose the requested storage headroom',
    stats.grantedLimits?.maxStorageBufferBindingSize > 0,
    JSON.stringify(stats.grantedLimits),
  );
  ctx.check(
    'capabilities: VAT storage-buffer guard rejects oversize, accepts real size',
    stats.vatGuard?.oversizeRejected === true && stats.vatGuard?.realSizeFits === true,
    JSON.stringify(stats.vatGuard),
  );

  // GPU-time readback lands a frame or two after submission; poll briefly.
  await page.waitForFunction(
    () => typeof window.__webgpuLabStats?.stats?.gpuTimeMs === 'number',
    undefined,
    { timeout: 6000 },
  ).catch(() => {});
  const gpuTimeMs = await page.evaluate(() => window.__webgpuLabStats.stats.gpuTimeMs);
  ctx.check(
    'capabilities: GPU timestamp readout is present and non-negative (timestamp-query)',
    stats.caps?.timestampQuery ? (typeof gpuTimeMs === 'number' && gpuTimeMs >= 0) : (gpuTimeMs === null),
    JSON.stringify({ timestampQuery: stats.caps?.timestampQuery, gpuTimeMs }),
  );

  const pixels = countNonBlank(PNG.sync.read(await page.screenshot()));
  ctx.check('capabilities: route renders a nonblank frame', pixels > 150000, JSON.stringify({ pixels }));
}
