import { PNG } from 'pngjs';

export const meta = {
  name: 'webgpu-device',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Fresh /webgpu/device route creates a raw WebGPU device and commits stable pixels.',
};

function pixelAt(png, x, y) {
  const o = (y * png.width + x) * 4;
  return [png.data[o], png.data[o + 1], png.data[o + 2], png.data[o + 3]];
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 640, height: 420 }, errorPrefix: 'webgpu-device' });
  await page.goto(`${ctx.target}/webgpu/device`);
  await page.waitForFunction(() => window.__webgpuLabReady === true, undefined, { timeout: 12000 });
  await page.waitForTimeout(160);
  const probe = await page.evaluate(() => window.__webgpuLabStats);
  const shot = await page.screenshot();
  const png = PNG.sync.read(shot);
  const center = pixelAt(png, 320, 210);
  ctx.check('route reports WebGPU ready', probe.ok === true && probe.route === 'device', JSON.stringify(probe));
  ctx.check('raw frame shell rendered nonblank pixels', center[0] > 80 && center[1] > 80 && center[2] < 220, `center ${center.join(',')}`);
  await page.close();
}
