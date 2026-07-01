import { PNG } from "pngjs";

// Water Slice 4 — sun-glint streak. The winner (Gerstner) with the specular
// sun-glint on. Pins that a warm glint streak appears, is not blown out, and
// crucially TRACKS the sun azimuth (the streak moves across the frame when the
// sun moves) rather than sitting at a fixed screen position. Neutral grey water;
// the glint carries a provisional warm tint (formalised into waterPalette at S5)
// so it separates from the white foam.
//
// GPU only (VERIFY_GPU=1); on this Mac use headless Chrome + hardware.

const WINNER = "gerstner";

export const meta = {
  name: "water-glint",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: [`water/glint-${WINNER}`],
  describe: "Water Slice 4: a warm sun-glint streak that tracks the sun azimuth.",
};

const waitReady = (page) =>
  page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "water-bakeoff",
    undefined,
    { timeout: 25000 },
  );

// Hot warm glint sparkles: BRIGHT and clearly warm, in the SEA band only (below
// the horizon) so the warm dusk sky and the dim warm water body don't register —
// only the specular glitter does. Returns count and x-centroid.
function glintStats(png) {
  let count = 0;
  let sumX = 0;
  const seaTop = Math.floor(png.height * 0.4);
  for (let y = seaTop; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o],
        g = png.data[o + 1],
        b = png.data[o + 2];
      if (r > 195 && r - b > 60 && r - g > 25) {
        count++;
        sumX += x;
      }
    }
  }
  return { count, centroidX: count > 0 ? sumX / count : null, width: png.width };
}

async function glintAt(ctx, sunAz) {
  const page = await ctx.newPage({
    viewport: { width: 1000, height: 600 },
    errorPrefix: `az-${sunAz.toFixed(2)}`,
  });
  try {
    await page.goto(
      `${ctx.target}/renderer/water-bakeoff?tech=${WINNER}&preset=dusk&t=3.0&sunAz=${sunAz}`,
    );
    await waitReady(page);
    const shot = await page.locator("#renderer-canvas").screenshot();
    return { shot, stats: glintStats(PNG.sync.read(shot)) };
  } finally {
    await page.close();
  }
}

export async function run(ctx) {
  const half = Math.PI / 2;
  // Sun rotated toward +x (world right → screen right) vs toward -x.
  const right = await glintAt(ctx, half - 0.6);
  const left = await glintAt(ctx, half + 0.6);
  const center = await glintAt(ctx, half);

  ctx.check(
    "glint: a warm sun-glint streak is present and not blown out",
    center.stats.count > 50 && center.stats.count < center.stats.width * 600 * 0.2,
    JSON.stringify({ count: center.stats.count }),
  );

  // The streak must MOVE with the sun: rotating the sun toward +x pushes the
  // glint to the right of where it is when rotated toward -x. A fixed screen
  // highlight would not move.
  const moved =
    right.stats.centroidX !== null &&
    left.stats.centroidX !== null &&
    right.stats.centroidX - left.stats.centroidX > center.stats.width * 0.08;
  ctx.check(
    "glint: the streak tracks the sun azimuth (moves across the frame), not a fixed screen spot",
    moved,
    JSON.stringify({
      rightAzCentroid: right.stats.centroidX?.toFixed(0),
      leftAzCentroid: left.stats.centroidX?.toFixed(0),
    }),
  );

  await ctx.snap(null, `water/glint-${WINNER}`, { shot: center.shot });
}
