import { PNG } from "pngjs";

// Water Slice 5 — albedo + depth ramp × environment preset. The winner
// (Gerstner) coloured by a neutral Aegean albedo (turquoise → deep blue) times
// one of three presets. Pins that the SAME material reads warm under golden and
// cool under overcast (the mood is in the light, not the albedo), that the sea is
// a believable blue (not grey, not neon-green), and that dusk is dim not
// dark-albedo'd. Holds one frozen-clock baseline per preset.
//
// GPU only (VERIFY_GPU=1); on macOS that means headful + hardware.

const WINNER = "gerstner";
const PRESETS = ["golden", "dusk", "overcast"];

export const meta = {
  name: "water-albedo",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: PRESETS.map((p) => `water/albedo-${p}`),
  describe:
    "Water Slice 5: one Aegean sea under golden / dusk / overcast presets — mood in the light, not the albedo.",
};

const waitReady = (page) =>
  page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "water-bakeoff",
    undefined,
    { timeout: 25000 },
  );

// Average warmth (r-b) and luma over the sea band (below the horizon), plus the
// mean channels to judge the water hue.
function seaStats(png) {
  const seaTop = Math.floor(png.height * 0.45);
  let n = 0,
    sr = 0,
    sg = 0,
    sb = 0;
  for (let y = seaTop; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      sr += png.data[o];
      sg += png.data[o + 1];
      sb += png.data[o + 2];
      n++;
    }
  }
  return { r: sr / n, g: sg / n, b: sb / n, warmth: (sr - sb) / n, luma: (sr + sg + sb) / (3 * n) };
}

async function measure(ctx, preset) {
  const page = await ctx.newPage({ viewport: { width: 1000, height: 600 }, errorPrefix: preset });
  try {
    await page.goto(`${ctx.target}/renderer/water-bakeoff?tech=${WINNER}&preset=${preset}&t=3.0`);
    await waitReady(page);
    const shot = await page.locator("#renderer-canvas").screenshot();
    return { shot, stats: seaStats(PNG.sync.read(shot)) };
  } finally {
    await page.close();
  }
}

export async function run(ctx) {
  const m = {};
  for (const p of PRESETS) m[p] = await measure(ctx, p);

  // Two-light neutrality: the same material must read WARMER under golden than
  // under overcast. If the mood were baked into the albedo they'd match.
  ctx.check(
    "albedo: same material reads warmer under golden than overcast (mood is in the light)",
    m.golden.stats.warmth > m.overcast.stats.warmth + 8,
    JSON.stringify({
      goldenWarmth: m.golden.stats.warmth.toFixed(1),
      overcastWarmth: m.overcast.stats.warmth.toFixed(1),
    }),
  );

  // The sea is a believable blue (b clearly above r), across every preset — not a
  // lifeless grey, and not a neon Caribbean green (g not runaway above b).
  const blueEverywhere = PRESETS.every(
    (p) => m[p].stats.b > m[p].stats.r + 8 && m[p].stats.b > m[p].stats.g - 6,
  );
  ctx.check(
    "albedo: the sea is Aegean blue under every preset (not grey, not neon-green)",
    blueEverywhere,
    JSON.stringify(
      Object.fromEntries(
        PRESETS.map((p) => [
          p,
          [m[p].stats.r, m[p].stats.g, m[p].stats.b].map((v) => v.toFixed(0)).join(","),
        ]),
      ),
    ),
  );

  // Dusk is dim, not a dark diorama: dimmer than golden, but still legible (not
  // crushed to near-black).
  ctx.check(
    "albedo: dusk is dim (below golden) but not crushed to a dark diorama",
    m.dusk.stats.luma < m.golden.stats.luma - 8 && m.dusk.stats.luma > 22,
    JSON.stringify({
      duskLuma: m.dusk.stats.luma.toFixed(1),
      goldenLuma: m.golden.stats.luma.toFixed(1),
    }),
  );

  for (const p of PRESETS) await ctx.snap(null, `water/albedo-${p}`, { shot: m[p].shot });
}
