import { PNG } from 'pngjs';

// Water Slice 6 — horizon haze / aerial perspective. The winner (Gerstner) with
// the far sea graded into the preset haze so it meets the sky with no hard
// horizon line. Pins that the sea→sky seam is soft (no sharp vertical luma step)
// and that the far sea is desaturated toward the sky relative to the near sea.
// Holds a frozen-clock baseline of the horizon band.
//
// GPU only (VERIFY_GPU=1); on macOS that means headful + hardware.

const WINNER = 'gerstner';

export const meta = {
  name: 'water-haze',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [`water/haze-${WINNER}`],
  describe: 'Water Slice 6: soft hazy sea-to-sky horizon (aerial perspective).',
};

const waitReady = (page) => page.waitForFunction(
  () => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.route === 'water-bakeoff',
  undefined,
  { timeout: 25000 },
);

// Per-row mean luma (averaged over x, which smooths per-wave foam), and the
// largest adjacent-row step — a hard horizon line makes a big step, a hazed seam
// does not.
function rowLumaProfile(png) {
  const rows = new Array(png.height).fill(0);
  for (let y = 0; y < png.height; y++) {
    let s = 0;
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      s += png.data[o] + png.data[o + 1] + png.data[o + 2];
    }
    rows[y] = s / (3 * png.width);
  }
  return rows;
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1000, height: 600 }, errorPrefix: WINNER });
  try {
    await page.goto(`${ctx.target}/renderer/water-bakeoff?tech=${WINNER}&preset=dusk&t=3.0`);
    await waitReady(page);

    const shot = await page.locator('#renderer-canvas').screenshot();
    const png = PNG.sync.read(shot);
    const rows = rowLumaProfile(png);

    // Largest row-to-row luma step over the whole frame — dominated by the
    // sea/sky seam. Hazed = gentle; a hard line spikes it.
    let maxStep = 0;
    let stepY = 0;
    for (let y = 1; y < png.height; y++) {
      const d = Math.abs(rows[y] - rows[y - 1]);
      if (d > maxStep) { maxStep = d; stepY = y; }
    }
    ctx.check(
      'haze: the sea-to-sky seam is soft (no hard horizon luma step)',
      maxStep < 14,
      JSON.stringify({ maxStep: maxStep.toFixed(1), atRow: stepY }),
    );

    // Aerial perspective: the far sea (just below the horizon) sits closer to the
    // sky luma than the near sea does.
    const skyLuma = rows.slice(0, Math.floor(png.height * 0.08)).reduce((a, b) => a + b, 0) / Math.floor(png.height * 0.08);
    // Horizon = first row (top→down) whose luma drops well below the sky.
    let horizon = Math.floor(png.height * 0.35);
    for (let y = Math.floor(png.height * 0.1); y < png.height; y++) {
      if (skyLuma - rows[y] > 18) { horizon = y; break; }
    }
    const farBand = rows.slice(horizon, horizon + Math.floor(png.height * 0.06));
    const farLuma = farBand.reduce((a, b) => a + b, 0) / farBand.length;
    const nearLuma = rows.slice(Math.floor(png.height * 0.85)).reduce((a, b) => a + b, 0) / (png.height - Math.floor(png.height * 0.85));
    ctx.check(
      'haze: far sea is desaturated toward the sky vs the near sea (aerial perspective)',
      Math.abs(farLuma - skyLuma) < Math.abs(nearLuma - skyLuma) * 0.75,
      JSON.stringify({ skyLuma: skyLuma.toFixed(0), farLuma: farLuma.toFixed(0), nearLuma: nearLuma.toFixed(0) }),
    );

    await ctx.snap(page, `water/haze-${WINNER}`, { shot });
  } finally {
    await page.close();
  }
}
