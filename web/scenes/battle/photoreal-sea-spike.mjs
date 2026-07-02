import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

export const meta = {
  name: 'photoreal-sea-spike',
  kind: 'flow',
  world: 'battle-photoreal-sea-vista',
  tier: 'full',
  snapshots: [],
  describe: 'Slice 12a sea displacement spike: Gerstner/IFFT source identity, sea band, determinism, SwiftShader fallback.',
};

const FIXED_TIME = 18.25;
const YAW_OUT_TO_SEA = -Math.PI / 2;
const SHOTS = new URL('../../shots-spike/', import.meta.url);

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('photoreal sea spike requires browser GPU flags', true, 'set VERIFY_GPU=1');
    return;
  }

  await mkdir(SHOTS, { recursive: true });

  const gerstner = await captureSea(ctx, 'gerstner');
  ctx.check(
    'gerstner route publishes Gerstner source identity',
    gerstner.sea?.requested === 'gerstner-tsl' &&
      gerstner.sea?.source === 'gerstner-tsl' &&
      gerstner.sea?.tier === 'gerstner-tsl',
    JSON.stringify(gerstner.sea),
  );
  ctx.check(
    'gerstner route has a non-blank lower sea band',
    gerstner.metrics.blueBand > 12000 && gerstner.metrics.lumaSpread > 24,
    JSON.stringify(gerstner.metrics),
  );
  ctx.check(
    'gerstner fixed setTime screenshots are byte-deterministic',
    Buffer.compare(gerstner.shot, gerstner.shotAgain) === 0,
    JSON.stringify({ bytesA: gerstner.shot.length, bytesB: gerstner.shotAgain.length }),
  );
  await writeFile(new URL('photoreal-sea-gerstner.png', SHOTS), gerstner.shot);
  await gerstner.page.close();

  const ifft = await captureSea(ctx, 'ifft');
  const expectedFallback = process.env.VERIFY_GPU_ADAPTER !== 'hardware';
  ctx.check(
    expectedFallback
      ? 'ifft route falls back to Gerstner tier under SwiftShader'
      : 'ifft route publishes IFFT source identity on hardware',
    expectedFallback
      ? ifft.sea?.requested === 'ifft-tsl' &&
          ifft.sea?.source === 'gerstner-tsl' &&
          ifft.sea?.tier === 'gerstner-tsl-swiftshader-fallback' &&
          ifft.sea?.fallback === true
      : ifft.sea?.requested === 'ifft-tsl' &&
          ifft.sea?.source === 'ifft-tsl' &&
          ifft.sea?.tier === 'ifft-tsl-spectral-spike' &&
          ifft.sea?.fallback === false,
    JSON.stringify(ifft.sea),
  );
  ctx.check(
    'ifft route has a non-blank lower sea band',
    ifft.metrics.blueBand > 12000 && ifft.metrics.lumaSpread > 24,
    JSON.stringify(ifft.metrics),
  );
  await writeFile(new URL('photoreal-sea-ifft.png', SHOTS), ifft.shot);
  await ifft.page.close();
}

async function captureSea(ctx, sea) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: sea });
  const query = new URLSearchParams({
    map: 'A',
    ref: '1',
    t: String(FIXED_TIME),
    ticks: '60',
    sea,
    zoom: '8.2',
    cx: '520',
    cy: '-180',
    pitch: '0.28',
    yaw: String(YAW_OUT_TO_SEA),
  });
  await page.goto(`${ctx.target}/renderer/photoreal-battle?${query}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.route === 'photoreal-battle' &&
      window.__rendererLabStats?.stats?.renderStats?.terrain?.sea,
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.());
  const clip = await page.locator('#renderer-canvas').boundingBox();
  const shot = await page.screenshot({ clip, timeout: 180000 });
  const shotAgain = sea === 'gerstner'
    ? await page.screenshot({ clip, timeout: 180000 })
    : Buffer.alloc(0);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats?.renderStats ?? null);
  const png = PNG.sync.read(shot);
  return {
    page,
    shot,
    shotAgain,
    sea: stats?.sea ?? stats?.terrain?.sea ?? null,
    metrics: seaBandMetrics(png),
  };
}

function seaBandMetrics(png) {
  let blueBand = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const y0 = Math.floor(png.height * 0.42);
  const y1 = Math.floor(png.height * 0.92);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (b > r + 14 && g > r + 4 && b > 54) blueBand++;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
    }
  }
  return {
    blueBand,
    lumaSpread: Number((maxLuma - minLuma).toFixed(2)),
  };
}
