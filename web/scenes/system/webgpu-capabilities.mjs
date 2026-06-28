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

// The gray border (blue ~205) meets olive terrain (blue ~90) along the top
// diagonal edge; antialiased boundary pixels land between. The blue channel
// isolates that transition cleanly, away from terrain speckle (all low-blue).
// We scan only the top band the diagonal edge crosses. MSAA spreads the edge
// across more transition pixels, so a higher count means smoother edges.
function countEdgeBlend(png) {
  const band = Math.floor(png.height * 0.18);
  let blend = 0;
  for (let y = 0; y < band; y++) {
    for (let x = 0; x < png.width; x++) {
      const b = png.data[(y * png.width + x) * 4 + 2];
      if (b >= 120 && b <= 188) blend++;
    }
  }
  return blend;
}

async function canvasBlend(ctx, sampleCount) {
  const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, errorPrefix: `webgpu-capabilities-msaa${sampleCount}` });
  try {
    await page.goto(`${ctx.target}/webgpu/capabilities?msaa=${sampleCount}`);
    await page.waitForFunction(
      (n) => window.__webgpuLabReady === true && window.__webgpuLabStats?.stats?.sampleCount === n,
      sampleCount,
      { timeout: 18000 },
    );
    await page.waitForTimeout(250);
    const png = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
    return { blend: countEdgeBlend(png), sampleCount };
  } finally {
    await page.close();
  }
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, errorPrefix: 'webgpu-capabilities' });
  try {
    await runProbe(ctx, page);
  } finally {
    await page.close();
  }
  // Each probe page runs an unbounded rAF loop that holds a device, so compare
  // MSAA only after the main page is closed.
  const off = await canvasBlend(ctx, 1);
  const on = await canvasBlend(ctx, 4);
  ctx.check(
    'capabilities: MSAA 4x renders at sampleCount 4 and reduces edge aliasing',
    on.sampleCount === 4 && off.sampleCount === 1 && on.blend > off.blend * 1.2,
    JSON.stringify({ off: off.blend, on: on.blend, ratio: (on.blend / Math.max(1, off.blend)).toFixed(2) }),
  );
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
