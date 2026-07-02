import { PNG } from 'pngjs';

export const meta = {
  name: 'photoreal-sea',
  kind: 'visual',
  world: 'battle-photoreal-sea-vista',
  tier: 'full',
  snapshots: ['photoreal-sea/sea-horizon'],
  describe: 'Slice 12 photoreal sea: SkyModel-reflecting PBR Gerstner surface at a fixed sea-facing battle vista.',
};

const FIXED_TIME = 18.25;
const SEA_QUERY = new URLSearchParams({
  map: 'A',
  ref: '1',
  t: String(FIXED_TIME),
  ticks: '60',
  sea: 'gerstner',
  zoom: '8.0',
  cx: '950',
  cy: '-150',
  pitch: '0.28',
  yaw: '0',
});

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('photoreal-sea requires browser GPU flags', true, 'set VERIFY_GPU=1');
    return;
  }

  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'sea' });
  try {
    await page.goto(`${ctx.target}/renderer/photoreal-battle?${SEA_QUERY}`);
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

    const stats = await page.evaluate(() => window.__rendererLabStats?.stats?.renderStats ?? null);
    const sea = stats?.sea ?? null;
    ctx.check(
      'sea: Gerstner TSL is the only active displacement tier',
      sea?.requested === 'gerstner-tsl' &&
        sea?.source === 'gerstner-tsl' &&
        sea?.tier === 'gerstner-tsl' &&
        sea?.fallback === false &&
        sea?.storageBytes === 0,
      JSON.stringify(sea),
    );
    ctx.check(
      'sea: PBR surface reflects the SkyModel LUT and uses distance-faded normal detail',
      sea?.surface?.owner === 'skyModel-ibl-standard-pbr' &&
        sea?.surface?.skyReflection === 'scene.environment:skyModel-lut' &&
        sea?.surface?.sunGlint === 'mesh-standard-ggx' &&
        sea?.surface?.normalDetail?.near > sea?.surface?.normalDetail?.far &&
        sea?.surface?.normalDetail?.fadeEnd > sea?.surface?.normalDetail?.fadeStart,
      JSON.stringify(sea?.surface),
    );
    ctx.check(
      'sea: atmosphere owner still provides horizon haze',
      stats?.atmosphere?.sky?.owner === 'skyModel' &&
        stats?.atmosphere?.aerial?.owner === 'aerialPerspective',
      JSON.stringify(stats?.atmosphere),
    );

    const full = await page.locator('#renderer-canvas').screenshot({ timeout: 180000 });
    const horizon = cropPng(full, { x: 0, y: 410, width: 1280, height: 260 });
    const m = seaBandMetrics(PNG.sync.read(horizon));
    ctx.check(
      'sea-horizon: near sea below the haze band remains blue and readable',
      m.blueFraction > 0.18 && m.lumaSpread > 18,
      JSON.stringify(m),
    );
    await ctx.snap(null, 'photoreal-sea/sea-horizon', { shot: horizon });
  } finally {
    await page.close();
  }
}

function cropPng(buffer, rect) {
  const src = PNG.sync.read(buffer);
  const out = new PNG({ width: rect.width, height: rect.height });
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const si = ((rect.y + y) * src.width + rect.x + x) * 4;
      const di = (y * rect.width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return PNG.sync.write(out);
}

function seaBandMetrics(png) {
  let blue = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const total = png.width * png.height;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (b > r + 10 && g > r + 2 && b > 48) blue++;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
    }
  }
  return {
    blueFraction: Number((blue / total).toFixed(4)),
    lumaSpread: Number((maxLuma - minLuma).toFixed(2)),
  };
}
